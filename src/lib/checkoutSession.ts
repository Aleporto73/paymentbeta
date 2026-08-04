// Identidade de sessao do checkout.
//
// Antes, o session_id nascia de um useRef criado a cada MONTAGEM: todo reload
// inventava uma sessao nova e inflava os acessos. Agora vive no sessionStorage,
// entao sobrevive ao reload e morre com a aba.
//
// Nada de dado pessoal entra no identificador — so aleatoriedade.
//
// O storage entra por parametro para os testes exercitarem reload e nova aba
// sem navegador.

export const CHECKOUT_SESSION_STORAGE_KEY = "pb_checkout_session_id";

/** Subconjunto de Storage que realmente usamos. */
export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const SESSION_ID_PATTERN = /^cs_[0-9a-z]{8,}$/;

/**
 * Id da sessao atual, criado apenas na primeira vez. Reload reusa; outra aba
 * (outro sessionStorage) recebe outro id.
 *
 * Sem sessionStorage (SSR, storage bloqueado) devolve um id valido assim mesmo:
 * o tracking degrada para "uma sessao por carregamento" e nunca quebra a pagina.
 */
export function getOrCreateCheckoutSessionId(storage: SessionStorageLike | null): string {
  const gerar = () =>
    `cs_${Math.floor(Math.random() * 0xffffffff).toString(36).padStart(7, "0")}${Math.floor(
      Math.random() * 0xffffffff,
    )
      .toString(36)
      .padStart(7, "0")}`;

  if (!storage) return gerar();

  try {
    const guardado = storage.getItem(CHECKOUT_SESSION_STORAGE_KEY);
    if (guardado && SESSION_ID_PATTERN.test(guardado)) return guardado;

    const criado = gerar();
    storage.setItem(CHECKOUT_SESSION_STORAGE_KEY, criado);
    return criado;
  } catch {
    return gerar();
  }
}

/**
 * Marca um evento como ja ocorrido nesta sessao e diz se ELE e o primeiro.
 * Retorna `true` so na primeira vez — inclusive atravessando reloads, porque a
 * marca tambem mora no sessionStorage.
 *
 * A chave leva produto e preco: na mesma aba o cliente pode trocar de produto, e
 * o segundo checkout precisa registrar o proprio acesso.
 *
 * Isto evita evento repetido no uso normal; NAO e protecao. Quem valida e a RPC.
 */
export function markSessionEventOnce(
  storage: SessionStorageLike | null,
  sessionId: string,
  eventType: string,
  productId: string,
  priceId?: string | null,
): boolean {
  if (!storage) return true;

  const key = `pb_once:${sessionId}:${eventType}:${productId}:${priceId || "-"}`;

  try {
    if (storage.getItem(key)) return false;
    storage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}
