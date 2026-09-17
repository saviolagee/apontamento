// Tipos do banco no formato do `supabase gen types typescript`.
// Mantidos manualmente enquanto não há projeto vinculado; quando houver,
// regenere com `npm run db:types`.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = "admin" | "gestor" | "colaborador";

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          name: string;
          cnpj: string | null;
          logo_url: string | null;
          monthly_hours: number;
          margin_attention_tolerance: number;
          timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          name?: string;
          cnpj?: string | null;
          logo_url?: string | null;
          monthly_hours?: number;
          margin_attention_tolerance?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          tenant_id: string;
          full_name: string;
          email: string;
          role: AppRole;
          can_view_costs: boolean;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: { full_name?: string };
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          id: string;
          tenant_id: string;
          email: string;
          full_name: string;
          role: AppRole;
          can_view_costs: boolean;
          invited_by: string | null;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          tenant_id: string;
          email: string;
          full_name: string;
          role?: AppRole;
          can_view_costs?: boolean;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_tenant: {
        Args: { p_name: string; p_cnpj: string | null; p_full_name: string };
        Returns: string;
      };
      accept_pending_invitation: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      admin_update_member: {
        Args: { p_profile_id: string; p_role: AppRole; p_can_view_costs: boolean; p_active: boolean };
        Returns: undefined;
      };
    };
    Enums: { app_role: AppRole };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
