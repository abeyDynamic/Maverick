import { useEffect, useState, useMemo, Fragment } from 'react';
import GlobalTickerBar from '@/components/GlobalTickerBar';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Edit } from 'lucide-react';
import { calculateStressEMI, formatCurrency, isLimitType, normalizeToMonthly } from '@/lib/mortgage-utils';
import WhatIfChat from '@/components/results/WhatIfChat';
import BankEligibilityTable, { useBankResults, buildWhatIfAnalysis } from '@/components/results/BankEligibilityTable';

interface Bank {
  id: string;
  bank_name: string;
  base_stress_rate: number | null;
  min_salary: number;
  dbr_limit: number;
  max_tenor_months: number;
  min_loan_amount: number;
  max_loan_amount: number | null;
}

interface Applicant {
  id: string;
  residency_status: string | null;
  nationality: string | null;
  date_of_birth: string | null;
  employment_type: string | null;
}

interface PropertyDetail {
  property_value: number | null;
  loan_amount: number | null;
  ltv: number | null;
  emirate: string;
  preferred_tenor_months: number;
  stress_rate: number;
  nominal_rate: number;
}

interface IncomeField {
  income_type: string;
  amount: number;
  percent_considered: number;
  recurrence: string;
}

interface LiabilityField {
  liability_type: string;
  amount: number;
  credit_card_limit: number | null;
  recurrence: string;
  closed_before_application: boolean;
}

interface QualNote {
  bank_id: string | null;
  field_name: string;
  official_value: string | null;
  practical_value: string | null;
  note_text: string;
  segment: string | null;
}

function calcTotalIncome(fields: IncomeField[]): number {
  return fields.reduce((sum, f) => {
    return sum + normalizeToMonthly(f.amount * f.percent_considered / 100, f.recurrence);
  }, 0);
}

function calcTotalLiabilities(fields: LiabilityField[]): number {
  return fields.reduce((sum, f) => {
    if (f.closed_before_application) return sum;
    if (isLimitType(f.liability_type)) return sum + (f.credit_card_limit ?? 0) * 0.05;
    return sum + normalizeToMonthly(f.amount, f.recurrence);
  }, 0);
}

export default function Results() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [incomeFields, setIncomeFields] = useState<IncomeField[]>([]);
  const [liabilityFields, setLiabilityFields] = useState<LiabilityField[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [qualNotes, setQualNotes] = useState<QualNote[]>([]);

  useEffect(() => {
    if (!id) return;
    async function load() {
      setLoading(true);
      const [appRes, propRes, incRes, liabRes, bankRes, notesRes] = await Promise.all([
        supabase.from('applicants').select('*').eq('id', id).single(),
        supabase.from('property_details').select('*').eq('applicant_id', id).single(),
        supabase.from('income_fields').select('*').eq('applicant_id', id),
        supabase.from('liability_fields').select('*').eq('applicant_id', id),
        supabase.from('banks').select('*').eq('active', true),
        supabase.from('qualification_notes').select('*').eq('active', true),
      ]);
      setApplicant(appRes.data as any);
      setProperty(propRes.data as any);
      setIncomeFields((incRes.data ?? []) as any);
      setLiabilityFields((liabRes.data ?? []) as any);
      setBanks((bankRes.data ?? []) as any);
      setQualNotes((notesRes.data ?? []) as any);
      setLoading(false);
    }
    load();
  }, [id]);

  const totalIncome = useMemo(() => calcTotalIncome(incomeFields), [incomeFields]);
  const totalLiabilities = useMemo(() => calcTotalLiabilities(liabilityFields), [liabilityFields]);

  const loanAmount = property?.loan_amount ?? 0;
  const tenorMonths = property?.preferred_tenor_months ?? 300;
  const ltv = property?.ltv ?? 0;

  const bankResults = useBankResults(banks, totalIncome, totalLiabilities, loanAmount, tenorMonths, property?.stress_rate ?? 0);

  const whatIfAnalysis = useMemo(() => {
    return buildWhatIfAnalysis(bankResults, totalIncome, totalLiabilities, liabilityFields as any);
  }, [bankResults, totalIncome, totalLiabilities, liabilityFields]);

  if (loading) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center">
        <p className="text-muted-foreground">Loading results…</p>
      </div>
    );
  }

  if (!applicant || !property) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center">
        <p className="text-destructive">Qualification not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary">
      <header className="bg-primary text-primary-foreground">
        <div className="container mx-auto flex items-center gap-4 py-4 px-6">
          <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary/80" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">Results — Bank Comparison</h1>
        </div>
      </header>
      <GlobalTickerBar />

      <main className="container mx-auto px-6 py-8 space-y-6">
        {/* SUMMARY BAR */}
        <Card className="bg-background">
          <CardContent className="py-4 px-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <span className="font-semibold text-foreground">Client</span>
                <span className="text-muted-foreground">Loan: <strong className="text-foreground">AED {formatCurrency(loanAmount)}</strong></span>
                <span className="text-muted-foreground">Property: <strong className="text-foreground">AED {formatCurrency(property.property_value ?? 0)}</strong></span>
                <span className="text-muted-foreground">LTV: <strong className="text-foreground">{ltv}%</strong></span>
                <span className="text-muted-foreground">Income: <strong className="text-foreground">AED {formatCurrency(totalIncome)}</strong></span>
                <span className="text-muted-foreground">Liabilities: <strong className="text-foreground">AED {formatCurrency(totalLiabilities)}</strong></span>
                <span className="text-muted-foreground">Tenor: <strong className="text-foreground">{tenorMonths} months</strong></span>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate(`/qualify/${id}`)}>
                <Edit className="h-4 w-4 mr-1" /> Edit
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* MAIN LAYOUT: Table (65%) + Chat (35%) */}
        <div className="flex gap-6 items-start">
          <div className="w-full lg:w-[65%]">
            <BankEligibilityTable
              banks={banks}
              qualNotes={qualNotes}
              totalIncome={totalIncome}
              totalLiabilities={totalLiabilities}
              loanAmount={loanAmount}
              tenorMonths={tenorMonths}
              stressRate={property.stress_rate}
              employmentType={applicant.employment_type ?? ''}
              residencyStatus={applicant.residency_status ?? ''}
              nationality={applicant.nationality ?? ''}
              emirate={property.emirate ?? ''}
            />
          </div>

          <div className="hidden lg:block w-[35%] sticky top-8" style={{ height: 'calc(100vh - 16rem)' }}>
            <WhatIfChat initialAnalysis={whatIfAnalysis || '✅ All banks are eligible — no what-if scenarios needed.'} />
          </div>
        </div>

        <div className="lg:hidden" style={{ height: '500px' }}>
          <WhatIfChat initialAnalysis={whatIfAnalysis || '✅ All banks are eligible — no what-if scenarios needed.'} />
        </div>
      </main>
    </div>
  );
}
