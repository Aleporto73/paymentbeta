-- Add affiliate_url column to product_affiliate_links if it doesn't exist
ALTER TABLE product_affiliate_links 
ADD COLUMN IF NOT EXISTS affiliate_url TEXT;