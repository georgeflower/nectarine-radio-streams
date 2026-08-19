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
      song_artists: {
        Row: {
          artist_id: string
          artist_name: string | null
          position: number
          song_id: string
        }
        Insert: {
          artist_id: string
          artist_name?: string | null
          position?: number
          song_id: string
        }
        Update: {
          artist_id?: string
          artist_name?: string | null
          position?: number
          song_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_artists_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "song_search"
            referencedColumns: ["song_id"]
          },
          {
            foreignKeyName: "song_artists_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["song_id"]
          },
        ]
      }
      song_groups: {
        Row: {
          group_id: string
          group_name: string | null
          song_id: string
        }
        Insert: {
          group_id: string
          group_name?: string | null
          song_id: string
        }
        Update: {
          group_id?: string
          group_name?: string | null
          song_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_groups_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "song_search"
            referencedColumns: ["song_id"]
          },
          {
            foreignKeyName: "song_groups_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["song_id"]
          },
        ]
      }
      song_links: {
        Row: {
          song_id: string
          source_id: string
          source_name: string | null
          url: string | null
        }
        Insert: {
          song_id: string
          source_id: string
          source_name?: string | null
          url?: string | null
        }
        Update: {
          song_id?: string
          source_id?: string
          source_name?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "song_links_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "song_search"
            referencedColumns: ["song_id"]
          },
          {
            foreignKeyName: "song_links_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["song_id"]
          },
        ]
      }
      song_plays: {
        Row: {
          created_at: string
          id: number
          length_sec: number | null
          playstart: string
          requester: string | null
          song_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          length_sec?: number | null
          playstart: string
          requester?: string | null
          song_id: string
        }
        Update: {
          created_at?: string
          id?: number
          length_sec?: number | null
          playstart?: string
          requester?: string | null
          song_id?: string
        }
        Relationships: []
      }
      song_tags: {
        Row: {
          song_id: string
          tag: string
          tag_norm: string | null
        }
        Insert: {
          song_id: string
          tag: string
          tag_norm?: string | null
        }
        Update: {
          song_id?: string
          tag?: string
          tag_norm?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "song_tags_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "song_search"
            referencedColumns: ["song_id"]
          },
          {
            foreignKeyName: "song_tags_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["song_id"]
          },
        ]
      }
      songs: {
        Row: {
          bitrate: number | null
          extra: Json
          first_seen_at: string
          info: string | null
          last_enriched_at: string
          lastplayed: string | null
          length_sec: number | null
          platform_id: string | null
          platform_name: string | null
          pouet_id: string | null
          rating: number | null
          samplerate: number | null
          song_id: string
          status_text: string | null
          status_v: string | null
          title: string | null
          type_id: string | null
          type_name: string | null
          votes: number | null
          yt_id: string | null
          yt_offset: number | null
        }
        Insert: {
          bitrate?: number | null
          extra?: Json
          first_seen_at?: string
          info?: string | null
          last_enriched_at?: string
          lastplayed?: string | null
          length_sec?: number | null
          platform_id?: string | null
          platform_name?: string | null
          pouet_id?: string | null
          rating?: number | null
          samplerate?: number | null
          song_id: string
          status_text?: string | null
          status_v?: string | null
          title?: string | null
          type_id?: string | null
          type_name?: string | null
          votes?: number | null
          yt_id?: string | null
          yt_offset?: number | null
        }
        Update: {
          bitrate?: number | null
          extra?: Json
          first_seen_at?: string
          info?: string | null
          last_enriched_at?: string
          lastplayed?: string | null
          length_sec?: number | null
          platform_id?: string | null
          platform_name?: string | null
          pouet_id?: string | null
          rating?: number | null
          samplerate?: number | null
          song_id?: string
          status_text?: string | null
          status_v?: string | null
          title?: string | null
          type_id?: string | null
          type_name?: string | null
          votes?: number | null
          yt_id?: string | null
          yt_offset?: number | null
        }
        Relationships: []
      }
      stream_events: {
        Row: {
          bitrate: number | null
          connection_type: string | null
          created_at: string
          downlink: number | null
          effective_type: string | null
          event: string
          hidden: boolean | null
          id: number
          lag_sec: number | null
          media_error_code: number | null
          media_error_message: string | null
          ms_since_connection_change: number | null
          network_state: number | null
          platform: string | null
          played_sec: number | null
          ready_state: number | null
          reason: string | null
          session_id: string
          stream_name: string | null
          stream_url: string
        }
        Insert: {
          bitrate?: number | null
          connection_type?: string | null
          created_at?: string
          downlink?: number | null
          effective_type?: string | null
          event: string
          hidden?: boolean | null
          id?: number
          lag_sec?: number | null
          media_error_code?: number | null
          media_error_message?: string | null
          ms_since_connection_change?: number | null
          network_state?: number | null
          platform?: string | null
          played_sec?: number | null
          ready_state?: number | null
          reason?: string | null
          session_id: string
          stream_name?: string | null
          stream_url: string
        }
        Update: {
          bitrate?: number | null
          connection_type?: string | null
          created_at?: string
          downlink?: number | null
          effective_type?: string | null
          event?: string
          hidden?: boolean | null
          id?: number
          lag_sec?: number | null
          media_error_code?: number | null
          media_error_message?: string | null
          ms_since_connection_change?: number | null
          network_state?: number | null
          platform?: string | null
          played_sec?: number | null
          ready_state?: number | null
          reason?: string | null
          session_id?: string
          stream_name?: string | null
          stream_url?: string
        }
        Relationships: []
      }
    }
    Views: {
      song_last_played: {
        Row: {
          last_played_locally: string | null
          song_id: string | null
        }
        Relationships: []
      }
      song_play_counts: {
        Row: {
          first_played: string | null
          last_played: string | null
          plays: number | null
          song_id: string | null
        }
        Relationships: []
      }
      song_search: {
        Row: {
          artists: Json | null
          bitrate: number | null
          extra: Json | null
          first_played: string | null
          first_seen_at: string | null
          groups: Json | null
          info: string | null
          last_enriched_at: string | null
          last_played: string | null
          lastplayed: string | null
          length_sec: number | null
          links: Json | null
          platform_id: string | null
          platform_name: string | null
          plays: number | null
          pouet_id: string | null
          rating: number | null
          samplerate: number | null
          song_id: string | null
          status_text: string | null
          status_v: string | null
          tags: string[] | null
          title: string | null
          type_id: string | null
          type_name: string | null
          votes: number | null
          yt_id: string | null
          yt_offset: number | null
        }
        Relationships: []
      }
      stream_reliability: {
        Row: {
          avg_live_seek_lag_sec: number | null
          avg_played_sec_before_failure: number | null
          bitrate: number | null
          connects: number | null
          ended_events: number | null
          failures: number | null
          handover_events: number | null
          incidents: number | null
          last_seen_at: string | null
          live_seeks: number | null
          raw_failures: number | null
          recent_connects: number | null
          recent_incidents: number | null
          recoveries: number | null
          stream_name: string | null
          stream_url: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
