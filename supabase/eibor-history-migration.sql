-- eibor_history: stores daily EIBOR fixings for all tenors
CREATE TABLE IF NOT EXISTS public.eibor_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixing_date date NOT NULL,
  overnight numeric,
  one_week numeric,
  one_month numeric,
  three_months numeric,
  six_months numeric,
  one_year numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE(fixing_date)
);
ALTER TABLE public.eibor_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users read eibor_history" ON public.eibor_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage eibor_history" ON public.eibor_history FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
