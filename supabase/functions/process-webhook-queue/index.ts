import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ENTITLEMENT_EVENT_VERSION } from "../_shared/buildEntitlementPayload.ts";
import { buildAuditableHeaders, signWebhookRequest } from "../_shared/webhookSignature.ts";
import {
  REQUEST_TIMEOUT_MS,
  STALE_PROCESSING_MS,
  interpretReceiverBody,
  isEligibleNow,
  isStaleProcessing,
  nextRetryAt,
  nextStatusAfterFailure,
  sanitizeErrorMessage,
  truncateResponseBody,
} from "../_shared/webhookRetryPolicy.ts";

/**
 * Cliente Supabase, com o mesmo tipo que `authorizeRequest` já usa neste
 * arquivo — evita `any` sem inventar uma interface estrutural paralela.
 */
type QueueClient = ReturnType<typeof createClient>;

/** Só o que este processador lê da linha da fila. */
interface QueueRow {
  id: string;
  product_id: string | null;
  product_webhook_id: string | null;
  webhook_url: string;
  payload: unknown;
  status: string;
  attempts: number;
  max_attempts: number;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  delivery_id: string;
  event: string | null;
  event_version: string | null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Batch processing configuration
const BATCH_SIZE = 10; // Process 10 webhooks at a time
const PROCESSING_DELAY = 100; // 100ms delay between batches
// O timeout mora em _shared/webhookRetryPolicy.ts (REQUEST_TIMEOUT_MS), junto
// do backoff que ele alimenta.

const unauthorizedResponse = () =>
  new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const forbiddenResponse = () =>
  new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  return match?.[1] ?? null;
};

/**
 * Comparação de segredo em tempo constante.
 *
 * Sai cedo apenas no tamanho, que não é segredo. Sem isto, a comparação `===`
 * do JavaScript retorna assim que encontra o primeiro byte diferente, e o tempo
 * de resposta vaza quantos caracteres do prefixo o atacante acertou.
 */
const secretMatches = (candidate: string, expected: string): boolean => {
  // Segredo ausente ou vazio NUNCA autentica -- senão um deploy sem a variável
  // configurada aceitaria qualquer bearer, ou até string vazia.
  if (!expected || expected.length === 0) return false;
  if (candidate.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
};

/**
 * Token dedicado do agendador.
 *
 * O cron autentica com ESTE segredo, não com a service-role key. Duas razões:
 *   * a service-role key que a plataforma injeta em SUPABASE_SERVICE_ROLE_KEY
 *     não é necessariamente a mesma string guardada no Vault -- foi exatamente
 *     isso que produziu 401 em 21 execuções seguidas do cron;
 *   * um token dedicado pode ser rotacionado sem tocar na chave que dá acesso
 *     total ao banco, e seu escopo é uma única função.
 */
const isCronToken = (token: string) =>
  secretMatches(token, Deno.env.get("WEBHOOK_QUEUE_CRON_TOKEN") ?? "");

/** Service-role continua aceita: é como as Edge Functions cutucam a fila. */
const isServiceRoleToken = (token: string) =>
  secretMatches(token, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

const authorizeRequest = async (req: Request, supabaseClient: ReturnType<typeof createClient>) => {
  const token = getBearerToken(req);

  if (!token) {
    return unauthorizedResponse();
  }

  // Dois segredos de máquina, ambos por igualdade exata em tempo constante.
  if (isCronToken(token) || isServiceRoleToken(token)) {
    return null;
  }

  // Caminho administrativo, inalterado: o JWT é validado pelo Supabase Auth --
  // assinatura inclusive -- e só então o papel é lido do banco. Uma claim
  // `service_role` forjada não passa por aqui: getUser rejeita a assinatura, e
  // mesmo que passasse, o papel vem de user_roles, não do token.
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

  if (authError || !user) {
    return unauthorizedResponse();
  }

  const { data: roles, error: rolesError } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (rolesError) {
    console.error("Error checking admin role:", rolesError);
    return forbiddenResponse();
  }

  if (!roles?.some(({ role }) => role === "admin")) {
    return forbiddenResponse();
  }

  return null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authorizationError = await authorizeRequest(req, supabaseClient);
    if (authorizationError) return authorizationError;

    console.log("Starting webhook queue processing...");

    const nowIso = new Date().toISOString();

    // Candidatas: pendentes cujo horario de retry chegou, MAIS linhas presas em
    // `processing` alem da janela de recuperacao (worker que morreu entre o
    // claim e a resposta). `next_retry_at` nulo = "agora", que e o caso das
    // linhas anteriores ao P1.
    //
    // `attempts < max_attempts` NAO e filtravel aqui: o PostgREST nao compara
    // duas colunas entre si. O corte fica no isEligibleNow, logo abaixo, que le
    // max_attempts da propria linha -- o antigo `.lt("attempts", 5)` ignorava a
    // coluna e usava um 5 fixo que nem batia com o default 3.
    const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
    const { data: candidates, error: fetchError } = await supabaseClient
      .from("webhook_queue")
      .select("*")
      .or(
        `and(status.eq.pending,next_retry_at.is.null),` +
          `and(status.eq.pending,next_retry_at.lte.${nowIso}),` +
          `and(status.eq.processing,last_attempt_at.lte.${staleBefore})`,
      )
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE * 2);

    if (fetchError) {
      console.error("Error fetching pending webhooks:", fetchError);
      throw fetchError;
    }

    const eligible = (candidates ?? [])
      .filter((row: QueueRow) => isEligibleNow(row) || isStaleProcessing(row))
      .slice(0, BATCH_SIZE);

    if (eligible.length === 0) {
      console.log("No pending webhooks to process");
      return new Response(
        JSON.stringify({ message: "No pending webhooks", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Claim antes de qualquer chamada remota. O UPDATE condicional e a trava:
    // dois workers competindo pela mesma linha rodam o mesmo statement, o
    // Postgres serializa, e o segundo nao encontra mais o status esperado e
    // recebe zero linhas. Sem isto, o SELECT anterior nao impedia entrega dupla.
    const claimed: QueueRow[] = [];
    for (const row of eligible) {
      if (await claimWebhook(row, supabaseClient)) claimed.push(row);
    }

    if (claimed.length === 0) {
      console.log("All candidate webhooks were claimed by another worker");
      return new Response(
        JSON.stringify({ message: "Nothing claimed", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${claimed.length} webhooks...`);

    const results = await Promise.allSettled(
      claimed.map((webhook) => processWebhook(webhook, supabaseClient))
    );

    const successful = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    console.log(`Webhook processing complete: ${successful} successful, ${failed} failed`);

    // Autoencadeamento apenas quando o lote encheu E ainda restam linhas
    // ELEGIVEIS AGORA. Encadear por lote cheio, como antes, faria a fila girar
    // sem parar quando o que sobrou tem next_retry_at futuro -- as linhas nao
    // seriam processadas, mas cada rodada dispararia a proxima.
    if (claimed.length === BATCH_SIZE && (await hasImmediateWork(supabaseClient))) {
      setTimeout(() => {
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/process-webhook-queue`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
        }).catch(console.error);
      }, PROCESSING_DELAY);
    }

    return new Response(
      JSON.stringify({
        message: "Webhooks processed",
        processed: claimed.length,
        successful,
        failed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in webhook queue processor:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

/**
 * Reivindica a linha para ESTE worker.
 *
 * A condicao `.eq("status", row.status)` e o que torna a operacao segura: o
 * Postgres serializa UPDATEs concorrentes sobre a mesma linha, entao apenas o
 * primeiro encontra o status esperado. O segundo recebe zero linhas e desiste.
 *
 * `attempts` e incrementado AQUI, junto do claim, e nao depois do envio: se o
 * worker morrer no meio, a tentativa ja foi contabilizada e a linha nao pode
 * ser retentada infinitamente.
 *
 * `delivery_id` NAO e tocado -- e o que faz o consumidor deduplicar a
 * reentrega em vez de conceder acesso duas vezes.
 */
async function claimWebhook(row: QueueRow, supabaseClient: QueueClient): Promise<boolean> {
  const { data, error } = await supabaseClient
    .from("webhook_queue")
    .update({
      status: "processing",
      last_attempt_at: new Date().toISOString(),
      attempts: (row.attempts ?? 0) + 1,
    })
    .eq("id", row.id)
    .eq("status", row.status)
    .select("id");

  if (error) {
    console.error(`Error claiming webhook ${row.id}:`, sanitizeErrorMessage(error));
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

/**
 * Existe alguma linha ELEGIVEL AGORA? Usado só para decidir o autoencadeamento.
 * Linhas com next_retry_at futuro nao contam -- quem as pega e o agendador.
 */
async function hasImmediateWork(supabaseClient: QueueClient): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseClient
    .from("webhook_queue")
    .select("id, status, attempts, max_attempts, next_retry_at")
    .or(`and(status.eq.pending,next_retry_at.is.null),and(status.eq.pending,next_retry_at.lte.${nowIso})`)
    .limit(BATCH_SIZE);

  if (error) {
    console.error("Error checking for immediate work:", sanitizeErrorMessage(error));
    return false;
  }

  return (data ?? []).some((row: QueueRow) => isEligibleNow(row));
}

// Resolve the signing secret for a queue row. Prefers the explicit
// product_webhook_id link; falls back to (product_id, webhook_url) for
// legacy rows queued before the link existed. Never logs the secret.
async function resolveWebhookSecret(webhook: any, supabaseClient: any): Promise<string | null> {
  if (webhook.product_webhook_id) {
    const { data } = await supabaseClient
      .from("product_webhooks")
      .select("webhook_secret")
      .eq("id", webhook.product_webhook_id)
      .maybeSingle();
    const secret = data?.webhook_secret;
    if (typeof secret === "string" && secret.length > 0) return secret;
  }

  const { data: fallback } = await supabaseClient
    .from("product_webhooks")
    .select("webhook_secret")
    .eq("product_id", webhook.product_id)
    .eq("webhook_url", webhook.webhook_url)
    .limit(1)
    .maybeSingle();

  const secret = fallback?.webhook_secret;
  return typeof secret === "string" && secret.length > 0 ? secret : null;
}

async function processWebhook(webhook: QueueRow, supabaseClient: QueueClient) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const event = webhook.event ?? "sale.confirmed";
  const eventVersion = webhook.event_version ?? ENTITLEMENT_EVENT_VERSION;
  const deliveryId = webhook.delivery_id;
  // O claim ja incrementou attempts; e este o numero que a linha carrega agora.
  const attempts = (webhook.attempts ?? 0) + 1;
  const maxAttempts = webhook.max_attempts ?? 3;

  try {
    console.log(`Sending webhook to ${webhook.webhook_url}...`);

    // Explicit, auditable failure when no signing secret is configured.
    // Unsigned entitlement webhooks must never be sent.
    const secret = await resolveWebhookSecret(webhook, supabaseClient);
    if (!secret) {
      clearTimeout(timeoutId);
      const errorMessage = "missing webhook_secret: configure a secret for this webhook before delivery";
      console.error(`Webhook ${webhook.id} not sent: ${errorMessage}`);

      // Terminal de imediato: nao e falha transitoria, retentar sem configurar
      // o segredo daria o mesmo resultado para sempre.
      await supabaseClient
        .from("webhook_queue")
        .update({
          status: "failed",
          error_message: errorMessage,
          next_retry_at: null,
        })
        .eq("id", webhook.id);

      await supabaseClient.from("webhook_logs").insert({
        product_id: webhook.product_id,
        webhook_url: webhook.webhook_url,
        payload: webhook.payload,
        response_status: null,
        response_body: errorMessage,
        success: false,
        delivery_id: deliveryId,
        event,
        event_version: eventVersion,
      });
      return;
    }

    // Sign at SEND time (fresh timestamp per attempt, current secret).
    // rawBody is serialized exactly once and the same string is signed
    // and sent as the request body.
    const rawBody = JSON.stringify(webhook.payload);
    const signed = await signWebhookRequest({
      secret,
      event,
      eventVersion,
      deliveryId,
      rawBody,
    });

    // Send webhook
    const response = await fetch(webhook.webhook_url, {
      method: "POST",
      headers: signed.headers,
      body: rawBody,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const rawResponseBody = await response.text().catch(() => "");
    const responseBody = truncateResponseBody(rawResponseBody);
    const success = response.ok;

    // O receptor pode responder 2xx e mesmo assim NAO ter concedido nada.
    const verdict = success
      ? interpretReceiverBody(rawResponseBody)
      : { outcome: "unknown" as const, receiverStatus: null, needsAlert: false };

    // Log webhook delivery (public headers only, signature truncated)
    await supabaseClient.from("webhook_logs").insert({
      product_id: webhook.product_id,
      webhook_url: webhook.webhook_url,
      payload: webhook.payload,
      response_status: response.status,
      response_body: responseBody,
      // Um `unsupported_*` chegou ao destino, mas nao concedeu direito algum.
      // Marcar success=false e o que faz o alerta aparecer na auditoria em vez
      // de se esconder atras de um HTTP 200.
      success: success && !verdict.needsAlert,
      delivery_id: deliveryId,
      event,
      event_version: eventVersion,
      request_headers: buildAuditableHeaders(signed, event, eventVersion, deliveryId),
    });

    if (success) {
      // Entrega HTTP concluida em qualquer 2xx, inclusive unsupported_*:
      // retentar um evento que o receptor recusa por contrato daria o mesmo
      // resultado para sempre. Fica `sent`, com o motivo auditavel na linha.
      await supabaseClient
        .from("webhook_queue")
        .update({
          status: "sent",
          response_status: response.status,
          response_body: responseBody,
          error_message: verdict.needsAlert
            ? `receiver rejected by contract: ${verdict.receiverStatus}`
            : null,
          next_retry_at: null,
        })
        .eq("id", webhook.id);

      if (verdict.needsAlert) {
        console.error(
          `CONTRACT DRIFT: ${webhook.webhook_url} answered 2xx with "${verdict.receiverStatus}" ` +
            `for event ${event} (delivery ${deliveryId}). Nothing was granted.`,
        );
      } else {
        console.log(`Webhook sent successfully to ${webhook.webhook_url}`);
      }
    } else {
      const status = nextStatusAfterFailure(attempts, maxAttempts);
      await supabaseClient
        .from("webhook_queue")
        .update({
          status,
          response_status: response.status,
          response_body: responseBody,
          error_message: sanitizeErrorMessage(`HTTP ${response.status}: ${rawResponseBody}`),
          next_retry_at: nextRetryAt(attempts, maxAttempts),
        })
        .eq("id", webhook.id);

      console.error(
        `Webhook failed for ${webhook.webhook_url}: HTTP ${response.status} (attempt ${attempts}/${maxAttempts}, now ${status})`
      );
    }
  } catch (error) {
    // Timeout (AbortError) e erro de rede caem aqui. Nao ha resposta remota,
    // entao response_status/response_body ficam nulos -- e a linha NUNCA pode
    // permanecer em `processing`.
    clearTimeout(timeoutId);
    const errorMessage = sanitizeErrorMessage(error);
    console.error(`Error sending webhook to ${webhook.webhook_url}: ${errorMessage}`);

    const status = nextStatusAfterFailure(attempts, maxAttempts);
    await supabaseClient
      .from("webhook_queue")
      .update({
        status,
        response_status: null,
        response_body: null,
        error_message: errorMessage,
        next_retry_at: nextRetryAt(attempts, maxAttempts),
      })
      .eq("id", webhook.id);

    // Log failed webhook
    await supabaseClient.from("webhook_logs").insert({
      product_id: webhook.product_id,
      webhook_url: webhook.webhook_url,
      payload: webhook.payload,
      response_status: null,
      response_body: errorMessage,
      success: false,
      delivery_id: deliveryId,
      event,
      event_version: eventVersion,
    });

    throw error;
  }
}
