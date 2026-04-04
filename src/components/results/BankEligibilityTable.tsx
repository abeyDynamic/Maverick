import { useMemo, Fragment } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, XCircle, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { calculateStressEMI, formatCurrency, isLimitType, normalizeToMonthly } from '@/lib/mortgage-utils';
import { cn } from '@/lib/utils';
import type { LiabilityEntry } from '@/components/qualify/LiabilityFieldCard';

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

interface QualNote {
  bank_id: string;
  field_name: string;
  official_value: string | null;
  practical_value: string | null;
  note_text: string;
}

export interface BankResult {
  bank: Bank;
  stressRate: number;
  stressEMI: number;
  dbr: number;
  dbrLimit: number;
  minSalaryMet: boolean;
  dbrMet: boolean;
  eligible: boolean;
}

function formatDbrLimit(val: number): string {
  const rounded = Math.round(val * 100) / 100;
  return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2);
}

function getDeclineReasons(r: BankResult, totalIncome: number): string[] {
  const reasons: string[] = [];
  if (!r.minSalaryMet) {
    reasons.push(`Minimum salary AED ${formatCurrency(r.bank.min_salary)} not met, client income AED ${formatCurrency(totalIncome)}`);
  }
  if (!r.dbrMet) {
    reasons.push(`DBR ${r.dbr.toFixed(1)}% exceeds bank limit of ${formatDbrLimit(r.dbrLimit)}%`);
  }
  return reasons;
}

interface Props {
  banks: Bank[];
  qualNotes: QualNote[];
  totalIncome: number;
  totalLiabilities: number;
  loanAmount: number;
  tenorMonths: number;
  stressRate: number;
}

export function useBankResults(
  banks: Bank[],
  totalIncome: number,
  totalLiabilities: number,
  loanAmount: number,
  tenorMonths: number,
  stressRate: number
): BankResult[] {
  return useMemo(() => {
    if (banks.length === 0 || !loanAmount) return [];

    return banks.map(bank => {
      const bankStressRate = (bank.base_stress_rate ?? stressRate / 100) * 100;
      const stressEMI = calculateStressEMI(loanAmount, bankStressRate, tenorMonths);
      const dbr = totalIncome > 0 ? ((stressEMI + totalLiabilities) / totalIncome) * 100 : 0;
      const dbrLimit = Math.round(bank.dbr_limit * 10000) / 100;
      const minSalaryMet = totalIncome >= bank.min_salary;
      const dbrMet = dbr <= dbrLimit;
      const eligible = dbrMet && minSalaryMet;

      return { bank, stressRate: bankStressRate, stressEMI, dbr, dbrLimit, minSalaryMet, dbrMet, eligible };
    }).sort((a, b) => {
      if (a.eligible && !b.eligible) return -1;
      if (!a.eligible && b.eligible) return 1;
      if (a.eligible && b.eligible) return a.stressEMI - b.stressEMI;
      // Ineligible: sort by how close DBR is to qualifying (smallest gap first)
      const gapA = a.dbr - a.dbrLimit;
      const gapB = b.dbr - b.dbrLimit;
      return gapA - gapB;
    });
  }, [banks, totalIncome, totalLiabilities, loanAmount, tenorMonths, stressRate]);
}

export function buildWhatIfAnalysis(
  bankResults: BankResult[],
  totalIncome: number,
  totalLiabilities: number,
  liabilityFields: LiabilityEntry[]
): string {
  const ineligible = bankResults.filter(r => !r.eligible);
  if (ineligible.length === 0) return '';

  const lines: string[] = ['📊 What-If Analysis for Ineligible Banks\n'];

  for (const r of ineligible) {
    lines.push(`▸ ${r.bank.bank_name}`);

    if (!r.minSalaryMet) {
      const shortfall = r.bank.min_salary - totalIncome;
      lines.push(`  Min salary requirement not met. Bank requires AED ${formatCurrency(r.bank.min_salary)} monthly. Client income is AED ${formatCurrency(totalIncome)}. Shortfall: AED ${formatCurrency(Math.round(shortfall))}.`);
      if (!r.dbrMet) {
        const excess = (r.stressEMI + totalLiabilities) - (r.dbrLimit / 100 * totalIncome);
        lines.push(`  Additionally, DBR is ${r.dbr.toFixed(1)}% vs limit ${formatDbrLimit(r.dbrLimit)}%. Monthly liability reduction needed: AED ${formatCurrency(Math.round(Math.max(0, excess)))}.`);
      }
    } else {
      const excess = (r.stressEMI + totalLiabilities) - (r.dbrLimit / 100 * totalIncome);
      lines.push(`  Monthly liability reduction needed to qualify: AED ${formatCurrency(Math.round(Math.max(0, excess)))}`);

      const hasCreditCard = liabilityFields.some(f => isLimitType(f.liability_type) && !f.closed_before_application);
      const hasPersonalLoan = liabilityFields.some(f => f.liability_type.toLowerCase().includes('personal loan') && !f.closed_before_application);

      if (hasCreditCard && excess > 0) {
        const ccReduction = Math.ceil(excess / 0.05);
        lines.push(`  → Question to ask client: Reducing credit card limit by AED ${formatCurrency(ccReduction)} would achieve this.`);
      }
      if (hasPersonalLoan) {
        const plTotal = liabilityFields
          .filter(f => f.liability_type.toLowerCase().includes('personal loan') && !f.closed_before_application)
          .reduce((s, f) => s + normalizeToMonthly(f.amount, f.recurrence), 0);
        lines.push(`  → Question to ask client: Closing personal loan(s) saves AED ${formatCurrency(Math.round(plTotal))}/month in liabilities.`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

export default function BankEligibilityTable({ banks, qualNotes, totalIncome, totalLiabilities, loanAmount, tenorMonths, stressRate }: Props) {
  const bankResults = useBankResults(banks, totalIncome, totalLiabilities, loanAmount, tenorMonths, stressRate);

  const notesByBank = useMemo(() => {
    const map: Record<string, QualNote[]> = {};
    for (const n of qualNotes) {
      if (!map[n.bank_id]) map[n.bank_id] = [];
      map[n.bank_id].push(n);
    }
    return map;
  }, [qualNotes]);

  if (bankResults.length === 0) {
    return (
      <Card className="bg-background">
        <CardContent className="py-8">
          <p className="text-sm text-muted-foreground text-center">Enter loan details to see bank eligibility</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card className="bg-background">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-semibold text-primary">Bank Eligibility</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-1">{ }</TableHead>
                <TableHead className="text-xs">Bank</TableHead>
                <TableHead className="text-xs text-right">Stress %</TableHead>
                <TableHead className="text-xs text-right">EMI</TableHead>
                <TableHead className="text-xs text-right">DBR %</TableHead>
                <TableHead className="text-xs text-center">Min Salary</TableHead>
                <TableHead className="text-xs text-center">Eligible</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bankResults.map(r => {
                const rowBg = r.eligible
                  ? 'bg-green-50 dark:bg-green-950/20'
                  : 'bg-red-50 dark:bg-red-950/20';
                const borderColor = r.eligible ? 'border-l-green-500' : 'border-l-red-500';

                return (
                  <Fragment key={r.bank.id}>
                    <TableRow className={rowBg}>
                      <TableCell className={cn('w-1 p-0 border-l-4', borderColor)} />
                      <TableCell className="font-medium text-xs py-2">{r.bank.bank_name}</TableCell>
                      <TableCell className="text-right text-xs py-2">{r.stressRate.toFixed(2)}%</TableCell>
                      <TableCell className="text-right text-xs py-2">AED {formatCurrency(Math.round(r.stressEMI))}</TableCell>
                      <TableCell className="text-right text-xs py-2">
                        <span className={cn(
                          'font-semibold',
                          r.dbr <= 42 ? 'text-green-600' : r.dbr <= 50 ? 'text-amber-600' : 'text-red-600'
                        )}>
                          {r.dbr.toFixed(1)}%
                        </span>
                        <span className="text-muted-foreground text-[10px] ml-1">/ {formatDbrLimit(r.dbrLimit)}%</span>
                      </TableCell>
                      <TableCell className="text-center py-2">
                        {r.minSalaryMet
                          ? <CheckCircle2 className="inline h-3.5 w-3.5 text-green-600" />
                          : <XCircle className="inline h-3.5 w-3.5 text-red-600" />}
                      </TableCell>
                      <TableCell className="text-center py-2">
                        {r.eligible ? (
                          <Badge className="bg-green-600 text-white hover:bg-green-700 text-[10px] px-1.5 py-0">Approved</Badge>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 cursor-help">Not Qualified</Badge>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs text-xs">
                              {getDeclineReasons(r, totalIncome).map((reason, i) => (
                                <p key={i}>{reason}</p>
                              ))}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                    {notesByBank[r.bank.id]?.map(note => (
                      <TableRow key={note.bank_id + note.field_name} className="bg-amber-50/50 dark:bg-amber-950/10">
                        <TableCell className="p-0" />
                        <TableCell colSpan={6} className="py-1.5">
                          <div className="flex items-start gap-1.5 text-[10px]">
                            <Info className="h-3 w-3 text-amber-600 mt-0.5 shrink-0" />
                            <div>
                              <span className="font-medium text-amber-700">{note.field_name}:</span>{' '}
                              <span className="text-muted-foreground">{note.note_text}</span>
                              {note.official_value && <span className="ml-1 text-muted-foreground">Official: {note.official_value}</span>}
                              {note.practical_value && <span className="ml-1 text-muted-foreground">Practical: {note.practical_value}</span>}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
