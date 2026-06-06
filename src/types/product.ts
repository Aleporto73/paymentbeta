export type ProductCategory =
  | 'saude_esportes'
  | 'financas_investimentos'
  | 'relacionamentos'
  | 'negocios_carreira'
  | 'espiritualidade'
  | 'sexualidade'
  | 'entretenimento'
  | 'culinaria_gastronomia'
  | 'idiomas'
  | 'direito'
  | 'apps_software'
  | 'literatura'
  | 'casa_construcao'
  | 'desenvolvimento_pessoal'
  | 'moda_beleza'
  | 'animais_plantas'
  | 'educacional'
  | 'hobbies'
  | 'design'
  | 'internet'
  | 'ecologia_meio_ambiente'
  | 'musica_artes'
  | 'tecnologia_informacao'
  | 'outros'
  | 'empreendedorismo_digital';

export type ProductType = 'recorrente' | 'pagamento_unico';
export type PaymentMethod = 'a_vista' | 'parcelado_taxa_cliente' | 'parcelado_taxa_vendedor';
export type SubscriptionPeriod = 'mensal' | 'trimestral' | 'semestral' | 'anual';
export type CommissionType = 'percentage' | 'fixed';
export type DiscountType = 'percentage' | 'fixed';
export type InstallmentInterestRates = Record<string, number>;

export interface Product {
  id: string;
  display_id: number;
  user_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  category: ProductCategory;
  product_type: ProductType;
  payment_method: PaymentMethod;
  price: number;
  installments: number;
  is_active: boolean;
  unique_code: string;
  default_commission_type: CommissionType;
  default_commission_value: number;
  created_at: string;
  updated_at: string;
}

export interface ProductPrice {
  id: string;
  product_id: string;
  name: string;
  price: number;
  subscription_period: SubscriptionPeriod | null;
  installments: number;
  installment_interest_rates: InstallmentInterestRates | null;
  is_default: boolean;
  unique_code: string;
  created_at: string;
}

export interface ProductAffiliateLink {
  id: string;
  product_id: string;
  affiliate_id?: string;
  affiliate_email?: string | null;
  affiliate_asaas_wallet_id?: string | null;
  affiliate_name: string;
  affiliate_url: string;
  commission_type: CommissionType;
  commission_value: number;
  is_active: boolean;
  created_at: string;
}

export interface ProductCoupon {
  id: string;
  product_id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  is_active: boolean;
  created_at: string;
}

export interface ProductOrderBump {
  id: string;
  product_id: string;
  order_bump_product_id: string;
  title: string;
  description: string | null;
  price: number;
  is_active: boolean;
  display_order: number;
  preview_background_color: string;
  preview_text_color: string;
  preview_button_color: string;
  preview_position: 'below_product' | 'sidebar' | 'popup';
  image_url: string | null;
  product_image_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductOrderBumpAnalytics {
  id: string;
  order_bump_id: string;
  product_id: string;
  event_type: 'view' | 'accept' | 'reject';
  revenue_generated: number;
  created_at: string;
}

export interface ProductUpsell {
  id: string;
  product_id: string;
  upsell_product_id: string;
  title: string;
  description: string | null;
  price: number;
  discount_percentage: number | null;
  is_active: boolean;
  display_order: number;
  unique_code: string;
  redirect_url: string | null;
  preview_background_color?: string;
  preview_text_color?: string;
  preview_button_color?: string;
  created_at: string;
  updated_at: string;
}

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  saude_esportes: 'Saúde e Esportes',
  financas_investimentos: 'Finanças e Investimentos',
  relacionamentos: 'Relacionamentos',
  negocios_carreira: 'Negócios e Carreira',
  espiritualidade: 'Espiritualidade',
  sexualidade: 'Sexualidade',
  entretenimento: 'Entretenimento',
  culinaria_gastronomia: 'Culinária e Gastronomia',
  idiomas: 'Idiomas',
  direito: 'Direito',
  apps_software: 'Apps & Software',
  literatura: 'Literatura',
  casa_construcao: 'Casa e Construção',
  desenvolvimento_pessoal: 'Desenvolvimento Pessoal',
  moda_beleza: 'Moda e Beleza',
  animais_plantas: 'Animais e Plantas',
  educacional: 'Educacional',
  hobbies: 'Hobbies',
  design: 'Design',
  internet: 'Internet',
  ecologia_meio_ambiente: 'Ecologia e Meio Ambiente',
  musica_artes: 'Música e Artes',
  tecnologia_informacao: 'Tecnologia da Informação',
  outros: 'Outros',
  empreendedorismo_digital: 'Empreendedorismo Digital',
};

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  recorrente: 'Recorrência',
  pagamento_unico: 'Pagamento Único',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  a_vista: 'À vista',
  parcelado_taxa_cliente: 'Parcelado (taxa do cliente)',
  parcelado_taxa_vendedor: 'Parcelado (taxa do vendedor)',
};

export const SUBSCRIPTION_PERIOD_LABELS: Record<SubscriptionPeriod, string> = {
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};
