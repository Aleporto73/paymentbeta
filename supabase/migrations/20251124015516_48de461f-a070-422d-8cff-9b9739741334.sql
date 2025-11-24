-- Função para gerar códigos únicos alfanuméricos curtos (8 caracteres)
CREATE OR REPLACE FUNCTION generate_unique_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Sem caracteres confusos (0, O, I, 1)
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Adicionar coluna unique_code na tabela products
ALTER TABLE public.products ADD COLUMN unique_code text;

-- Adicionar coluna unique_code na tabela product_prices
ALTER TABLE public.product_prices ADD COLUMN unique_code text;

-- Criar índices únicos para os códigos
CREATE UNIQUE INDEX products_unique_code_idx ON public.products(unique_code);
CREATE UNIQUE INDEX product_prices_unique_code_idx ON public.product_prices(unique_code);

-- Função trigger para gerar código único ao criar produto
CREATE OR REPLACE FUNCTION set_product_unique_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_code text;
  code_exists boolean;
BEGIN
  -- Gerar código único até encontrar um que não existe
  LOOP
    new_code := generate_unique_code();
    SELECT EXISTS(SELECT 1 FROM products WHERE unique_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  NEW.unique_code := new_code;
  RETURN NEW;
END;
$$;

-- Função trigger para gerar código único ao criar preço/plano
CREATE OR REPLACE FUNCTION set_price_unique_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_code text;
  code_exists boolean;
BEGIN
  -- Gerar código único até encontrar um que não existe
  LOOP
    new_code := generate_unique_code();
    SELECT EXISTS(SELECT 1 FROM product_prices WHERE unique_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  NEW.unique_code := new_code;
  RETURN NEW;
END;
$$;

-- Criar triggers
CREATE TRIGGER products_set_unique_code
  BEFORE INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION set_product_unique_code();

CREATE TRIGGER product_prices_set_unique_code
  BEFORE INSERT ON public.product_prices
  FOR EACH ROW
  EXECUTE FUNCTION set_price_unique_code();

-- Gerar códigos únicos para produtos existentes
UPDATE public.products 
SET unique_code = generate_unique_code() 
WHERE unique_code IS NULL;

-- Gerar códigos únicos para preços existentes
UPDATE public.product_prices 
SET unique_code = generate_unique_code() 
WHERE unique_code IS NULL;

-- Tornar as colunas NOT NULL após popular os dados existentes
ALTER TABLE public.products ALTER COLUMN unique_code SET NOT NULL;
ALTER TABLE public.product_prices ALTER COLUMN unique_code SET NOT NULL;