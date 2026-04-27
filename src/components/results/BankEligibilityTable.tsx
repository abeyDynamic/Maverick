import { useMemo, Fragment, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Info, ChevronDown, ChevronRight, AlertTriangle, CircleCheck } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { formatCurrency } from '@/lib/mortgage-utils';
import { cn } from '@/lib/utils';
import { type PolicyCheckResult } from '@/lib/policy-checks';
import { formatDbrLimit, getDeclineReasons, type CaseBankResult } from '@/lib/case/stage1-engine';
import type { Stage2BankEvaluation } from '@/lib/case';

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

function isWarningNote(note: QualNote) { return WARNING_KEYWORDS.test(note.note_text || ''); }
function isWarningByField(note: QualNote) { return WARNING_FIELD_KEYWORDS.test(note.field_name || ''); }
function isUSPByField(note: QualNote) { return USP_FIELD_KEYWORDS.test(note.field_name || ''); }
type NoteCategory = 'warning' | 'usp' | 'info';
function getNoteCategory(note: QualNote): NoteCategory {
  if (isWarningByField(note)) return 'warning';
  if (isUSPByField(note)) return 'usp';
  return 'info';
}

function filterNotesBySegment(notes: QualNote[], employmentType: string, residencyStatus: string) {
  return notes.filter(n => {
    const seg = n.segment?.toLowerCase() || 'all';
    if (seg === 'all') return true;
    if (seg === 'salaried' && employmentType === 'salaried') return true;
    if (seg === 'self_employed' && employmentType === 'self_employed') return true;
    if (seg === 'non_resident' && residencyStatus === 'non_resident') return true;
    return false;
  });
}

export function SessionRemindersPanel({ notes, warningsOnly }: { notes: QualNote[]; warningsOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const filtered = warningsOnly ? notes.filter(isWarningNote) : notes;
  if (filtered.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2 bg-amber-50 border border-amber-200/70 rounded-lg hover:bg-amber-100/70 transition-colors">
        {open ? <ChevronDown className="h-3.5 w-3.5 text-amber-600" /> : <ChevronRight className="h-3.5 w-3.5 text-amber-600" />}
        <span className="text-[10.5px] font-semibold text-amber-700 uppercase tracking-wide">Session Reminders</span>
        <span className="badge-amber ml-1">{filtered.length}</span>
        {!open && (
          <span className="text-[11px] text-muted-foreground truncate ml-2">{filtered[0]?.field_name}</span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-1 px-1">
          {filtered.map((note, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-1.5 text-[11px] bg-amber-50/60 rounded">
              <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-amber-700">{note.field_name}</span>
                {note.practical_value && <span className="ml-1 text-amber-600">— {note.practical_value}</span>}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PolicyCheckIcon({ status }: { status: PolicyCheckResult['status'] }) {
  switch (status) {
    case 'pass':    return <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(174,85%,32%)] shrink-0" />;
    case 'fail':    return <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
    case 'warn':    return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
    case 'info':    return <Info className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
    case 'no_data': return <span className="w-3.5 text-muted-foreground text-[10px] shrink-0">—</span>;
  }
}

function PolicyChecksGrid({ checks }: { checks: PolicyCheckResult[] }) {
  return (
    <div className="space-y-1">
      <p className="section-label mb-2">Policy Checks</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
        {checks.map((check, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[11px] py-0.5">
            <PolicyCheckIcon status={check.status} />
            <span className="font-medium text-foreground whitespace-nowrap">{check.name}:</span>
            <span className={cn(
              'truncate',
              check.status === 'fail' ? 'text-red-500' :
              check.status === 'warn' ? 'text-amber-600' :
              check.status === 'no_data' ? 'text-muted-foreground' : 'text-foreground'
            )}>{check.summary}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Props {
  bankResults: CaseBankResult[];
  stage2ByBank: Record<string, Stage2BankEvaluation>;
  qualNotes: QualNote[];
  totalIncome: number;
  loanAmount: number;
  employmentType?: string;
  residencyStatus?: string;
  nationality?: string;
  emirate?: string;
}

export default function BankEligibilityTable({
  bankResults, stage2ByBank, qualNotes, totalIncome, loanAmount,
  employmentType = '', residencyStatus = '', nationality = '', emirate = ''
}: Props) {
  const [warningsOnly, setWarningsOnly] = useState(false);
  const [expandedBanks, setExpandedBanks] = useState<Record<string, boolean>>({});

  const toggleBank = (id: string) => setExpandedBanks(prev => ({ ...prev, [id]: !prev[id] }));

  const notesByBank = useMemo(() => {
    const byBank: Record<string, QualNote[]> = {};
    const filtered = filterNotesBySegment(qualNotes, employmentType, residencyStatus);
    for (const n of filtered) {
      if (n.bank_id) {
        if (!byBank[n.bank_id]) byBank[n.bank_id] = [];
        byBank[n.bank_id].push(n);
      }
    }
    return byBank;
  }, [qualNotes, employmentType, residencyStatus]);

  if (bankResults.length === 0) {
    return (
      <div className="surface px-5 py-10 text-center">
        <p className="text-sm text-muted-foreground">Enter loan details to see bank eligibility</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="surface overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-border">
          <div className="form-section-title mb-0">
            <span>Bank Eligibility</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] text-muted-foreground">
              {warningsOnly ? 'Warnings only' : 'All notes'}
            </span>
            <Switch checked={warningsOnly} onCheckedChange={setWarningsOnly} className="scale-75" />
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-x-4 px-4 py-2 border-b border-border bg-[hsl(220,18%,97%)]">
          <span className="section-label">Bank</span>
          <span className="section-label text-right w-16">Stress%</span>
          <span className="section-label text-right w-20">EMI</span>
          <span className="section-label text-right w-16">DBR%</span>
          <span className="section-label text-center w-14">Stage 1</span>
          <span className="section-label text-center w-14">Final</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-border">
          {bankResults.map(r => {
            const s2 = stage2ByBank[r.bank.id];
            const checks = s2?.checks ?? [];
            const summary = s2?.summary ?? { passed: 0, total: 0, criticalFail: false, criticalPass: false };
            const fullyEligible = s2?.finalEligible ?? false;
            const isReview = r.eligible && !fullyEligible;

            const rowClass = fullyEligible ? 'bank-row-approved'
              : isReview ? 'bank-row-review'
              : 'bank-row-declined';

            const bankNotes = notesByBank[r.bank.id] ?? [];
            const displayNotes = warningsOnly ? bankNotes.filter(isWarningNote) : bankNotes;
            const noteCount = displayNotes.length;
            const isExpanded = expandedBanks[r.bank.id] ?? false;
            const hasContent = checks.length > 0 || noteCount > 0;

            return (
              <Fragment key={r.bank.id}>
                <div
                  className={cn(
                    'grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-x-4 px-4 py-3 items-center bank-row',
                    rowClass,
                    hasContent && 'cursor-pointer hover:brightness-[0.98]'
                  )}
                  onClick={() => hasContent && toggleBank(r.bank.id)}
                >
                  {/* Bank name */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    {hasContent && (
                      isExpanded
                        ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                        : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-[13px] font-semibold text-foreground truncate">{r.bank.bankName}</span>
                    {noteCount > 0 && (
                      <span className={cn('badge-amber text-[9px]', isWarningByField(bankNotes[0]) ? 'badge-amber' : 'badge-navy')}>
                        {noteCount}
                      </span>
                    )}
                  </div>

                  {/* Stress rate */}
                  <span className="text-right text-[12px] font-mono text-muted-foreground w-16">
                    {r.stressRate.toFixed(2)}%
                  </span>

                  {/* EMI */}
                  <span className="text-right text-[12px] font-mono text-foreground w-20">
                    {formatCurrency(Math.round(r.stressEMI))}
                  </span>

                  {/* DBR */}
                  <div className="text-right w-16">
                    <span className={cn(
                      'text-[12.5px] font-mono font-semibold',
                      r.dbr <= 42 ? 'text-[hsl(174,85%,30%)]' :
                      r.dbr <= 50 ? 'text-amber-600' : 'text-red-500'
                    )}>
                      {r.dbr.toFixed(1)}%
                    </span>
                    <span className="text-muted-foreground text-[10px] ml-0.5">/{formatDbrLimit(r.dbrLimit)}</span>
                  </div>

                  {/* Stage 1 */}
                  <div className="flex justify-center w-14">
                    {r.eligible ? (
                      <span className="badge-teal">Pass</span>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="badge-red cursor-help">Fail</span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs max-w-xs">
                          {getDeclineReasons(r, totalIncome).map((reason, i) => <p key={i}>{reason}</p>)}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>

                  {/* Final */}
                  <div className="flex justify-center w-14">
                    {fullyEligible ? (
                      <span className="badge-teal">✓ OK</span>
                    ) : r.eligible ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="badge-amber cursor-help">Review</span>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-xs max-w-xs">
                          Stage 1 passed — policy checks need review
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="badge-red">No</span>
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-5 py-4 bg-[hsl(220,18%,97%)] border-t border-border space-y-4">
                    {checks.length > 0 && <PolicyChecksGrid checks={checks} />}
                    {displayNotes.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="section-label mb-2">Adviser Notes</p>
                        {displayNotes.map((note, i) => (
                          <div key={i} className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200/60 rounded-lg text-[11px]">
                            {getNoteCategory(note) === 'warning'
                              ? <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                              : getNoteCategory(note) === 'usp'
                              ? <CircleCheck className="h-3 w-3 text-[hsl(174,85%,32%)] mt-0.5 shrink-0" />
                              : <Info className="h-3 w-3 text-blue-400 mt-0.5 shrink-0" />}
                            <div>
                              <p className="font-semibold text-amber-800">{note.field_name}</p>
                              {note.note_text && <p className="mt-0.5 text-foreground leading-relaxed">{note.note_text}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
