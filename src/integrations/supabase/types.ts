export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      product_affiliate_links: {
        Row: {
          affiliate_name: string
          affiliate_url: string
          commission_percentage: number
          created_at: string
          id: string
          is_active: boolean | null
          product_id: string
        }
        Insert: {
          affiliate_name: string
          affiliate_url: string
          commission_percentage: number
          created_at?: string
          id?: string
          is_active?: boolean | null
          product_id: string
        }
        Update: {
          affiliate_name?: string
          affiliate_url?: string
          commission_percentage?: number
          created_at?: string
          id?: string
          is_active?: boolean | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_affiliate_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_link_clicks: {
        Row: {
          clicked_at: string
          id: string
          ip_address: string | null
          price_id: string
          product_id: string
          referrer: string | null
          user_agent: string | null
        }
        Insert: {
          clicked_at?: string
          id?: string
          ip_address?: string | null
          price_id: string
          product_id: string
          referrer?: string | null
          user_agent?: string | null
        }
        Update: {
          clicked_at?: string
          id?: string
          ip_address?: string | null
          price_id?: string
          product_id?: string
          referrer?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_link_clicks_price_id_fkey"
            columns: ["price_id"]
            isOneToOne: false
            referencedRelation: "product_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_link_clicks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_prices: {
        Row: {
          created_at: string
          id: string
          installments: number | null
          is_default: boolean | null
          name: string
          price: number
          product_id: string
          subscription_period:
            | Database["public"]["Enums"]["subscription_period"]
            | null
          unique_code: string
        }
        Insert: {
          created_at?: string
          id?: string
          installments?: number | null
          is_default?: boolean | null
          name: string
          price: number
          product_id: string
          subscription_period?:
            | Database["public"]["Enums"]["subscription_period"]
            | null
          unique_code: string
        }
        Update: {
          created_at?: string
          id?: string
          installments?: number | null
          is_default?: boolean | null
          name?: string
          price?: number
          product_id?: string
          subscription_period?:
            | Database["public"]["Enums"]["subscription_period"]
            | null
          unique_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_sales: {
        Row: {
          affiliate_link_id: string | null
          commission_amount: number | null
          created_at: string
          customer_email: string
          customer_name: string
          id: string
          product_id: string
          product_price_id: string | null
          sale_amount: number
          sale_date: string
          status: string | null
        }
        Insert: {
          affiliate_link_id?: string | null
          commission_amount?: number | null
          created_at?: string
          customer_email: string
          customer_name: string
          id?: string
          product_id: string
          product_price_id?: string | null
          sale_amount: number
          sale_date?: string
          status?: string | null
        }
        Update: {
          affiliate_link_id?: string | null
          commission_amount?: number | null
          created_at?: string
          customer_email?: string
          customer_name?: string
          id?: string
          product_id?: string
          product_price_id?: string | null
          sale_amount?: number
          sale_date?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_sales_affiliate_link_id_fkey"
            columns: ["affiliate_link_id"]
            isOneToOne: false
            referencedRelation: "product_affiliate_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_sales_product_price_id_fkey"
            columns: ["product_price_id"]
            isOneToOne: false
            referencedRelation: "product_prices"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: Database["public"]["Enums"]["product_category"]
          created_at: string
          description: string | null
          display_id: number
          id: string
          image_url: string | null
          installments: number
          is_active: boolean | null
          name: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          price: number
          product_type: Database["public"]["Enums"]["product_type"]
          unique_code: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: Database["public"]["Enums"]["product_category"]
          created_at?: string
          description?: string | null
          display_id?: number
          id?: string
          image_url?: string | null
          installments?: number
          is_active?: boolean | null
          name: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          price?: number
          product_type: Database["public"]["Enums"]["product_type"]
          unique_code: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["product_category"]
          created_at?: string
          description?: string | null
          display_id?: number
          id?: string
          image_url?: string | null
          installments?: number
          is_active?: boolean | null
          name?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          price?: number
          product_type?: Database["public"]["Enums"]["product_type"]
          unique_code?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_unique_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      payment_method:
        | "a_vista"
        | "parcelado_taxa_cliente"
        | "parcelado_taxa_vendedor"
      product_category:
        | "saude_esportes"
        | "financas_investimentos"
        | "relacionamentos"
        | "negocios_carreira"
        | "espiritualidade"
        | "sexualidade"
        | "entretenimento"
        | "culinaria_gastronomia"
        | "idiomas"
        | "direito"
        | "apps_software"
        | "literatura"
        | "casa_construcao"
        | "desenvolvimento_pessoal"
        | "moda_beleza"
        | "animais_plantas"
        | "educacional"
        | "hobbies"
        | "design"
        | "internet"
        | "ecologia_meio_ambiente"
        | "musica_artes"
        | "tecnologia_informacao"
        | "outros"
        | "empreendedorismo_digital"
      product_type: "recorrente" | "pagamento_unico"
      subscription_period: "mensal" | "trimestral" | "semestral" | "anual"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      payment_method: [
        "a_vista",
        "parcelado_taxa_cliente",
        "parcelado_taxa_vendedor",
      ],
      product_category: [
        "saude_esportes",
        "financas_investimentos",
        "relacionamentos",
        "negocios_carreira",
        "espiritualidade",
        "sexualidade",
        "entretenimento",
        "culinaria_gastronomia",
        "idiomas",
        "direito",
        "apps_software",
        "literatura",
        "casa_construcao",
        "desenvolvimento_pessoal",
        "moda_beleza",
        "animais_plantas",
        "educacional",
        "hobbies",
        "design",
        "internet",
        "ecologia_meio_ambiente",
        "musica_artes",
        "tecnologia_informacao",
        "outros",
        "empreendedorismo_digital",
      ],
      product_type: ["recorrente", "pagamento_unico"],
      subscription_period: ["mensal", "trimestral", "semestral", "anual"],
    },
  },
} as const
