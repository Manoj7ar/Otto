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
      otto_tasks: {
        Row: {
          approved_scope: string[];
          approval_summary: string;
          business_name: string;
          business_phone: string | null;
          business_website: string | null;
          call_goal: string;
          callback_call_sid: string | null;
          completed_at: string | null;
          conversation_log: Json;
          created_at: string;
          id: string;
          inbox_state: "active" | "waiting_approval" | "completed" | "failed" | "canceled";
          latest_step_label: string | null;
          latest_summary: string | null;
          metadata: Json;
          request_query: string;
          result_structured: Json;
          result_summary: string | null;
          source_snapshot: Json;
          status: "queued" | "dialing" | "in_progress" | "completed" | "failed" | "canceled";
          subject: string;
          task_type: "verification" | "booking" | "concierge";
          title: string;
          twilio_call_sid: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          approved_scope?: string[];
          approval_summary: string;
          business_name: string;
          business_phone?: string | null;
          business_website?: string | null;
          call_goal: string;
          callback_call_sid?: string | null;
          completed_at?: string | null;
          conversation_log?: Json;
          created_at?: string;
          id?: string;
          inbox_state?: "active" | "waiting_approval" | "completed" | "failed" | "canceled";
          latest_step_label?: string | null;
          latest_summary?: string | null;
          metadata?: Json;
          request_query: string;
          result_structured?: Json;
          result_summary?: string | null;
          source_snapshot?: Json;
          status?: "queued" | "dialing" | "in_progress" | "completed" | "failed" | "canceled";
          subject: string;
          task_type: "verification" | "booking" | "concierge";
          title?: string;
          twilio_call_sid?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          approved_scope?: string[];
          approval_summary?: string;
          business_name?: string;
          business_phone?: string | null;
          business_website?: string | null;
          call_goal?: string;
          callback_call_sid?: string | null;
          completed_at?: string | null;
          conversation_log?: Json;
          created_at?: string;
          id?: string;
          inbox_state?: "active" | "waiting_approval" | "completed" | "failed" | "canceled";
          latest_step_label?: string | null;
          latest_summary?: string | null;
          metadata?: Json;
          request_query?: string;
          result_structured?: Json;
          result_summary?: string | null;
          source_snapshot?: Json;
          status?: "queued" | "dialing" | "in_progress" | "completed" | "failed" | "canceled";
          subject?: string;
          task_type?: "verification" | "booking" | "concierge";
          title?: string;
          twilio_call_sid?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      otto_task_steps: {
        Row: {
          approval_required: boolean;
          approval_summary: string | null;
          completed_at: string | null;
          created_at: string;
          id: string;
          payload: Json;
          recipient_name: string | null;
          recipient_phone: string | null;
          result_summary: string | null;
          status: "pending" | "waiting_approval" | "approved" | "declined" | "running" | "completed" | "failed" | "skipped";
          step_order: number;
          step_type: "call_business" | "callback_user";
          task_id: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          approval_required?: boolean;
          approval_summary?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          payload?: Json;
          recipient_name?: string | null;
          recipient_phone?: string | null;
          result_summary?: string | null;
          status?: "pending" | "waiting_approval" | "approved" | "declined" | "running" | "completed" | "failed" | "skipped";
          step_order: number;
          step_type: "call_business" | "callback_user";
          task_id: string;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          approval_required?: boolean;
          approval_summary?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          payload?: Json;
          recipient_name?: string | null;
          recipient_phone?: string | null;
          result_summary?: string | null;
          status?: "pending" | "waiting_approval" | "approved" | "declined" | "running" | "completed" | "failed" | "skipped";
          step_order?: number;
          step_type?: "call_business" | "callback_user";
          task_id?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      otto_task_approvals: {
        Row: {
          created_at: string;
          id: string;
          resolved_at: string | null;
          status: "pending" | "approved" | "declined";
          step_id: string;
          summary: string;
          task_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          resolved_at?: string | null;
          status?: "pending" | "approved" | "declined";
          step_id: string;
          summary: string;
          task_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          resolved_at?: string | null;
          status?: "pending" | "approved" | "declined";
          step_id?: string;
          summary?: string;
          task_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          callback_phone: string | null;
          call_briefing_enabled: boolean;
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
          callback_phone?: string | null;
          call_briefing_enabled?: boolean;
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
          callback_phone?: string | null;
          call_briefing_enabled?: boolean;
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
