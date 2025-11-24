-- Create table to track order bump analytics
CREATE TABLE product_order_bump_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_bump_id uuid NOT NULL REFERENCES product_order_bumps(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('view', 'accept', 'reject')),
  revenue_generated numeric DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add RLS policies
ALTER TABLE product_order_bump_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view analytics for their order bumps"
ON product_order_bump_analytics
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM products
    WHERE products.id = product_order_bump_analytics.product_id
    AND products.user_id = auth.uid()
  )
);

CREATE POLICY "Public can insert analytics"
ON product_order_bump_analytics
FOR INSERT
WITH CHECK (true);

-- Create index for better query performance
CREATE INDEX idx_order_bump_analytics_order_bump_id ON product_order_bump_analytics(order_bump_id);
CREATE INDEX idx_order_bump_analytics_created_at ON product_order_bump_analytics(created_at);

-- Add preview customization columns to product_order_bumps
ALTER TABLE product_order_bumps 
ADD COLUMN preview_background_color text DEFAULT '#f8f9fa',
ADD COLUMN preview_text_color text DEFAULT '#1f2937',
ADD COLUMN preview_button_color text DEFAULT '#3b82f6',
ADD COLUMN preview_position text DEFAULT 'below_product' CHECK (preview_position IN ('below_product', 'sidebar', 'popup'));

COMMENT ON COLUMN product_order_bumps.preview_background_color IS 'Background color for the order bump preview';
COMMENT ON COLUMN product_order_bumps.preview_text_color IS 'Text color for the order bump preview';
COMMENT ON COLUMN product_order_bumps.preview_button_color IS 'Button color for the order bump preview';
COMMENT ON COLUMN product_order_bumps.preview_position IS 'Position where the order bump will be displayed';