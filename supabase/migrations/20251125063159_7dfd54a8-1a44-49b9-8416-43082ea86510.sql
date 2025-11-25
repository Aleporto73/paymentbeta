-- Add redirect URL field to product_upsells
ALTER TABLE product_upsells 
ADD COLUMN redirect_url TEXT;

COMMENT ON COLUMN product_upsells.redirect_url IS 'URL para redirecionar após pagamento aprovado do upsell';