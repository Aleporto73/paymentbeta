-- Migration: add_subscription_email_events
-- Log/idempotency table for automatic subscription management e-mails.
-- This table must never store raw tokens, token hashes, full management URLs,
-- HTML bodies, or provider payloads containing sensitive links.

BEGIN;

CREATE TABLE IF NOT EXISTS public.subscription_email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  transaction_id uuid NULL REFERENCES public.transactions(id) ON DELETE SET NULL,
  asaas_payment_id text NOT NULL,
  template_key text NOT NULL,
  recipient_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  resend_message_id text NULL,
  error_message text NULL,
  sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscription_email_events_status_check'
      AND conrelid = 'public.subscription_email_events'::regclass
  ) THEN
    ALTER TABLE public.subscription_email_events
      ADD CONSTRAINT subscription_email_events_status_check
      CHECK (status IN ('pending', 'sent', 'failed', 'skipped'));
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS subscription_email_events_idempotency_uidx
  ON public.subscription_email_events (subscription_id, template_key, asaas_payment_id);

CREATE INDEX IF NOT EXISTS idx_subscription_email_events_subscription_id
  ON public.subscription_email_events (subscription_id);

CREATE INDEX IF NOT EXISTS idx_subscription_email_events_transaction_id
  ON public.subscription_email_events (transaction_id);

CREATE INDEX IF NOT EXISTS idx_subscription_email_events_asaas_payment_id
  ON public.subscription_email_events (asaas_payment_id);

CREATE INDEX IF NOT EXISTS idx_subscription_email_events_status
  ON public.subscription_email_events (status);

DROP TRIGGER IF EXISTS update_subscription_email_events_updated_at ON public.subscription_email_events;
CREATE TRIGGER update_subscription_email_events_updated_at
  BEFORE UPDATE ON public.subscription_email_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.subscription_email_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage subscription email events" ON public.subscription_email_events;
CREATE POLICY "Admins can manage subscription email events"
  ON public.subscription_email_events
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.subscription_email_events IS 'Audit/idempotency log for subscription transactional e-mails. Never stores raw tokens, token hashes, full management URLs, HTML bodies, or provider payloads.';
COMMENT ON COLUMN public.subscription_email_events.template_key IS 'Logical e-mail template key, e.g. subscription_management_link.';
COMMENT ON COLUMN public.subscription_email_events.error_message IS 'Sanitized provider/configuration error only; must not include tokens or full management URLs.';

COMMIT;
