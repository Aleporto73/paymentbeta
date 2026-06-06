ALTER TABLE public.affiliates
ADD COLUMN IF NOT EXISTS asaas_wallet_id text null;
