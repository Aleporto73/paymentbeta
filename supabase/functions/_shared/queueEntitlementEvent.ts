// Enfileiramento canonico de eventos de entitlement.
//
// Consolida o que estava escrito duas vezes -- em asaas-webhook (queueWebhooks)
// e em queueCancellationWebhooks -- e que viraria cinco copias assim que os
// eventos pending/payment_failed/access_revoked chegassem. As duas copias ja
// divergiam em detalhes (classificacao de erro, formato do log de skip), e essa
// e exatamente a forma como um emissor financeiro se desalinha do outro.
//
// Responsabilidade unica: dado um fato financeiro JA validado pelo chamador,
// montar o payload canonico e gravar uma linha por destino ativo.
//
// O que este modulo NAO faz, de proposito:
//   * nao decide SE o fato ocorreu -- isso e do chamador, que ve o webhook;
//   * nao implementa scheduler nem backoff (escopo do P2);
//   * nao reenvia nada -- so escreve na outbox;
//   * nao regenera delivery_id de uma linha existente. O retry da MESMA linha
//     reusa o delivery_id gravado, que e o que faz o consumidor deduplicar.

import {
  buildEntitlementPayload,
  ENTITLEMENT_EVENT_VERSION,
} from "./buildEntitlementPayload.ts";
import type {
  EntitlementPriceInput,
  EntitlementSubscriptionInput,
  EntitlementTransactionInput,
} from "./buildEntitlementPayload.ts";

/** Erro de banco vindo do supabase-js; tipado só no que é lido aqui. */
interface PostgresErrorLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
}

/** Destino ativo de product_webhooks. */
interface WebhookDestination {
  id: string;
  webhook_url: string;
}

/**
 * Superfície mínima do cliente Supabase que este módulo usa.
 *
 * Estrutural de propósito: evita importar o tipo de esm.sh só para tipar dois
 * métodos, e permite que o teste injete um duplo sem depender do pacote real.
 */
interface QueueClient {
  from(table: string): {
    select?: (columns: string) => unknown;
    insert(
      rows: Record<string, unknown> | Record<string, unknown>[],
    ): Promise<{ error: PostgresErrorLike | null }> | { error: PostgresErrorLike | null };
  };
}

export const IDEMPOTENCY_CONSTRAINT = "webhook_queue_idempotency_uidx";
export const LEGACY_TX_CONSTRAINT = "webhook_queue_tx_event_url_uidx";

const errorText = (error: PostgresErrorLike | null | undefined) =>
  [error?.message, error?.details, error?.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

/**
 * Um 23505 generico NAO e duplicata aceitavel: so as duas constraints de
 * idempotencia da outbox representam "este fato ja esta enfileirado". Qualquer
 * outra violacao pode ser problema de schema ou de dado e precisa continuar
 * visivel como falha.
 */
export const isExpectedDuplicate = (
  error: PostgresErrorLike | null | undefined,
): boolean => {
  if (error?.code !== "23505") return false;
  const text = errorText(error);
  return text.includes(IDEMPOTENCY_CONSTRAINT) || text.includes(LEGACY_TX_CONSTRAINT);
};

/** Mensagem curta e sem PII/segredo para log e para webhook_logs. */
export const sanitizeForLog = (value: unknown): string => {
  let message = "Unknown error";

  if (value instanceof Error) {
    message = value.message;
  } else if (typeof value === "string") {
    message = value;
  } else if (value && typeof value === "object") {
    const candidate = value as PostgresErrorLike;
    if (typeof candidate.message === "string") message = candidate.message;
    else if (typeof candidate.code === "string") message = `code ${candidate.code}`;
  }

  return message.slice(0, 300);
};

export interface QueueEntitlementEventArgs {
  event: string;
  /** Chave do fato financeiro. Ver _shared/entitlementIdempotency.ts. */
  idempotencyKey: string;
  transaction: EntitlementTransactionInput & { product_id: string | null };
  /** `products` row: id, unique_code, entitlement_code, product_type. */
  product: {
    id: string;
    unique_code: string | null;
    entitlement_code: string | null;
    product_type: string | null;
  };
  price?: EntitlementPriceInput | null;
  subscription?: EntitlementSubscriptionInput | null;
  /** `subscriptions.id` — vai para o payload e para a coluna de auditoria. */
  subscriptionId?: string | null;
  cycleFrom?: string | null;
  paymentStatus?: string | null;
  reason?: string | null;
  occurredAt?: string;
  expiresAtOverride?: string | null;
}

export interface QueueEntitlementEventResult {
  queued: number;
  duplicate: number;
  skipped: number;
  failed: number;
  /** Motivo legível quando nada foi enfileirado; null no caminho feliz. */
  reason: string | null;
}

const emptyResult = (reason: string | null): QueueEntitlementEventResult => ({
  queued: 0,
  duplicate: 0,
  skipped: 0,
  failed: 0,
  reason,
});

/**
 * Grava uma linha na outbox por destino ativo do produto.
 *
 * Nunca lanca: um problema de entrega nao pode transformar um fato financeiro
 * ja consumado (pagamento aplicado, assinatura cancelada) em erro para o
 * chamador. O resultado estruturado deixa o chamador decidir se o evento Asaas
 * deve permanecer reprocessavel.
 */
export async function queueEntitlementEvent(
  // O construtor real do supabase-js devolve um cliente muito mais amplo; aqui
  // basta a superfície usada, o que também torna o duplo de teste trivial.
  supabase: QueueClient,
  args: QueueEntitlementEventArgs,
): Promise<QueueEntitlementEventResult> {
  try {
    const { event, idempotencyKey, transaction, product } = args;

    if (!transaction.product_id) {
      return emptyResult("transaction has no product_id");
    }

    const { data: webhooks, error: webhooksError } = await supabase
      .from("product_webhooks")
      .select("id, webhook_url")
      .eq("product_id", transaction.product_id)
      .eq("is_active", true);

    if (webhooksError) {
      console.error(
        `Error fetching product webhooks for ${event}:`,
        sanitizeForLog(webhooksError),
      );
      return { ...emptyResult("error fetching product webhooks"), failed: 1 };
    }

    if (!webhooks || webhooks.length === 0) {
      return emptyResult("no active product webhooks");
    }

    // Regra de seguranca: sem entitlement_code explicito nao ha direito de
    // acesso confiavel a conceder ou revogar. Falha fechada, com trilha.
    if (!product.entitlement_code || !String(product.entitlement_code).trim()) {
      const reason = "skipped: product has no entitlement_code configured";
      console.error(`Skipping ${event}: product ${product.id} has no entitlement_code`);

      const { error: logError } = await supabase.from("webhook_logs").insert(
        webhooks.map((webhook: WebhookDestination) => ({
          product_id: transaction.product_id,
          webhook_url: webhook.webhook_url,
          payload: { event, transaction_id: transaction.id },
          response_status: null,
          response_body: reason,
          success: false,
          event,
          event_version: ENTITLEMENT_EVENT_VERSION,
        })),
      );
      if (logError) {
        console.error("Error recording skipped entitlement:", sanitizeForLog(logError));
      }

      return { ...emptyResult(reason), skipped: 1 };
    }

    let queued = 0;
    let duplicate = 0;
    let skipped = 0;
    let failed = 0;
    let reason: string | null = null;

    for (const webhook of webhooks) {
      // Um delivery_id NOVO por destino, na PRIMEIRA gravacao. O retry desta
      // linha reusa este valor -- e por isso que uma reentrega nao vira uma
      // segunda concessao no consumidor.
      const deliveryId = crypto.randomUUID();

      let payload;
      try {
        payload = buildEntitlementPayload({
          event,
          deliveryId,
          occurredAt: args.occurredAt,
          transaction,
          product,
          price: args.price ?? null,
          subscription: args.subscription ?? null,
          expiresAtOverride: args.expiresAtOverride,
          subscriptionId: args.subscriptionId,
          cycleFrom: args.cycleFrom,
          paymentStatus: args.paymentStatus,
          reason: args.reason,
        });
      } catch (error) {
        reason = "skipped: invalid recurring entitlement period or expiration";
        skipped += 1;
        console.error(`Skipping ${event} for ${transaction.id}: ${sanitizeForLog(error)}`);

        await supabase.from("webhook_logs").insert({
          product_id: transaction.product_id,
          webhook_url: webhook.webhook_url,
          payload: { event, transaction_id: transaction.id },
          response_status: null,
          response_body: reason,
          success: false,
          event,
          event_version: ENTITLEMENT_EVENT_VERSION,
        });
        continue;
      }

      const { error: queueError } = await supabase.from("webhook_queue").insert({
        product_id: transaction.product_id,
        product_webhook_id: webhook.id,
        webhook_url: webhook.webhook_url,
        payload,
        status: "pending",
        delivery_id: deliveryId,
        event,
        event_version: ENTITLEMENT_EVENT_VERSION,
        transaction_id: transaction.id,
        subscription_id: args.subscriptionId ?? null,
        idempotency_key: idempotencyKey,
        next_retry_at: new Date().toISOString(),
      });

      if (queueError) {
        if (isExpectedDuplicate(queueError)) {
          duplicate += 1;
          console.log(`${event} already queued for ${idempotencyKey} -> ${webhook.webhook_url}`);
        } else {
          failed += 1;
          reason = "one or more entitlement destinations failed";
          console.error(`Error queuing ${event}:`, sanitizeForLog(queueError));
        }
        continue;
      }

      queued += 1;
    }

    if (queued > 0) {
      // Cutucao best-effort. A linha na outbox e a fonte de verdade; o
      // processador recolhe o que este disparo perder.
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/process-webhook-queue`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
      }).catch((error) => console.error("Queue nudge failed:", sanitizeForLog(error)));
    }

    return { queued, duplicate, skipped, failed, reason: queued > 0 ? null : reason };
  } catch (error) {
    console.error("Unexpected error queuing entitlement event:", sanitizeForLog(error));
    return { ...emptyResult("unexpected entitlement queue failure"), failed: 1 };
  }
}

/** Falha que deve manter o evento Asaas reprocessavel. */
export const shouldRetryEntitlement = (result: QueueEntitlementEventResult) =>
  result.failed > 0;
