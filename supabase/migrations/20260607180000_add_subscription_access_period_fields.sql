-- Migration: add_subscription_access_period_fields
-- Schema minimo, defensivo e idempotente para tornar public.subscriptions apta a
-- controlar periodo pago, acesso ate o fim do periodo e estado de pagamento recorrente.
-- NAO altera fluxo de pagamento, webhook, checkout ou functions. Apenas estrutura.
-- Todas as colunas usam ADD COLUMN IF NOT EXISTS (seguro para reexecucao).

BEGIN;

-- 1. Vinculo com o preco/plano que originou a assinatura.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS product_price_id uuid NULL;

-- 2-3. Janela do ciclo pago corrente.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz NULL;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz NULL;

-- 4. Data ate a qual o acesso deve permanecer ativo (pode exceder o ciclo: cortesia, graca).
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS access_until timestamptz NULL;

-- 5. Cancelamento solicitado mantendo acesso ate o fim do periodo pago.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

-- 6. Quando o cancelamento foi solicitado.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz NULL;

-- 7-9. Rastreamento do ultimo pagamento recorrente.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS last_payment_id text NULL;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS last_payment_status text NULL;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS last_paid_at timestamptz NULL;

-- 10. Inicio da inadimplencia (overdue) para dunning / corte futuro.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS overdue_since timestamptz NULL;

-- 11. Encerramento definitivo da assinatura (acesso ja expirado).
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS ended_at timestamptz NULL;

-- Foreign key para product_prices(id). Criada de forma guardada para ser idempotente.
-- product_prices.id e UUID PRIMARY KEY (migration 20251121115242). ON DELETE SET NULL
-- preserva o historico da assinatura mesmo se o preco for removido.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscriptions_product_price_id_fkey'
      AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_product_price_id_fkey
      FOREIGN KEY (product_price_id)
      REFERENCES public.product_prices(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

-- Indices (idempotentes).
CREATE INDEX IF NOT EXISTS idx_subscriptions_product_price_id
  ON public.subscriptions (product_price_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_current_period_end
  ON public.subscriptions (current_period_end);

CREATE INDEX IF NOT EXISTS idx_subscriptions_access_until
  ON public.subscriptions (access_until);

CREATE INDEX IF NOT EXISTS idx_subscriptions_last_payment_id
  ON public.subscriptions (last_payment_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON public.subscriptions (status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_cancel_at_period_end
  ON public.subscriptions (cancel_at_period_end);

-- Unique parcial: um pagamento Asaas mapeia para um unico ciclo de assinatura.
-- Seguro agora (fluxo recorrente ainda nao grava dados); evita reprocessar o mesmo
-- pagamento em duas assinaturas distintas.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_subscriptions_last_payment_id
  ON public.subscriptions (last_payment_id)
  WHERE last_payment_id IS NOT NULL;

-- Comentarios nas colunas principais.
COMMENT ON COLUMN public.subscriptions.current_period_end IS 'Fim do ciclo pago da assinatura.';
COMMENT ON COLUMN public.subscriptions.access_until IS 'Data ate a qual o acesso deve permanecer ativo.';
COMMENT ON COLUMN public.subscriptions.cancel_at_period_end IS 'Indica cancelamento solicitado, mantendo acesso ate fim do periodo pago.';

COMMIT;
