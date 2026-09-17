// Tipos do banco no formato do `supabase gen types typescript`.
// Mantidos manualmente enquanto não há projeto vinculado; quando houver,
// regenere com `npm run db:types`.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = "admin" | "gestor" | "colaborador";

export type ContractPeriodicity = "mensal" | "bimestral" | "trimestral" | "semestral" | "anual" | "projeto";
export type ContractStatus = "ativo" | "pausado" | "encerrado";
export type ExpenseCategory = "deslocamento" | "software" | "terceirizado" | "impostos" | "outros";
export type ExpenseRecurrence = "pontual" | "mensal" | "bimestral" | "trimestral" | "semestral" | "anual";
export type TimeEntryStatus = "pendente" | "aprovado" | "rejeitado";

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
          employee_id: string | null;
          created_at: string;
        };
        Insert: {
          tenant_id: string;
          email: string;
          full_name: string;
          role?: AppRole;
          can_view_costs?: boolean;
          employee_id?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      areas: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          description: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { tenant_id: string; name: string; description?: string | null; active?: boolean };
        Update: { name?: string; description?: string | null; active?: boolean };
        Relationships: [];
      };
      activities: {
        Row: {
          id: string;
          tenant_id: string;
          area_id: string | null;
          name: string;
          billable: boolean;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { tenant_id: string; area_id?: string | null; name: string; billable?: boolean; active?: boolean };
        Update: { area_id?: string | null; name?: string; billable?: boolean; active?: boolean };
        Relationships: [
          {
            foreignKeyName: "activities_area_id_fkey";
            columns: ["area_id"];
            isOneToOne: false;
            referencedRelation: "areas";
            referencedColumns: ["id"];
          },
        ];
      };
      employees: {
        Row: {
          id: string;
          tenant_id: string;
          profile_id: string | null;
          full_name: string;
          email: string | null;
          job_title: string | null;
          monthly_hours: number | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          tenant_id: string;
          full_name: string;
          email?: string | null;
          job_title?: string | null;
          monthly_hours?: number | null;
          active?: boolean;
        };
        Update: {
          full_name?: string;
          email?: string | null;
          job_title?: string | null;
          monthly_hours?: number | null;
          active?: boolean;
        };
        Relationships: [];
      };
      employee_areas: {
        Row: { employee_id: string; area_id: string; tenant_id: string };
        Insert: { employee_id: string; area_id: string; tenant_id: string };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "employee_areas_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_areas_area_id_fkey";
            columns: ["area_id"];
            isOneToOne: false;
            referencedRelation: "areas";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_costs: {
        Row: {
          id: string;
          tenant_id: string;
          employee_id: string;
          monthly_salary: number;
          charges_percent: number;
          charges_amount: number;
          benefits: number;
          monthly_hours: number;
          valid_from: string;
          valid_to: string | null;
          hourly_cost: number;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "employee_costs_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          id: string;
          tenant_id: string;
          legal_name: string;
          trade_name: string | null;
          cnpj: string | null;
          contact_name: string | null;
          email: string | null;
          phone: string | null;
          notes: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          tenant_id: string;
          legal_name: string;
          trade_name?: string | null;
          cnpj?: string | null;
          contact_name?: string | null;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          active?: boolean;
        };
        Update: {
          legal_name?: string;
          trade_name?: string | null;
          cnpj?: string | null;
          contact_name?: string | null;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          active?: boolean;
        };
        Relationships: [];
      };
      client_areas: {
        Row: { client_id: string; area_id: string; tenant_id: string };
        Insert: { client_id: string; area_id: string; tenant_id: string };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "client_areas_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_areas_area_id_fkey";
            columns: ["area_id"];
            isOneToOne: false;
            referencedRelation: "areas";
            referencedColumns: ["id"];
          },
        ];
      };
      contracts: {
        Row: {
          id: string;
          tenant_id: string;
          client_id: string;
          name: string;
          description: string | null;
          amount: number;
          periodicity: ContractPeriodicity;
          start_date: string;
          end_date: string | null;
          desired_margin: number;
          tax_rate: number;
          expected_hours: number | null;
          status: ContractStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          tenant_id: string;
          client_id: string;
          name: string;
          description?: string | null;
          amount: number;
          periodicity?: ContractPeriodicity;
          start_date: string;
          end_date?: string | null;
          desired_margin?: number;
          tax_rate?: number;
          expected_hours?: number | null;
          status?: ContractStatus;
        };
        Update: {
          name?: string;
          description?: string | null;
          amount?: number;
          periodicity?: ContractPeriodicity;
          start_date?: string;
          end_date?: string | null;
          desired_margin?: number;
          tax_rate?: number;
          expected_hours?: number | null;
          status?: ContractStatus;
        };
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      contract_areas: {
        Row: { contract_id: string; area_id: string; tenant_id: string };
        Insert: { contract_id: string; area_id: string; tenant_id: string };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "contract_areas_area_id_fkey";
            columns: ["area_id"];
            isOneToOne: false;
            referencedRelation: "areas";
            referencedColumns: ["id"];
          },
        ];
      };
      contract_activities: {
        Row: { contract_id: string; activity_id: string; tenant_id: string };
        Insert: { contract_id: string; activity_id: string; tenant_id: string };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "contract_activities_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "activities";
            referencedColumns: ["id"];
          },
        ];
      };
      contract_members: {
        Row: { contract_id: string; employee_id: string; tenant_id: string };
        Insert: { contract_id: string; employee_id: string; tenant_id: string };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "contract_members_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      contract_expenses: {
        Row: {
          id: string;
          tenant_id: string;
          contract_id: string;
          description: string;
          category: ExpenseCategory;
          amount: number;
          expense_date: string;
          recurrence: ExpenseRecurrence;
          end_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          tenant_id: string;
          contract_id: string;
          description: string;
          category?: ExpenseCategory;
          amount: number;
          expense_date: string;
          recurrence?: ExpenseRecurrence;
          end_date?: string | null;
        };
        Update: {
          description?: string;
          category?: ExpenseCategory;
          amount?: number;
          expense_date?: string;
          recurrence?: ExpenseRecurrence;
          end_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contract_expenses_contract_id_fkey";
            columns: ["contract_id"];
            isOneToOne: false;
            referencedRelation: "contracts";
            referencedColumns: ["id"];
          },
        ];
      };
      time_entries: {
        Row: {
          id: string;
          tenant_id: string;
          employee_id: string;
          contract_id: string | null;
          activity_id: string;
          entry_date: string;
          start_time: string | null;
          end_time: string | null;
          minutes: number;
          description: string | null;
          billable: boolean;
          cost_per_hour: number | null;
          cost_amount: number;
          status: TimeEntryStatus;
          reviewed_by: string | null;
          reviewed_at: string | null;
          review_comment: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          tenant_id: string;
          employee_id: string;
          contract_id?: string | null;
          activity_id: string;
          entry_date: string;
          start_time?: string | null;
          end_time?: string | null;
          minutes: number;
          description?: string | null;
        };
        Update: {
          contract_id?: string | null;
          activity_id?: string;
          entry_date?: string;
          start_time?: string | null;
          end_time?: string | null;
          minutes?: number;
          description?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "time_entries_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_entries_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "activities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_entries_contract_id_fkey";
            columns: ["contract_id"];
            isOneToOne: false;
            referencedRelation: "contracts";
            referencedColumns: ["id"];
          },
        ];
      };
      period_locks: {
        Row: {
          tenant_id: string;
          locked_through: string | null;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      contract_options: {
        Row: {
          id: string;
          tenant_id: string;
          client_id: string;
          name: string;
          status: ContractStatus;
          start_date: string;
          end_date: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      review_time_entries: {
        Args: { p_ids: string[]; p_status: TimeEntryStatus; p_comment?: string | null };
        Returns: number;
      };
      set_period_lock: {
        Args: { p_locked_through: string | null };
        Returns: undefined;
      };
      set_employee_cost: {
        Args: {
          p_employee_id: string;
          p_monthly_salary: number;
          p_charges_percent: number;
          p_charges_amount: number;
          p_benefits: number;
          p_monthly_hours: number;
          p_valid_from: string;
        };
        Returns: string;
      };
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
    Enums: {
      app_role: AppRole;
      contract_periodicity: ContractPeriodicity;
      contract_status: ContractStatus;
      expense_category: ExpenseCategory;
      expense_recurrence: ExpenseRecurrence;
      time_entry_status: TimeEntryStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
