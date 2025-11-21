-- Add price and installments to products table
ALTER TABLE products 
ADD COLUMN price DECIMAL(10, 2) NOT NULL DEFAULT 0,
ADD COLUMN installments INTEGER NOT NULL DEFAULT 1;