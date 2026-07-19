-- Migration: schedule_webhook_queue_processor
-- Agendador da outbox de entitlement.
--
-- POR QUE EXISTE
-- Ate aqui process-webhook-queue so rodava quando algum evento a cutucava
-- (asaas-webhook, cancelamento, painel admin). Com o backoff do P2, uma linha
-- que falha volta para `pending` com next_retry_at no futuro -- e sem um
-- disparador periodico ela ficaria esperando alguem passar por perto. O cron e
-- quem garante que o horario de retry seja de fato honrado.
--
-- DIVISAO DE RESPONSABILIDADE
-- O cron NAO processa a fila. Ele apenas dispara a Edge Function, uma vez por
-- minuto. Toda a logica financeira continua na Edge:
--   * claim atomico (UPDATE condicional por status) contra entrega dupla;
--   * backoff 1min / 5min / 15min, teto de 60min;
--   * leitura do 2xx do receptor, incluindo os unsupported_* que respondem 200
--     sem conceder nada;
--   * recuperacao de linhas travadas em `processing`.
-- pg_net so entrega o POST e esquece: a resposta HTTP nao volta para o cron, e
-- nem precisa -- quem registra resultado e a propria Edge, na linha da fila.
--
-- FREQUENCIA
-- Um minuto e o menor intervalo do cron padrao e casa com o menor degrau do
-- backoff (1 min). Ir mais rapido nao adiantaria: nao ha retry abaixo disso.
--
-- AUTENTICACAO
-- process-webhook-queue exige service-role ou JWT de admin, e continua assim --
-- esta migration NAO a torna publica e NAO altera verify_jwt.
--
-- A chave vem do Vault, lida A CADA EXECUCAO pelo proprio comando do job. O
-- texto persistido em cron.job.command carrega apenas o NOME do segredo; o
-- valor nunca e interpolado aqui, nunca entra no Git e nunca aparece em
-- cron.job. Rotacionar a chave no Vault passa a valer sem reescrever o job.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Pre-condicao: o segredo precisa existir e nao ser vazio.
--    Testado por EXISTS -- o valor nao e selecionado, exibido nem comparado
--    com nada alem de "diferente de string vazia".
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'paymentbeta_webhook_queue_service_role_key'
      AND coalesce(btrim(decrypted_secret), '') <> ''
  ) THEN
    RAISE EXCEPTION
      'Vault secret "paymentbeta_webhook_queue_service_role_key" is missing or empty; create it before scheduling the webhook queue processor';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. Extensoes.
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Falhar alto e cedo se o pg_net nao expuser a funcao no schema esperado.
-- Sem isto, um schema diferente produziria um job que so quebra em execucao,
-- silenciosamente, uma vez por minuto.
DO $$
BEGIN
  IF to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') IS NULL THEN
    RAISE EXCEPTION
      'net.http_post(text, jsonb, jsonb, jsonb, integer) not found; check where pg_net was installed before scheduling';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. Remocao controlada do job anterior de MESMO nome.
--    Reaplicacao nao duplica, e nenhum outro job e tocado.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'paymentbeta_webhook_queue_processor'
  ) THEN
    PERFORM cron.unschedule('paymentbeta_webhook_queue_processor');
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4. O job.
--
--    O corpo vai entre $job$ ... $job$ e e armazenado LITERALMENTE em
--    cron.job.command. A subconsulta ao Vault faz parte desse texto e e
--    avaliada em cada execucao -- nao agora. Nenhum format(), nenhuma
--    concatenacao com o valor da chave, nenhum literal de service-role.
-- ---------------------------------------------------------------------
SELECT cron.schedule(
  'paymentbeta_webhook_queue_processor',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://nwaihnoxcxhtitgagcqk.supabase.co/functions/v1/process-webhook-queue',
    body := '{}'::jsonb,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'paymentbeta_webhook_queue_service_role_key'
      )
    ),
    timeout_milliseconds := 10000
  );
  $job$
);

-- ---------------------------------------------------------------------
-- 5. Pos-condicao: exatamente um job com este nome.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM cron.job
  WHERE jobname = 'paymentbeta_webhook_queue_processor';

  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'expected exactly 1 job named paymentbeta_webhook_queue_processor, found %', v_count;
  END IF;
END $$;

COMMIT;
