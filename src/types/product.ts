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
  is_active: boolean;
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
  is_default: boolean;
  created_at: string;
}

export interface ProductAffiliateLink {
  id: string;
  product_id: string;
  affiliate_name: string;
  affiliate_url: string;
  commission_percentage: number;
  is_active: boolean;
  created_at: string;
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
