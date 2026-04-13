import { useMemo, Fragment, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, XCircle, Info, ChevronDown, ChevronRight, AlertTriangle, CircleCheck, ShieldCheck, ShieldX } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/mortgage-utils';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { runPolicyChecks, getStage2Summary, type PolicyTerm, type PolicyCheckResult } from '@/lib/policy-checks';
import { formatDbrLimit, getDeclineReasons, type CaseBankResult } from '@/lib/case/stage1-engine';

export interface QualNote {
  bank_id: string | null;
  field_name: string;
  official_value: string | null;
  practical_value: string | null;
  note_text: string;
  segment: string | null;
}

const WARNING_KEYWORDS = /restrict|not accepted|excluded|difficult|required|cannot|must not|check/i;
const WARNING_FIELD_KEYWORDS = /restriction|excluded|required|cannot|difficult|desell|warning/i;
const USP_FIELD_KEYWORDS = /usp|upsell|insurance free|processing fee stl/i;

function isWarningNote(note: QualNote): boolean {
  return WARNING_KEYWORDS.test(note.note_text || '');
}

function isWarningByField(note: QualNote): boolean {
  return WARNING_FIELD_KEYWORDS.test(note.field_name || '');
}

function isUSPByField(note: QualNote): boolean {
  return USP_FIELD_KEYWORDS.test(note.field_name || '');
}

type NoteCategory = 'warning' | 'usp' | 'info';

function getNoteCategory(note: QualNote): NoteCategory {
  if (isWarningByField(note)) return 'warning';
  if (isUSPByField(note)) return 'usp';
  return 'info';
}

function NoteCategoryIcon({ category }: { category: NoteCategory }) {
  switch (category) {
    case 'warning':
      return <AlertTriangle className="h-3 w-3 text-amber-600 mt-0.5 shrink-0" />;
    case 'usp':
      return <CircleCheck className="h-3 w-3 text-green-600 mt-0.5 shrink-0" />;
    case 'info':
      return <Info className="h-3 w-3 text-blue-500 mt-0.5 shrink-0" />;
  }
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

/* ── Session Reminders Panel (global notes, bank_id IS NULL) ── */
export function SessionRemindersPanel({ notes, warningsOnly }: { notes: QualNote[]; warningsOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const filtered = warningsOnly ? notes.filter(isWarningNote) : notes;

  if (filtered.length === 0) return null;

  const firstTitle = filtered[0]?.field_name || 'Reminders available';

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full px-4 py-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-950/30 transition-colors">
        {open ? <ChevronDown className="h-3.5 w-3.5 text-amber-600" /> : <ChevronRight className="h-3.5 w-3.5 text-amber-600" />}
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Session Reminders</span>
        <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0 ml-1">{filtered.length}</Badge>
        {!open && (
          <span className="text-[11px] text-muted-foreground truncate ml-2">{firstTitle}</span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-1 px-1">
          {filtered.map((note, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-1.5 text-[11px] bg-amber-50/60 dark:bg-amber-950/10 rounded">
              <NoteCategoryIcon category={getNoteCategory(note)} />
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

/* ── Bank Note Card (3-line format) ── */
function BankNoteCard({ note }: { note: QualNote }) {
  const category = getNoteCategory(note);

  return (
    <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/15 border border-amber-200/60 dark:border-amber-800/40 rounded text-[11px]">
      <div className="flex items-start gap-1.5">
        <NoteCategoryIcon category={category} />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-amber-700 dark:text-amber-400">{note.field_name}</div>
          {note.note_text && (
            <p className="mt-0.5 text-foreground leading-relaxed">{note.note_text}</p>
          )}
          {(note.official_value || note.practical_value) && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {note.official_value && <span>Official: {note.official_value}</span>}
              {note.official_value && note.practical_value && <span> | </span>}
              {note.practical_value && <span>Practical: {note.practical_value}</span>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Policy Check Icon ── */
function PolicyCheckIcon({ status }: { status: PolicyCheckResult['status'] }) {
  switch (status) {
    case 'pass': return <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />;
    case 'fail': return <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />;
    case 'warn': return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
    case 'info': return <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
    case 'no_data': return <span className="h-3.5 w-3.5 text-muted-foreground text-[10px] shrink-0">—</span>;
  }
}

/* ── Policy Checks Grid ── */
function PolicyChecksGrid({ checks }: { checks: PolicyCheckResult[] }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Stage 2 — Policy Checks</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
        {checks.map((check, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[11px] py-0.5">
            <PolicyCheckIcon status={check.status} />
            <span className="font-medium text-foreground whitespace-nowrap">{check.name}:</span>
            <span className={cn(
              'truncate',
              check.status === 'fail' ? 'text-red-600' :
              check.status === 'warn' ? 'text-amber-600' :
              check.status === 'no_data' ? 'text-muted-foreground' :
              'text-foreground'
            )}>{check.summary}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Props {
  bankResults: CaseBankResult[];
  qualNotes: QualNote[];
  totalIncome: number;
  loanAmount: number;
  employmentType?: string;
  residencyStatus?: string;
  nationality?: string;
  emirate?: string;
}

export default function BankEligibilityTable({
  bankResults, qualNotes, totalIncome, loanAmount,
  employmentType = '', residencyStatus = '', nationality = '', emirate = ''
}: Props) {
  const [warningsOnly, setWarningsOnly] = useState(false);
  const [expandedBanks, setExpandedBanks] = useState<Record<string, boolean>>({});
  const [policyTerms, setPolicyTerms] = useState<PolicyTerm[]>([]);

  // Map residency/employment for policy_terms query
  const policySegment = residencyStatus === 'non_resident' ? 'Non-Resident' : 'Resident';
  const policyEmployment = employmentType === 'self_employed' ? 'Self Employed'
    : residencyStatus === 'non_resident' ? 'Mixed' : 'Salaried';

  // Fetch policy_terms for all banks
  useEffect(() => {
    if (bankResults.length === 0) return;
    async function fetchPolicies() {
      const bankNames = bankResults.map(r => r.bank.bankName);
      const { data } = await supabase
        .from('policy_terms')
        .select('*')
        .in('bank', bankNames)
        .eq('segment', policySegment)
        .eq('employment_type', policyEmployment);
      setPolicyTerms((data ?? []) as PolicyTerm[]);
    }
    fetchPolicies();
  }, [bankResults.length, policySegment, policyEmployment]);

  // Run policy checks per bank
  const policyChecksByBank = useMemo(() => {
    const map: Record<string, PolicyCheckResult[]> = {};
    for (const r of bankResults) {
      const terms = policyTerms.filter(t => t.bank === r.bank.bankName);
      map[r.bank.id] = runPolicyChecks(terms, totalIncome, loanAmount, nationality, emirate, employmentType, r.bank.bankName);
    }
    return map;
  }, [bankResults, policyTerms, totalIncome, loanAmount, nationality, emirate, employmentType]);

  const toggleBank = (bankId: string) => {
    setExpandedBanks(prev => ({ ...prev, [bankId]: !prev[bankId] }));
  };

  const notesByBank = useMemo(() => {
    const byBank: Record<string, QualNote[]> = {};
    const segmentFiltered = filterNotesBySegment(qualNotes, employmentType, residencyStatus);
    for (const n of segmentFiltered) {
      if (n.bank_id) {
        if (!byBank[n.bank_id]) byBank[n.bank_id] = [];
        byBank[n.bank_id].push(n);
      }
    }
    return byBank;
  }, [qualNotes, employmentType, residencyStatus]);

  const bankNoteMeta = useMemo(() => {
    const meta: Record<string, { count: number; hasWarning: boolean }> = {};
    for (const [bankId, notes] of Object.entries(notesByBank)) {
      const filtered = warningsOnly ? notes.filter(isWarningNote) : notes;
      const hasWarning = filtered.some(isWarningByField);
      meta[bankId] = { count: filtered.length, hasWarning };
    }
    return meta;
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
      <Card className="bg-background">
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-primary">Bank Eligibility</CardTitle>
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
                <TableHead className="text-xs text-center">Stage 1</TableHead>
                <TableHead className="text-xs text-center">Stage 2</TableHead>
                <TableHead className="text-xs text-center">Eligible</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bankResults.map(r => {
                const checks = policyChecksByBank[r.bank.id] ?? [];
                const stage2 = getStage2Summary(checks);
                const fullyEligible = r.eligible && !stage2.criticalFail;

                const rowBg = fullyEligible
                  ? 'bg-green-50 dark:bg-green-950/20'
                  : stage2.criticalFail && r.eligible
                    ? 'bg-amber-50 dark:bg-amber-950/20'
                    : 'bg-red-50 dark:bg-red-950/20';
                const borderColor = fullyEligible ? 'border-l-green-500'
                  : stage2.criticalFail && r.eligible ? 'border-l-amber-500'
                  : 'border-l-red-500';

                const bankNotes = notesByBank[r.bank.id] ?? [];
                const displayNotes = warningsOnly ? bankNotes.filter(isWarningNote) : bankNotes;
                const meta = bankNoteMeta[r.bank.id];
                const noteCount = meta?.count ?? 0;
                const isExpanded = expandedBanks[r.bank.id] ?? false;
                const hasContent = checks.length > 0 || noteCount > 0;

                return (
                  <Fragment key={r.bank.id}>
                    <TableRow
                      className={cn(rowBg, hasContent && 'cursor-pointer')}
                      onClick={() => hasContent && toggleBank(r.bank.id)}
                    >
                      <TableCell className={cn('w-1 p-0 border-l-4', borderColor)} />
                      <TableCell className="font-medium text-xs py-2">
                        <div className="flex items-center gap-1.5">
                          {hasContent && (
                            isExpanded
                              ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                              : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                          )}
                          <span>{r.bank.bankName}</span>
                          {noteCount > 0 && (
                            <Badge className={cn(
                              'text-white text-[9px] px-1 py-0 leading-tight',
                              meta?.hasWarning ? 'bg-amber-500' : 'bg-green-500'
                            )}>
                              {noteCount}
                            </Badge>
                          )}
                        </div>
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
                      {/* Stage 1 */}
                      <TableCell className="text-center py-2">
                        {r.eligible ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge className="bg-green-600 text-white text-[9px] px-1.5 py-0 hover:bg-green-700">PASS</Badge>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">DBR & min salary met</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="destructive" className="text-[9px] px-1.5 py-0 cursor-help">FAIL</Badge>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs text-xs">
                              {getDeclineReasons(r, totalIncome).map((reason, i) => (
                                <p key={i}>{reason}</p>
                              ))}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                      {/* Stage 2 */}
                      <TableCell className="text-center py-2">
                        {checks.length > 0 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge className={cn(
                                'text-white text-[9px] px-1.5 py-0',
                                stage2.criticalFail ? 'bg-red-600 hover:bg-red-700' :
                                stage2.passed < stage2.total ? 'bg-amber-500 hover:bg-amber-600' :
                                'bg-green-600 hover:bg-green-700'
                              )}>
                                {stage2.passed}/{stage2.total}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                              {stage2.criticalFail ? 'Critical policy check failed' : `${stage2.passed} of ${stage2.total} checks passed`}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {/* Final Eligible */}
                      <TableCell className="text-center py-2">
                        {fullyEligible ? (
                          <Badge className="bg-green-600 text-white hover:bg-green-700 text-[10px] px-1.5 py-0">Approved</Badge>
                        ) : r.eligible && stage2.criticalFail ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge className="bg-amber-500 text-white hover:bg-amber-600 text-[10px] px-1.5 py-0 cursor-help">Policy Fail</Badge>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs text-xs">
                              Stage 1 (DBR) passed but Stage 2 policy check failed
                            </TooltipContent>
                          </Tooltip>
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
                    {/* Expanded section: Policy checks + Notes */}
                    {isExpanded && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell className="p-0" />
                        <TableCell colSpan={7} className="py-2 px-3">
                          <div className="space-y-3">
                            {/* Section A: Policy Checks */}
                            {checks.length > 0 && <PolicyChecksGrid checks={checks} />}

                            {/* Section B: Adviser Notes */}
                            {displayNotes.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Adviser Notes</p>
                                {displayNotes.map((note, i) => (
                                  <BankNoteCard key={`${r.bank.id}-${note.field_name}-${i}`} note={note} />
                                ))}
                              </div>
                            )}
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
    </TooltipProvider>
  );
}
