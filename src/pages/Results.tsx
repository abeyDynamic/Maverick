import { useEffect, useState, useMemo } from 'react';
import GlobalTickerBar from '@/components/GlobalTickerBar';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Edit } from 'lucide-react';
import { formatCurrency } from '@/lib/mortgage-utils';
import WhatIfChat from '@/components/results/WhatIfChat';
import BankEligibilityTable from '@/components/results/BankEligibilityTable';
import type { QualNote } from '@/components/results/BankEligibilityTable';
import {
  toBankFromRow,
  calcTotalIncome,
  calcTotalLiabilities,
  runStage1,
  buildWhatIfAnalysis,
  type CaseBank,
  type CaseIncomeField,
  type CaseLiabilityField,
} from '@/lib/case';

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

function dbIncomeToEngine(rows: any[]): CaseIncomeField[] {
  return rows.map(f => ({
    incomeType: f.income_type,
    amount: f.amount,
    percentConsidered: f.percent_considered,
    recurrence: f.recurrence,
  }));
}

function dbLiabilityToEngine(rows: any[]): CaseLiabilityField[] {
  return rows.map(f => ({
    liabilityType: f.liability_type,
    amount: f.amount,
    creditCardLimit: f.credit_card_limit ?? 0,
    recurrence: f.recurrence,
    closedBeforeApplication: f.closed_before_application ?? false,
    liabilityLetterObtained: f.liability_letter_obtained ?? false,
  }));
}

export default function Results() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [incomeFields, setIncomeFields] = useState<CaseIncomeField[]>([]);
  const [liabilityFields, setLiabilityFields] = useState<CaseLiabilityField[]>([]);
  const [banks, setBanks] = useState<CaseBank[]>([]);
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
      setIncomeFields(dbIncomeToEngine(incRes.data ?? []));
      setLiabilityFields(dbLiabilityToEngine(liabRes.data ?? []));
      setBanks((bankRes.data ?? []).map(toBankFromRow));
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

  const bankResults = useMemo(
    () => runStage1(banks, totalIncome, totalLiabilities, loanAmount, tenorMonths, property?.stress_rate ?? 0),
    [banks, totalIncome, totalLiabilities, loanAmount, tenorMonths, property?.stress_rate]
  );

  const whatIfAnalysis = useMemo(
    () => buildWhatIfAnalysis(bankResults, totalIncome, totalLiabilities, liabilityFields),
    [bankResults, totalIncome, totalLiabilities, liabilityFields]
  );

  // Legacy bank format for BankEligibilityTable component
  const legacyBanks = useMemo(() => banks.map(b => ({
    id: b.id, bank_name: b.bankName, base_stress_rate: b.baseStressRate,
    min_salary: b.minSalary, dbr_limit: b.dbrLimit, max_tenor_months: b.maxTenorMonths,
    min_loan_amount: b.minLoanAmount, max_loan_amount: b.maxLoanAmount,
  })), [banks]);

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
              banks={legacyBanks}
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
