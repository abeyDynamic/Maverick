import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Edit, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';
import { calculateStressEMI, formatCurrency, isLimitType, normalizeToMonthly } from '@/lib/mortgage-utils';
import { cn } from '@/lib/utils';

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
  bank_id: string;
  field_name: string;
  official_value: string | null;
  practical_value: string | null;
  note_text: string;
}

interface BankResult {
  bank: Bank;
  stressRate: number;
  stressEMI: number;
  dbr: number;
  dbrLimit: number;
  minSalaryMet: boolean;
  ltvOk: boolean;
  eligible: boolean;
  nearLimit: boolean; // DBR within 5% of limit but failing
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

  const bankResults = useMemo<BankResult[]>(() => {
    if (!property || banks.length === 0) return [];

    return banks.map(bank => {
      const stressRate = (bank.base_stress_rate ?? property.stress_rate / 100) * 100;
      const stressEMI = calculateStressEMI(loanAmount, stressRate, tenorMonths);
      const dbr = totalIncome > 0 ? ((stressEMI + totalLiabilities) / totalIncome) * 100 : 0;
      const dbrLimit = bank.dbr_limit * 100; // stored as decimal e.g. 0.50
      const minSalaryMet = totalIncome >= bank.min_salary;
      const ltvOk = true; // max_ltv not on banks table in current schema, always pass
      const eligible = dbr <= dbrLimit && minSalaryMet;
      const nearLimit = !eligible && dbr > 0 && dbr <= dbrLimit + 5;

      return { bank, stressRate, stressEMI, dbr, dbrLimit, minSalaryMet, ltvOk, eligible, nearLimit };
    }).sort((a, b) => {
      if (a.eligible && !b.eligible) return -1;
      if (!a.eligible && b.eligible) return 1;
      if (a.eligible && b.eligible) return a.stressEMI - b.stressEMI;
      if (a.nearLimit && !b.nearLimit) return -1;
      if (!a.nearLimit && b.nearLimit) return 1;
      return a.stressEMI - b.stressEMI;
    });
  }, [banks, property, loanAmount, tenorMonths, totalIncome, totalLiabilities]);

  // What-if calculations for ineligible banks
  const whatIfData = useMemo(() => {
    return bankResults.filter(r => !r.eligible).map(r => {
      const excess = (r.stressEMI + totalLiabilities) - (r.dbrLimit / 100 * totalIncome);
      const hasCreditCard = liabilityFields.some(f => isLimitType(f.liability_type) && !f.closed_before_application);
      const hasPersonalLoan = liabilityFields.some(f => f.liability_type.toLowerCase().includes('personal loan') && !f.closed_before_application);

      let ccReduction: number | null = null;
      if (hasCreditCard && excess > 0) {
        ccReduction = Math.ceil(excess / 0.05); // reduce CC limit by this amount
      }

      let plImpact: number | null = null;
      if (hasPersonalLoan) {
        const plTotal = liabilityFields
          .filter(f => f.liability_type.toLowerCase().includes('personal loan') && !f.closed_before_application)
          .reduce((s, f) => s + normalizeToMonthly(f.amount, f.recurrence), 0);
        plImpact = plTotal;
      }

      return {
        bankName: r.bank.bank_name,
        excessLiability: Math.max(0, excess),
        ccReduction,
        plImpact,
      };
    });
  }, [bankResults, totalLiabilities, totalIncome, liabilityFields]);

  // Notes grouped by bank
  const notesByBank = useMemo(() => {
    const map: Record<string, QualNote[]> = {};
    for (const n of qualNotes) {
      if (!map[n.bank_id]) map[n.bank_id] = [];
      map[n.bank_id].push(n);
    }
    return map;
  }, [qualNotes]);

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
      {/* Header */}
      <header className="bg-primary text-primary-foreground">
        <div className="container mx-auto flex items-center gap-4 py-4 px-6">
          <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary/80" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">Results — Bank Comparison</h1>
        </div>
      </header>

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

        {/* BANK ELIGIBILITY TABLE */}
        <Card className="bg-background">
          <CardHeader>
            <CardTitle className="text-lg text-primary">Bank Eligibility</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {bankResults.length === 0 ? (
              <p className="p-6 text-muted-foreground">No active banks found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bank</TableHead>
                    <TableHead className="text-right">Stress Rate %</TableHead>
                    <TableHead className="text-right">Monthly EMI</TableHead>
                    <TableHead className="text-right">DBR %</TableHead>
                    <TableHead className="text-center">Min Salary</TableHead>
                    <TableHead className="text-center">Eligible</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bankResults.map(r => {
                    const rowColor = r.eligible
                      ? 'bg-green-50 dark:bg-green-950/20'
                      : r.nearLimit
                        ? 'bg-amber-50 dark:bg-amber-950/20'
                        : 'bg-red-50 dark:bg-red-950/20';

                    return (
                      <>
                        <TableRow key={r.bank.id} className={rowColor}>
                          <TableCell className="font-medium">{r.bank.bank_name}</TableCell>
                          <TableCell className="text-right">{r.stressRate.toFixed(2)}%</TableCell>
                          <TableCell className="text-right">AED {formatCurrency(Math.round(r.stressEMI))}</TableCell>
                          <TableCell className="text-right">
                            <span className={cn(
                              'font-semibold',
                              r.dbr <= 42 ? 'text-green-600' : r.dbr <= 50 ? 'text-amber-600' : 'text-red-600'
                            )}>
                              {r.dbr.toFixed(1)}%
                            </span>
                            <span className="text-muted-foreground text-xs ml-1">/ {r.dbrLimit}%</span>
                          </TableCell>
                          <TableCell className="text-center">
                            {r.minSalaryMet
                              ? <CheckCircle2 className="inline h-4 w-4 text-green-600" />
                              : <XCircle className="inline h-4 w-4 text-red-600" />}
                          </TableCell>
                          <TableCell className="text-center">
                            {r.eligible ? (
                              <Badge className="bg-green-600 text-white hover:bg-green-700">Approved</Badge>
                            ) : r.nearLimit ? (
                              <Badge className="bg-amber-500 text-white hover:bg-amber-600">Borderline</Badge>
                            ) : (
                              <Badge variant="destructive">Declined</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                        {/* Qualification notes */}
                        {notesByBank[r.bank.id] && notesByBank[r.bank.id].map(note => (
                          <TableRow key={note.bank_id + note.field_name} className="bg-amber-50/50 dark:bg-amber-950/10">
                            <TableCell colSpan={6}>
                              <div className="flex items-start gap-2 text-xs">
                                <Info className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                                <div>
                                  <span className="font-medium text-amber-700">{note.field_name}:</span>{' '}
                                  <span className="text-muted-foreground">{note.note_text}</span>
                                  {note.official_value && <span className="ml-2 text-muted-foreground">Official: {note.official_value}</span>}
                                  {note.practical_value && <span className="ml-2 text-muted-foreground">Practical: {note.practical_value}</span>}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* WHAT-IF PANEL */}
        {whatIfData.length > 0 && (
          <Card className="bg-background">
            <CardHeader>
              <CardTitle className="text-lg text-primary flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                What-If — Questions to Ask Client
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {whatIfData.map(w => (
                <div key={w.bankName} className="border rounded-lg p-4 space-y-2">
                  <h4 className="font-semibold text-foreground">{w.bankName}</h4>
                  <p className="text-sm text-muted-foreground">
                    Monthly liability reduction needed to qualify: <strong className="text-foreground">AED {formatCurrency(Math.round(w.excessLiability))}</strong>
                  </p>
                  {w.ccReduction !== null && (
                    <p className="text-sm text-muted-foreground">
                      <span className="text-amber-600 font-medium">Question to ask client:</span> Reducing credit card limit by <strong className="text-foreground">AED {formatCurrency(w.ccReduction)}</strong> would achieve this.
                    </p>
                  )}
                  {w.plImpact !== null && (
                    <p className="text-sm text-muted-foreground">
                      <span className="text-amber-600 font-medium">Question to ask client:</span> Closing personal loan(s) saves <strong className="text-foreground">AED {formatCurrency(Math.round(w.plImpact))}/month</strong> in liabilities.
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
