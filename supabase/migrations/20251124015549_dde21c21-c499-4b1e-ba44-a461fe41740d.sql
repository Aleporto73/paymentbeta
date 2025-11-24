-- Corrigir função generate_unique_code com search_path
CREATE OR REPLACE FUNCTION generate_unique_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Corrigir função set_product_unique_code com search_path
CREATE OR REPLACE FUNCTION set_product_unique_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
  code_exists boolean;
BEGIN
  LOOP
    new_code := generate_unique_code();
    SELECT EXISTS(SELECT 1 FROM products WHERE unique_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  NEW.unique_code := new_code;
  RETURN NEW;
END;
$$;

-- Corrigir função set_price_unique_code com search_path
CREATE OR REPLACE FUNCTION set_price_unique_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
  code_exists boolean;
BEGIN
  LOOP
    new_code := generate_unique_code();
    SELECT EXISTS(SELECT 1 FROM product_prices WHERE unique_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  NEW.unique_code := new_code;
  RETURN NEW;
END;
$$;