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
      affiliates: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean | null
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean | null
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      asaas_customers: {
        Row: {
          address: string | null
          address_number: string | null
          asaas_customer_id: string
          city: string | null
          complement: string | null
          cpf_cnpj: string | null
          created_at: string
          email: string
          id: string
          mobile_phone: string | null
          name: string
          phone: string | null
          postal_code: string | null
          province: string | null
          state: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          address_number?: string | null
          asaas_customer_id: string
          city?: string | null
          complement?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email: string
          id?: string
          mobile_phone?: string | null
          name: string
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          state?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          address_number?: string | null
          asaas_customer_id?: string
          city?: string | null
          complement?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email?: string
          id?: string
          mobile_phone?: string | null
          name?: string
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      checkout_events: {
        Row: {
          affiliate_code: string | null
          created_at: string
          event_type: string
          id: string
          ip_address: string | null
          order_bumps_amount: number | null
          order_bumps_selected: string[] | null
          price_id: string | null
          product_id: string | null
          session_id: string
          total_amount: number | null
          user_agent: string | null
        }
        Insert: {
          affiliate_code?: string | null
          created_at?: string
          event_type: string
          id?: string
          ip_address?: string | null
          order_bumps_amount?: number | null
          order_bumps_selected?: string[] | null
          price_id?: string | null
          product_id?: string | null
          session_id: string
          total_amount?: number | null
          user_agent?: string | null
        }
        Update: {
          affiliate_code?: string | null
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          order_bumps_amount?: number | null
          order_bumps_selected?: string[] | null
          price_id?: string | null
          product_id?: string | null
          session_id?: string
          total_amount?: number | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkout_events_price_id_fkey"
            columns: ["price_id"]
            isOneToOne: false
            referencedRelation: "product_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_settings: {
        Row: {
          created_at: string
          id: string
          integration_name: string
          is_active: boolean
          is_sandbox: boolean
          production_api_key: string | null
          sandbox_api_key: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          integration_name: string
          is_active?: boolean
          is_sandbox?: boolean
          production_api_key?: string | null
          sandbox_api_key?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          integration_name?: string
          is_active?: boolean
          is_sandbox?: boolean
          production_api_key?: string | null
          sandbox_api_key?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_ads_configs: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          pixel_id: string | null
          platform: string
          product_id: string
          token: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          pixel_id?: string | null
          platform: string
          product_id: string
          token?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          pixel_id?: string | null
          platform?: string
          product_id?: string
          token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_ads_configs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_affiliate_links: {
        Row: {
          affiliate_id: string | null
          affiliate_name: string | null
          affiliate_url: string | null
          commission_type: string | null
          commission_value: number
          created_at: string
          id: string
          is_active: boolean | null
          product_id: string
        }
        Insert: {
          affiliate_id?: string | null
          affiliate_name?: string | null
          affiliate_url?: string | null
          commission_type?: string | null
          commission_value: number
          created_at?: string
          id?: string
          is_active?: boolean | null
          product_id: string
        }
        Update: {
          affiliate_id?: string | null
          affiliate_name?: string | null
          affiliate_url?: string | null
          commission_type?: string | null
          commission_value?: number
          created_at?: string
          id?: string
          is_active?: boolean | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_affiliate_links_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_affiliate_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_coupons: {
        Row: {
          code: string
          created_at: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean | null
          product_id: string
        }
        Insert: {
          code: string
          created_at?: string | null
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean | null
          product_id: string
        }
        Update: {
          code?: string
          created_at?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_coupons_product_id_fkey"
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
      product_order_bump_analytics: {
        Row: {
          created_at: string
          event_type: string
          id: string
          order_bump_id: string
          product_id: string
          revenue_generated: number | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          order_bump_id: string
          product_id: string
          revenue_generated?: number | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          order_bump_id?: string
          product_id?: string
          revenue_generated?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_order_bump_analytics_order_bump_id_fkey"
            columns: ["order_bump_id"]
            isOneToOne: false
            referencedRelation: "product_order_bumps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_order_bump_analytics_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_order_bumps: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          is_active: boolean | null
          order_bump_product_id: string
          preview_background_color: string | null
          preview_button_color: string | null
          preview_position: string | null
          preview_text_color: string | null
          price: number
          product_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          order_bump_product_id: string
          preview_background_color?: string | null
          preview_button_color?: string | null
          preview_position?: string | null
          preview_text_color?: string | null
          price: number
          product_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          order_bump_product_id?: string
          preview_background_color?: string | null
          preview_button_color?: string | null
          preview_position?: string | null
          preview_text_color?: string | null
          price?: number
          product_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
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
      product_upsell_analytics: {
        Row: {
          created_at: string
          event_type: string
          id: string
          product_id: string
          revenue_generated: number | null
          upsell_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          product_id: string
          revenue_generated?: number | null
          upsell_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          product_id?: string
          revenue_generated?: number | null
          upsell_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_upsell_analytics_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_upsell_analytics_upsell_id_fkey"
            columns: ["upsell_id"]
            isOneToOne: false
            referencedRelation: "product_upsells"
            referencedColumns: ["id"]
          },
        ]
      }
      product_upsells: {
        Row: {
          created_at: string
          description: string | null
          discount_percentage: number | null
          display_order: number
          id: string
          is_active: boolean
          preview_background_color: string | null
          preview_button_color: string | null
          preview_text_color: string | null
          price: number
          product_id: string
          redirect_url: string | null
          title: string
          unique_code: string
          updated_at: string
          upsell_product_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_percentage?: number | null
          display_order?: number
          id?: string
          is_active?: boolean
          preview_background_color?: string | null
          preview_button_color?: string | null
          preview_text_color?: string | null
          price: number
          product_id: string
          redirect_url?: string | null
          title: string
          unique_code?: string
          updated_at?: string
          upsell_product_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_percentage?: number | null
          display_order?: number
          id?: string
          is_active?: boolean
          preview_background_color?: string | null
          preview_button_color?: string | null
          preview_text_color?: string | null
          price?: number
          product_id?: string
          redirect_url?: string | null
          title?: string
          unique_code?: string
          updated_at?: string
          upsell_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_upsells_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_upsells_upsell_product_id_fkey"
            columns: ["upsell_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_webhooks: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          product_id: string
          updated_at: string
          webhook_url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          product_id: string
          updated_at?: string
          webhook_url: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          product_id?: string
          updated_at?: string
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_webhooks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          approved_payment_redirect_url: string | null
          category: Database["public"]["Enums"]["product_category"]
          checkout_header_image_url: string | null
          created_at: string
          default_commission_type: string | null
          default_commission_value: number | null
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
          rejected_payment_redirect_url: string | null
          unique_code: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_payment_redirect_url?: string | null
          category: Database["public"]["Enums"]["product_category"]
          checkout_header_image_url?: string | null
          created_at?: string
          default_commission_type?: string | null
          default_commission_value?: number | null
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
          rejected_payment_redirect_url?: string | null
          unique_code: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_payment_redirect_url?: string | null
          category?: Database["public"]["Enums"]["product_category"]
          checkout_header_image_url?: string | null
          created_at?: string
          default_commission_type?: string | null
          default_commission_value?: number | null
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
          rejected_payment_redirect_url?: string | null
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
      subscriptions: {
        Row: {
          affiliate_code: string | null
          asaas_customer_id: string
          asaas_subscription_id: string
          billing_type: string
          cancelled_at: string | null
          created_at: string
          cycle: string
          description: string | null
          id: string
          next_due_date: string | null
          product_id: string | null
          status: string
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          affiliate_code?: string | null
          asaas_customer_id: string
          asaas_subscription_id: string
          billing_type: string
          cancelled_at?: string | null
          created_at?: string
          cycle: string
          description?: string | null
          id?: string
          next_due_date?: string | null
          product_id?: string | null
          status: string
          updated_at?: string
          user_id: string
          value: number
        }
        Update: {
          affiliate_code?: string | null
          asaas_customer_id?: string
          asaas_subscription_id?: string
          billing_type?: string
          cancelled_at?: string | null
          created_at?: string
          cycle?: string
          description?: string | null
          id?: string
          next_due_date?: string | null
          product_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_tokens: {
        Row: {
          asaas_customer_id: string
          created_at: string
          customer_email: string
          customer_name: string
          expires_at: string
          id: string
          token: string
          transaction_id: string
          used: boolean
        }
        Insert: {
          asaas_customer_id: string
          created_at?: string
          customer_email: string
          customer_name: string
          expires_at: string
          id?: string
          token: string
          transaction_id: string
          used?: boolean
        }
        Update: {
          asaas_customer_id?: string
          created_at?: string
          customer_email?: string
          customer_name?: string
          expires_at?: string
          id?: string
          token?: string
          transaction_id?: string
          used?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "transaction_tokens_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          affiliate_code: string | null
          asaas_customer_id: string | null
          asaas_payment_id: string
          billing_type: string
          confirmed_date: string | null
          created_at: string
          credit_card_token: string | null
          credit_date: string | null
          customer_cpf_cnpj: string | null
          customer_email: string
          customer_name: string
          customer_phone: string | null
          customer_state: string | null
          description: string | null
          device_type: string | null
          due_date: string | null
          external_reference: string | null
          id: string
          installment_count: number | null
          installment_value: number | null
          ip_address: string | null
          net_value: number | null
          order_bumps_amount: number | null
          order_bumps_selected: string[] | null
          payment_date: string | null
          payment_method: string
          price_id: string | null
          product_id: string | null
          status: string
          updated_at: string
          user_agent: string | null
          user_id: string
          value: number
        }
        Insert: {
          affiliate_code?: string | null
          asaas_customer_id?: string | null
          asaas_payment_id: string
          billing_type: string
          confirmed_date?: string | null
          created_at?: string
          credit_card_token?: string | null
          credit_date?: string | null
          customer_cpf_cnpj?: string | null
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          customer_state?: string | null
          description?: string | null
          device_type?: string | null
          due_date?: string | null
          external_reference?: string | null
          id?: string
          installment_count?: number | null
          installment_value?: number | null
          ip_address?: string | null
          net_value?: number | null
          order_bumps_amount?: number | null
          order_bumps_selected?: string[] | null
          payment_date?: string | null
          payment_method: string
          price_id?: string | null
          product_id?: string | null
          status: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
          value: number
        }
        Update: {
          affiliate_code?: string | null
          asaas_customer_id?: string | null
          asaas_payment_id?: string
          billing_type?: string
          confirmed_date?: string | null
          created_at?: string
          credit_card_token?: string | null
          credit_date?: string | null
          customer_cpf_cnpj?: string | null
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          customer_state?: string | null
          description?: string | null
          device_type?: string | null
          due_date?: string | null
          external_reference?: string | null
          id?: string
          installment_count?: number | null
          installment_value?: number | null
          ip_address?: string | null
          net_value?: number | null
          order_bumps_amount?: number | null
          order_bumps_selected?: string[] | null
          payment_date?: string | null
          payment_method?: string
          price_id?: string | null
          product_id?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "transactions_price_id_fkey"
            columns: ["price_id"]
            isOneToOne: false
            referencedRelation: "product_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      upsell_transactions: {
        Row: {
          created_at: string
          id: string
          original_transaction_id: string
          token_used: string
          transaction_id: string
          upsell_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          original_transaction_id: string
          token_used: string
          transaction_id: string
          upsell_id: string
        }
        Update: {
          created_at?: string
          id?: string
          original_transaction_id?: string
          token_used?: string
          transaction_id?: string
          upsell_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "upsell_transactions_original_transaction_id_fkey"
            columns: ["original_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upsell_transactions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upsell_transactions_upsell_id_fkey"
            columns: ["upsell_id"]
            isOneToOne: false
            referencedRelation: "product_upsells"
            referencedColumns: ["id"]
          },
        ]
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
      webhook_logs: {
        Row: {
          created_at: string
          id: string
          payload: Json
          product_id: string
          response_body: string | null
          response_status: number | null
          success: boolean
          webhook_url: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload: Json
          product_id: string
          response_body?: string | null
          response_status?: number | null
          success?: boolean
          webhook_url: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          product_id?: string
          response_body?: string | null
          response_status?: number | null
          success?: boolean
          webhook_url?: string
        }
        Relationships: []
      }
      webhook_queue: {
        Row: {
          attempts: number
          created_at: string
          error_message: string | null
          id: string
          last_attempt_at: string | null
          max_attempts: number
          payload: Json
          product_id: string
          status: string
          updated_at: string
          webhook_url: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          payload: Json
          product_id: string
          status?: string
          updated_at?: string
          webhook_url: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          payload?: Json
          product_id?: string
          status?: string
          updated_at?: string
          webhook_url?: string
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
      app_role: "admin" | "user" | "affiliate"
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
      app_role: ["admin", "user", "affiliate"],
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
