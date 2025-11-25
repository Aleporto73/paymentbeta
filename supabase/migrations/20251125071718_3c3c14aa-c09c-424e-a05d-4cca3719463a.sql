-- Create table for product ads configuration
CREATE TABLE IF NOT EXISTS public.product_ads_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok', 'taboola')),
  pixel_id TEXT,
  token TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_ads_configs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view ads configs for their products"
  ON public.product_ads_configs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_ads_configs.product_id
      AND products.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert ads configs for their products"
  ON public.product_ads_configs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_ads_configs.product_id
      AND products.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update ads configs for their products"
  ON public.product_ads_configs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_ads_configs.product_id
      AND products.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete ads configs for their products"
  ON public.product_ads_configs
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_ads_configs.product_id
      AND products.user_id = auth.uid()
    )
  );

-- Create trigger for updated_at
CREATE TRIGGER update_product_ads_configs_updated_at
  BEFORE UPDATE ON public.product_ads_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();