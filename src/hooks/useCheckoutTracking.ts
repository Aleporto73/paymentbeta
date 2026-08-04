import { useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CHECKOUT_EVENT } from "@/lib/checkoutMetrics";
import {
  getOrCreateCheckoutSessionId,
  markSessionEventOnce,
  type SessionStorageLike,
} from "@/lib/checkoutSession";

interface TrackCheckoutParams {
  productId: string;
  priceId?: string;
  affiliateCode?: string;
  /** Injetavel nos testes; em producao e o sessionStorage do navegador. */
  storage?: SessionStorageLike | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const browserSessionStorage = (): SessionStorageLike | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

// O navegador registra apenas `view` e `payment_attempt`.
//
// Saiu daqui:
//   - `beforeunload`, que gravava "abandono" em reload, em fechar a aba e ate
//     no redirect pos-compra;
//   - o evento de cobranca criada, que o navegador nao tem como provar —
//     cobranca e venda sao contadas em `transactions`;
//   - valor, order bumps e user agent, que ninguem lia e qualquer um forjava.
export function useCheckoutTracking({
  productId,
  priceId,
  affiliateCode,
  storage,
}: TrackCheckoutParams) {
  const storageRef = useRef<SessionStorageLike | null>(
    storage === undefined ? browserSessionStorage() : storage,
  );
  const sessionId = useMemo(() => getOrCreateCheckoutSessionId(storageRef.current), []);

  /** Grava so na primeira vez da sessao para este produto/preco. */
  const trackEventOnce = (eventType: string) => {
    if (!productId) return;
    if (!markSessionEventOnce(storageRef.current, sessionId, eventType, productId, priceId)) {
      return;
    }

    // Gravacao pela RPC validada, nunca por INSERT direto: a policy antiga
    // aceitava qualquer coisa (`WITH CHECK (true)`) e a chave publica esta no
    // bundle do site.
    void (async () => {
      try {
        const { error } = await supabase.rpc("track_public_checkout_event", {
          p_session_id: sessionId,
          p_event_type: eventType,
          p_product_id: productId,
          p_price_id: priceId || null,
          // O parametro e uuid: texto livre faria a chamada inteira falhar.
          p_affiliate_code: UUID_PATTERN.test(affiliateCode || "") ? affiliateCode : null,
        });

        if (error) throw error;
      } catch (error) {
        // Telemetria nunca derruba o checkout. O log leva so o tipo do evento e
        // a mensagem tecnica — sem CPF, e-mail, telefone ou payload.
        console.error(
          "checkout tracking failed",
          eventType,
          error instanceof Error ? error.message : "unknown error",
        );
      }
    })();
  };

  useEffect(() => {
    trackEventOnce(CHECKOUT_EVENT.view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, priceId]);

  /** Formulario enviado: ultimo degrau que o navegador consegue medir. */
  const trackPaymentAttempt = () => trackEventOnce(CHECKOUT_EVENT.paymentAttempt);

  return { trackPaymentAttempt };
}
