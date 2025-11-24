-- Create affiliates table
CREATE TABLE public.affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  is_active BOOLEAN DEFAULT true
);

-- Enable RLS
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for affiliates
CREATE POLICY "Users can view all affiliates"
  ON public.affiliates
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert affiliates"
  ON public.affiliates
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own affiliate profile"
  ON public.affiliates
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Owners can delete affiliates"
  ON public.affiliates
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM products 
    WHERE products.user_id = auth.uid()
  ));

-- Modify product_affiliate_links to reference affiliates table
ALTER TABLE public.product_affiliate_links 
  ADD COLUMN affiliate_id UUID REFERENCES public.affiliates(id) ON DELETE CASCADE;

-- Make affiliate_name and affiliate_url nullable since they'll come from affiliates table
ALTER TABLE public.product_affiliate_links 
  ALTER COLUMN affiliate_name DROP NOT NULL,
  ALTER COLUMN affiliate_url DROP NOT NULL;

-- Create index for better performance
CREATE INDEX idx_product_affiliate_links_affiliate_id ON public.product_affiliate_links(affiliate_id);
CREATE INDEX idx_affiliates_user_id ON public.affiliates(user_id);
CREATE INDEX idx_affiliates_email ON public.affiliates(email);