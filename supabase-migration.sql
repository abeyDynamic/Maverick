-- ============================================================
-- KSquare Mortgage Engine — Full Database Setup
-- Run this in your Supabase SQL Editor (gghrlmbtklwwfyowiwjv)
-- ============================================================

-- 1. user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role text NOT NULL DEFAULT 'adviser'
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "Users read own role" ON public.user_roles FOR SELECT USING (user_id = auth.uid());

-- 2. banks
CREATE TABLE IF NOT EXISTS public.banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name text NOT NULL,
  short_code text,
  active boolean DEFAULT true,
  mortgage_types text[] DEFAULT ARRAY['conventional'],
  base_stress_rate numeric,
  stress_eibor_tenor text,
  min_loan_amount numeric DEFAULT 500000,
  max_loan_amount numeric,
  min_salary numeric DEFAULT 15000,
  dbr_limit numeric DEFAULT 0.50,
  max_tenor_months integer DEFAULT 300
);
ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users read active banks" ON public.banks FOR SELECT TO authenticated USING (active = true);
CREATE POLICY "Admins manage banks" ON public.banks FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. eibor_rates
CREATE TABLE IF NOT EXISTS public.eibor_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_type text NOT NULL,
  rate numeric NOT NULL,
  effective_date date NOT NULL DEFAULT current_date,
  source text DEFAULT 'manual'
);
ALTER TABLE public.eibor_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users read eibor" ON public.eibor_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage eibor" ON public.eibor_rates FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. products
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id uuid REFERENCES public.banks(id),
  segment text NOT NULL,
  residency text NOT NULL,
  mortgage_type text NOT NULL,
  transaction_type text NOT NULL,
  product_type text NOT NULL,
  fixed_period text,
  salary_transfer boolean DEFAULT false,
  customer_profile text,
  rate numeric NOT NULL,
  follow_on_margin numeric,
  eibor_benchmark text,
  floor_rate numeric,
  stress_rate numeric,
  max_ltv numeric,
  processing_fee text,
  valuation_fee numeric,
  life_ins_monthly numeric,
  prop_ins_annual numeric,
  early_settlement text,
  partial_settlement text,
  key_points text,
  validity_start date NOT NULL DEFAULT current_date,
  validity_end date,
  status text NOT NULL DEFAULT 'active',
  version_number integer DEFAULT 1,
  superseded_by uuid REFERENCES public.products(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users read active products" ON public.products FOR SELECT TO authenticated
  USING (status = 'active' AND (validity_end IS NULL OR validity_end > current_date));
CREATE POLICY "Admins manage products" ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. qualification_notes
CREATE TABLE IF NOT EXISTS public.qualification_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id uuid REFERENCES public.banks(id),
  segment text,
  field_name text NOT NULL,
  official_value text,
  practical_value text,
  note_text text NOT NULL,
  added_by uuid REFERENCES auth.users(id),
  added_at timestamptz DEFAULT now(),
  active boolean DEFAULT true
);
ALTER TABLE public.qualification_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read active notes" ON public.qualification_notes FOR SELECT TO authenticated USING (active = true);
CREATE POLICY "Auth insert notes" ON public.qualification_notes FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admins update notes" ON public.qualification_notes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete notes" ON public.qualification_notes FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 6. emirate_fees
CREATE TABLE IF NOT EXISTS public.emirate_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emirate text NOT NULL,
  fee_type text NOT NULL,
  rate numeric,
  fixed_amount numeric,
  notes text,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.emirate_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read emirate fees" ON public.emirate_fees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage emirate fees" ON public.emirate_fees FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 7. version_log
CREATE TABLE IF NOT EXISTS public.version_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL,
  changed_fields jsonb,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz DEFAULT now(),
  reason text
);
ALTER TABLE public.version_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin read version log" ON public.version_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 8. applicants
CREATE TABLE IF NOT EXISTS public.applicants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  residency_status text,
  nationality text,
  date_of_birth date,
  employment_type text,
  employer_name text,
  employer_category text
);
ALTER TABLE public.applicants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own applicants" ON public.applicants FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 9. income_fields
CREATE TABLE IF NOT EXISTS public.income_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE CASCADE,
  income_type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  percent_considered numeric DEFAULT 100,
  recurrence text DEFAULT 'monthly',
  owner_type text DEFAULT 'main',
  co_borrower_index integer DEFAULT 0
);
ALTER TABLE public.income_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own income" ON public.income_fields FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.applicants WHERE id = applicant_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.applicants WHERE id = applicant_id AND user_id = auth.uid()));

-- 10. liability_fields
CREATE TABLE IF NOT EXISTS public.liability_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE CASCADE,
  liability_type text NOT NULL,
  amount numeric DEFAULT 0,
  credit_card_limit numeric,
  percent_considered numeric DEFAULT 100,
  recurrence text DEFAULT 'monthly',
  owner_type text DEFAULT 'main',
  co_borrower_index integer DEFAULT 0,
  closed_before_application boolean DEFAULT false,
  liability_letter_obtained boolean DEFAULT false
);
ALTER TABLE public.liability_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own liabilities" ON public.liability_fields FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.applicants WHERE id = applicant_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.applicants WHERE id = applicant_id AND user_id = auth.uid()));

-- 11. co_borrowers
CREATE TABLE IF NOT EXISTS public.co_borrowers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE CASCADE,
  index integer NOT NULL DEFAULT 0,
  name text,
  relationship text,
  employment_type text,
  date_of_birth date,
  residency_status text
);
ALTER TABLE public.co_borrowers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own co-borrowers" ON public.co_borrowers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.applicants WHERE id = applicant_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.applicants WHERE id = applicant_id AND user_id = auth.uid()));

-- 12. property_details
CREATE TABLE IF NOT EXISTS public.property_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE CASCADE,
  property_value numeric,
  loan_amount numeric,
  ltv numeric,
  emirate text DEFAULT 'dubai',
  transaction_type text DEFAULT 'purchase',
  preferred_tenor_months integer DEFAULT 300,
  nominal_rate numeric DEFAULT 4.5,
  stress_rate numeric DEFAULT 7.5
);
ALTER TABLE public.property_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own property" ON public.property_details FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.applicants WHERE id = applicant_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.applicants WHERE id = applicant_id AND user_id = auth.uid()));

-- ============================================================
-- DATABASE FUNCTIONS (RPCs)
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_total_income(applicant_id_param uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE total numeric := 0;
BEGIN
  SELECT COALESCE(SUM(
    (amount * percent_considered / 100.0) *
    CASE recurrence
      WHEN 'quarterly' THEN 1.0/3
      WHEN 'bi-annually' THEN 1.0/6
      WHEN 'annually' THEN 1.0/12
      ELSE 1
    END
  ), 0) INTO total
  FROM income_fields WHERE applicant_id = applicant_id_param;
  RETURN total;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_total_liabilities(applicant_id_param uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE total numeric := 0;
BEGIN
  SELECT COALESCE(SUM(
    CASE
      WHEN liability_type ILIKE '%credit card%' OR liability_type ILIKE '%limit%'
        THEN COALESCE(credit_card_limit, 0) * 0.05
      ELSE (amount * percent_considered / 100.0) *
        CASE recurrence
          WHEN 'quarterly' THEN 1.0/3
          WHEN 'bi-annually' THEN 1.0/6
          WHEN 'annually' THEN 1.0/12
          ELSE 1
        END
    END
  ), 0) INTO total
  FROM liability_fields
  WHERE applicant_id = applicant_id_param AND closed_before_application = false;
  RETURN total;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_dbr(applicant_id_param uuid, stress_emi numeric)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  total_income numeric;
  total_liabilities numeric;
BEGIN
  total_income := public.calculate_total_income(applicant_id_param);
  total_liabilities := public.calculate_total_liabilities(applicant_id_param);
  IF total_income = 0 THEN RETURN 0; END IF;
  RETURN ((stress_emi + total_liabilities) / total_income) * 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_active_products(
  p_segment text DEFAULT NULL,
  p_residency text DEFAULT NULL,
  p_transaction_type text DEFAULT NULL
)
RETURNS SETOF public.products LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM products
  WHERE status = 'active'
    AND (validity_end IS NULL OR validity_end > current_date)
    AND (p_segment IS NULL OR segment = p_segment)
    AND (p_residency IS NULL OR residency = p_residency)
    AND (p_transaction_type IS NULL OR transaction_type = p_transaction_type);
END;
$$;

-- ============================================================
-- SEED DATA
-- ============================================================

-- EIBOR Rates
INSERT INTO public.eibor_rates (rate_type, rate) VALUES
  ('1m', 0.0477), ('3m', 0.0483), ('6m', 0.0492);

-- Emirate Fees
INSERT INTO public.emirate_fees (emirate, fee_type, rate, fixed_amount) VALUES
  ('dubai', 'dld', 0.04, 580),
  ('dubai', 'mortgage_reg', 0.0025, 290),
  ('dubai', 'transfer', NULL, 4200),
  ('dubai', 'agent', 0.02, NULL),
  ('abu_dhabi', 'dld', 0.02, NULL),
  ('abu_dhabi', 'mortgage_reg', 0.001, NULL),
  ('abu_dhabi', 'transfer', NULL, 900),
  ('sharjah', 'dld', 0.04, NULL),
  ('sharjah', 'mortgage_reg', 0.005, NULL),
  ('ajman', 'dld', 0.025, 720),
  ('ajman', 'mortgage_reg', 0.005, NULL),
  ('rak', 'dld', 0.02, NULL),
  ('rak', 'mortgage_reg', 0.001, NULL);

-- Banks
INSERT INTO public.banks (bank_name, short_code, base_stress_rate, stress_eibor_tenor, min_loan_amount, min_salary, dbr_limit) VALUES
  ('FAB', 'fab', 0.0651, '3m', 750000, 15000, 0.50),
  ('ENBD', 'enbd', 0.0679, '1m', 500000, 15000, 0.50),
  ('ADIB', 'adib', 0.0639, '1m', 250000, 10000, 0.50),
  ('Mashreq', 'mashreq', 0.0725, '3m', 350000, 15000, 0.50),
  ('CBD', 'cbd', 0.0684, '3m', 500000, 15000, 0.55),
  ('DIB', 'dib', 0.0737, '3m', 250000, 10000, 0.50),
  ('HSBC', 'hsbc', 0.0695, '3m', 500000, 30000, 0.50),
  ('RAK Bank', 'rak', 0.0724, '3m', 350000, 15000, 0.50);
