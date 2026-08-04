-- Fecha o INSERT direto em checkout_events (parte 2 de 2 — RESTRITIVA).
--
-- ORDEM OBRIGATORIA: aplicar SOMENTE depois que
--   1. 20260804130000_public_checkout_event_rpc.sql estiver aplicada, e
--   2. o frontend que chama track_public_checkout_event estiver publicado.
--
-- Aplicar antes disso nao quebra pagamento nenhum — o tracking falha em
-- silencio, por desenho — mas cria um buraco na serie de eventos ate o deploy
-- do frontend.
--
-- Nenhum dado historico e alterado ou apagado.

-- 1. A policy que autorizava qualquer INSERT anonimo. `WITH CHECK (true)` era
--    literalmente "aceite o que vier".
DROP POLICY IF EXISTS "Public can insert checkout events for analytics" ON public.checkout_events;

-- 2. GRANTs de tabela. O default do Supabase da tudo para anon e authenticated;
--    o que segurava as outras operacoes era a ausencia de policy, nao o grant.
--    Aqui o grant tambem sai — RLS deixa de ser a unica linha de defesa.
--
--    A RPC da parte 1 e SECURITY DEFINER: continua inserindo normalmente,
--    independentemente destes grants.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.checkout_events FROM anon;
REVOKE SELECT ON public.checkout_events FROM anon;

-- 3. `authenticated` perde apenas o INSERT direto. SELECT/UPDATE/DELETE ficam,
--    porque a policy "Admins can manage checkout events" (FOR ALL, has_role
--    admin) depende deles — e o dashboard, os relatorios e o analytics de
--    afiliadas leem a tabela por esse caminho.
REVOKE INSERT ON public.checkout_events FROM authenticated;

-- 4. service_role permanece intocado: e ele que roda manutencao administrativa.

-- Estado resultante de public.checkout_events:
--
--   policies : "Admins can manage checkout events" (FOR ALL, authenticated, admin)
--   anon     : nenhum privilegio de tabela; escreve unicamente via
--              track_public_checkout_event, sob allowlist e validacao
--   auth.    : SELECT/UPDATE/DELETE de tabela, efetivos so para admin via policy
--   escrita  : exclusivamente pela RPC validada
