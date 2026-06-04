-- Phase 2 corrective RLS before Vercel.
-- This migration removes broad authenticated/public access and recreates
-- minimum policies for admin, affiliate, checkout, and analytics flows.

-- Ensure RLS is enabled on the corrected tables.
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_order_bumps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asaas_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_ads_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_upsells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upsell_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_link_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_order_bump_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_upsell_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_affiliate_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_tokens ENABLE ROW LEVEL SECURITY;

-- Drop unsafe or legacy policies on products and checkout catalog tables.
DROP POLICY IF EXISTS "Users can view their own products" ON public.products;
DROP POLICY IF EXISTS "Users can insert their own products" ON public.products;
DROP POLICY IF EXISTS "Users can update their own products" ON public.products;
DROP POLICY IF EXISTS "Users can delete their own products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can insert products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can update products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can delete products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can view all products" ON public.products;
DROP POLICY IF EXISTS "Allow public read access to products" ON public.products;
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
DROP POLICY IF EXISTS "Public can view active products for checkout" ON public.products;

DROP POLICY IF EXISTS "Users can view prices for their products" ON public.product_prices;
DROP POLICY IF EXISTS "Users can insert prices for their products" ON public.product_prices;
DROP POLICY IF EXISTS "Users can update prices for their products" ON public.product_prices;
DROP POLICY IF EXISTS "Users can delete prices for their products" ON public.product_prices;
DROP POLICY IF EXISTS "Authenticated users can insert product prices" ON public.product_prices;
DROP POLICY IF EXISTS "Authenticated users can update product prices" ON public.product_prices;
DROP POLICY IF EXISTS "Authenticated users can delete product prices" ON public.product_prices;
DROP POLICY IF EXISTS "Authenticated users can view all product prices" ON public.product_prices;
DROP POLICY IF EXISTS "Allow public read access to product_prices" ON public.product_prices;
DROP POLICY IF EXISTS "Admins can manage product prices" ON public.product_prices;
DROP POLICY IF EXISTS "Public can view prices for active checkout products" ON public.product_prices;

DROP POLICY IF EXISTS "Users can view order bumps for their products" ON public.product_order_bumps;
DROP POLICY IF EXISTS "Users can insert order bumps for their products" ON public.product_order_bumps;
DROP POLICY IF EXISTS "Users can update order bumps for their products" ON public.product_order_bumps;
DROP POLICY IF EXISTS "Users can delete order bumps for their products" ON public.product_order_bumps;
DROP POLICY IF EXISTS "Authenticated users can insert order bumps" ON public.product_order_bumps;
DROP POLICY IF EXISTS "Authenticated users can update order bumps" ON public.product_order_bumps;
DROP POLICY IF EXISTS "Authenticated users can delete order bumps" ON public.product_order_bumps;
DROP POLICY IF EXISTS "Authenticated users can view all order bumps" ON public.product_order_bumps;
DROP POLICY IF EXISTS "Allow public read access to product_order_bumps" ON public.product_order_bumps;
DROP POLICY IF EXISTS "Admins can manage product order bumps" ON public.product_order_bumps;
DROP POLICY IF EXISTS "Public can view active order bumps for checkout" ON public.product_order_bumps;

-- Drop unsafe or legacy policies on admin-only tables.
DROP POLICY IF EXISTS "Users can view their own integration settings" ON public.integration_settings;
DROP POLICY IF EXISTS "Users can create their own integration settings" ON public.integration_settings;
DROP POLICY IF EXISTS "Users can update their own integration settings" ON public.integration_settings;
DROP POLICY IF EXISTS "Users can delete their own integration settings" ON public.integration_settings;
DROP POLICY IF EXISTS "Authenticated users can insert integration settings" ON public.integration_settings;
DROP POLICY IF EXISTS "Authenticated users can update integration settings" ON public.integration_settings;
DROP POLICY IF EXISTS "Authenticated users can delete integration settings" ON public.integration_settings;
DROP POLICY IF EXISTS "Authenticated users can view all integration settings" ON public.integration_settings;
DROP POLICY IF EXISTS "Admins can manage integration settings" ON public.integration_settings;

DROP POLICY IF EXISTS "Users can view their own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can insert their own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can update their own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Authenticated users can insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "Authenticated users can update transactions" ON public.transactions;
DROP POLICY IF EXISTS "Authenticated users can view all transactions" ON public.transactions;
DROP POLICY IF EXISTS "Admins can manage transactions" ON public.transactions;

DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Authenticated users can insert subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Authenticated users can update subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Authenticated users can view all subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Admins can manage subscriptions" ON public.subscriptions;

DROP POLICY IF EXISTS "Users can view their own customers" ON public.asaas_customers;
DROP POLICY IF EXISTS "Users can insert their own customers" ON public.asaas_customers;
DROP POLICY IF EXISTS "Users can update their own customers" ON public.asaas_customers;
DROP POLICY IF EXISTS "Authenticated users can insert customers" ON public.asaas_customers;
DROP POLICY IF EXISTS "Authenticated users can update customers" ON public.asaas_customers;
DROP POLICY IF EXISTS "Authenticated users can view all customers" ON public.asaas_customers;
DROP POLICY IF EXISTS "Admins can manage asaas customers" ON public.asaas_customers;

DROP POLICY IF EXISTS "Users can view webhooks for their products" ON public.product_webhooks;
DROP POLICY IF EXISTS "Users can insert webhooks for their products" ON public.product_webhooks;
DROP POLICY IF EXISTS "Users can update webhooks for their products" ON public.product_webhooks;
DROP POLICY IF EXISTS "Users can delete webhooks for their products" ON public.product_webhooks;
DROP POLICY IF EXISTS "Authenticated users can insert webhooks" ON public.product_webhooks;
DROP POLICY IF EXISTS "Authenticated users can update webhooks" ON public.product_webhooks;
DROP POLICY IF EXISTS "Authenticated users can delete webhooks" ON public.product_webhooks;
DROP POLICY IF EXISTS "Authenticated users can view all webhooks" ON public.product_webhooks;
DROP POLICY IF EXISTS "Admins can manage product webhooks" ON public.product_webhooks;

DROP POLICY IF EXISTS "Users can view webhook queue for their products" ON public.webhook_queue;
DROP POLICY IF EXISTS "Authenticated users can view all webhook queue" ON public.webhook_queue;
DROP POLICY IF EXISTS "Admins can manage webhook queue" ON public.webhook_queue;

DROP POLICY IF EXISTS "Users can view webhook logs for their products" ON public.webhook_logs;
DROP POLICY IF EXISTS "Authenticated users can view all webhook logs" ON public.webhook_logs;
DROP POLICY IF EXISTS "Admins can manage webhook logs" ON public.webhook_logs;

DROP POLICY IF EXISTS "Users can view coupons for their products" ON public.product_coupons;
DROP POLICY IF EXISTS "Users can insert coupons for their products" ON public.product_coupons;
DROP POLICY IF EXISTS "Users can update coupons for their products" ON public.product_coupons;
DROP POLICY IF EXISTS "Users can delete coupons for their products" ON public.product_coupons;
DROP POLICY IF EXISTS "Authenticated users can insert coupons" ON public.product_coupons;
DROP POLICY IF EXISTS "Authenticated users can update coupons" ON public.product_coupons;
DROP POLICY IF EXISTS "Authenticated users can delete coupons" ON public.product_coupons;
DROP POLICY IF EXISTS "Authenticated users can view all coupons" ON public.product_coupons;
DROP POLICY IF EXISTS "Admins can manage product coupons" ON public.product_coupons;

DROP POLICY IF EXISTS "Users can view ads configs for their products" ON public.product_ads_configs;
DROP POLICY IF EXISTS "Users can insert ads configs for their products" ON public.product_ads_configs;
DROP POLICY IF EXISTS "Users can update ads configs for their products" ON public.product_ads_configs;
DROP POLICY IF EXISTS "Users can delete ads configs for their products" ON public.product_ads_configs;
DROP POLICY IF EXISTS "Authenticated users can insert ads configs" ON public.product_ads_configs;
DROP POLICY IF EXISTS "Authenticated users can update ads configs" ON public.product_ads_configs;
DROP POLICY IF EXISTS "Authenticated users can delete ads configs" ON public.product_ads_configs;
DROP POLICY IF EXISTS "Authenticated users can view all ads configs" ON public.product_ads_configs;
DROP POLICY IF EXISTS "Allow public read access to product_ads_configs" ON public.product_ads_configs;
DROP POLICY IF EXISTS "Admins can manage product ads configs" ON public.product_ads_configs;

DROP POLICY IF EXISTS "Users can view upsells for their products" ON public.product_upsells;
DROP POLICY IF EXISTS "Users can insert upsells for their products" ON public.product_upsells;
DROP POLICY IF EXISTS "Users can update upsells for their products" ON public.product_upsells;
DROP POLICY IF EXISTS "Users can delete upsells for their products" ON public.product_upsells;
DROP POLICY IF EXISTS "Authenticated users can insert upsells" ON public.product_upsells;
DROP POLICY IF EXISTS "Authenticated users can update upsells" ON public.product_upsells;
DROP POLICY IF EXISTS "Authenticated users can delete upsells" ON public.product_upsells;
DROP POLICY IF EXISTS "Authenticated users can view all upsells" ON public.product_upsells;
DROP POLICY IF EXISTS "Admins can manage product upsells" ON public.product_upsells;

DROP POLICY IF EXISTS "Users can view upsell transactions for their products" ON public.upsell_transactions;
DROP POLICY IF EXISTS "Authenticated users can view all upsell transactions" ON public.upsell_transactions;
DROP POLICY IF EXISTS "Admins can manage upsell transactions" ON public.upsell_transactions;

-- Drop unsafe or legacy policies on analytics tables.
DROP POLICY IF EXISTS "Public can insert checkout events" ON public.checkout_events;
DROP POLICY IF EXISTS "Users can view events for their products" ON public.checkout_events;
DROP POLICY IF EXISTS "Authenticated users can view all checkout events" ON public.checkout_events;
DROP POLICY IF EXISTS "Admins can manage checkout events" ON public.checkout_events;
DROP POLICY IF EXISTS "Public can insert checkout events for analytics" ON public.checkout_events;

DROP POLICY IF EXISTS "Users can view clicks for their products" ON public.product_link_clicks;
DROP POLICY IF EXISTS "Affiliates can view their own clicks" ON public.product_link_clicks;
DROP POLICY IF EXISTS "Public can insert clicks" ON public.product_link_clicks;
DROP POLICY IF EXISTS "Admins can manage product link clicks" ON public.product_link_clicks;
DROP POLICY IF EXISTS "Public can insert product link clicks for analytics" ON public.product_link_clicks;

DROP POLICY IF EXISTS "Users can view analytics for their order bumps" ON public.product_order_bump_analytics;
DROP POLICY IF EXISTS "Authenticated users can view all order bump analytics" ON public.product_order_bump_analytics;
DROP POLICY IF EXISTS "Public can insert analytics" ON public.product_order_bump_analytics;
DROP POLICY IF EXISTS "Admins can manage order bump analytics" ON public.product_order_bump_analytics;
DROP POLICY IF EXISTS "Public can insert order bump analytics" ON public.product_order_bump_analytics;

DROP POLICY IF EXISTS "Authenticated users can view all upsell analytics" ON public.product_upsell_analytics;
DROP POLICY IF EXISTS "Public can insert analytics" ON public.product_upsell_analytics;
DROP POLICY IF EXISTS "Admins can manage upsell analytics" ON public.product_upsell_analytics;
DROP POLICY IF EXISTS "Public can insert upsell analytics" ON public.product_upsell_analytics;

-- Drop unsafe or legacy policies on affiliate and sales tables.
DROP POLICY IF EXISTS "Users can view all affiliates" ON public.affiliates;
DROP POLICY IF EXISTS "Users can insert affiliates" ON public.affiliates;
DROP POLICY IF EXISTS "Users can update their own affiliate profile" ON public.affiliates;
DROP POLICY IF EXISTS "Owners can delete affiliates" ON public.affiliates;
DROP POLICY IF EXISTS "Authenticated users can delete affiliates" ON public.affiliates;
DROP POLICY IF EXISTS "Authenticated users can update affiliates" ON public.affiliates;
DROP POLICY IF EXISTS "Authenticated users can view all affiliates" ON public.affiliates;
DROP POLICY IF EXISTS "Admins can manage affiliates" ON public.affiliates;
DROP POLICY IF EXISTS "Affiliates can view own affiliate profile" ON public.affiliates;
DROP POLICY IF EXISTS "Affiliates can update own affiliate profile" ON public.affiliates;

DROP POLICY IF EXISTS "Users can view affiliate links for their products" ON public.product_affiliate_links;
DROP POLICY IF EXISTS "Users can insert affiliate links for their products" ON public.product_affiliate_links;
DROP POLICY IF EXISTS "Users can update affiliate links for their products" ON public.product_affiliate_links;
DROP POLICY IF EXISTS "Users can delete affiliate links for their products" ON public.product_affiliate_links;
DROP POLICY IF EXISTS "Affiliates can view their own links" ON public.product_affiliate_links;
DROP POLICY IF EXISTS "Authenticated users can insert affiliate links" ON public.product_affiliate_links;
DROP POLICY IF EXISTS "Authenticated users can update affiliate links" ON public.product_affiliate_links;
DROP POLICY IF EXISTS "Authenticated users can delete affiliate links" ON public.product_affiliate_links;
DROP POLICY IF EXISTS "Authenticated users can view all affiliate links" ON public.product_affiliate_links;
DROP POLICY IF EXISTS "Admins can manage affiliate links" ON public.product_affiliate_links;
DROP POLICY IF EXISTS "Affiliates can view own affiliate links" ON public.product_affiliate_links;

DROP POLICY IF EXISTS "Users can view sales for their products" ON public.product_sales;
DROP POLICY IF EXISTS "Users can insert sales for their products" ON public.product_sales;
DROP POLICY IF EXISTS "Affiliates can view their own sales" ON public.product_sales;
DROP POLICY IF EXISTS "Authenticated users can view all sales" ON public.product_sales;
DROP POLICY IF EXISTS "Admins can view product sales" ON public.product_sales;
DROP POLICY IF EXISTS "Affiliates can view own product sales" ON public.product_sales;

-- Drop unsafe profile policies and service-role-only token policy.
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

DROP POLICY IF EXISTS "Public can read valid tokens" ON public.transaction_tokens;

-- Admin policies for catalog and admin-only data.
CREATE POLICY "Admins can manage products"
ON public.products
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage product prices"
ON public.product_prices
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage product order bumps"
ON public.product_order_bumps
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage integration settings"
ON public.integration_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage transactions"
ON public.transactions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage subscriptions"
ON public.subscriptions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage asaas customers"
ON public.asaas_customers
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage product webhooks"
ON public.product_webhooks
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage webhook queue"
ON public.webhook_queue
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage webhook logs"
ON public.webhook_logs
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage product coupons"
ON public.product_coupons
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage product ads configs"
ON public.product_ads_configs
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage product upsells"
ON public.product_upsells
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage upsell transactions"
ON public.upsell_transactions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Public checkout read: products and order bumps require active rows.
-- Product prices do not have an is_active column, so they are limited by
-- the active parent product.
CREATE POLICY "Public can view active products for checkout"
ON public.products
FOR SELECT
TO anon, authenticated
USING (is_active IS TRUE);

CREATE POLICY "Public can view prices for active checkout products"
ON public.product_prices
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = product_prices.product_id
      AND p.is_active IS TRUE
  )
);

CREATE POLICY "Public can view active order bumps for checkout"
ON public.product_order_bumps
FOR SELECT
TO anon, authenticated
USING (
  is_active IS TRUE
  AND EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = product_order_bumps.product_id
      AND p.is_active IS TRUE
  )
  AND EXISTS (
    SELECT 1
    FROM public.products bump_product
    WHERE bump_product.id = product_order_bumps.order_bump_product_id
      AND bump_product.is_active IS TRUE
  )
);

-- Analytics: public inserts remain for checkout tracking; reads and
-- mutation beyond inserts are admin-only.
CREATE POLICY "Admins can manage checkout events"
ON public.checkout_events
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can insert checkout events for analytics"
ON public.checkout_events
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Admins can manage product link clicks"
ON public.product_link_clicks
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can insert product link clicks for analytics"
ON public.product_link_clicks
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Admins can manage order bump analytics"
ON public.product_order_bump_analytics
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can insert order bump analytics"
ON public.product_order_bump_analytics
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Admins can manage upsell analytics"
ON public.product_upsell_analytics
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can insert upsell analytics"
ON public.product_upsell_analytics
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Affiliate records and links.
CREATE POLICY "Admins can manage affiliates"
ON public.affiliates
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Affiliates can view own affiliate profile"
ON public.affiliates
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'affiliate')
  AND user_id = auth.uid()
);

CREATE POLICY "Affiliates can update own affiliate profile"
ON public.affiliates
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'affiliate')
  AND user_id = auth.uid()
)
WITH CHECK (
  public.has_role(auth.uid(), 'affiliate')
  AND user_id = auth.uid()
);

CREATE POLICY "Admins can manage affiliate links"
ON public.product_affiliate_links
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Affiliates can view own affiliate links"
ON public.product_affiliate_links
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'affiliate')
  AND EXISTS (
    SELECT 1
    FROM public.affiliates a
    WHERE a.id = product_affiliate_links.affiliate_id
      AND a.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can view product sales"
ON public.product_sales
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Affiliates can view own product sales"
ON public.product_sales
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'affiliate')
  AND EXISTS (
    SELECT 1
    FROM public.product_affiliate_links pal
    JOIN public.affiliates a ON a.id = pal.affiliate_id
    WHERE pal.id = product_sales.affiliate_link_id
      AND a.user_id = auth.uid()
  )
);

-- Profiles: users only see/update themselves; admins can read all.
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- transaction_tokens intentionally has no anon/authenticated policy.
-- Service role and backend functions should be the only direct readers.
