-- Add the database foundation for real financial reconciliation.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS coupon_code text NULL;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) NULL DEFAULT 0;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS installment_fee_amount numeric(10,2) NULL DEFAULT 0;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS asaas_fee_amount numeric(10,2) NULL;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS affiliate_split_total numeric(10,2) NULL;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS producer_net_amount numeric(10,2) NULL;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS asaas_raw_payload jsonb NULL;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS reconciliation_status text NULL DEFAULT 'pending';

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS reconciliation_notes text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_reconciliation_status_check'
      AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_reconciliation_status_check
      CHECK (
        reconciliation_status IS NULL
        OR reconciliation_status IN (
          'pending',
          'partial',
          'reconciled',
          'divergent',
          'not_applicable'
        )
      );
  END IF;
END $$;

ALTER TABLE public.product_sales
  ADD COLUMN IF NOT EXISTS transaction_id uuid NULL;

ALTER TABLE public.product_sales
  ADD COLUMN IF NOT EXISTS asaas_payment_id text NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_sales'
      AND column_name = 'transaction_id'
      AND udt_name = 'uuid'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'id'
      AND udt_name = 'uuid'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_sales_transaction_id_fkey'
      AND conrelid = 'public.product_sales'::regclass
  ) THEN
    ALTER TABLE public.product_sales
      ADD CONSTRAINT product_sales_transaction_id_fkey
      FOREIGN KEY (transaction_id)
      REFERENCES public.transactions(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_sales_transaction_id
  ON public.product_sales(transaction_id);

CREATE INDEX IF NOT EXISTS idx_product_sales_asaas_payment_id
  ON public.product_sales(asaas_payment_id);

CREATE TABLE IF NOT EXISTS public.transaction_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  asaas_payment_id text NULL,
  affiliate_id uuid NULL REFERENCES public.affiliates(id) ON DELETE SET NULL,
  affiliate_link_id uuid NULL REFERENCES public.product_affiliate_links(id) ON DELETE SET NULL,
  wallet_id text NULL,
  split_type text NULL,
  split_percentage numeric(10,4) NULL,
  split_fixed_value numeric(10,2) NULL,
  planned_amount numeric(10,2) NULL,
  received_amount numeric(10,2) NULL,
  status text NOT NULL DEFAULT 'planned',
  raw_payload jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transaction_splits_status_check'
      AND conrelid = 'public.transaction_splits'::regclass
  ) THEN
    ALTER TABLE public.transaction_splits
      ADD CONSTRAINT transaction_splits_status_check
      CHECK (
        status IN (
          'planned',
          'sent',
          'received',
          'partial',
          'divergent',
          'failed',
          'unknown'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transaction_splits_transaction_id
  ON public.transaction_splits(transaction_id);

CREATE INDEX IF NOT EXISTS idx_transaction_splits_asaas_payment_id
  ON public.transaction_splits(asaas_payment_id);

CREATE INDEX IF NOT EXISTS idx_transaction_splits_affiliate_id
  ON public.transaction_splits(affiliate_id);

CREATE INDEX IF NOT EXISTS idx_transaction_splits_affiliate_link_id
  ON public.transaction_splits(affiliate_link_id);

CREATE INDEX IF NOT EXISTS idx_transaction_splits_wallet_id
  ON public.transaction_splits(wallet_id);

CREATE INDEX IF NOT EXISTS idx_transaction_splits_status
  ON public.transaction_splits(status);

CREATE INDEX IF NOT EXISTS idx_transaction_splits_created_at
  ON public.transaction_splits(created_at);

ALTER TABLE public.transaction_splits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_transaction_splits_updated_at'
      AND tgrelid = 'public.transaction_splits'::regclass
  ) THEN
    CREATE TRIGGER update_transaction_splits_updated_at
      BEFORE UPDATE ON public.transaction_splits
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
      AND tablename = 'transaction_splits'
      AND policyname = 'Admins can manage transaction splits'
  ) THEN
    CREATE POLICY "Admins can manage transaction splits"
    ON public.transaction_splits
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;
