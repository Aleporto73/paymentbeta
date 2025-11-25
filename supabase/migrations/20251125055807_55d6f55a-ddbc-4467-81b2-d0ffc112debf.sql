-- Add checkout customization fields to products table
ALTER TABLE products
ADD COLUMN checkout_header_image_url text,
ADD COLUMN approved_payment_redirect_url text,
ADD COLUMN rejected_payment_redirect_url text;