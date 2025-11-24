-- Create table for tracking link clicks
CREATE TABLE IF NOT EXISTS public.product_link_clicks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price_id UUID NOT NULL REFERENCES public.product_prices(id) ON DELETE CASCADE,
  clicked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_agent TEXT,
  referrer TEXT,
  ip_address TEXT
);

-- Enable RLS
ALTER TABLE public.product_link_clicks ENABLE ROW LEVEL SECURITY;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_product_link_clicks_product_id ON public.product_link_clicks(product_id);
CREATE INDEX IF NOT EXISTS idx_product_link_clicks_price_id ON public.product_link_clicks(price_id);
CREATE INDEX IF NOT EXISTS idx_product_link_clicks_clicked_at ON public.product_link_clicks(clicked_at);

-- RLS Policies
CREATE POLICY "Users can view clicks for their products"
  ON public.product_link_clicks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_link_clicks.product_id
      AND products.user_id = auth.uid()
    )
  );

CREATE POLICY "Public can insert clicks"
  ON public.product_link_clicks
  FOR INSERT
  WITH CHECK (true);