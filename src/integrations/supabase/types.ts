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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          city: string
          complement: string | null
          created_at: string
          id: string
          is_default: boolean
          label: string
          latitude: number | null
          longitude: number | null
          neighborhood: string
          number: string
          reference: string | null
          state: string
          street: string
          user_id: string
          zipcode: string | null
        }
        Insert: {
          city?: string
          complement?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          latitude?: number | null
          longitude?: number | null
          neighborhood: string
          number: string
          reference?: string | null
          state?: string
          street: string
          user_id: string
          zipcode?: string | null
        }
        Update: {
          city?: string
          complement?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          latitude?: number | null
          longitude?: number | null
          neighborhood?: string
          number?: string
          reference?: string | null
          state?: string
          street?: string
          user_id?: string
          zipcode?: string | null
        }
        Relationships: []
      }
      banners: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          link_slug: string | null
          sort_order: number
          subtitle: string | null
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_slug?: string | null
          sort_order?: number
          subtitle?: string | null
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_slug?: string | null
          sort_order?: number
          subtitle?: string | null
          title?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      combo_items: {
        Row: {
          combo_id: string
          id: string
          product_id: string
          quantity: number
        }
        Insert: {
          combo_id: string
          id?: string
          product_id: string
          quantity?: number
        }
        Update: {
          combo_id?: string
          id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "combo_items_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_items_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "products_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_admin"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_usages: {
        Row: {
          coupon_id: string
          created_at: string
          id: string
          order_id: string | null
          user_id: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          id?: string
          order_id?: string | null
          user_id: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          id?: string
          order_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_usages_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          ends_at: string | null
          first_order_only: boolean
          id: string
          is_active: boolean
          max_uses: number | null
          max_uses_per_user: number
          min_order: number
          starts_at: string | null
          used_count: number
        }
        Insert: {
          code: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          first_order_only?: boolean
          id?: string
          is_active?: boolean
          max_uses?: number | null
          max_uses_per_user?: number
          min_order?: number
          starts_at?: string | null
          used_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          first_order_only?: boolean
          id?: string
          is_active?: boolean
          max_uses?: number | null
          max_uses_per_user?: number
          min_order?: number
          starts_at?: string | null
          used_count?: number
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          created_at: string
          delivered_at: string | null
          driver_id: string | null
          id: string
          last_latitude: number | null
          last_longitude: number | null
          order_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          driver_id?: string | null
          id?: string
          last_latitude?: number | null
          last_longitude?: number | null
          order_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          driver_id?: string | null
          id?: string
          last_latitude?: number | null
          last_longitude?: number | null
          order_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "delivery_drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_drivers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          user_id: string
          vehicle: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          user_id: string
          vehicle?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          user_id?: string
          vehicle?: string | null
        }
        Relationships: []
      }
      delivery_zones: {
        Row: {
          city: string
          eta_minutes: number
          fee: number
          id: string
          is_active: boolean
          min_order: number
          neighborhood: string
          state: string
        }
        Insert: {
          city?: string
          eta_minutes?: number
          fee?: number
          id?: string
          is_active?: boolean
          min_order?: number
          neighborhood: string
          state?: string
        }
        Update: {
          city?: string
          eta_minutes?: number
          fee?: number
          id?: string
          is_active?: boolean
          min_order?: number
          neighborhood?: string
          state?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_admin"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_accounts: {
        Row: {
          balance: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      loyalty_transactions: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          order_id: string | null
          points: number
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          order_id?: string | null
          points?: number
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          order_id?: string | null
          points?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          title: string
          type?: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          image_url: string | null
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          id?: string
          image_url?: string | null
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Update: {
          id?: string
          image_url?: string | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_admin"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_events: {
        Row: {
          created_at: string
          id: string
          order_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          status: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_id: string | null
          address_snapshot: Json | null
          coupon_code: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          delivery_fee: number
          discount: number
          driver_id: string | null
          eta_minutes: number | null
          id: string
          notes: string | null
          order_number: number
          payment_method: string
          payment_status: string
          status: string
          stock_restored_at: string | null
          subtotal: number
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          address_id?: string | null
          address_snapshot?: Json | null
          coupon_code?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          delivery_fee?: number
          discount?: number
          driver_id?: string | null
          eta_minutes?: number | null
          id?: string
          notes?: string | null
          order_number?: number
          payment_method?: string
          payment_status?: string
          status?: string
          stock_restored_at?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          address_id?: string | null
          address_snapshot?: Json | null
          coupon_code?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          delivery_fee?: number
          discount?: number
          driver_id?: string | null
          eta_minutes?: number | null
          id?: string
          notes?: string | null
          order_number?: number
          payment_method?: string
          payment_status?: string
          status?: string
          stock_restored_at?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "delivery_drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          external_id: string | null
          id: string
          method: string
          order_id: string
          pix_copy_paste: string | null
          pix_qr_code: string | null
          provider: string
          status: string
        }
        Insert: {
          amount?: number
          created_at?: string
          external_id?: string | null
          id?: string
          method?: string
          order_id: string
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          provider?: string
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          external_id?: string | null
          id?: string
          method?: string
          order_id?: string
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          provider?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          id: string
          product_id: string
          sort_order: number
          url: string
        }
        Insert: {
          id?: string
          product_id: string
          sort_order?: number
          url: string
        }
        Update: {
          id?: string
          product_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_admin"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          brand: string | null
          category_id: string | null
          combo_original_price: number | null
          cost: number | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_combo: boolean
          is_featured: boolean
          min_stock: number
          name: string
          price: number
          promo_price: number | null
          sku: string | null
          slug: string | null
          stock: number
          temperature: string
          unit: string
          updated_at: string
          volume: string | null
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          category_id?: string | null
          combo_original_price?: number | null
          cost?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_combo?: boolean
          is_featured?: boolean
          min_stock?: number
          name: string
          price?: number
          promo_price?: number | null
          sku?: string | null
          slug?: string | null
          stock?: number
          temperature?: string
          unit?: string
          updated_at?: string
          volume?: string | null
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          category_id?: string | null
          combo_original_price?: number | null
          cost?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_combo?: boolean
          is_featured?: boolean
          min_stock?: number
          name?: string
          price?: number
          promo_price?: number | null
          sku?: string | null
          slug?: string | null
          stock?: number
          temperature?: string
          unit?: string
          updated_at?: string
          volume?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cpf: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promotions: {
        Row: {
          created_at: string
          discount_amount: number | null
          discount_percent: number | null
          ends_at: string | null
          id: string
          is_active: boolean
          label: string | null
          min_quantity: number
          product_id: string | null
          starts_at: string | null
          type: string
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          discount_amount?: number | null
          discount_percent?: number | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          min_quantity?: number
          product_id?: string | null
          starts_at?: string | null
          type?: string
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          discount_amount?: number | null
          discount_percent?: number | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          min_quantity?: number
          product_id?: string | null
          starts_at?: string | null
          type?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_admin"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          actor_user_id: string | null
          cost_after: number | null
          cost_before: number | null
          created_at: string
          id: string
          idempotency_key: string | null
          kind: string
          order_id: string | null
          product_id: string
          quantity_delta: number
          reason: string | null
          source: string
          stock_after: number
          stock_before: number
          unit_cost: number | null
        }
        Insert: {
          actor_user_id?: string | null
          cost_after?: number | null
          cost_before?: number | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          kind: string
          order_id?: string | null
          product_id: string
          quantity_delta: number
          reason?: string | null
          source?: string
          stock_after: number
          stock_before: number
          unit_cost?: number | null
        }
        Update: {
          actor_user_id?: string | null
          cost_after?: number | null
          cost_before?: number | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          kind?: string
          order_id?: string | null
          product_id?: string
          quantity_delta?: number
          reason?: string | null
          source?: string
          stock_after?: number
          stock_before?: number
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_admin"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          address: string | null
          avg_delivery_minutes: number
          default_delivery_fee: number
          free_delivery_above: number
          id: number
          is_open: boolean
          logo_url: string | null
          min_order: number
          opening_hours: string | null
          payment_methods: string[]
          phone: string | null
          store_name: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          avg_delivery_minutes?: number
          default_delivery_fee?: number
          free_delivery_above?: number
          id?: number
          is_open?: boolean
          logo_url?: string | null
          min_order?: number
          opening_hours?: string | null
          payment_methods?: string[]
          phone?: string | null
          store_name?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          avg_delivery_minutes?: number
          default_delivery_fee?: number
          free_delivery_above?: number
          id?: number
          is_open?: boolean
          logo_url?: string | null
          min_order?: number
          opening_hours?: string | null
          payment_methods?: string[]
          phone?: string | null
          store_name?: string
          updated_at?: string
          whatsapp?: string | null
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
      products_admin: {
        Row: {
          barcode: string | null
          brand: string | null
          category_id: string | null
          combo_original_price: number | null
          cost: number | null
          created_at: string | null
          description: string | null
          id: string | null
          image_url: string | null
          is_active: boolean | null
          is_combo: boolean | null
          is_featured: boolean | null
          min_stock: number | null
          name: string | null
          price: number | null
          promo_price: number | null
          sku: string | null
          slug: string | null
          stock: number | null
          temperature: string | null
          unit: string | null
          updated_at: string | null
          volume: string | null
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          category_id?: string | null
          combo_original_price?: number | null
          cost?: number | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          is_active?: boolean | null
          is_combo?: boolean | null
          is_featured?: boolean | null
          min_stock?: number | null
          name?: string | null
          price?: number | null
          promo_price?: number | null
          sku?: string | null
          slug?: string | null
          stock?: number | null
          temperature?: string | null
          unit?: string | null
          updated_at?: string | null
          volume?: string | null
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          category_id?: string | null
          combo_original_price?: number | null
          cost?: number | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          is_active?: boolean | null
          is_combo?: boolean | null
          is_featured?: boolean | null
          min_stock?: number | null
          name?: string | null
          price?: number | null
          promo_price?: number | null
          sku?: string | null
          slug?: string | null
          stock?: number | null
          temperature?: string | null
          unit?: string | null
          updated_at?: string | null
          volume?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_delivery: { Args: { p_order_id: string }; Returns: Json }
      admin_customers: {
        Args: { p_search?: string }
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          last_order_at: string
          orders_count: number
          orders_total: number
          phone: string
        }[]
      }
      admin_dashboard_metrics: { Args: never; Returns: Json }
      admin_driver_stats: {
        Args: never
        Returns: {
          delivered: number
          driver_id: string
          in_route: number
          last_delivery_at: string
        }[]
      }
      admin_link_driver: {
        Args: {
          p_email: string
          p_name: string
          p_phone?: string
          p_vehicle?: string
        }
        Returns: Json
      }
      admin_stock_adjust: {
        Args: {
          p_delta: number
          p_kind: string
          p_product_id: string
          p_reason: string
        }
        Returns: Json
      }
      admin_stock_bulk_entry: {
        Args: { p_items: Json; p_reason?: string }
        Returns: Json
      }
      admin_stock_entry: {
        Args: {
          p_product_id: string
          p_quantity: number
          p_reason?: string
          p_unit_cost?: number
        }
        Returns: Json
      }
      admin_stock_history: {
        Args: {
          p_from?: string
          p_kind?: string
          p_limit?: number
          p_offset?: number
          p_product_id?: string
          p_to?: string
        }
        Returns: {
          actor_name: string
          created_at: string
          id: string
          kind: string
          order_id: string
          order_number: number
          product_id: string
          product_name: string
          quantity_delta: number
          reason: string
          stock_after: number
          stock_before: number
          unit_cost: number
        }[]
      }
      admin_stock_inventory: {
        Args: { p_counted: number; p_product_id: string; p_reason: string }
        Returns: Json
      }
      admin_unlink_driver: { Args: { p_driver_id: string }; Returns: Json }
      can_view_order: { Args: { _order_id: string }; Returns: boolean }
      create_order: {
        Args: {
          p_address_id: string
          p_change_for?: string
          p_coupon_code?: string
          p_items: Json
          p_notes?: string
          p_payment_method: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_order_driver: { Args: { _order_id: string }; Returns: boolean }
      preview_coupon: {
        Args: { p_code: string; p_subtotal: number }
        Returns: Json
      }
      record_stock_movement: {
        Args: {
          p_actor?: string
          p_cost_after?: number
          p_cost_before?: number
          p_delta: number
          p_key?: string
          p_kind: string
          p_order_id?: string
          p_product_id: string
          p_reason?: string
          p_source?: string
          p_stock_after: number
          p_stock_before: number
          p_unit_cost?: number
        }
        Returns: undefined
      }
      set_order_status: {
        Args: { p_order_id: string; p_status: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "customer" | "driver" | "admin"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["customer", "driver", "admin"],
    },
  },
} as const
