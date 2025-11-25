-- Remove políticas antigas que limitam por user_id e cria políticas para todos os usuários autenticados

-- PRODUCTS
DROP POLICY IF EXISTS "Users can insert their own products" ON public.products;
DROP POLICY IF EXISTS "Users can update their own products" ON public.products;
DROP POLICY IF EXISTS "Users can delete their own products" ON public.products;
DROP POLICY IF EXISTS "Users can view their own products" ON public.products;

CREATE POLICY "Authenticated users can insert products"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update products"
ON public.products
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete products"
ON public.products
FOR DELETE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view all products"
ON public.products
FOR SELECT
TO authenticated
USING (true);

-- TRANSACTIONS
DROP POLICY IF EXISTS "Users can insert their own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can update their own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can view their own transactions" ON public.transactions;

CREATE POLICY "Authenticated users can insert transactions"
ON public.transactions
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update transactions"
ON public.transactions
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view all transactions"
ON public.transactions
FOR SELECT
TO authenticated
USING (true);

-- SUBSCRIPTIONS
DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.subscriptions;

CREATE POLICY "Authenticated users can insert subscriptions"
ON public.subscriptions
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update subscriptions"
ON public.subscriptions
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view all subscriptions"
ON public.subscriptions
FOR SELECT
TO authenticated
USING (true);

-- INTEGRATION_SETTINGS
DROP POLICY IF EXISTS "Users can create their own integration settings" ON public.integration_settings;
DROP POLICY IF EXISTS "Users can delete their own integration settings" ON public.integration_settings;
DROP POLICY IF EXISTS "Users can update their own integration settings" ON public.integration_settings;
DROP POLICY IF EXISTS "Users can view their own integration settings" ON public.integration_settings;

CREATE POLICY "Authenticated users can insert integration settings"
ON public.integration_settings
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update integration settings"
ON public.integration_settings
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete integration settings"
ON public.integration_settings
FOR DELETE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view all integration settings"
ON public.integration_settings
FOR SELECT
TO authenticated
USING (true);

-- ASAAS_CUSTOMERS
DROP POLICY IF EXISTS "Users can insert their own customers" ON public.asaas_customers;
DROP POLICY IF EXISTS "Users can update their own customers" ON public.asaas_customers;
DROP POLICY IF EXISTS "Users can view their own customers" ON public.asaas_customers;

CREATE POLICY "Authenticated users can insert customers"
ON public.asaas_customers
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update customers"
ON public.asaas_customers
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view all customers"
ON public.asaas_customers
FOR SELECT
TO authenticated
USING (true);

-- PROFILES
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Authenticated users can insert profiles"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- PRODUCT_PRICES
DROP POLICY IF EXISTS "Users can insert prices for their products" ON public.product_prices;
DROP POLICY IF EXISTS "Users can update prices for their products" ON public.product_prices;
DROP POLICY IF EXISTS "Users can delete prices for their products" ON public.product_prices;
DROP POLICY IF EXISTS "Users can view prices for their products" ON public.product_prices;

CREATE POLICY "Authenticated users can insert product prices"
ON public.product_prices
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update product prices"
ON public.product_prices
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete product prices"
ON public.product_prices
FOR DELETE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view all product prices"
ON public.product_prices
FOR SELECT
TO authenticated
USING (true);

-- PRODUCT_ORDER_BUMPS
DROP POLICY IF EXISTS "Users can insert order bumps for their products" ON public.product_order_bumps;
DROP POLICY IF EXISTS "Users can update order bumps for their products" ON public.product_order_bumps;
DROP POLICY IF EXISTS "Users can delete order bumps for their products" ON public.product_order_bumps;
DROP POLICY IF EXISTS "Users can view order bumps for their products" ON public.product_order_bumps;

CREATE POLICY "Authenticated users can insert order bumps"
ON public.product_order_bumps
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update order bumps"
ON public.product_order_bumps
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete order bumps"
ON public.product_order_bumps
FOR DELETE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view all order bumps"
ON public.product_order_bumps
FOR SELECT
TO authenticated
USING (true);

-- PRODUCT_WEBHOOKS
DROP POLICY IF EXISTS "Users can insert webhooks for their products" ON public.product_webhooks;
DROP POLICY IF EXISTS "Users can update webhooks for their products" ON public.product_webhooks;
DROP POLICY IF EXISTS "Users can delete webhooks for their products" ON public.product_webhooks;
DROP POLICY IF EXISTS "Users can view webhooks for their products" ON public.product_webhooks;

CREATE POLICY "Authenticated users can insert webhooks"
ON public.product_webhooks
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update webhooks"
ON public.product_webhooks
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete webhooks"
ON public.product_webhooks
FOR DELETE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view all webhooks"
ON public.product_webhooks
FOR SELECT
TO authenticated
USING (true);

-- PRODUCT_COUPONS
DROP POLICY IF EXISTS "Users can insert coupons for their products" ON public.product_coupons;
DROP POLICY IF EXISTS "Users can update coupons for their products" ON public.product_coupons;
DROP POLICY IF EXISTS "Users can delete coupons for their products" ON public.product_coupons;
DROP POLICY IF EXISTS "Users can view coupons for their products" ON public.product_coupons;

CREATE POLICY "Authenticated users can insert coupons"
ON public.product_coupons
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update coupons"
ON public.product_coupons
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete coupons"
ON public.product_coupons
FOR DELETE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view all coupons"
ON public.product_coupons
FOR SELECT
TO authenticated
USING (true);

-- PRODUCT_AFFILIATE_LINKS
DROP POLICY IF EXISTS "Users can insert affiliate links for their products" ON public.product_affiliate_links;
DROP POLICY IF EXISTS "Users can update affiliate links for their products" ON public.product_affiliate_links;
DROP POLICY IF EXISTS "Users can delete affiliate links for their products" ON public.product_affiliate_links;
DROP POLICY IF EXISTS "Users can view affiliate links for their products" ON public.product_affiliate_links;

CREATE POLICY "Authenticated users can insert affiliate links"
ON public.product_affiliate_links
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update affiliate links"
ON public.product_affiliate_links
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete affiliate links"
ON public.product_affiliate_links
FOR DELETE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view all affiliate links"
ON public.product_affiliate_links
FOR SELECT
TO authenticated
USING (true);

-- PRODUCT_UPSELLS
DROP POLICY IF EXISTS "Users can insert upsells for their products" ON public.product_upsells;
DROP POLICY IF EXISTS "Users can update upsells for their products" ON public.product_upsells;
DROP POLICY IF EXISTS "Users can delete upsells for their products" ON public.product_upsells;
DROP POLICY IF EXISTS "Users can view upsells for their products" ON public.product_upsells;

CREATE POLICY "Authenticated users can insert upsells"
ON public.product_upsells
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update upsells"
ON public.product_upsells
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete upsells"
ON public.product_upsells
FOR DELETE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view all upsells"
ON public.product_upsells
FOR SELECT
TO authenticated
USING (true);

-- AFFILIATES
DROP POLICY IF EXISTS "Owners can delete affiliates" ON public.affiliates;
DROP POLICY IF EXISTS "Users can update their own affiliate profile" ON public.affiliates;

CREATE POLICY "Authenticated users can delete affiliates"
ON public.affiliates
FOR DELETE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can update affiliates"
ON public.affiliates
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view all affiliates"
ON public.affiliates
FOR SELECT
TO authenticated
USING (true);

-- PRODUCT_ADS_CONFIGS
DROP POLICY IF EXISTS "Users can insert ads configs for their products" ON public.product_ads_configs;
DROP POLICY IF EXISTS "Users can update ads configs for their products" ON public.product_ads_configs;
DROP POLICY IF EXISTS "Users can delete ads configs for their products" ON public.product_ads_configs;
DROP POLICY IF EXISTS "Users can view ads configs for their products" ON public.product_ads_configs;

CREATE POLICY "Authenticated users can insert ads configs"
ON public.product_ads_configs
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update ads configs"
ON public.product_ads_configs
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete ads configs"
ON public.product_ads_configs
FOR DELETE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view all ads configs"
ON public.product_ads_configs
FOR SELECT
TO authenticated
USING (true);

-- WEBHOOK_QUEUE
DROP POLICY IF EXISTS "Users can view webhook queue for their products" ON public.webhook_queue;

CREATE POLICY "Authenticated users can view all webhook queue"
ON public.webhook_queue
FOR SELECT
TO authenticated
USING (true);

-- WEBHOOK_LOGS
DROP POLICY IF EXISTS "Users can view webhook logs for their products" ON public.webhook_logs;

CREATE POLICY "Authenticated users can view all webhook logs"
ON public.webhook_logs
FOR SELECT
TO authenticated
USING (true);

-- PRODUCT_SALES
DROP POLICY IF EXISTS "Users can view sales for their products" ON public.product_sales;

CREATE POLICY "Authenticated users can view all sales"
ON public.product_sales
FOR SELECT
TO authenticated
USING (true);

-- UPSELL_TRANSACTIONS
DROP POLICY IF EXISTS "Users can view upsell transactions for their products" ON public.upsell_transactions;

CREATE POLICY "Authenticated users can view all upsell transactions"
ON public.upsell_transactions
FOR SELECT
TO authenticated
USING (true);

-- PRODUCT_ORDER_BUMP_ANALYTICS
DROP POLICY IF EXISTS "Users can view analytics for their order bumps" ON public.product_order_bump_analytics;

CREATE POLICY "Authenticated users can view all order bump analytics"
ON public.product_order_bump_analytics
FOR SELECT
TO authenticated
USING (true);

-- CHECKOUT_EVENTS
DROP POLICY IF EXISTS "Users can view events for their products" ON public.checkout_events;

CREATE POLICY "Authenticated users can view all checkout events"
ON public.checkout_events
FOR SELECT
TO authenticated
USING (true);