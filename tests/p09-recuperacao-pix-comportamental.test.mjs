// P0.9 — a recuperacao do PIX pendente so pode devolver a cobranca da PROPRIA
// tentativa atual: mesmo produtor, produto, CPF, price_id e mesmo total
// calculado pelo servidor (comparado em centavos), com status PENDING local e
// ao vivo no Asaas.
//
// Problema evitado: cliente gera PIX de R$ 97 com order bump, volta, remove o
// bump (nova tentativa vale R$ 67) — o sistema NAO pode reapresentar o PIX
// antigo de R$ 97. Idem para outro preco, cupom ou promocao.
//
// Estes testes sao COMPORTAMENTAIS: importam o modulo real
// (_shared/vitalicioPixRecovery.ts nao depende de deno.land/esm.sh, como
// pollCapability.ts) e o executam com um client Supabase e um fetch mockados,
// registrando cada chamada para provar o que foi e o que NAO foi feito.

import assert from "node:assert/strict";
import test from "node:test";

import {
  VITALICIO_RECOVERY_WINDOW_MS,
  getRecoveryDocumentCandidates,
  isLiveChargeRecoverable,
  matchesCurrentAttempt,
  normalizeCouponCode,
  normalizeOrderBumpIds,
  recoverVitalicioPendingPix,
  toCents,
} from "../supabase/functions/_shared/vitalicioPixRecovery.ts";

// ---------------------------------------------------------------------
// Cenario base e utilitarios de mock
// ---------------------------------------------------------------------

const ATTEMPT = {
  producerId: "b803d01d-8511-4280-a4fc-dac718f3f33e",
  productId: "ad27ba35-92a5-4a60-aec8-0b82ae7c0f44",
  priceId: "11111111-1111-4111-8111-111111111111",
  normalizedDocument: "12345678901",
  orderBumpIds: [],
  couponCode: null,
  expectedDiscountTotal: 0,
  expectedChargeTotal: 97,
};

const CANDIDATE_ROW = {
  id: "tx-1",
  asaas_payment_id: "pay_123",
  status: "PENDING",
  billing_type: "PIX",
  price_id: ATTEMPT.priceId,
  value: 97,
  order_bumps_selected: [],
  coupon_code: null,
  discount_amount: 0,
  created_at: new Date().toISOString(),
};

const BUMP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BUMP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BUMP_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const LIVE_PAYMENT = {
  id: "pay_123",
  status: "PENDING",
  value: 97,
  invoiceUrl: "https://www.asaas.com/i/pay_123",
  bankSlipUrl: null,
};

const PIX_QR = {
  encodedImage: "base64-qr",
  payload: "00020126pixcopiaecola",
  expirationDate: "2026-08-11 23:59:59",
};

// Client Supabase mockado: registra tabelas, filtros e updates. Os metodos de
// filtro devolvem o proprio builder; o resultado final e um objeto simples
// { data, error } (await de nao-thenable devolve o proprio objeto).
function makeSupabaseMock({
  transactionRows = [CANDIDATE_ROW],
  transactionsError = null,
  integration = { production_api_key: "prod-key", sandbox_api_key: null, is_sandbox: false },
  integrationError = null,
  updateError = null,
} = {}) {
  const calls = { filters: [], updates: [], tables: [] };

  function makeBuilder(table) {
    const builder = {
      select: () => builder,
      in: (column, values) => {
        calls.filters.push({ table, column, values });
        return builder;
      },
      eq: (column, value) => {
        calls.filters.push({ table, column, value });
        return builder;
      },
      gte: (column, value) => {
        calls.filters.push({ table, column, value });
        return builder;
      },
      order: () => builder,
      limit: () => ({ data: transactionRows, error: transactionsError }),
      maybeSingle: () => ({ data: integration, error: integrationError }),
      update: (values) => {
        calls.updates.push({ table, values });
        return {
          eq: (column, value) => {
            calls.filters.push({ table, column, value, afterUpdate: true });
            return { error: updateError };
          },
        };
      },
    };
    return builder;
  }

  return {
    calls,
    from(table) {
      calls.tables.push(table);
      return makeBuilder(table);
    },
  };
}

// fetch mockado: responde ao GET do pagamento e do QR e registra cada chamada
// (URL + metodo) para provar que nenhum POST acontece.
function makeFetchMock({ livePayment = LIVE_PAYMENT, pixQr = PIX_QR, pixQrOk = true } = {}) {
  const requests = [];

  const fetchImpl = (url, init = {}) => {
    requests.push({ url: String(url), method: init.method ?? "GET" });

    if (String(url).endsWith("/pixQrCode")) {
      return Promise.resolve({
        ok: pixQrOk,
        json: () => Promise.resolve(pixQr),
      });
    }

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(livePayment),
    });
  };

  return { fetchImpl, requests };
}

// ---------------------------------------------------------------------
// 1. Mesmo produto, preco e valor: recupera, sem novo POST /payments
// ---------------------------------------------------------------------

test("1. cobranca identica a tentativa atual e recuperada sem criar outra", async () => {
  const supabase = makeSupabaseMock();
  const { fetchImpl, requests } = makeFetchMock();

  const recovery = await recoverVitalicioPendingPix(supabase, ATTEMPT, { fetchImpl });

  assert.ok(recovery, "deveria recuperar a cobranca");
  assert.equal(recovery.payment.id, "pay_123");
  assert.equal(recovery.transaction.id, "tx-1");

  // Nenhum POST em lugar nenhum: só GETs de status e QR.
  assert.ok(requests.length >= 1);
  for (const request of requests) {
    assert.equal(request.method, "GET", `nao pode haver ${request.method} em ${request.url}`);
  }
  assert.ok(requests.some((r) => r.url.endsWith("/payments/pay_123")));

  // A query filtrou por todos os criterios de identidade da tentativa.
  const filterOf = (column) => supabase.calls.filters.find((f) => f.column === column);
  assert.equal(filterOf("user_id").value, ATTEMPT.producerId);
  assert.equal(filterOf("product_id").value, ATTEMPT.productId);
  assert.equal(filterOf("price_id").value, ATTEMPT.priceId);
  assert.equal(filterOf("billing_type").value, "PIX");
  assert.equal(filterOf("status").value, "PENDING");
  assert.deepEqual(
    filterOf("customer_cpf_cnpj").values,
    getRecoveryDocumentCandidates(ATTEMPT.normalizedDocument),
  );
});

// ---------------------------------------------------------------------
// 2. Mesmo produto, price_id diferente: nao recupera
// ---------------------------------------------------------------------

test("2. cobranca de outro price_id nao e recuperada", async () => {
  const rowOutroPreco = { ...CANDIDATE_ROW, price_id: "22222222-2222-4222-8222-222222222222" };
  const supabase = makeSupabaseMock({ transactionRows: [rowOutroPreco] });
  const { fetchImpl, requests } = makeFetchMock();

  const recovery = await recoverVitalicioPendingPix(supabase, ATTEMPT, { fetchImpl });

  assert.equal(recovery, null);
  // Rejeitada ANTES de qualquer chamada ao Asaas e de qualquer escrita.
  assert.equal(requests.length, 0);
  assert.equal(supabase.calls.updates.length, 0);

  // E a funcao pura confirma o criterio isoladamente.
  assert.equal(matchesCurrentAttempt(rowOutroPreco, ATTEMPT), false);
});

// ---------------------------------------------------------------------
// 3. Mesmo preco, valor total diferente: nao recupera
// ---------------------------------------------------------------------

test("3. cobranca com valor diferente do total do servidor nao e recuperada", async () => {
  const rowValorDiferente = { ...CANDIDATE_ROW, value: 67 };
  const supabase = makeSupabaseMock({ transactionRows: [rowValorDiferente] });
  const { fetchImpl, requests } = makeFetchMock();

  const recovery = await recoverVitalicioPendingPix(supabase, ATTEMPT, { fetchImpl });

  assert.equal(recovery, null);
  assert.equal(requests.length, 0);
  assert.equal(supabase.calls.updates.length, 0);
});

// ---------------------------------------------------------------------
// 4. Order bump adicionado/removido muda o total: nao recupera
// ---------------------------------------------------------------------

test("4. PIX antigo de R$ 97 (com bump) nao volta para tentativa de R$ 67 (sem bump)", async () => {
  // Cobranca antiga: preco 67 + bump 30 = 97. Nova tentativa: só o preco, 67.
  const cobrancaComBump = { ...CANDIDATE_ROW, value: 97 };
  const tentativaSemBump = { ...ATTEMPT, expectedChargeTotal: 67 };

  const supabase = makeSupabaseMock({ transactionRows: [cobrancaComBump] });
  const { fetchImpl } = makeFetchMock();

  const recovery = await recoverVitalicioPendingPix(supabase, tentativaSemBump, { fetchImpl });
  assert.equal(recovery, null);

  // Sentido inverso (bump adicionado agora) tambem nao recupera.
  const cobrancaSemBump = { ...CANDIDATE_ROW, value: 67 };
  const supabase2 = makeSupabaseMock({ transactionRows: [cobrancaSemBump] });
  const recovery2 = await recoverVitalicioPendingPix(supabase2, ATTEMPT, {
    fetchImpl: makeFetchMock().fetchImpl,
  });
  assert.equal(recovery2, null);
});

// ---------------------------------------------------------------------
// 5. Cupom/desconto diferente muda o total: nao recupera
// ---------------------------------------------------------------------

test("5. cobranca sem cupom nao volta para tentativa com cupom aplicado", async () => {
  // Cobranca antiga sem cupom (97). Nova tentativa com cupom de 20% => 77.60.
  const tentativaComCupom = { ...ATTEMPT, expectedChargeTotal: 77.6 };
  const supabase = makeSupabaseMock({ transactionRows: [{ ...CANDIDATE_ROW, value: 97 }] });

  const recovery = await recoverVitalicioPendingPix(supabase, tentativaComCupom, {
    fetchImpl: makeFetchMock().fetchImpl,
  });

  assert.equal(recovery, null);

  // Centavos protegem contra float: 77.60 casa com 77.6, nunca com 97.
  assert.equal(toCents(77.6), 7760);
  assert.equal(toCents("77.60"), 7760);
  assert.equal(
    matchesCurrentAttempt({ ...CANDIDATE_ROW, value: "77.60" }, tentativaComCupom),
    true,
  );
});

// ---------------------------------------------------------------------
// 6. Status local PENDING mas Asaas nao-PENDING: nao recupera
// ---------------------------------------------------------------------

test("6. status ao vivo diferente de PENDING impede a recuperacao", async () => {
  for (const liveStatus of ["RECEIVED", "CONFIRMED", "OVERDUE", "DELETED", "REFUNDED"]) {
    const supabase = makeSupabaseMock();
    const { fetchImpl } = makeFetchMock({
      livePayment: { ...LIVE_PAYMENT, status: liveStatus },
    });

    const recovery = await recoverVitalicioPendingPix(supabase, ATTEMPT, { fetchImpl });

    assert.equal(recovery, null, `status ao vivo ${liveStatus} nao pode recuperar`);
    assert.equal(supabase.calls.updates.length, 0, "sem rotacao de token quando nao recupera");
  }

  // Valor divergente AO VIVO (editado no Asaas) tambem invalida.
  assert.equal(isLiveChargeRecoverable({ ...LIVE_PAYMENT, value: 96.99 }, ATTEMPT), false);
  assert.equal(isLiveChargeRecoverable({ ...LIVE_PAYMENT, value: null }, ATTEMPT), false);
});

// ---------------------------------------------------------------------
// 7. asaas_payment_id ausente: nao recupera
// ---------------------------------------------------------------------

test("7. transacao sem asaas_payment_id nao e recuperada", async () => {
  for (const semPaymentId of [null, "", "   ", undefined]) {
    const row = { ...CANDIDATE_ROW, asaas_payment_id: semPaymentId };
    const supabase = makeSupabaseMock({ transactionRows: [row] });
    const { fetchImpl, requests } = makeFetchMock();

    const recovery = await recoverVitalicioPendingPix(supabase, ATTEMPT, { fetchImpl });

    assert.equal(recovery, null);
    assert.equal(requests.length, 0, "sem chamada ao Asaas para linha sem payment id");
  }
});

// ---------------------------------------------------------------------
// 8. Cobranca compativel: mesmo QR, copia-e-cola e invoiceUrl; so o token gira
// ---------------------------------------------------------------------

test("8. recuperacao devolve o MESMO QR/copia-e-cola e rotaciona apenas o poll token", async () => {
  const supabase = makeSupabaseMock();
  const { fetchImpl, requests } = makeFetchMock();

  const recovery = await recoverVitalicioPendingPix(supabase, ATTEMPT, { fetchImpl });

  assert.ok(recovery);
  // O MESMO QR e copia-e-cola da cobranca original.
  assert.equal(recovery.pixData.encodedImage, PIX_QR.encodedImage);
  assert.equal(recovery.pixData.payload, PIX_QR.payload);
  assert.equal(recovery.payment.invoiceUrl, LIVE_PAYMENT.invoiceUrl);

  // Unica escrita: rotacao do poll token na MESMA linha, nada alem disso.
  assert.equal(supabase.calls.updates.length, 1);
  const update = supabase.calls.updates[0];
  assert.equal(update.table, "transactions");
  assert.deepEqual(
    Object.keys(update.values).sort(),
    ["payment_poll_token_expires_at", "payment_poll_token_hash", "updated_at"],
  );
  const updateFilter = supabase.calls.filters.find((f) => f.afterUpdate);
  assert.deepEqual({ column: updateFilter.column, value: updateFilter.value }, {
    column: "id",
    value: "tx-1",
  });

  // Token devolvido uma unica vez, hash persistido (43 chars base64url).
  assert.match(recovery.pollingToken, /^[A-Za-z0-9_-]{43}$/);
  assert.match(update.values.payment_poll_token_hash, /^[0-9a-f]{64}$/);

  // Nenhum POST: nenhuma cobranca criada.
  for (const request of requests) {
    assert.equal(request.method, "GET");
  }

  // Sem QR disponivel, o invoiceUrl continua sendo devolvido como fallback.
  const supabase2 = makeSupabaseMock();
  const semQr = makeFetchMock({ pixQrOk: false });
  const recovery2 = await recoverVitalicioPendingPix(supabase2, ATTEMPT, {
    fetchImpl: semQr.fetchImpl,
  });
  assert.ok(recovery2);
  assert.equal(recovery2.pixData, null);
  assert.equal(recovery2.payment.invoiceUrl, LIVE_PAYMENT.invoiceUrl);
});

// ---------------------------------------------------------------------
// Guardas adicionais da janela e das funcoes puras
// ---------------------------------------------------------------------

test("9. janela de recuperacao segue os 30 minutos do guard", () => {
  assert.equal(VITALICIO_RECOVERY_WINDOW_MS, 30 * 60 * 1000);
});

test("10. tentativa invalida nunca recupera (total nao numerico, zero ou sem preco)", async () => {
  for (const attempt of [
    { ...ATTEMPT, expectedChargeTotal: Number.NaN },
    { ...ATTEMPT, expectedChargeTotal: 0 },
    { ...ATTEMPT, expectedChargeTotal: -10 },
    { ...ATTEMPT, priceId: "" },
    { ...ATTEMPT, orderBumpIds: "nao-e-array" },
    { ...ATTEMPT, expectedDiscountTotal: Number.NaN },
  ]) {
    const supabase = makeSupabaseMock();
    const recovery = await recoverVitalicioPendingPix(supabase, attempt, {
      fetchImpl: makeFetchMock().fetchImpl,
    });
    assert.equal(recovery, null);
    // Rejeicao antes de qualquer consulta ao banco.
    assert.equal(supabase.calls.tables.length, 0);
  }
});

// ---------------------------------------------------------------------
// Composicao da compra: total igual NAO significa compra igual
// ---------------------------------------------------------------------

test("11. mesmos bumps em ordem diferente: recupera (conjunto, nao sequencia)", async () => {
  const cobranca = {
    ...CANDIDATE_ROW,
    value: 157,
    order_bumps_selected: [BUMP_B, BUMP_A],
  };
  const tentativa = {
    ...ATTEMPT,
    expectedChargeTotal: 157,
    orderBumpIds: [BUMP_A, BUMP_B],
  };

  const supabase = makeSupabaseMock({ transactionRows: [cobranca] });
  const { fetchImpl, requests } = makeFetchMock({
    livePayment: { ...LIVE_PAYMENT, value: 157 },
  });

  const recovery = await recoverVitalicioPendingPix(supabase, tentativa, { fetchImpl });

  assert.ok(recovery, "ordem de selecao nao muda a compra");
  assert.equal(recovery.payment.id, "pay_123");
  for (const request of requests) {
    assert.equal(request.method, "GET");
  }

  // A canonicalizacao e por conjunto ordenado e deduplicado.
  assert.deepEqual(normalizeOrderBumpIds([BUMP_B, BUMP_A, BUMP_B]), [BUMP_A, BUMP_B].sort());
});

test("12. bump diferente com o mesmo preco: nao recupera", async () => {
  // Bump A e bump B custam R$ 30: mesmo total (127), entregas diferentes.
  const cobrancaComA = {
    ...CANDIDATE_ROW,
    value: 127,
    order_bumps_selected: [BUMP_A],
  };
  const tentativaComB = {
    ...ATTEMPT,
    expectedChargeTotal: 127,
    orderBumpIds: [BUMP_B],
  };

  const supabase = makeSupabaseMock({ transactionRows: [cobrancaComA] });
  const { fetchImpl, requests } = makeFetchMock();

  const recovery = await recoverVitalicioPendingPix(supabase, tentativaComB, { fetchImpl });

  assert.equal(recovery, null, "total igual nao prova composicao igual");
  assert.equal(requests.length, 0, "rejeitada antes de qualquer chamada ao Asaas");
  assert.equal(supabase.calls.updates.length, 0);
});

test("13. um bump removido e outro adicionado mantendo o total: nao recupera", async () => {
  // Antiga: A + B (30 + 20). Nova: A + C (30 + 20). Total identico (147).
  const cobrancaAB = {
    ...CANDIDATE_ROW,
    value: 147,
    order_bumps_selected: [BUMP_A, BUMP_B],
  };
  const tentativaAC = {
    ...ATTEMPT,
    expectedChargeTotal: 147,
    orderBumpIds: [BUMP_A, BUMP_C],
  };

  const supabase = makeSupabaseMock({ transactionRows: [cobrancaAB] });
  const recovery = await recoverVitalicioPendingPix(supabase, tentativaAC, {
    fetchImpl: makeFetchMock().fetchImpl,
  });

  assert.equal(recovery, null);

  // Subconjunto tambem nao casa (A+B vs so A).
  const tentativaSoA = { ...ATTEMPT, expectedChargeTotal: 147, orderBumpIds: [BUMP_A] };
  assert.equal(matchesCurrentAttempt(cobrancaAB, tentativaSoA), false);
});

test("14. cupons diferentes com o mesmo desconto: nao recupera", async () => {
  // PROMO10 e DESCONTO10 dao os mesmos R$ 9,70 de desconto: mesmo total,
  // cupons (regras, limites, auditoria) diferentes.
  const cobrancaPromo = {
    ...CANDIDATE_ROW,
    value: 87.3,
    coupon_code: "PROMO10",
    discount_amount: 9.7,
  };
  const tentativaDesconto = {
    ...ATTEMPT,
    expectedChargeTotal: 87.3,
    couponCode: "DESCONTO10",
    expectedDiscountTotal: 9.7,
  };

  const supabase = makeSupabaseMock({ transactionRows: [cobrancaPromo] });
  const recovery = await recoverVitalicioPendingPix(supabase, tentativaDesconto, {
    fetchImpl: makeFetchMock().fetchImpl,
  });

  assert.equal(recovery, null);

  // Cupom presente so de um lado tambem nao casa; caixa/espacos nao importam.
  assert.equal(matchesCurrentAttempt(cobrancaPromo, { ...tentativaDesconto, couponCode: null }), false);
  assert.equal(normalizeCouponCode("  promo10 "), "PROMO10");
  assert.equal(
    matchesCurrentAttempt(cobrancaPromo, { ...tentativaDesconto, couponCode: "promo10" }),
    true,
  );
});

test("15. mesma composicao completa (bumps + cupom): recupera sem criar cobranca", async () => {
  const cobranca = {
    ...CANDIDATE_ROW,
    value: 117.3,
    order_bumps_selected: [BUMP_A],
    coupon_code: "PROMO10",
    discount_amount: 9.7,
  };
  const tentativa = {
    ...ATTEMPT,
    expectedChargeTotal: 117.3,
    orderBumpIds: [BUMP_A],
    couponCode: "PROMO10",
    expectedDiscountTotal: 9.7,
  };

  const supabase = makeSupabaseMock({ transactionRows: [cobranca] });
  const { fetchImpl, requests } = makeFetchMock({
    livePayment: { ...LIVE_PAYMENT, value: 117.3 },
  });

  const recovery = await recoverVitalicioPendingPix(supabase, tentativa, { fetchImpl });

  assert.ok(recovery);
  assert.equal(recovery.pixData.payload, PIX_QR.payload);
  for (const request of requests) {
    assert.equal(request.method, "GET", "nenhuma cobranca nova");
  }
  assert.equal(supabase.calls.updates.length, 1, "so a rotacao do poll token");
});

test("16. composicao original indisponivel: fail-safe, nunca assume pelo total", async () => {
  for (const semComposicao of [null, undefined, "corrompido", [BUMP_A, ""], [42]]) {
    const cobrancaSemRegistro = {
      ...CANDIDATE_ROW,
      order_bumps_selected: semComposicao,
    };
    const supabase = makeSupabaseMock({ transactionRows: [cobrancaSemRegistro] });
    const { fetchImpl, requests } = makeFetchMock();

    const recovery = await recoverVitalicioPendingPix(supabase, ATTEMPT, { fetchImpl });

    assert.equal(
      recovery,
      null,
      `composicao ${JSON.stringify(semComposicao)} nao comprovada nao pode recuperar`,
    );
    assert.equal(requests.length, 0);
    assert.equal(supabase.calls.updates.length, 0);
  }

  // A canonicalizacao confirma o fail-safe isoladamente.
  assert.equal(normalizeOrderBumpIds(null), null);
  assert.equal(normalizeOrderBumpIds("corrompido"), null);
  assert.equal(normalizeOrderBumpIds([BUMP_A, ""]), null);
});
