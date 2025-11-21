-- Create enums for product management
CREATE TYPE product_category AS ENUM (
  'saude_esportes',
  'financas_investimentos',
  'relacionamentos',
  'negocios_carreira',
  'espiritualidade',
  'sexualidade',
  'entretenimento',
  'culinaria_gastronomia',
  'idiomas',
  'direito',
  'apps_software',
  'literatura',
  'casa_construcao',
  'desenvolvimento_pessoal',
  'moda_beleza',
  'animais_plantas',
  'educacional',
  'hobbies',
  'design',
  'internet',
  'ecologia_meio_ambiente',
  'musica_artes',
  'tecnologia_informacao',
  'outros',
  'empreendedorismo_digital'
);

CREATE TYPE product_type AS ENUM ('recorrente', 'pagamento_unico');

CREATE TYPE payment_method AS ENUM (
  'a_vista',
  'parcelado_taxa_cliente',
  'parcelado_taxa_vendedor'
);

CREATE TYPE subscription_period AS ENUM ('mensal', 'trimestral', 'semestral', 'anual');

-- Create products table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id INTEGER UNIQUE NOT NULL,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  category product_category NOT NULL,
  product_type product_type NOT NULL,
  payment_method payment_method NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create sequence for display_id starting at 100
CREATE SEQUENCE products_display_id_seq START WITH 100;
ALTER TABLE products ALTER COLUMN display_id SET DEFAULT nextval('products_display_id_seq');

-- Create product_prices table for multiple prices per product
CREATE TABLE product_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  subscription_period subscription_period,
  installments INTEGER DEFAULT 1,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create product_affiliate_links table for commission tracking
CREATE TABLE product_affiliate_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  affiliate_name TEXT NOT NULL,
  affiliate_url TEXT NOT NULL,
  commission_percentage DECIMAL(5, 2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create product_sales table for reporting
CREATE TABLE product_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_price_id UUID REFERENCES product_prices(id),
  affiliate_link_id UUID REFERENCES product_affiliate_links(id),
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  sale_amount DECIMAL(10, 2) NOT NULL,
  commission_amount DECIMAL(10, 2),
  sale_date TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_affiliate_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_sales ENABLE ROW LEVEL SECURITY;

-- RLS Policies for products
CREATE POLICY "Users can view their own products"
  ON products FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own products"
  ON products FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own products"
  ON products FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own products"
  ON products FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for product_prices
CREATE POLICY "Users can view prices for their products"
  ON product_prices FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM products WHERE products.id = product_prices.product_id AND products.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert prices for their products"
  ON product_prices FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM products WHERE products.id = product_prices.product_id AND products.user_id = auth.uid()
  ));

CREATE POLICY "Users can update prices for their products"
  ON product_prices FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM products WHERE products.id = product_prices.product_id AND products.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete prices for their products"
  ON product_prices FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM products WHERE products.id = product_prices.product_id AND products.user_id = auth.uid()
  ));

-- RLS Policies for product_affiliate_links
CREATE POLICY "Users can view affiliate links for their products"
  ON product_affiliate_links FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM products WHERE products.id = product_affiliate_links.product_id AND products.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert affiliate links for their products"
  ON product_affiliate_links FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM products WHERE products.id = product_affiliate_links.product_id AND products.user_id = auth.uid()
  ));

CREATE POLICY "Users can update affiliate links for their products"
  ON product_affiliate_links FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM products WHERE products.id = product_affiliate_links.product_id AND products.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete affiliate links for their products"
  ON product_affiliate_links FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM products WHERE products.id = product_affiliate_links.product_id AND products.user_id = auth.uid()
  ));

-- RLS Policies for product_sales
CREATE POLICY "Users can view sales for their products"
  ON product_sales FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM products WHERE products.id = product_sales.product_id AND products.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert sales for their products"
  ON product_sales FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM products WHERE products.id = product_sales.product_id AND products.user_id = auth.uid()
  ));

-- Create trigger for updated_at on products
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_products_user_id ON products(user_id);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_display_id ON products(display_id);
CREATE INDEX idx_product_prices_product_id ON product_prices(product_id);
CREATE INDEX idx_product_affiliate_links_product_id ON product_affiliate_links(product_id);
CREATE INDEX idx_product_sales_product_id ON product_sales(product_id);
CREATE INDEX idx_product_sales_sale_date ON product_sales(sale_date);