import { useMemo, Fragment, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, XCircle, Info, ChevronDown, ChevronRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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

export interface QualNote {
  bank_id: string | null;
  field_name: string;
  official_value: string | null;
  practical_value: string | null;
  note_text: string;
  segment: string | null;
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

const WARNING_KEYWORDS = /restrict|not accepted|excluded|difficult|required|cannot|must not|check/i;

function isWarningNote(note: QualNote): boolean {
  return WARNING_KEYWORDS.test(note.note_text || '');
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

function filterNotesBySegment(
  notes: QualNote[],
  employmentType: string,
  residencyStatus: string
): QualNote[] {
  return notes.filter(n => {
    const seg = n.segment?.toLowerCase() || 'all';
    if (seg === 'all') return true;
    if (seg === 'salaried' && employmentType === 'salaried') return true;
    if (seg === 'self_employed' && employmentType === 'self_employed') return true;
    if (seg === 'non_resident' && residencyStatus === 'non_resident') return true;
    return false;
  });
}

interface Props {
  banks: Bank[];
  qualNotes: QualNote[];
  totalIncome: number;
  totalLiabilities: number;
  loanAmount: number;
  tenorMonths: number;
  stressRate: number;
  employmentType?: string;
  residencyStatus?: string;
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

/* ── Adviser Reminders Panel ── */
function AdviserRemindersPanel({ notes, warningsOnly }: { notes: QualNote[]; warningsOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const filtered = warningsOnly ? notes.filter(isWarningNote) : notes;

  if (filtered.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full px-4 py-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-950/30 transition-colors">
        {open ? <ChevronDown className="h-3.5 w-3.5 text-amber-600" /> : <ChevronRight className="h-3.5 w-3.5 text-amber-600" />}
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Adviser Reminders</span>
        <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0 ml-auto">{filtered.length}</Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-1 px-1">
          {filtered.map((note, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-1.5 text-[11px] bg-amber-50/60 dark:bg-amber-950/10 rounded">
              <Info className="h-3 w-3 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-amber-700 dark:text-amber-400">{note.field_name}</span>
                {note.practical_value && (
                  <span className="ml-1 text-amber-600 dark:text-amber-500">— {note.practical_value}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ── Bank Note Card ── */
function BankNoteCard({ note }: { note: QualNote }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/15 border border-amber-200/60 dark:border-amber-800/40 rounded text-[11px] cursor-pointer hover:bg-amber-100/80 dark:hover:bg-amber-950/25 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-1.5">
        <Info className="h-3 w-3 text-amber-600 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="font-bold text-foreground">{note.field_name}</span>
          {note.official_value && (
            <span className="ml-2 text-muted-foreground">Official: {note.official_value}</span>
          )}
          {note.practical_value && (
            <span className="ml-2 text-amber-600 dark:text-amber-400 font-medium">Practical: {note.practical_value}</span>
          )}
          {expanded && note.note_text && (
            <p className="mt-1 text-muted-foreground leading-relaxed">{note.note_text}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BankEligibilityTable({ banks, qualNotes, totalIncome, totalLiabilities, loanAmount, tenorMonths, stressRate, employmentType = '', residencyStatus = '' }: Props) {
  const bankResults = useBankResults(banks, totalIncome, totalLiabilities, loanAmount, tenorMonths, stressRate);
  const [warningsOnly, setWarningsOnly] = useState(false);

  // Split notes: global (bank_id IS NULL) vs bank-specific
  const { globalNotes, notesByBank } = useMemo(() => {
    const global: QualNote[] = [];
    const byBank: Record<string, QualNote[]> = {};

    const segmentFiltered = filterNotesBySegment(qualNotes, employmentType, residencyStatus);

    for (const n of segmentFiltered) {
      if (!n.bank_id) {
        global.push(n);
      } else {
        if (!byBank[n.bank_id]) byBank[n.bank_id] = [];
        byBank[n.bank_id].push(n);
      }
    }
    return { globalNotes: global, notesByBank: byBank };
  }, [qualNotes, employmentType, residencyStatus]);

  // Count notes per bank (after warning filter)
  const noteCountByBank = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [bankId, notes] of Object.entries(notesByBank)) {
      counts[bankId] = warningsOnly ? notes.filter(isWarningNote).length : notes.length;
    }
    return counts;
  }, [notesByBank, warningsOnly]);

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
      <div className="space-y-2">
        {/* Adviser Reminders — collapsible, above table */}
        <AdviserRemindersPanel notes={globalNotes} warningsOnly={warningsOnly} />

        <Card className="bg-background">
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-primary">Bank Eligibility</CardTitle>
            {/* Warnings filter toggle */}
            <div className="flex items-center gap-2">
              <Label htmlFor="warnings-toggle" className="text-[10px] text-muted-foreground cursor-pointer">
                {warningsOnly ? 'Warnings only' : 'All notes'}
              </Label>
              <Switch
                id="warnings-toggle"
                checked={warningsOnly}
                onCheckedChange={setWarningsOnly}
                className="scale-75"
              />
            </div>
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
                  const bankNotes = notesByBank[r.bank.id] ?? [];
                  const displayNotes = warningsOnly ? bankNotes.filter(isWarningNote) : bankNotes;
                  const noteCount = noteCountByBank[r.bank.id] ?? 0;

                  return (
                    <Fragment key={r.bank.id}>
                      <TableRow className={rowBg}>
                        <TableCell className={cn('w-1 p-0 border-l-4', borderColor)} />
                        <TableCell className="font-medium text-xs py-2">
                          <span>{r.bank.bank_name}</span>
                          {noteCount > 0 && (
                            <Badge className="ml-1.5 bg-amber-500 text-white text-[9px] px-1 py-0 leading-tight">{noteCount}</Badge>
                          )}
                        </TableCell>
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
                      {/* Bank-specific qualification notes as amber cards */}
                      {displayNotes.length > 0 && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell className="p-0" />
                          <TableCell colSpan={6} className="py-1.5 px-2">
                            <div className="space-y-1">
                              {displayNotes.map((note, i) => (
                                <BankNoteCard key={`${r.bank.id}-${note.field_name}-${i}`} note={note} />
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
