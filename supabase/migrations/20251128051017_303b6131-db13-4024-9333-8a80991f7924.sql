-- Add button text customization columns to product_upsells
ALTER TABLE product_upsells
ADD COLUMN accept_button_text text DEFAULT 'Sim, eu quero!',
ADD COLUMN decline_button_text text DEFAULT 'Não, obrigado';