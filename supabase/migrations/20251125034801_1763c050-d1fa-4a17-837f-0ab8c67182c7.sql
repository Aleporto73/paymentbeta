-- Create table for Asaas customers (clientes no Asaas)
CREATE TABLE IF NOT EXISTS public.asaas_customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  asaas_customer_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  cpf_cnpj TEXT,
  phone TEXT,
  mobile_phone TEXT,
  postal_code TEXT,
  address TEXT,
  address_number TEXT,
  complement TEXT,
  province TEXT,
  city TEXT,
  state TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for transactions (todas as transações de pagamento)
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  asaas_payment_id TEXT NOT NULL UNIQUE,
  asaas_customer_id TEXT,
  product_id UUID,
  price_id UUID,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_cpf_cnpj TEXT,
  customer_phone TEXT,
  customer_state TEXT,
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL,
  value NUMERIC NOT NULL,
  net_value NUMERIC,
  due_date DATE,
  payment_date TIMESTAMP WITH TIME ZONE,
  confirmed_date TIMESTAMP WITH TIME ZONE,
  credit_date DATE,
  billing_type TEXT NOT NULL,
  description TEXT,
  external_reference TEXT,
  affiliate_code TEXT,
  order_bumps_selected TEXT[],
  order_bumps_amount NUMERIC DEFAULT 0,
  installment_count INTEGER DEFAULT 1,
  installment_value NUMERIC,
  device_type TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (price_id) REFERENCES product_prices(id) ON DELETE SET NULL
);

-- Create table for subscriptions (assinaturas recorrentes)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  asaas_subscription_id TEXT NOT NULL UNIQUE,
  asaas_customer_id TEXT NOT NULL,
  product_id UUID,
  affiliate_code TEXT,
  status TEXT NOT NULL,
  value NUMERIC NOT NULL,
  next_due_date DATE,
  cycle TEXT NOT NULL,
  description TEXT,
  billing_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMP WITH TIME ZONE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.asaas_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Create policies for asaas_customers
CREATE POLICY "Users can view their own customers" 
ON public.asaas_customers 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own customers" 
ON public.asaas_customers 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own customers" 
ON public.asaas_customers 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create policies for transactions
CREATE POLICY "Users can view their own transactions" 
ON public.transactions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions" 
ON public.transactions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transactions" 
ON public.transactions 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create policies for subscriptions
CREATE POLICY "Users can view their own subscriptions" 
ON public.subscriptions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions" 
ON public.subscriptions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions" 
ON public.subscriptions 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Add triggers for automatic timestamp updates
CREATE TRIGGER update_asaas_customers_updated_at
BEFORE UPDATE ON public.asaas_customers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
BEFORE UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better query performance
CREATE INDEX idx_asaas_customers_user_id ON public.asaas_customers(user_id);
CREATE INDEX idx_asaas_customers_asaas_id ON public.asaas_customers(asaas_customer_id);
CREATE INDEX idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX idx_transactions_product_id ON public.transactions(product_id);
CREATE INDEX idx_transactions_status ON public.transactions(status);
CREATE INDEX idx_transactions_payment_date ON public.transactions(payment_date);
CREATE INDEX idx_transactions_customer_state ON public.transactions(customer_state);
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);