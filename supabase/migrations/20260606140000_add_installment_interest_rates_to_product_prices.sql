ALTER TABLE public.product_prices
ADD COLUMN IF NOT EXISTS installment_interest_rates jsonb NULL;

COMMENT ON COLUMN public.product_prices.installment_interest_rates IS
'Percentual de acrescimo por quantidade de parcelas. Exemplo: {"2": 3.99, "3": 5.99}.';
