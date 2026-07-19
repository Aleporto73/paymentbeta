-- Migration: add_entitlement_outbox_idempotency
-- Fundacao da outbox para os eventos financeiros novos (pending, payment_failed,
-- access_revoked). NAO emite evento algum: apenas estrutura.
--
-- DUAS IDENTIDADES DISTINTAS, deliberadamente separadas:
--
--   idempotency_key -> identifica o FATO FINANCEIRO. "este pagamento desta
--     assinatura foi confirmado", "esta assinatura foi cancelada". Dois eventos
--     com a mesma chave sao o mesmo fato e o segundo deve ser descartado.
--
--   delivery_id     -> identifica uma TENTATIVA LOGICA DE ENTREGA. Ja existe e
--     nao muda de significado. O consumidor deduplica por ele, e o retry da
--     MESMA linha reusa o mesmo valor -- por isso o reenvio automatico nunca
--     duplica no receptor.
--
-- Um fato financeiro entregue a dois destinos gera duas linhas: mesma
-- idempotency_key, delivery_id diferentes. Por isso o indice unico e composto
-- com product_webhook_id.
--
-- Idempotente (IF NOT EXISTS) e sem impacto em runtime existente.
-- NAO altera RLS, grants, checkout, afiliados ou split.

BEGIN;

ALTER TABLE public.webhook_queue
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS next_retry_at   timestamptz,
  ADD COLUMN IF NOT EXISTS response_status integer,
  ADD COLUMN IF NOT EXISTS response_body   text,
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.subscriptions(id);

-- `last_error` foi avaliado e NAO criado: public.webhook_queue.error_message ja
-- existe desde a migration original (20251125051419) e cumpre exatamente esse
-- papel -- process-webhook-queue ja o escreve. Criar last_error seria duplicata
-- semantica e abriria espaco para os dois divergirem.

COMMENT ON COLUMN public.webhook_queue.idempotency_key IS
  'Identidade do FATO financeiro (ex.: confirmed:{subscription_id}:{asaas_payment_id}). Nao confundir com delivery_id, que identifica uma tentativa de entrega.';

COMMENT ON COLUMN public.webhook_queue.next_retry_at IS
  'Quando esta linha pode ser tentada novamente. Preenchido com now() na insercao; o backoff que o consome e escopo do P2.';

COMMENT ON COLUMN public.webhook_queue.response_status IS
  'Status HTTP da ultima tentativa. O AbaMinds trata qualquer 2xx como entregue, inclusive unsupported_*; guardar o status na propria fila torna esse caso auditavel sem cruzar com webhook_logs.';

COMMENT ON COLUMN public.webhook_queue.response_body IS
  'Corpo da ultima resposta, truncado pelo processador. Permite detectar 2xx que na verdade recusou o evento.';

COMMENT ON COLUMN public.webhook_queue.subscription_id IS
  'Auditoria e correlacao: qual assinatura originou esta entrega. Nao participa de nenhuma chave.';

-- Anti-duplicacao por FATO financeiro, por destino.
-- Parcial: linhas historicas sem idempotency_key nao sao afetadas.
CREATE UNIQUE INDEX IF NOT EXISTS webhook_queue_idempotency_uidx
  ON public.webhook_queue (idempotency_key, product_webhook_id)
  WHERE idempotency_key IS NOT NULL;

-- Varredura da fila pendente pelo worker (P2).
CREATE INDEX IF NOT EXISTS webhook_queue_pending_retry_idx
  ON public.webhook_queue (status, next_retry_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS webhook_queue_subscription_idx
  ON public.webhook_queue (subscription_id)
  WHERE subscription_id IS NOT NULL;

-- O indice legado webhook_queue_tx_event_url_uidx (transaction_id, event,
-- webhook_url) e PRESERVADO. Ele nao cobre os eventos novos -- refund e
-- chargeback da mesma transacao colidiriam nele, por terem o mesmo `event` --
-- mas continua protegendo o caminho antigo enquanto ambos coexistem. Sua
-- eventual remocao e decisao de outro bloco.

COMMIT;
