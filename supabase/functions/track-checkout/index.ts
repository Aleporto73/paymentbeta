// track-checkout — DESATIVADA. Responde 410 Gone e nao grava nada.
//
// O que esta funcao era: um endpoint publico (verify_jwt = false) que criava um
// client com SERVICE_ROLE_KEY e inseria em `checkout_events` o JSON cru do
// corpo da requisicao, sem validar campo nenhum. Qualquer pessoa na internet
// podia fabricar `view`, `payment_attempt`, `payment_created` ou qualquer outro
// event_type — a tabela nao tem CHECK em `event_type` — e assim contaminar
// acessos, tentativas, cobrancas e as taxas do dashboard.
//
// O unico chamador era o beacon de `abandon` em useCheckoutTracking.ts, que saiu
// no P1.0. Auditoria do repositorio: nenhuma outra referencia a
// "track-checkout" fora de supabase/config.toml. Zero chamadores legitimos.
//
// O tracking legitimo do checkout escreve direto em `checkout_events` pelo
// client anonimo, sob a policy "Public can insert checkout events for
// analytics" e sob RLS — nao precisa de service role em lugar nenhum.
//
// A funcao NAO foi removida de producao nesta rodada: derrubar o endpoint com
// um deploy isolado nao e coordenavel aqui. Este arquivo fica pronto para o
// deploy coordenado; ate la o codigo publicado continua sendo o antigo.
//
// Ao remover de vez, apagar tambem o bloco [functions.track-checkout] de
// supabase/config.toml.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const getCorsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Credentials": "true",
});

serve((req) => {
  const origin = req.headers.get("Origin") || req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) });
  }

  // Sem createClient, sem SERVICE_ROLE_KEY, sem leitura do corpo e sem insert.
  // O corpo da requisicao nunca e interpretado: nada que chegue aqui pode virar
  // linha em checkout_events.
  return new Response(
    JSON.stringify({
      error: "gone",
      message:
        "track-checkout foi desativada. O checkout grava a propria telemetria pelo client anonimo, sob RLS.",
    }),
    {
      status: 410,
      headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
    },
  );
});
