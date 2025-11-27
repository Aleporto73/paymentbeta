-- Add credit_card_token column to transactions table for one-click payments
ALTER TABLE public.transactions 
ADD COLUMN credit_card_token text;

COMMENT ON COLUMN public.transactions.credit_card_token IS 'Asaas credit card token for one-click payments';