export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.4";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          created_at: string;
          current_region: string;
          full_name: string | null;
          home_location: string;
          id: string;
          language_code: string;
          onboarding_completed_at: string | null;
          timezone: string;
          travel_mode: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          current_region: string;
          full_name?: string | null;
          home_location: string;
          id: string;
          language_code: string;
          onboarding_completed_at?: string | null;
          timezone: string;
          travel_mode: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          current_region?: string;
          full_name?: string | null;
          home_location?: string;
          id?: string;
          language_code?: string;
          onboarding_completed_at?: string | null;
          timezone?: string;
          travel_mode?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
