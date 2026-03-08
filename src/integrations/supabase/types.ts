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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      data_products: {
        Row: {
          confidence_score: number | null
          content: Json | null
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          priority: Database["public"]["Enums"]["priority_level"] | null
          priority_reasoning: string | null
          priority_score: number | null
          source_identifier: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          status: Database["public"]["Enums"]["data_status"]
          title: string
          updated_at: string
        }
        Insert: {
          confidence_score?: number | null
          content?: Json | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          priority_reasoning?: string | null
          priority_score?: number | null
          source_identifier?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          status?: Database["public"]["Enums"]["data_status"]
          title: string
          updated_at?: string
        }
        Update: {
          confidence_score?: number | null
          content?: Json | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          priority_reasoning?: string | null
          priority_score?: number | null
          source_identifier?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          status?: Database["public"]["Enums"]["data_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      metadata_tags: {
        Row: {
          confidence: number | null
          created_at: string
          data_product_id: string
          id: string
          tag_category: string | null
          tag_name: string
          tag_value: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          data_product_id: string
          id?: string
          tag_category?: string | null
          tag_name: string
          tag_value: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          data_product_id?: string
          id?: string
          tag_category?: string | null
          tag_name?: string
          tag_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "metadata_tags_data_product_id_fkey"
            columns: ["data_product_id"]
            isOneToOne: false
            referencedRelation: "data_products"
            referencedColumns: ["id"]
          },
        ]
      }
      processing_queue: {
        Row: {
          completed_at: string | null
          created_at: string
          data_product_id: string
          error_message: string | null
          id: string
          started_at: string | null
          status: string
          step: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          data_product_id: string
          error_message?: string | null
          id?: string
          started_at?: string | null
          status?: string
          step: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          data_product_id?: string
          error_message?: string | null
          id?: string
          started_at?: string | null
          status?: string
          step?: string
        }
        Relationships: [
          {
            foreignKeyName: "processing_queue_data_product_id_fkey"
            columns: ["data_product_id"]
            isOneToOne: false
            referencedRelation: "data_products"
            referencedColumns: ["id"]
          },
        ]
      }
      system_metrics: {
        Row: {
          id: string
          metric_name: string
          metric_value: number
          recorded_at: string
          unit: string | null
        }
        Insert: {
          id?: string
          metric_name: string
          metric_value: number
          recorded_at?: string
          unit?: string | null
        }
        Update: {
          id?: string
          metric_name?: string
          metric_value?: number
          recorded_at?: string
          unit?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      data_status:
        | "ingested"
        | "processing"
        | "tagged"
        | "prioritized"
        | "transported"
        | "archived"
      priority_level: "critical" | "high" | "medium" | "low" | "routine"
      source_type:
        | "sensor"
        | "cot_message"
        | "image"
        | "video"
        | "document"
        | "sigint"
        | "humint"
        | "geoint"
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
      data_status: [
        "ingested",
        "processing",
        "tagged",
        "prioritized",
        "transported",
        "archived",
      ],
      priority_level: ["critical", "high", "medium", "low", "routine"],
      source_type: [
        "sensor",
        "cot_message",
        "image",
        "video",
        "document",
        "sigint",
        "humint",
        "geoint",
      ],
    },
  },
} as const
