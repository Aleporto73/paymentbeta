-- Migration: add_payment_poll_capability
-- Capacidade de polling para o checkout PIX publico.
--
-- CONTEXTO
-- A funcao check-payment-status e chamada pela pagina /checkout, que e publica
-- (src/App.tsx nao a envolve em ProtectedRoute) e cujo comprador e anonimo. Por
-- isso ela roda com verify_jwt = false e nao pode exigir login. Antes desta
-- mudanca o unico "controle" era um userId enviado no corpo -- escolhido pelo
-- proprio chamador, portanto nenhum controle.
--
-- O par de colunas abaixo guarda uma capacidade: um segredo aleatorio, gerado
-- por create-payment DEPOIS que a transacao ja existe, entregue uma unica vez ao
-- navegador que acabou de criar a cobranca, e exigido em toda chamada de polling.
--
-- LIMITES DELIBERADOS
--   * o hash autoriza SOMENTE consultar e reconciliar o pagamento desta linha;
--   * NAO representa identidade: nao ha usuario por tras dele, e ele nunca deve
--     ser aceito como autenticacao para qualquer outra operacao;
--   * NAO deve ser reutilizado para cancelar assinatura, ler dados do cliente,
--     reenviar webhook, criar cobranca ou acessar o painel;
--   * expira em minutos, nao em dias, e nao se renova.
--
-- Somente o SHA-256 e persistido. O token bruto existe uma unica vez, na
-- resposta de create-payment, e nunca e gravado nem registrado em log.
--
-- NAO altera fluxo de pagamento, webhook, checkout ou entitlement. Apenas
-- estrutura. Colunas nullable e sem default para nao afetar as linhas
-- historicas, que simplesmente nao possuem capacidade e por isso nao autorizam
-- polling algum.

BEGIN;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payment_poll_token_hash text,
  ADD COLUMN IF NOT EXISTS payment_poll_token_expires_at timestamptz;

COMMENT ON COLUMN public.transactions.payment_poll_token_hash IS
  'SHA-256 hex do token de capacidade de polling. Autoriza APENAS consultar e reconciliar este pagamento no checkout publico. Nao e identidade e nao serve para nenhuma outra operacao. Token bruto nunca e persistido.';

COMMENT ON COLUMN public.transactions.payment_poll_token_expires_at IS
  'Expiracao da capacidade de polling (30 minutos apos a criacao da cobranca). Sem renovacao automatica.';

-- Sem indice, deliberadamente.
-- check-payment-status localiza a linha por asaas_payment_id, que ja possui
-- UNIQUE desde a migration original de transactions, e so entao le e compara
-- estas duas colunas. Nenhuma consulta filtra por hash ou por expiracao, entao
-- um indice aqui seria peso morto. O token bruto nunca e indexado porque nunca
-- e armazenado.

-- RLS e grants permanecem exatamente como estao.
-- Um REVOKE de coluna para anon/authenticated foi avaliado e REJEITADO: no
-- Postgres isso faria `SELECT *` falhar para o papel afetado, e o painel admin
-- depende disso (src/pages/Assinaturas.tsx usa .select('*') em transactions).
-- A protecao efetiva ja existe e continua valendo:
--   * anon nao le transactions -- as policies exigem auth.uid() = user_id, e
--     auth.uid() e nulo para anon;
--   * authenticated so alcanca as proprias linhas pela mesma policy;
--   * o que ficaria visivel para o dono da linha e o HASH, nunca o token.

COMMIT;
