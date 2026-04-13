export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      user_roles: {
        Row: { user_id: string; role: string };
        Insert: { user_id: string; role?: string };
        Update: { user_id?: string; role?: string };
      };
      banks: {
        Row: {
          id: string; bank_name: string; short_code: string | null; active: boolean;
          mortgage_types: string[]; base_stress_rate: number | null; stress_eibor_tenor: string | null;
          min_loan_amount: number; max_loan_amount: number | null; min_salary: number;
          dbr_limit: number; max_tenor_months: number; max_ltv: number | null;
        };
        Insert: Partial<Database['public']['Tables']['banks']['Row']> & { bank_name: string };
        Update: Partial<Database['public']['Tables']['banks']['Row']>;
      };
      version_log: {
        Row: {
          id: string; table_name: string; record_id: string; action: string;
          changed_by: string | null; details: Json | null; changed_at: string;
        };
        Insert: Partial<Database['public']['Tables']['version_log']['Row']> & { table_name: string; record_id: string };
        Update: Partial<Database['public']['Tables']['version_log']['Row']>;
      };
      applicants: {
        Row: {
          id: string; user_id: string; created_at: string;
          full_name: string | null;
          residency_status: string | null; nationality: string | null; date_of_birth: string | null;
          employment_type: string | null; employer_name: string | null; employer_category: string | null;
        };
        Insert: Partial<Database['public']['Tables']['applicants']['Row']> & { user_id: string };
        Update: Partial<Database['public']['Tables']['applicants']['Row']>;
      };
      qualification_results: {
        Row: {
          id: string; applicant_id: string; saved_at: string;
          loan_amount: number | null;
          dbr_percent: number | null;
          bank_results: Json | null;
          cost_comparison: Json | null;
        };
        Insert: Partial<Database['public']['Tables']['qualification_results']['Row']> & { applicant_id: string };
        Update: Partial<Database['public']['Tables']['qualification_results']['Row']>;
      };
      income_fields: {
        Row: {
          id: string; applicant_id: string; income_type: string; amount: number;
          percent_considered: number; recurrence: string; owner_type: string; co_borrower_index: number;
        };
        Insert: Partial<Database['public']['Tables']['income_fields']['Row']> & { income_type: string };
        Update: Partial<Database['public']['Tables']['income_fields']['Row']>;
      };
      liability_fields: {
        Row: {
          id: string; applicant_id: string; liability_type: string; amount: number;
          credit_card_limit: number | null; percent_considered: number; recurrence: string;
          owner_type: string; co_borrower_index: number;
          closed_before_application: boolean; liability_letter_obtained: boolean;
        };
        Insert: Partial<Database['public']['Tables']['liability_fields']['Row']> & { liability_type: string };
        Update: Partial<Database['public']['Tables']['liability_fields']['Row']>;
      };
      eibor_history: {
        Row: {
          id: string; fixing_date: string;
          overnight: number | null; w1: number | null; m1: number | null;
          m3: number | null; m6: number | null; y1: number | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['eibor_history']['Row']> & { fixing_date: string };
        Update: Partial<Database['public']['Tables']['eibor_history']['Row']>;
      };
      co_borrowers: {
        Row: {
          id: string; applicant_id: string; index: number; name: string | null;
          relationship: string | null; employment_type: string | null;
          date_of_birth: string | null; residency_status: string | null;
        };
        Insert: Partial<Database['public']['Tables']['co_borrowers']['Row']>;
        Update: Partial<Database['public']['Tables']['co_borrowers']['Row']>;
      };
      property_details: {
        Row: {
          id: string; applicant_id: string; property_value: number | null;
          loan_amount: number | null; ltv: number | null; emirate: string;
          is_difc: boolean; is_al_ain: boolean;
          transaction_type: string; property_type: string | null;
          purpose: string | null; loan_type_preference: string;
          preferred_tenor_months: number; nominal_rate: number;
          stress_rate: number;
        };
        Insert: Partial<Database['public']['Tables']['property_details']['Row']>;
        Update: Partial<Database['public']['Tables']['property_details']['Row']>;
      };
      products: {
        Row: {
          id: string; bank_id: string; product_name: string | null; segment: string | null;
          transaction_type: string | null; rate: number | null; rate_type: string | null;
          fixed_period_months: number | null; follow_on_margin: number | null;
          processing_fee_percent: number | null; valuation_fee: number | null;
          life_ins_monthly_percent: number | null; prop_ins_annual_percent: number | null;
          early_settlement_fee: string | null; active: boolean;
          salary_transfer: boolean; residency: string | null;
          eibor_benchmark: string | null; stress_rate: number | null;
          partial_settlement: string | null; key_points: string | null;
          status: string; validity_end: string | null;
          created_at: string; fixed_period: string | null;
          processing_fee: number | null;
          employment_subtype: string | null;
          doc_path: string | null;
          route_type: string | null;
          requires_stage1_pass: boolean;
          requires_stage2_pass: boolean;
          manual_only: boolean;
        };
        Insert: Partial<Database['public']['Tables']['products']['Row']> & { bank_id: string };
        Update: Partial<Database['public']['Tables']['products']['Row']>;
      };
      policy_terms: {
        Row: {
          id: string; bank: string; segment: string; employment_type: string;
          attribute: string; value: string | null;
        };
        Insert: Partial<Database['public']['Tables']['policy_terms']['Row']> & { bank: string; attribute: string };
        Update: Partial<Database['public']['Tables']['policy_terms']['Row']>;
      };
      ticker_updates: {
        Row: {
          id: string; content: string; category: string;
          active: boolean; pinned: boolean;
          created_at: string; created_by: string | null;
        };
        Insert: Partial<Database['public']['Tables']['ticker_updates']['Row']> & { content: string };
        Update: Partial<Database['public']['Tables']['ticker_updates']['Row']>;
      };
      qualification_notes: {
        Row: {
          id: string; bank_name: string; note_text: string;
          note_type: string | null; segment: string | null;
          employment_subtype: string | null; doc_path: string | null;
          route_type: string | null; critical: boolean;
          active: boolean; created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['qualification_notes']['Row']> & { bank_name: string; note_text: string };
        Update: Partial<Database['public']['Tables']['qualification_notes']['Row']>;
      };
      bank_eligibility_rules: {
        Row: {
          id: string; bank_id: string; segment: string;
          employment_subtype: string | null; doc_path: string | null;
          route_type: string | null; rule_type: string;
          operator: string; value_numeric: number | null;
          value_text: string | null; critical: boolean;
          active: boolean; priority: number;
          requires_manual_review: boolean; source_note: string | null;
          created_at: string; updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['bank_eligibility_rules']['Row']> & { bank_id: string; rule_type: string };
        Update: Partial<Database['public']['Tables']['bank_eligibility_rules']['Row']>;
      };
      bank_income_policies: {
        Row: {
          id: string; bank_id: string; segment: string;
          employment_subtype: string | null; doc_path: string | null;
          route_type: string | null; income_type: string;
          consideration_pct: number; income_basis: string | null;
          averaging_method: string | null; averaging_months: number | null;
          requires_documents: boolean; conditions: string | null;
          notes: string | null; active: boolean;
          created_at: string; updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['bank_income_policies']['Row']> & { bank_id: string; income_type: string };
        Update: Partial<Database['public']['Tables']['bank_income_policies']['Row']>;
      };
      bank_route_support: {
        Row: {
          id: string; bank_id: string; segment_path: string;
          route_type: string; supported: boolean;
          notes: string | null;
          created_at: string; updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['bank_route_support']['Row']> & { bank_id: string; segment_path: string; route_type: string };
        Update: Partial<Database['public']['Tables']['bank_route_support']['Row']>;
      };
      qualification_profiles: {
        Row: {
          id: string; applicant_id: string; segment_path: string;
          employment_subtype: string | null; doc_path: string | null;
          route_type: string; created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['qualification_profiles']['Row']> & { applicant_id: string; segment_path: string; route_type: string };
        Update: Partial<Database['public']['Tables']['qualification_profiles']['Row']>;
      };
    };
  };
}
