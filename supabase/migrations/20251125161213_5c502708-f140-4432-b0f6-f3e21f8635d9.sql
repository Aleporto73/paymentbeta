-- Permitir leitura pública de produtos para o checkout
CREATE POLICY "Allow public read access to products"
ON public.products
FOR SELECT
USING (true);

-- Permitir leitura pública de preços de produtos para o checkout
CREATE POLICY "Allow public read access to product_prices"
ON public.product_prices
FOR SELECT
USING (true);

-- Permitir leitura pública de order bumps para o checkout
CREATE POLICY "Allow public read access to product_order_bumps"
ON public.product_order_bumps
FOR SELECT
USING (true);

-- Permitir leitura pública de configurações de anúncios para o checkout
CREATE POLICY "Allow public read access to product_ads_configs"
ON public.product_ads_configs
FOR SELECT
USING (true);