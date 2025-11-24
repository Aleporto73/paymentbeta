export interface Affiliate {
  id: string;
  user_id: string;
  name: string;
  email: string;
  created_at: string;
  is_active: boolean;
}

export interface AffiliateWithProducts extends Affiliate {
  products: Array<{
    product_id: string;
    product_name: string;
    commission_type: 'percentage' | 'fixed';
    commission_value: number;
    is_active: boolean;
  }>;
}
