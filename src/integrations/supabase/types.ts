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
      commander_intents: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          term: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          term: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          term?: string
          updated_at?: string
        }
        Relationships: []
      }
      correlation_alerts: {
        Row: {
          acknowledged: boolean
          created_at: string
          data_product_id: string
          detection_id: string | null
          id: string
          intent_id: string
          match_score: number | null
          match_type: string
          matched_label: string
          matched_term: string
        }
        Insert: {
          acknowledged?: boolean
          created_at?: string
          data_product_id: string
          detection_id?: string | null
          id?: string
          intent_id: string
          match_score?: number | null
          match_type: string
          matched_label: string
          matched_term: string
        }
        Update: {
          acknowledged?: boolean
          created_at?: string
          data_product_id?: string
          detection_id?: string | null
          id?: string
          intent_id?: string
          match_score?: number | null
          match_type?: string
          matched_label?: string
          matched_term?: string
        }
        Relationships: [
          {
            foreignKeyName: "correlation_alerts_data_product_id_fkey"
            columns: ["data_product_id"]
            isOneToOne: false
            referencedRelation: "data_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correlation_alerts_detection_id_fkey"
            columns: ["detection_id"]
            isOneToOne: false
            referencedRelation: "detection_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correlation_alerts_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "commander_intents"
            referencedColumns: ["id"]
          },
        ]
      }
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
      data_sources: {
        Row: {
          auth_credentials: Json | null
          auth_type: string | null
          config: Json | null
          created_at: string
          endpoint_url: string | null
          id: string
          last_error: string | null
          last_heartbeat: string | null
          max_retries: number
          name: string
          retry_count: number
          retry_delay_seconds: number
          source_type: string
          status: string
          total_ingested: number
          updated_at: string
        }
        Insert: {
          auth_credentials?: Json | null
          auth_type?: string | null
          config?: Json | null
          created_at?: string
          endpoint_url?: string | null
          id?: string
          last_error?: string | null
          last_heartbeat?: string | null
          max_retries?: number
          name: string
          retry_count?: number
          retry_delay_seconds?: number
          source_type: string
          status?: string
          total_ingested?: number
          updated_at?: string
        }
        Update: {
          auth_credentials?: Json | null
          auth_type?: string | null
          config?: Json | null
          created_at?: string
          endpoint_url?: string | null
          id?: string
          last_error?: string | null
          last_heartbeat?: string | null
          max_retries?: number
          name?: string
          retry_count?: number
          retry_delay_seconds?: number
          source_type?: string
          status?: string
          total_ingested?: number
          updated_at?: string
        }
        Relationships: []
      }
      dead_letter_queue: {
        Row: {
          created_at: string
          data_product_id: string | null
          error_message: string | null
          id: string
          original_event_id: string | null
          payload: Json
          retry_count: number
          stage: string
          topic: string
        }
        Insert: {
          created_at?: string
          data_product_id?: string | null
          error_message?: string | null
          id?: string
          original_event_id?: string | null
          payload: Json
          retry_count?: number
          stage: string
          topic: string
        }
        Update: {
          created_at?: string
          data_product_id?: string | null
          error_message?: string | null
          id?: string
          original_event_id?: string | null
          payload?: Json
          retry_count?: number
          stage?: string
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "dead_letter_queue_data_product_id_fkey"
            columns: ["data_product_id"]
            isOneToOne: false
            referencedRelation: "data_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dead_letter_queue_original_event_id_fkey"
            columns: ["original_event_id"]
            isOneToOne: false
            referencedRelation: "event_bus"
            referencedColumns: ["id"]
          },
        ]
      }
      detection_results: {
        Row: {
          bounding_box: Json | null
          confidence: number | null
          created_at: string
          data_product_id: string
          detector_type: string
          id: string
          label: string
          metadata: Json | null
        }
        Insert: {
          bounding_box?: Json | null
          confidence?: number | null
          created_at?: string
          data_product_id: string
          detector_type: string
          id?: string
          label: string
          metadata?: Json | null
        }
        Update: {
          bounding_box?: Json | null
          confidence?: number | null
          created_at?: string
          data_product_id?: string
          detector_type?: string
          id?: string
          label?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "detection_results_data_product_id_fkey"
            columns: ["data_product_id"]
            isOneToOne: false
            referencedRelation: "data_products"
            referencedColumns: ["id"]
          },
        ]
      }
      event_bus: {
        Row: {
          completed_at: string | null
          consumer_group: string | null
          created_at: string
          data_product_id: string | null
          error_message: string | null
          id: string
          max_retries: number
          metadata: Json | null
          next_retry_at: string | null
          offset_id: number
          partition_key: string | null
          payload: Json
          retry_count: number
          stage: string
          started_at: string | null
          status: string
          topic: string
        }
        Insert: {
          completed_at?: string | null
          consumer_group?: string | null
          created_at?: string
          data_product_id?: string | null
          error_message?: string | null
          id?: string
          max_retries?: number
          metadata?: Json | null
          next_retry_at?: string | null
          offset_id?: never
          partition_key?: string | null
          payload?: Json
          retry_count?: number
          stage?: string
          started_at?: string | null
          status?: string
          topic: string
        }
        Update: {
          completed_at?: string | null
          consumer_group?: string | null
          created_at?: string
          data_product_id?: string | null
          error_message?: string | null
          id?: string
          max_retries?: number
          metadata?: Json | null
          next_retry_at?: string | null
          offset_id?: never
          partition_key?: string | null
          payload?: Json
          retry_count?: number
          stage?: string
          started_at?: string | null
          status?: string
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_bus_data_product_id_fkey"
            columns: ["data_product_id"]
            isOneToOne: false
            referencedRelation: "data_products"
            referencedColumns: ["id"]
          },
        ]
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
      pipeline_stages: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          name: string
          stage_order: number
          timeout_seconds: number
          topic: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          name: string
          stage_order: number
          timeout_seconds?: number
          topic: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          name?: string
          stage_order?: number
          timeout_seconds?: number
          topic?: string
        }
        Relationships: []
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
