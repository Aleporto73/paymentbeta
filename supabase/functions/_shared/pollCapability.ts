// Capacidade de polling do checkout PIX publico.
//
// A pagina /checkout e publica e o comprador e anonimo, entao check-payment-status
// nao pode exigir login. O que ela PODE exigir e a prova de que quem chama e o
// mesmo navegador que acabou de criar aquela cobranca. Essa prova e um segredo
// aleatorio devolvido uma unica vez por create-payment.
//
// Propriedades:
//   * 32 bytes de aleatoriedade criptografica -- nao derivado de paymentId,
//     userId, e-mail, CPF, telefone ou qualquer dado adivinhavel;
//   * armazenado SOMENTE como SHA-256; o token bruto nunca e persistido;
//   * escopo de um unico pagamento: o hash mora na propria linha da transacao;
//   * expiracao curta (30 min) e sem renovacao;
//   * comparacao em tempo constante, para nao vazar o hash por temporizacao.
//
// NAO e autenticacao. NAO representa usuario. NAO autoriza nenhuma outra
// operacao alem de consultar e reconciliar o pagamento que o originou.

/** 30 minutos. O polling do checkout dura ~15 min; a folga cobre latencia e
 *  uma retomada curta, sem virar credencial duradoura. */
export const POLL_TOKEN_TTL_MS = 30 * 60 * 1000;

/** 32 bytes -> 43 caracteres base64url sem padding. */
export const POLL_TOKEN_BYTES = 32;
const POLL_TOKEN_ENCODED_LENGTH = 43;

const POLL_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const encoder = new TextEncoder();

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Comparacao em tempo constante entre dois hashes hex.
 * Sai cedo apenas no tamanho, que nao e segredo.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Formato esperado do token bruto. Barra lixo antes de qualquer hash. */
export const isPollTokenFormatValid = (value: unknown): value is string =>
  typeof value === "string" && POLL_TOKEN_RE.test(value);

export interface GeneratedPollCapability {
  /** Devolvido UMA unica vez ao navegador. Nunca persistido, nunca logado. */
  token: string;
  /** Persistido em transactions.payment_poll_token_hash. */
  tokenHash: string;
  /** Persistido em transactions.payment_poll_token_expires_at. */
  expiresAt: string;
}

export async function generatePollCapability(
  now: number = Date.now(),
): Promise<GeneratedPollCapability> {
  const raw = new Uint8Array(POLL_TOKEN_BYTES);
  crypto.getRandomValues(raw);

  const token = bytesToBase64Url(raw);

  // Defensivo: um encoder quebrado nao pode produzir uma capacidade fraca.
  if (token.length !== POLL_TOKEN_ENCODED_LENGTH || !isPollTokenFormatValid(token)) {
    throw new Error("Generated polling token has an unexpected shape");
  }

  return {
    token,
    tokenHash: await sha256Hex(token),
    expiresAt: new Date(now + POLL_TOKEN_TTL_MS).toISOString(),
  };
}

export interface PollCapabilityRow {
  payment_poll_token_hash?: string | null;
  payment_poll_token_expires_at?: string | null;
}

/**
 * Autoriza uma chamada de polling contra a linha da transacao.
 *
 * Devolve apenas true/false de proposito: o chamador responde 403 generico em
 * todos os casos, para nao contar ao atacante se o pagamento existe, se a
 * capacidade existe, se o token esta errado ou se apenas expirou.
 */
export async function verifyPollCapability(
  token: unknown,
  row: PollCapabilityRow | null | undefined,
  now: number = Date.now(),
): Promise<boolean> {
  if (!isPollTokenFormatValid(token)) return false;
  if (!row) return false;

  const storedHash = row.payment_poll_token_hash;
  if (typeof storedHash !== "string" || storedHash.length === 0) return false;

  const expiresAt = row.payment_poll_token_expires_at;
  if (typeof expiresAt !== "string" || expiresAt.length === 0) return false;

  const expiresAtMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresAtMs) || expiresAtMs <= now) return false;

  return timingSafeEqualHex(await sha256Hex(token), storedHash);
}
