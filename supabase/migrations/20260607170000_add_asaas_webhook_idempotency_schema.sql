-- Add idempotency foundations for inbound Asaas webhooks.

CREATE TABLE IF NOT EXISTS public.asaas_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asaas_payment_id text NOT NULL,
  event_type text NOT NULL,
  asaas_event_id text NULL,
  status text NOT NULL DEFAULT 'received',
  raw_payload jsonb NULL,
  processed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'asaas_webhook_events_status_check'
      AND conrelid = 'public.asaas_webhook_events'::regclass
  ) THEN
    ALTER TABLE public.asaas_webhook_events
      ADD CONSTRAINT asaas_webhook_events_status_check
      CHECK (
        status IN (
          'received',
          'processed',
          'duplicate',
          'ignored',
          'failed'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.asaas_webhook_events_payment_event_uidx') IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM (
        SELECT asaas_payment_id, event_type
        FROM public.asaas_webhook_events
        GROUP BY asaas_payment_id, event_type
        HAVING count(*) > 1
      ) duplicates
    ) THEN
      RAISE NOTICE 'Skipped asaas_webhook_events_payment_event_uidx because duplicate Asaas webhook events exist.';
    ELSE
      EXECUTE 'CREATE UNIQUE INDEX asaas_webhook_events_payment_event_uidx ON public.asaas_webhook_events(asaas_payment_id, event_type)';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.asaas_webhook_events_asaas_event_id_uidx') IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM (
        SELECT asaas_event_id
        FROM public.asaas_webhook_events
        WHERE asaas_event_id IS NOT NULL
        GROUP BY asaas_event_id
        HAVING count(*) > 1
      ) duplicates
    ) THEN
      RAISE NOTICE 'Skipped asaas_webhook_events_asaas_event_id_uidx because duplicate Asaas event ids exist.';
    ELSE
      EXECUTE 'CREATE UNIQUE INDEX asaas_webhook_events_asaas_event_id_uidx ON public.asaas_webhook_events(asaas_event_id) WHERE asaas_event_id IS NOT NULL';
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_asaas_webhook_events_payment_id
  ON public.asaas_webhook_events(asaas_payment_id);

CREATE INDEX IF NOT EXISTS idx_asaas_webhook_events_event_type
  ON public.asaas_webhook_events(event_type);

CREATE INDEX IF NOT EXISTS idx_asaas_webhook_events_status
  ON public.asaas_webhook_events(status);

CREATE INDEX IF NOT EXISTS idx_asaas_webhook_events_created_at
  ON public.asaas_webhook_events(created_at);

DO $$
BEGIN
  IF to_regclass('public.product_sales_transaction_id_uidx') IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM (
        SELECT transaction_id
        FROM public.product_sales
        WHERE transaction_id IS NOT NULL
        GROUP BY transaction_id
        HAVING count(*) > 1
      ) duplicates
    ) THEN
      RAISE NOTICE 'Skipped product_sales_transaction_id_uidx because duplicate product_sales.transaction_id values exist.';
    ELSE
      EXECUTE 'CREATE UNIQUE INDEX product_sales_transaction_id_uidx ON public.product_sales(transaction_id) WHERE transaction_id IS NOT NULL';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.product_sales_asaas_payment_id_uidx') IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM (
        SELECT asaas_payment_id
        FROM public.product_sales
        WHERE asaas_payment_id IS NOT NULL
        GROUP BY asaas_payment_id
        HAVING count(*) > 1
      ) duplicates
    ) THEN
      RAISE NOTICE 'Skipped product_sales_asaas_payment_id_uidx because duplicate product_sales.asaas_payment_id values exist.';
    ELSE
      EXECUTE 'CREATE UNIQUE INDEX product_sales_asaas_payment_id_uidx ON public.product_sales(asaas_payment_id) WHERE asaas_payment_id IS NOT NULL';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.transaction_splits_transaction_wallet_uidx') IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM (
        SELECT transaction_id, wallet_id
        FROM public.transaction_splits
        WHERE transaction_id IS NOT NULL
          AND wallet_id IS NOT NULL
        GROUP BY transaction_id, wallet_id
        HAVING count(*) > 1
      ) duplicates
    ) THEN
      RAISE NOTICE 'Skipped transaction_splits_transaction_wallet_uidx because duplicate transaction_splits transaction/wallet values exist.';
    ELSE
      EXECUTE 'CREATE UNIQUE INDEX transaction_splits_transaction_wallet_uidx ON public.transaction_splits(transaction_id, wallet_id) WHERE transaction_id IS NOT NULL AND wallet_id IS NOT NULL';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.transaction_splits_payment_wallet_uidx') IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM (
        SELECT asaas_payment_id, wallet_id
        FROM public.transaction_splits
        WHERE asaas_payment_id IS NOT NULL
          AND wallet_id IS NOT NULL
        GROUP BY asaas_payment_id, wallet_id
        HAVING count(*) > 1
      ) duplicates
    ) THEN
      RAISE NOTICE 'Skipped transaction_splits_payment_wallet_uidx because duplicate transaction_splits payment/wallet values exist.';
    ELSE
      EXECUTE 'CREATE UNIQUE INDEX transaction_splits_payment_wallet_uidx ON public.transaction_splits(asaas_payment_id, wallet_id) WHERE asaas_payment_id IS NOT NULL AND wallet_id IS NOT NULL';
    END IF;
  END IF;
END $$;

ALTER TABLE public.asaas_webhook_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_asaas_webhook_events_updated_at'
      AND tgrelid = 'public.asaas_webhook_events'::regclass
  ) THEN
    CREATE TRIGGER update_asaas_webhook_events_updated_at
      BEFORE UPDATE ON public.asaas_webhook_events
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'asaas_webhook_events'
      AND policyname = 'Admins can manage Asaas webhook events'
  ) THEN
    CREATE POLICY "Admins can manage Asaas webhook events"
    ON public.asaas_webhook_events
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;
