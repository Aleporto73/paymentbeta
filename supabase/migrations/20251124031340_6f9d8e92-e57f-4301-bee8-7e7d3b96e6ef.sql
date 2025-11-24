-- Add default commission fields to products table
ALTER TABLE products 
ADD COLUMN default_commission_type text CHECK (default_commission_type IN ('percentage', 'fixed')) DEFAULT 'percentage',
ADD COLUMN default_commission_value numeric DEFAULT 0;

-- Add commission type to affiliate links
ALTER TABLE product_affiliate_links
ADD COLUMN commission_type text CHECK (commission_type IN ('percentage', 'fixed')) DEFAULT 'percentage';

-- Rename commission_percentage to commission_value for consistency
ALTER TABLE product_affiliate_links
RENAME COLUMN commission_percentage TO commission_value;

-- Create product_coupons table
CREATE TABLE product_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value numeric NOT NULL CHECK (discount_value > 0),
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on product_coupons
ALTER TABLE product_coupons ENABLE ROW LEVEL SECURITY;

-- RLS policies for product_coupons
CREATE POLICY "Users can view coupons for their products"
  ON product_coupons FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM products 
    WHERE products.id = product_coupons.product_id 
    AND products.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert coupons for their products"
  ON product_coupons FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM products 
    WHERE products.id = product_coupons.product_id 
    AND products.user_id = auth.uid()
  ));

CREATE POLICY "Users can update coupons for their products"
  ON product_coupons FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM products 
    WHERE products.id = product_coupons.product_id 
    AND products.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete coupons for their products"
  ON product_coupons FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM products 
    WHERE products.id = product_coupons.product_id 
    AND products.user_id = auth.uid()
  ));

-- Create index for faster coupon lookups
CREATE INDEX idx_product_coupons_product_id ON product_coupons(product_id);
CREATE INDEX idx_product_coupons_code ON product_coupons(code);