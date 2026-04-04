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
          dbr_limit: number; max_tenor_months: number;
        };
        Insert: Partial<Database['public']['Tables']['banks']['Row']> & { bank_name: string };
        Update: Partial<Database['public']['Tables']['banks']['Row']>;
      };
      applicants: {
        Row: {
          id: string; user_id: string; created_at: string;
          residency_status: string | null; nationality: string | null; date_of_birth: string | null;
          employment_type: string | null; employer_name: string | null; employer_category: string | null;
        };
        Insert: Partial<Database['public']['Tables']['applicants']['Row']> & { user_id: string };
        Update: Partial<Database['public']['Tables']['applicants']['Row']>;
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
    };
  };
}
