-- Migration: add_entitlement_webhook_security
-- Fase 1 do webhook seguro de entitlement (PaymentBeta -> Psico2).
-- Adiciona: secret por webhook (com suporte a rotacao), entitlement_code estavel
-- em products, identidade/versionamento de evento na fila (delivery_id,
-- event, event_version) e auditoria de entrega em webhook_logs.
-- Idempotente (IF NOT EXISTS) e sem impacto em runtime existente.
-- NAO altera RLS, checkout, afiliados ou split.

BEGIN;

-- 1. product_webhooks: secret por destino + suporte minimo a rotacao.
ALTER TABLE public.product_webhooks
  ADD COLUMN IF NOT EXISTS webhook_secret text,
  ADD COLUMN IF NOT EXISTS previous_webhook_secret text,
  ADD COLUMN IF NOT EXISTS secret_rotated_at timestamptz;

-- 2. products: codigo estavel de direito de acesso (fonte de verdade para o
--    receptor decidir acesso; ex.: 'psicoplanilhas-vitalicio', 'assistente-ia-pro').
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS entitlement_code text;

CREATE UNIQUE INDEX IF NOT EXISTS products_entitlement_code_uidx
  ON public.products(entitlement_code)
  WHERE entitlement_code IS NOT NULL;

-- 3. webhook_queue: identidade e versionamento do evento outbound.
ALTER TABLE public.webhook_queue
  ADD COLUMN IF NOT EXISTS delivery_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS event text NOT NULL DEFAULT 'sale.confirmed',
  ADD COLUMN IF NOT EXISTS event_version text NOT NULL DEFAULT '2026-06-10',
  ADD COLUMN IF NOT EXISTS product_webhook_id uuid REFERENCES public.product_webhooks(id),
  ADD COLUMN IF NOT EXISTS transaction_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS webhook_queue_delivery_uidx
  ON public.webhook_queue(delivery_id);

-- Anti-duplicacao outbound: impede enfileirar duas vezes o mesmo evento da
-- mesma transacao para a mesma URL (ex.: PAYMENT_CONFIRMED + PAYMENT_RECEIVED).
CREATE UNIQUE INDEX IF NOT EXISTS webhook_queue_tx_event_url_uidx
  ON public.webhook_queue(transaction_id, event, webhook_url)
  WHERE transaction_id IS NOT NULL;

-- 4. webhook_logs: auditoria de entrega.
--    request_headers deve conter APENAS headers publicos (X-PaymentBeta-*),
--    nunca o secret; assinatura preferencialmente truncada/mascarada.
ALTER TABLE public.webhook_logs
  ADD COLUMN IF NOT EXISTS delivery_id uuid,
  ADD COLUMN IF NOT EXISTS event text,
  ADD COLUMN IF NOT EXISTS event_version text,
  ADD COLUMN IF NOT EXISTS request_headers jsonb;

CREATE INDEX IF NOT EXISTS webhook_logs_delivery_idx
  ON public.webhook_logs(delivery_id);

COMMIT;
