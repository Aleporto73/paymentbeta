-- Add display_order column to product_order_bumps table
ALTER TABLE product_order_bumps 
ADD COLUMN display_order integer NOT NULL DEFAULT 1;

-- Add comment to explain the column
COMMENT ON COLUMN product_order_bumps.display_order IS 'Order of display for multiple order bumps on the same product. Lower numbers appear first.';