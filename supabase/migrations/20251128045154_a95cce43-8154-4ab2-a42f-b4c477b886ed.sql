-- Create product_upsell_analytics table
CREATE TABLE IF NOT EXISTS product_upsell_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upsell_id UUID NOT NULL REFERENCES product_upsells(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'accept', 'reject')),
  revenue_generated NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE product_upsell_analytics ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view all upsell analytics"
  ON product_upsell_analytics
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Public can insert analytics"
  ON product_upsell_analytics
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_upsell_analytics_upsell_id ON product_upsell_analytics(upsell_id);
CREATE INDEX IF NOT EXISTS idx_upsell_analytics_product_id ON product_upsell_analytics(product_id);
CREATE INDEX IF NOT EXISTS idx_upsell_analytics_created_at ON product_upsell_analytics(created_at DESC);