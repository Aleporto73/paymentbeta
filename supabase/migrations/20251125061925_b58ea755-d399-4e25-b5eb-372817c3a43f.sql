-- Create product_upsells table
CREATE TABLE IF NOT EXISTS public.product_upsells (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  upsell_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL,
  discount_percentage NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 1,
  unique_code TEXT NOT NULL UNIQUE DEFAULT generate_unique_code(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create transaction_tokens table for one-click validation
CREATE TABLE IF NOT EXISTS public.transaction_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  asaas_customer_id TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create upsell_transactions table to track upsell sales
CREATE TABLE IF NOT EXISTS public.upsell_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  upsell_id UUID NOT NULL REFERENCES public.product_upsells(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  token_used TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_upsells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upsell_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for product_upsells
CREATE POLICY "Users can view upsells for their products"
  ON public.product_upsells FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_upsells.product_id
      AND products.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert upsells for their products"
  ON public.product_upsells FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_upsells.product_id
      AND products.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update upsells for their products"
  ON public.product_upsells FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_upsells.product_id
      AND products.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete upsells for their products"
  ON public.product_upsells FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_upsells.product_id
      AND products.user_id = auth.uid()
    )
  );

-- RLS Policies for transaction_tokens (public can read with valid token)
CREATE POLICY "Public can read valid tokens"
  ON public.transaction_tokens FOR SELECT
  USING (expires_at > now() AND used = false);

-- RLS Policies for upsell_transactions
CREATE POLICY "Users can view upsell transactions for their products"
  ON public.upsell_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
      JOIN public.products p ON p.id = t.product_id
      WHERE t.id = upsell_transactions.transaction_id
      AND p.user_id = auth.uid()
    )
  );

-- Create indexes for performance
CREATE INDEX idx_product_upsells_product_id ON public.product_upsells(product_id);
CREATE INDEX idx_product_upsells_unique_code ON public.product_upsells(unique_code);
CREATE INDEX idx_transaction_tokens_token ON public.transaction_tokens(token);
CREATE INDEX idx_transaction_tokens_expires_at ON public.transaction_tokens(expires_at);
CREATE INDEX idx_upsell_transactions_original_transaction_id ON public.upsell_transactions(original_transaction_id);

-- Trigger to update updated_at
CREATE TRIGGER update_product_upsells_updated_at
  BEFORE UPDATE ON public.product_upsells
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();