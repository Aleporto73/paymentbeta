-- Create table for order bumps
CREATE TABLE public.product_order_bumps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL,
  order_bump_product_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.product_order_bumps ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view order bumps for their products"
ON public.product_order_bumps
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM products
    WHERE products.id = product_order_bumps.product_id
    AND products.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert order bumps for their products"
ON public.product_order_bumps
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM products
    WHERE products.id = product_order_bumps.product_id
    AND products.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update order bumps for their products"
ON public.product_order_bumps
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM products
    WHERE products.id = product_order_bumps.product_id
    AND products.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete order bumps for their products"
ON public.product_order_bumps
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM products
    WHERE products.id = product_order_bumps.product_id
    AND products.user_id = auth.uid()
  )
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_product_order_bumps_updated_at
BEFORE UPDATE ON public.product_order_bumps
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();