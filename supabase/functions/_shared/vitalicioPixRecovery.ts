// Recuperacao da cobranca PIX pendente do guard vitalicio.
//
// Quando reserve_vitalicio_purchase devolve purchase_processing, existe uma
// tentativa recente em andamento para o CPF. Este modulo decide se essa
// tentativa e EXATAMENTE a mesma compra que o cliente esta refazendo — e so
// entao devolve a cobranca ja criada, em vez de um bloqueio generico.
//
// "Exatamente a mesma compra" significa TODOS os criterios abaixo:
//   * mesmo producer_id (user_id do produtor);
//   * mesmo product_id;
//   * mesmo CPF/CNPJ normalizado (cobrindo formato com e sem mascara);
//   * mesmo price_id;
//   * mesma COMPOSICAO: mesmo CONJUNTO de order bumps (independente de ordem),
//     mesmo cupom normalizado (ou nenhum nos dois lados) e mesmo desconto em
//     centavos — o total sozinho nao prova nada: bump A de R$ 30 e bump B de
//     R$ 30 dao o mesmo total e entregas diferentes, e o asaas-webhook
//     provisiona/audita pelo order_bumps_selected DA TRANSACAO ANTIGA;
//   * mesmo valor TOTAL calculado pelo SERVIDOR para a tentativa atual
//     (preco + order bumps - cupom), comparado em CENTAVOS — nunca o valor
//     enviado pelo navegador;
//   * metodo PIX;
//   * status local PENDING dentro da janela do guard;
//   * asaas_payment_id presente;
//   * status ao vivo no Asaas tambem PENDING e com o MESMO valor em centavos.
//
// Qualquer divergencia (order bump trocado, cupom diferente, outro preco,
// promocao, valor editado no Asaas) NAO recupera: o cliente ve a resposta
// generica anterior e nenhuma cobranca nova e criada automaticamente.
//
// Fail-safe: se a composicao original nao for comprovavel (order_bumps_selected
// ausente/malformado na linha antiga), a correspondencia NUNCA e assumida pelo
// total — a recuperacao simplesmente nao acontece.
//
// Sem imports de deno.land/esm.sh de proposito: igual a pollCapability.ts,
// este modulo roda tanto no Deno (Edge Function) quanto sob `node --test`,
// entao os testes sao de COMPORTAMENTO, nao de texto-fonte.

import { generatePollCapability } from "./pollCapability.ts";

/** Janela da RPC reserve_vitalicio_purchase (migration 20260728140000). Uma
 *  tentativa dentro dela devolve purchase_processing; fora dela o CPF ja esta
 *  livre e nem passa por aqui. */
export const VITALICIO_RECOVERY_WINDOW_MS = 30 * 60 * 1000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getTextValue = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** Dinheiro comparado SEMPRE em centavos inteiros: 96.99999… e 97 sao a mesma
 *  cobranca; 97 e 67 nunca sao. null para qualquer coisa nao numerica. */
export const toCents = (value: unknown): number | null => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(parsed * 100);
};

/** Mesmos candidatos de documento usados pelo restante do fluxo vitalicio:
 *  o valor normalizado (so digitos) e o formato mascarado historico. */
export const getRecoveryDocumentCandidates = (document: string) => {
  const candidates = new Set([document]);

  if (document.length === 11) {
    candidates.add(
      `${document.slice(0, 3)}.${document.slice(3, 6)}.${document.slice(6, 9)}-${document.slice(9)}`,
    );
  } else if (document.length === 14) {
    candidates.add(
      `${document.slice(0, 2)}.${document.slice(2, 5)}.${document.slice(5, 8)}/${document.slice(8, 12)}-${document.slice(12)}`,
    );
  }

  return Array.from(candidates);
};

/** Cupom em forma canonica: trim + maiusculas; null quando nao ha cupom. */
export const normalizeCouponCode = (value: unknown): string | null => {
  const text = getTextValue(value);
  return text ? text.toUpperCase() : null;
};

/**
 * Conjunto canonico de order bumps: IDs unicos, ordenados — a ORDEM de selecao
 * nao muda a compra. Devolve null quando a lista nao e comprovavel (nao-array
 * ou com entrada vazia): null nunca casa com nada (fail-safe).
 */
export const normalizeOrderBumpIds = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const ids: string[] = [];

  for (const item of value) {
    const id = getTextValue(item);

    if (!id) {
      return null;
    }

    ids.push(id);
  }

  return Array.from(new Set(ids)).sort();
};

const sameCanonicalIds = (first: string[], second: string[]) =>
  first.length === second.length && first.every((id, index) => id === second[index]);

export interface VitalicioRecoveryAttempt {
  producerId: string;
  productId: string;
  /** price_id da tentativa ATUAL. Cobranca de outro preco nunca e recuperada. */
  priceId: string;
  /** CPF/CNPJ normalizado (so digitos), ja validado pelo chamador. */
  normalizedDocument: string;
  /** IDs dos order bumps VALIDADOS PELO SERVIDOR para a tentativa atual.
   *  Comparados como conjunto: ordem nao importa, conteudo importa. */
  orderBumpIds: string[];
  /** Codigo do cupom validado pelo servidor, ou null sem cupom. */
  couponCode: string | null;
  /** Desconto em reais calculado pelo SERVIDOR (0 sem cupom). */
  expectedDiscountTotal: number;
  /** Total em reais calculado pelo SERVIDOR para a tentativa atual
   *  (preco + order bumps - cupom). Nunca um valor vindo do navegador. */
  expectedChargeTotal: number;
}

export type VitalicioPixRecovery = {
  payment: {
    id: string;
    status: string;
    billingType: string;
    value: unknown;
    invoiceUrl: string | null;
    bankSlipUrl: string | null;
  };
  transaction: { id: string };
  pixData: Record<string, unknown> | null;
  pollingToken: string | null;
};

/**
 * Decide se a linha local de transactions corresponde integralmente a
 * tentativa atual. Funcao pura: e a camada validada pelos testes
 * comportamentais, independente dos filtros da query (defesa em profundidade —
 * a query ja filtra, mas a decisao final nunca depende so dela).
 */
export function matchesCurrentAttempt(
  row: unknown,
  attempt: VitalicioRecoveryAttempt,
): boolean {
  if (!isRecord(row)) return false;

  if (!getTextValue(row.id)) return false;
  if (!getTextValue(row.asaas_payment_id)) return false;

  if (getTextValue(row.billing_type)?.toUpperCase() !== "PIX") return false;
  if (getTextValue(row.status)?.toUpperCase() !== "PENDING") return false;

  if (getTextValue(row.price_id) !== attempt.priceId) return false;

  // Composicao: o CONJUNTO de order bumps precisa ser identico. Se a linha
  // antiga nao tiver a composicao registrada de forma comprovavel, nao ha
  // correspondencia — o total nunca substitui a composicao (fail-safe).
  const rowBumps = normalizeOrderBumpIds(row.order_bumps_selected);
  const attemptBumps = normalizeOrderBumpIds(attempt.orderBumpIds);

  if (!rowBumps || !attemptBumps || !sameCanonicalIds(rowBumps, attemptBumps)) {
    return false;
  }

  // Cupom: mesmo codigo canonico dos dois lados, ou nenhum dos dois. Cupons
  // diferentes com o mesmo desconto continuam sendo compras diferentes
  // (regras proprias, limite de uso, auditoria).
  if (normalizeCouponCode(row.coupon_code) !== normalizeCouponCode(attempt.couponCode)) {
    return false;
  }

  // Desconto em centavos: null na linha antiga vale 0 (sem cupom registrado).
  const rowDiscountCents = toCents(row.discount_amount ?? 0);
  const expectedDiscountCents = toCents(attempt.expectedDiscountTotal);

  if (
    rowDiscountCents === null
    || expectedDiscountCents === null
    || rowDiscountCents !== expectedDiscountCents
  ) {
    return false;
  }

  const rowCents = toCents(row.value);
  const expectedCents = toCents(attempt.expectedChargeTotal);

  return rowCents !== null && expectedCents !== null && rowCents === expectedCents;
}

/**
 * Decide se a cobranca AO VIVO no Asaas ainda e a mesma coisa que vamos
 * reexibir: PENDING e com o mesmo total em centavos. Pagou, cancelou, venceu
 * ou teve o valor alterado no Asaas -> nao recupera.
 */
export function isLiveChargeRecoverable(
  livePayment: unknown,
  attempt: VitalicioRecoveryAttempt,
): boolean {
  if (!isRecord(livePayment)) return false;

  if (getTextValue(livePayment.status)?.toUpperCase() !== "PENDING") return false;

  const liveCents = toCents(livePayment.value);
  const expectedCents = toCents(attempt.expectedChargeTotal);

  return liveCents !== null && expectedCents !== null && liveCents === expectedCents;
}

// Contrato minimo do client Supabase usado aqui. Estrutural de proposito: o
// client real satisfaz, e os testes injetam um mock que registra as chamadas.
interface SupabaseResultLike {
  data?: unknown;
  error?: unknown;
}

interface SupabaseChainLike {
  select(columns: string): SupabaseChainLike;
  update(values: Record<string, unknown>): SupabaseChainLike;
  eq(column: string, value: unknown): SupabaseChainLike;
  in(column: string, values: unknown[]): SupabaseChainLike;
  gte(column: string, value: unknown): SupabaseChainLike;
  order(column: string, options: { ascending: boolean }): SupabaseChainLike;
  limit(count: number): SupabaseChainLike | Promise<SupabaseResultLike>;
  maybeSingle(): SupabaseChainLike | Promise<SupabaseResultLike>;
}

export interface SupabaseClientLike {
  from(table: string): SupabaseChainLike;
}

export interface VitalicioRecoveryDeps {
  /** Injetavel para os testes comportamentais; default e o fetch global. */
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/**
 * Recupera a cobranca PIX em aberto que causou o purchase_processing, em vez
 * de so devolver um bloqueio. Nao cria cobranca nova (nenhum POST no Asaas),
 * nao toca no guard e nao altera nenhuma regra de bloqueio: apenas devolve a
 * cobranca que ja existe, quando — e somente quando — ela corresponde
 * integralmente a tentativa atual.
 *
 * Qualquer falha degrada para o comportamento anterior (mensagem generica),
 * nunca para um erro novo — por isso todo caminho de erro retorna null.
 */
export async function recoverVitalicioPendingPix(
  supabaseClient: SupabaseClientLike,
  attempt: VitalicioRecoveryAttempt,
  deps: VitalicioRecoveryDeps = {},
): Promise<VitalicioPixRecovery | null> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;

  try {
    const expectedCents = toCents(attempt.expectedChargeTotal);
    const expectedDiscountCents = toCents(attempt.expectedDiscountTotal);
    const attemptBumps = normalizeOrderBumpIds(attempt.orderBumpIds);

    if (
      expectedCents === null
      || expectedCents <= 0
      || expectedDiscountCents === null
      || expectedDiscountCents < 0
      || attemptBumps === null
      || !getTextValue(attempt.priceId)
    ) {
      return null;
    }

    const documentCandidates = getRecoveryDocumentCandidates(attempt.normalizedDocument);
    const windowStart = new Date(now() - VITALICIO_RECOVERY_WINDOW_MS).toISOString();

    // So PIX PENDING recente do MESMO preco. AUTHORIZED/AWAITING_RISK_ANALYSIS
    // sao estados de cartao e nao tem QR para recuperar; pagas e vencidas nao
    // entram. Valor, composicao (bumps/cupom/desconto) sao conferidos em codigo
    // pela funcao pura, nunca so na query.
    const { data: rows, error } = await supabaseClient
      .from("transactions")
      .select(
        "id, asaas_payment_id, status, billing_type, price_id, value, order_bumps_selected, coupon_code, discount_amount, created_at",
      )
      .eq("user_id", attempt.producerId)
      .eq("product_id", attempt.productId)
      .in("customer_cpf_cnpj", documentCandidates)
      .eq("billing_type", "PIX")
      .eq("status", "PENDING")
      .eq("price_id", attempt.priceId)
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(1) as SupabaseResultLike;

    if (error || !Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    const candidate = rows[0];

    // Decisao final SEMPRE pela funcao pura, mesmo que a query ja filtre.
    if (!matchesCurrentAttempt(candidate, attempt)) {
      return null;
    }

    const candidateRow = candidate as Record<string, unknown>;
    const paymentId = getTextValue(candidateRow.asaas_payment_id) as string;
    const transactionId = getTextValue(candidateRow.id) as string;

    // Credenciais carregadas aqui porque o fluxo principal so as carrega depois
    // da reserva do guard — e a recuperacao acontece exatamente quando a
    // reserva recusa.
    const { data: integration, error: settingsError } = await supabaseClient
      .from("integration_settings")
      .select("production_api_key, sandbox_api_key, is_sandbox")
      .eq("integration_name", "asaas")
      .eq("is_active", true)
      .maybeSingle() as SupabaseResultLike;

    if (settingsError || !isRecord(integration)) {
      return null;
    }

    const apiKey = integration.is_sandbox
      ? integration.sandbox_api_key
      : integration.production_api_key;

    if (!getTextValue(apiKey)) {
      return null;
    }

    const asaasBaseUrl = integration.is_sandbox
      ? "https://sandbox.asaas.com/api/v3"
      : "https://www.asaas.com/api/v3";

    // Status e valor ao vivo: nunca reexibir cobranca paga, cancelada, vencida
    // ou com valor diferente do calculado para a tentativa atual.
    const liveResponse = await fetchImpl(`${asaasBaseUrl}/payments/${paymentId}`, {
      headers: {
        "Content-Type": "application/json",
        "access_token": String(apiKey),
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!liveResponse.ok) {
      return null;
    }

    const livePayment: unknown = await liveResponse.json().catch(() => null);

    if (!isLiveChargeRecoverable(livePayment, attempt)) {
      return null;
    }

    const livePaymentRecord = livePayment as Record<string, unknown>;

    // QR Code e opcional: sem ele o invoiceUrl continua sendo um fallback valido.
    let pixData: Record<string, unknown> | null = null;

    try {
      const pixResponse = await fetchImpl(`${asaasBaseUrl}/payments/${paymentId}/pixQrCode`, {
        headers: {
          "Content-Type": "application/json",
          "access_token": String(apiKey),
        },
        signal: AbortSignal.timeout(30_000),
      });

      if (pixResponse.ok) {
        const parsed: unknown = await pixResponse.json().catch(() => null);
        pixData = isRecord(parsed) && getTextValue(parsed.payload) ? parsed : null;
      }
    } catch (_error) {
      pixData = null;
    }

    // Nova capacidade de polling, rotacionada na MESMA linha da transacao.
    // Igual ao fluxo normal, so o hash e persistido; o token bruto sai uma
    // unica vez. Se a rotacao falhar, a recuperacao continua sem polling — o
    // webhook segue sendo a autoridade da confirmacao.
    let pollingToken: string | null = null;

    try {
      const capability = await generatePollCapability();
      const { error: capabilityError } = await supabaseClient
        .from("transactions")
        .update({
          payment_poll_token_hash: capability.tokenHash,
          payment_poll_token_expires_at: capability.expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", transactionId) as SupabaseResultLike;

      if (!capabilityError) {
        pollingToken = capability.token;
      }
    } catch (_error) {
      pollingToken = null;
    }

    return {
      payment: {
        id: paymentId,
        status: "PENDING",
        billingType: "PIX",
        value: livePaymentRecord.value,
        invoiceUrl: getTextValue(livePaymentRecord.invoiceUrl),
        bankSlipUrl: getTextValue(livePaymentRecord.bankSlipUrl),
      },
      transaction: { id: transactionId },
      pixData,
      pollingToken,
    };
  } catch (_error) {
    // Dados tecnicos apenas; o documento do cliente nunca e logado.
    console.error("Vitalicio PIX recovery failed; falling back to generic block");
    return null;
  }
}
