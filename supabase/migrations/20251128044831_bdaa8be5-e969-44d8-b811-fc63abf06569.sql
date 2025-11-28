-- Add preview customization columns to product_upsells table
ALTER TABLE product_upsells
ADD COLUMN IF NOT EXISTS preview_background_color TEXT DEFAULT '#f8f9fa',
ADD COLUMN IF NOT EXISTS preview_text_color TEXT DEFAULT '#1f2937',
ADD COLUMN IF NOT EXISTS preview_button_color TEXT DEFAULT '#3b82f6';