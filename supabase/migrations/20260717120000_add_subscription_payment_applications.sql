-- Durable idempotency for recurring subscription payments.
--
-- This migration is intentionally local until it is reviewed and applied to
-- staging. The RPC is the single authority that advances a paid subscription
-- period: the ledger insert and subscription update run in the same database
-- transaction and are rolled back together on any error.

BEGIN;

CREATE TABLE IF NOT EXISTS public.subscription_payment_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL
    REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  asaas_payment_id text NOT NULL,
  event_type text NULL,
  effective_date timestamptz NOT NULL,
  previous_period_end timestamptz NULL,
  applied_period_start timestamptz NOT NULL,
  applied_period_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_payment_applications_subscription_payment_key
    UNIQUE (subscription_id, asaas_payment_id)
);

-- Seed the currently known applied payment before the RPC becomes authoritative.
-- Older finalized inbound events remain protected by asaas_webhook_events; this
-- backfill also protects the current payment if its inbound audit row is absent.
INSERT INTO public.subscription_payment_applications (
  subscription_id,
  asaas_payment_id,
  event_type,
  effective_date,
  previous_period_end,
  applied_period_start,
  applied_period_end
)
SELECT
  s.id,
  s.last_payment_id,
  'MIGRATION_BACKFILL',
  COALESCE(s.last_paid_at, s.current_period_start, s.updated_at, s.created_at),
  NULL,
  s.current_period_start,
  s.current_period_end
FROM public.subscriptions AS s
WHERE s.last_payment_id IS NOT NULL
  AND s.current_period_start IS NOT NULL
  AND s.current_period_end IS NOT NULL
  AND s.last_payment_status IN ('CONFIRMED', 'RECEIVED')
ON CONFLICT (subscription_id, asaas_payment_id) DO NOTHING;

ALTER TABLE public.subscription_payment_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view subscription payment applications"
  ON public.subscription_payment_applications;
CREATE POLICY "Admins can view subscription payment applications"
  ON public.subscription_payment_applications
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON TABLE public.subscription_payment_applications FROM anon, authenticated;
GRANT SELECT ON TABLE public.subscription_payment_applications TO authenticated;
GRANT ALL ON TABLE public.subscription_payment_applications TO service_role;

COMMENT ON TABLE public.subscription_payment_applications IS
  'Durable ledger of recurring payments already applied to subscription access.';
COMMENT ON COLUMN public.subscription_payment_applications.asaas_payment_id IS
  'Asaas payment id; unique per subscription and never removed from idempotency history.';

CREATE OR REPLACE FUNCTION public.apply_subscription_payment(
  p_subscription_id uuid,
  p_asaas_payment_id text,
  p_event_type text,
  p_effective_date timestamptz,
  p_payment_status text
)
RETURNS TABLE (
  application_result text,
  subscription jsonb,
  application jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_subscription public.subscriptions%ROWTYPE;
  v_existing_application public.subscription_payment_applications%ROWTYPE;
  v_application public.subscription_payment_applications%ROWTYPE;
  v_cycle_months integer;
  v_period_start timestamptz;
  v_period_start_utc timestamp without time zone;
  v_period_end timestamptz;
  v_previous_period_end timestamptz;
BEGIN
  IF p_subscription_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'subscription_id is required';
  END IF;

  IF p_asaas_payment_id IS NULL OR btrim(p_asaas_payment_id) = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'asaas_payment_id is required';
  END IF;

  IF p_effective_date IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'effective_date is required';
  END IF;

  -- Serialize every payment application for this subscription. A second
  -- worker waits here and observes the ledger row committed by the first.
  SELECT s.*
  INTO v_subscription
  FROM public.subscriptions AS s
  WHERE s.id = p_subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'subscription not found';
  END IF;

  SELECT spa.*
  INTO v_existing_application
  FROM public.subscription_payment_applications AS spa
  WHERE spa.subscription_id = p_subscription_id
    AND spa.asaas_payment_id = p_asaas_payment_id;

  IF FOUND THEN
    application_result := 'duplicate';
    subscription := to_jsonb(v_subscription);
    application := to_jsonb(v_existing_application);
    RETURN NEXT;
    RETURN;
  END IF;

  v_cycle_months := CASE v_subscription.cycle
    WHEN 'MONTHLY' THEN 1
    WHEN 'QUARTERLY' THEN 3
    WHEN 'SEMIANNUALLY' THEN 6
    WHEN 'YEARLY' THEN 12
    ELSE NULL
  END;

  IF v_cycle_months IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'subscription has an invalid cycle';
  END IF;

  v_previous_period_end := v_subscription.current_period_end;
  v_period_start := p_effective_date;

  IF v_subscription.current_period_end IS NOT NULL
    AND v_subscription.current_period_end > v_period_start THEN
    v_period_start := v_subscription.current_period_end;
  END IF;

  IF v_subscription.access_until IS NOT NULL
    AND v_subscription.access_until > v_period_start THEN
    v_period_start := v_subscription.access_until;
  END IF;

  -- Preserve the existing JavaScript setUTCMonth overflow semantics. For
  -- example, 2026-01-31 + 1 month becomes 2026-03-03 rather than truncating
  -- to the last day of February. Product may choose different semantics in a
  -- separate change.
  v_period_start_utc := v_period_start AT TIME ZONE 'UTC';
  v_period_end := (
    date_trunc('month', v_period_start_utc)
    + make_interval(months => v_cycle_months)
    + make_interval(days => extract(day FROM v_period_start_utc)::integer - 1)
    + (v_period_start_utc - date_trunc('day', v_period_start_utc))
  ) AT TIME ZONE 'UTC';

  INSERT INTO public.subscription_payment_applications (
    subscription_id,
    asaas_payment_id,
    event_type,
    effective_date,
    previous_period_end,
    applied_period_start,
    applied_period_end
  ) VALUES (
    p_subscription_id,
    p_asaas_payment_id,
    p_event_type,
    p_effective_date,
    v_previous_period_end,
    v_period_start,
    v_period_end
  )
  RETURNING * INTO v_application;

  UPDATE public.subscriptions AS s
  SET
    last_payment_id = p_asaas_payment_id,
    last_payment_status = p_payment_status,
    last_paid_at = p_effective_date,
    current_period_start = v_period_start,
    current_period_end = v_period_end,
    access_until = v_period_end,
    overdue_since = NULL,
    ended_at = NULL,
    status = CASE
      WHEN s.status IN ('INACTIVE', 'EXPIRED', 'OVERDUE') THEN 'ACTIVE'
      ELSE s.status
    END,
    updated_at = now()
  WHERE s.id = p_subscription_id
  RETURNING s.* INTO v_subscription;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'subscription disappeared during payment application';
  END IF;

  application_result := 'applied';
  subscription := to_jsonb(v_subscription);
  application := to_jsonb(v_application);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_subscription_payment(
  uuid, text, text, timestamptz, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_subscription_payment(
  uuid, text, text, timestamptz, text
) TO service_role;

COMMENT ON FUNCTION public.apply_subscription_payment(
  uuid, text, text, timestamptz, text
) IS
  'Atomically records and applies one recurring payment. Returns applied or duplicate.';

COMMIT;
