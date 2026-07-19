// Politica de retry e leitura da resposta remota da webhook_queue.
//
// Funcoes PURAS de proposito: nao importam deno.land, nao tocam banco nem rede,
// e por isso rodam sob `node --test`. As decisoes que governam dinheiro --
// quando desistir, quando esperar, o que conta como entregue -- ficam testaveis
// sem subir Edge Function.

/** Timeout por tentativa. Mantido em 10s, como antes do P2. */
export const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Corpo da resposta guardado na fila. 4 KB cobre com folga qualquer JSON de
 * status e evita que uma pagina de erro HTML inche a tabela.
 */
export const MAX_RESPONSE_BODY_BYTES = 4096;

/**
 * Backoff deterministico, por numero de tentativas JA realizadas.
 *
 * 1min -> 5min -> 15min, teto de 60min. Escalonado porque a falha tipica do
 * receptor e transitoria (deploy, timeout) e se resolve em minutos; repetir de
 * imediato so multiplicaria a carga sobre um destino que ja esta em apuros.
 */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];
export const MAX_RETRY_DELAY_MS = 60 * 60_000;

export const retryDelayMs = (attempts: number): number => {
  const index = Math.max(0, attempts - 1);
  const delay = RETRY_DELAYS_MS[index] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  return Math.min(delay, MAX_RETRY_DELAY_MS);
};

/**
 * Quando esta linha pode ser tentada de novo. `null` quando nao havera nova
 * tentativa -- o que mantem next_retry_at coerente com status `failed`/`sent`.
 */
export const nextRetryAt = (
  attempts: number,
  maxAttempts: number,
  now: number = Date.now(),
): string | null =>
  attempts >= maxAttempts ? null : new Date(now + retryDelayMs(attempts)).toISOString();

/** Apos uma falha: volta para a fila ou desiste. */
export const nextStatusAfterFailure = (
  attempts: number,
  maxAttempts: number,
): "pending" | "failed" => (attempts >= maxAttempts ? "failed" : "pending");

/**
 * Trunca preservando limite em BYTES, nao em caracteres: um corpo de resposta
 * pode vir em UTF-8 multibyte, e cortar por `length` estouraria o limite.
 */
export const truncateResponseBody = (
  body: unknown,
  maxBytes: number = MAX_RESPONSE_BODY_BYTES,
): string | null => {
  if (typeof body !== "string" || body === "") return null;

  const encoder = new TextEncoder();
  const bytes = encoder.encode(body);
  if (bytes.length <= maxBytes) return body;

  // Corta no limite e descarta um eventual caractere partido ao meio.
  return new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.slice(0, maxBytes))
    .replace(/�$/, "");
};

/**
 * Mensagem de erro para a fila. Curta, e com os padroes de segredo removidos --
 * o texto pode ter vindo de uma resposta remota arbitraria.
 */
export const sanitizeErrorMessage = (value: unknown, maxLength = 500): string => {
  let message = "Unknown error";

  if (value instanceof Error) message = value.message;
  else if (typeof value === "string") message = value;
  else if (value && typeof value === "object") {
    const candidate = value as { message?: unknown; code?: unknown };
    if (typeof candidate.message === "string") message = candidate.message;
    else if (typeof candidate.code === "string") message = `code ${candidate.code}`;
  }

  return message
    .replace(/(bearer\s+)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    .replace(/(sha256=)[A-Fa-f0-9]+/g, "$1[redacted]")
    .replace(/(eyJ[A-Za-z0-9._-]{10,})/g, "[redacted-jwt]")
    .replace(/((?:secret|token|apikey|api_key|password)["'\s:=]+)[^\s"',}]+/gi, "$1[redacted]")
    .slice(0, maxLength);
};

// ---------------------------------------------------------------------
// Leitura do 2xx do receptor
// ---------------------------------------------------------------------

/**
 * O AbaMinds responde 200 tanto quando aceita quanto quando RECUSA o evento por
 * deriva de contrato (versao, evento ou entitlement desconhecidos). Nos tres
 * casos de recusa a entrega HTTP terminou e retentar seria inutil -- o proximo
 * envio seria recusado igual --, mas tratar isso como sucesso silencioso
 * esconderia exatamente o tipo de quebra que mais importa detectar.
 */
export const UNSUPPORTED_STATUSES = [
  "unsupported_version",
  "unsupported_event",
  "unsupported_entitlement",
] as const;

export const ACCEPTED_STATUSES = ["accepted", "duplicate"] as const;

export type ReceiverOutcome = "accepted" | "duplicate" | "unsupported" | "unknown";

export interface ReceiverVerdict {
  outcome: ReceiverOutcome;
  /** Valor bruto do campo `status`, quando presente. Para auditoria. */
  receiverStatus: string | null;
  /** true => entrega concluida, porem o receptor NAO concedeu nada. */
  needsAlert: boolean;
}

/**
 * Interpreta o corpo de uma resposta 2xx.
 *
 * Corpo ausente ou nao-JSON nao e erro: receptores legitimos podem responder
 * 200 vazio. Vira `unknown`, que conta como entregue e nao alarma.
 */
export const interpretReceiverBody = (body: unknown): ReceiverVerdict => {
  let parsed: unknown = null;

  if (typeof body === "string" && body.trim() !== "") {
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = null;
    }
  }

  const receiverStatus =
    parsed && typeof parsed === "object" &&
      typeof (parsed as { status?: unknown }).status === "string"
      ? ((parsed as { status: string }).status).trim()
      : null;

  if (receiverStatus && (UNSUPPORTED_STATUSES as readonly string[]).includes(receiverStatus)) {
    return { outcome: "unsupported", receiverStatus, needsAlert: true };
  }

  if (receiverStatus === "accepted" || receiverStatus === "duplicate") {
    return { outcome: receiverStatus, receiverStatus, needsAlert: false };
  }

  return { outcome: "unknown", receiverStatus, needsAlert: false };
};

/**
 * Uma linha e elegivel quando esta pendente, ainda tem tentativa e o horario de
 * retry chegou. `next_retry_at` nulo significa "agora" -- o caso das linhas
 * historicas, anteriores ao P1.
 */
export const isEligibleNow = (
  row: {
    status?: unknown;
    attempts?: unknown;
    max_attempts?: unknown;
    next_retry_at?: unknown;
  },
  now: number = Date.now(),
): boolean => {
  if (row.status !== "pending") return false;

  const attempts = Number(row.attempts ?? 0);
  const maxAttempts = Number(row.max_attempts ?? 0);
  if (!Number.isFinite(attempts) || !Number.isFinite(maxAttempts)) return false;
  if (attempts >= maxAttempts) return false;

  if (row.next_retry_at === null || row.next_retry_at === undefined) return true;
  if (typeof row.next_retry_at !== "string") return false;

  const due = new Date(row.next_retry_at).getTime();
  return Number.isNaN(due) ? true : due <= now;
};

/**
 * Uma linha travada em `processing` e recuperavel depois desta janela.
 *
 * Sem isto, um worker que morre entre o claim e a resposta deixaria a entrega
 * presa para sempre. A janela e folgada em relacao ao timeout de 10s para nunca
 * roubar uma linha que ainda esta em voo.
 */
export const STALE_PROCESSING_MS = 5 * 60_000;

export const isStaleProcessing = (
  row: { status?: unknown; last_attempt_at?: unknown },
  now: number = Date.now(),
): boolean => {
  if (row.status !== "processing") return false;
  if (typeof row.last_attempt_at !== "string") return true;

  const startedAt = new Date(row.last_attempt_at).getTime();
  return Number.isNaN(startedAt) ? true : now - startedAt >= STALE_PROCESSING_MS;
};
