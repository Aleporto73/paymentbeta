-- Add RLS policies for affiliates to view their own data

-- Policy for affiliates to view their own affiliate links
CREATE POLICY "Affiliates can view their own links"
ON product_affiliate_links
FOR SELECT
TO authenticated
USING (
  affiliate_id IN (
    SELECT id FROM affiliates WHERE user_id = auth.uid()
  )
);

-- Policy for affiliates to view sales from their links
CREATE POLICY "Affiliates can view their own sales"
ON product_sales
FOR SELECT
TO authenticated
USING (
  affiliate_link_id IN (
    SELECT id FROM product_affiliate_links 
    WHERE affiliate_id IN (
      SELECT id FROM affiliates WHERE user_id = auth.uid()
    )
  )
);

-- Policy for affiliates to view clicks on their links
CREATE POLICY "Affiliates can view their own clicks"
ON product_link_clicks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM product_affiliate_links pal
    JOIN product_prices pp ON pp.id = product_link_clicks.price_id
    WHERE pal.product_id = pp.product_id
    AND pal.affiliate_id IN (
      SELECT id FROM affiliates WHERE user_id = auth.uid()
    )
  )
);