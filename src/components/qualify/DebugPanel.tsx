/**
 * Developer-facing debug panel for qualification data inspection.
 * Toggle with Ctrl+Shift+D or the debug button.
 * Shows raw → normalized → aggregated income/liability values and Stage 1/2 inputs.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bug, ChevronDown, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { normalizeToMonthly, isLimitType, formatCurrency } from '@/lib/mortgage-utils';
import type { CaseIncomeField, CaseLiabilityField, CaseBankResult, Stage2BankDebugRow, QualSegment, BankStructuredEvaluation } from '@/lib/case';

interface QualProfile {
  segmentPath: string;
  employmentSubtype: string;
  docPath: string | null;
  routeType: string;
}

interface DebugPanelProps {
  incomeFields: CaseIncomeField[];
  liabilityFields: CaseLiabilityField[];
  totalIncome: number;
  totalLiabilities: number;
  loanAmount: number;
  stressRate: number;
  tenorMonths: number;
  bankResults: CaseBankResult[];
  employmentType: string;
  residencyStatus: string;
  nationality: string;
  emirate: string;
  stage2DebugRows: Stage2BankDebugRow[];
  segment?: QualSegment | '';
  segmentRoute?: string;
  qualProfile?: QualProfile;
  routeExclusions?: Record<string, string>;
  structuredEvalByBank?: Record<string, BankStructuredEvaluation>;
}

export default function DebugPanel({
  incomeFields, liabilityFields, totalIncome, totalLiabilities,
  loanAmount, stressRate, tenorMonths, bankResults,
  employmentType, residencyStatus, nationality, emirate,
  stage2DebugRows, segment, segmentRoute, qualProfile, routeExclusions,
  structuredEvalByBank,
}: DebugPanelProps) {
  const [visible, setVisible] = useState(false);
  const [incomeOpen, setIncomeOpen] = useState(true);
  const [liabOpen, setLiabOpen] = useState(true);
  const [stage1Open, setStage1Open] = useState(true);
  const [stage2Open, setStage2Open] = useState(false);
  const [structuredOpen, setStructuredOpen] = useState(false);

  // Ctrl+Shift+D toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setVisible(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!visible) return;
    console.group('🔍 Maverick Debug — Qualification Data');
    console.table(incomeFields.map(f => ({
      type: f.incomeType,
      rawAmount: f.amount,
      pctConsidered: f.percentConsidered,
      recurrence: f.recurrence,
      effectiveMonthly: normalizeToMonthly(f.amount * f.percentConsidered / 100, f.recurrence),
    })));
    console.log('Total Income:', totalIncome);
    console.log('Total Liabilities:', totalLiabilities);
    console.log('Stage 1 inputs:', { totalIncome, totalLiabilities, loanAmount, stressRate, tenorMonths });
    console.log('Stage 2 inputs:', { employmentType, residencyStatus, nationality, emirate });
    if (structuredEvalByBank && Object.keys(structuredEvalByBank).length > 0) {
      console.group('📋 Structured Rules');
      for (const [bankId, eval_] of Object.entries(structuredEvalByBank)) {
        console.groupCollapsed(`Bank ${bankId.slice(0, 8)}…`);
        console.table(eval_.ruleResults.map(r => ({
          rule: r.ruleType, status: r.status, summary: r.summary,
          operator: r.source.operator, value: r.source.valueNumeric ?? r.source.valueText,
        })));
        console.log('Income policies:', eval_.incomePolicies.length);
        console.log('Automatable:', eval_.isAutomatable);
        console.groupEnd();
      }
      console.groupEnd();
    }
    console.groupEnd();
  }, [visible, incomeFields, liabilityFields, totalIncome, totalLiabilities, loanAmount, stressRate, tenorMonths, bankResults, employmentType, residencyStatus, nationality, emirate, stage2DebugRows, structuredEvalByBank]);

  if (!visible) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="fixed bottom-4 right-4 z-50 opacity-30 hover:opacity-100 text-muted-foreground"
        onClick={() => setVisible(true)}
        title="Debug Panel (Ctrl+Shift+D)"
      >
        <Bug className="h-4 w-4" />
      </Button>
    );
  }

  const structuredEntries = structuredEvalByBank ? Object.entries(structuredEvalByBank) : [];

  return (
    <div className="fixed bottom-0 right-0 z-50 w-[520px] max-h-[70vh] overflow-y-auto shadow-2xl border-l border-t border-border bg-background rounded-tl-lg">
      <div className="flex items-center justify-between px-3 py-2 bg-muted border-b">
        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
          <Bug className="h-3.5 w-3.5" /> Debug Panel
        </span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setVisible(false)}>Close</Button>
      </div>

      <div className="p-3 space-y-2 text-[11px]">
        {/* INCOME */}
        <Collapsible open={incomeOpen} onOpenChange={setIncomeOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 font-bold text-foreground">
            {incomeOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Income Fields ({incomeFields.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <table className="w-full mt-1 text-[10px]">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left py-0.5">Type</th>
                  <th className="text-right py-0.5">Raw</th>
                  <th className="text-right py-0.5">%</th>
                  <th className="text-right py-0.5">Recurrence</th>
                  <th className="text-right py-0.5 font-bold">Monthly</th>
                </tr>
              </thead>
              <tbody>
                {incomeFields.map((f, i) => {
                  const monthly = normalizeToMonthly(f.amount * f.percentConsidered / 100, f.recurrence);
                  return (
                    <tr key={i} className="border-t border-border/30">
                      <td className="py-0.5">{f.incomeType}</td>
                      <td className="text-right">{formatCurrency(f.amount)}</td>
                      <td className="text-right">{f.percentConsidered}%</td>
                      <td className="text-right">{f.recurrence}</td>
                      <td className="text-right font-semibold">{formatCurrency(Math.round(monthly))}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-foreground/20 font-bold">
                  <td colSpan={4}>Total Monthly Income</td>
                  <td className="text-right text-green-600">AED {formatCurrency(Math.round(totalIncome))}</td>
                </tr>
              </tfoot>
            </table>
          </CollapsibleContent>
        </Collapsible>

        {/* LIABILITIES */}
        <Collapsible open={liabOpen} onOpenChange={setLiabOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 font-bold text-foreground">
            {liabOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Liability Fields ({liabilityFields.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <table className="w-full mt-1 text-[10px]">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left py-0.5">Type</th>
                  <th className="text-right py-0.5">Amount/Limit</th>
                  <th className="text-right py-0.5">Closed?</th>
                  <th className="text-right py-0.5 font-bold">Monthly</th>
                </tr>
              </thead>
              <tbody>
                {liabilityFields.map((f, i) => {
                  const isLimit = isLimitType(f.liabilityType);
                  const monthly = f.closedBeforeApplication ? 0 : isLimit ? f.creditCardLimit * 0.05 : normalizeToMonthly(f.amount, f.recurrence);
                  return (
                    <tr key={i} className="border-t border-border/30">
                      <td className="py-0.5">{f.liabilityType}</td>
                      <td className="text-right">{isLimit ? `Limit: ${formatCurrency(f.creditCardLimit)}` : formatCurrency(f.amount)}</td>
                      <td className="text-right">{f.closedBeforeApplication ? '✓' : '—'}</td>
                      <td className="text-right font-semibold">{formatCurrency(Math.round(monthly))}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-foreground/20 font-bold">
                  <td colSpan={3}>Total Monthly Liabilities</td>
                  <td className="text-right text-red-600">AED {formatCurrency(Math.round(totalLiabilities))}</td>
                </tr>
              </tfoot>
            </table>
          </CollapsibleContent>
        </Collapsible>

        {/* STAGE 1 */}
        <Collapsible open={stage1Open} onOpenChange={setStage1Open}>
          <CollapsibleTrigger className="flex items-center gap-1 font-bold text-foreground">
            {stage1Open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Stage 1 — DBR Inputs & Outputs
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1 text-[10px]">
              <span className="text-muted-foreground">Total Income:</span>
              <span className="text-right font-semibold">AED {formatCurrency(Math.round(totalIncome))}</span>
              <span className="text-muted-foreground">Total Liabilities:</span>
              <span className="text-right font-semibold">AED {formatCurrency(Math.round(totalLiabilities))}</span>
              <span className="text-muted-foreground">Loan Amount:</span>
              <span className="text-right font-semibold">AED {formatCurrency(loanAmount)}</span>
              <span className="text-muted-foreground">Stress Rate:</span>
              <span className="text-right font-semibold">{stressRate}%</span>
              <span className="text-muted-foreground">Tenor:</span>
              <span className="text-right font-semibold">{tenorMonths} months</span>
            </div>
            <table className="w-full mt-2 text-[10px]">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left py-0.5">Bank</th>
                  <th className="text-right py-0.5">Stress%</th>
                  <th className="text-right py-0.5">EMI</th>
                  <th className="text-right py-0.5">DBR%</th>
                  <th className="text-right py-0.5">Limit%</th>
                  <th className="text-center py-0.5">Result</th>
                </tr>
              </thead>
              <tbody>
                {bankResults.map((r, i) => (
                  <tr key={i} className="border-t border-border/30">
                    <td className="py-0.5">{r.bank.bankName}</td>
                    <td className="text-right">{r.stressRate.toFixed(2)}</td>
                    <td className="text-right">{formatCurrency(Math.round(r.stressEMI))}</td>
                    <td className="text-right">{r.dbr.toFixed(1)}</td>
                    <td className="text-right">{r.dbrLimit.toFixed(1)}</td>
                    <td className="text-center">
                      <Badge className={r.eligible ? 'bg-green-600 text-white text-[8px] px-1 py-0' : 'bg-red-600 text-white text-[8px] px-1 py-0'}>
                        {r.eligible ? 'PASS' : 'FAIL'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CollapsibleContent>
        </Collapsible>

        {/* STAGE 2 LEGACY */}
        <Collapsible open={stage2Open} onOpenChange={setStage2Open}>
          <CollapsibleTrigger className="flex items-center gap-1 font-bold text-foreground">
            {stage2Open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Stage 2 — Policy Inputs & Rule Sources
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1 text-[10px]">
              <span className="text-muted-foreground font-bold">Segment:</span>
              <span className="text-right font-bold">{segment || '(not set)'}</span>
              <span className="text-muted-foreground">Segment Route:</span>
              <span className="text-right font-semibold">{segmentRoute || '(auto)'}</span>
              {qualProfile && (
                <>
                  <span className="text-muted-foreground font-bold">Qual Profile — Path:</span>
                  <span className="text-right font-bold">{qualProfile.segmentPath}</span>
                  <span className="text-muted-foreground">Emp Subtype:</span>
                  <span className="text-right font-semibold">{qualProfile.employmentSubtype}</span>
                  <span className="text-muted-foreground">Doc Path:</span>
                  <span className="text-right font-semibold">{qualProfile.docPath || '(n/a)'}</span>
                  <span className="text-muted-foreground">Route Type:</span>
                  <span className="text-right font-semibold">{qualProfile.routeType}</span>
                </>
              )}
              <span className="text-muted-foreground">Employment Type:</span>
              <span className="text-right font-semibold">{employmentType || '(not set)'}</span>
              <span className="text-muted-foreground">Residency Status:</span>
              <span className="text-right font-semibold">{residencyStatus || '(not set)'}</span>
              <span className="text-muted-foreground">Nationality:</span>
              <span className="text-right font-semibold">{nationality || '(not set)'}</span>
              <span className="text-muted-foreground">Emirate:</span>
              <span className="text-right font-semibold">{emirate || '(not set)'}</span>
            </div>

            {routeExclusions && Object.keys(routeExclusions).length > 0 && (
              <div className="mt-2 p-2 bg-destructive/10 rounded text-[10px]">
                <span className="font-bold text-destructive">Route Exclusions:</span>
                {Object.entries(routeExclusions).map(([bankId, reason]) => (
                  <div key={bankId} className="ml-2">{bankId.slice(0, 8)}… — {reason}</div>
                ))}
              </div>
            )}

            {stage2DebugRows.length > 0 && (
              <table className="w-full mt-2 text-[10px]">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/30">
                    <th className="text-left py-1">Bank</th>
                    <th className="text-left py-1">Salary</th>
                    <th className="text-left py-1">DBR / Loan</th>
                    <th className="text-left py-1">Outcomes</th>
                  </tr>
                </thead>
                <tbody>
                  {stage2DebugRows.map(row => (
                    <tr key={row.bankId} className="border-t border-border/30 align-top">
                      <td className="py-1 pr-2 font-semibold">{row.bankName}</td>
                      <td className="py-1 pr-2">
                        <div>Stage 1: {row.stage1MinSalarySource} = {row.stage1MinSalaryValue != null ? `AED ${formatCurrency(row.stage1MinSalaryValue)}` : 'n/a'}</div>
                        <div>Stage 2 src: {row.stage2MinSalarySource ?? 'n/a'}</div>
                        <div>Parsed: {row.stage2MinSalaryParsedValue != null ? `AED ${formatCurrency(row.stage2MinSalaryParsedValue)}` : 'n/a'}</div>
                      </td>
                      <td className="py-1 pr-2">
                        <div>{row.dbrLimitSource} = {row.dbrLimitValue != null ? `${row.dbrLimitValue.toFixed(2)}%` : 'n/a'}</div>
                        <div>{row.minLoanSource} = {row.minLoanValue != null ? `AED ${formatCurrency(row.minLoanValue)}` : 'n/a'}</div>
                        <div>{row.maxLoanSource} = {row.maxLoanValue != null ? `AED ${formatCurrency(row.maxLoanValue)}` : 'n/a'}</div>
                      </td>
                      <td className="py-1">
                        <div>Stage 1: {row.stage1Outcome}</div>
                        <div>Stage 2: {row.stage2Outcome}</div>
                        <div>{row.productEligibilityIncluded ? 'Included' : 'Excluded'} — {row.productEligibilityReason}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* STRUCTURED RULES */}
        <Collapsible open={structuredOpen} onOpenChange={setStructuredOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 font-bold text-foreground">
            {structuredOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Structured Rules ({structuredEntries.length} banks)
          </CollapsibleTrigger>
          <CollapsibleContent>
            {structuredEntries.length === 0 ? (
              <p className="text-[10px] text-muted-foreground mt-1">No structured rules loaded from bank_eligibility_rules.</p>
            ) : (
              <div className="space-y-3 mt-1">
                {structuredEntries.map(([bankId, eval_]) => (
                  <div key={bankId} className="border border-border/50 rounded p-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-[10px]">{bankId.slice(0, 8)}…</span>
                      <Badge className={`text-[8px] px-1 py-0 ${
                        eval_.hasCriticalFail ? 'bg-red-600 text-white' :
                        eval_.hasManualReview ? 'bg-amber-500 text-white' :
                        eval_.allCriticalPass ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'
                      }`}>
                        {eval_.hasCriticalFail ? 'FAIL' : eval_.hasManualReview ? 'REVIEW' : eval_.allCriticalPass ? 'PASS' : 'PARTIAL'}
                      </Badge>
                      {!eval_.isAutomatable && (
                        <Badge className="bg-amber-600 text-white text-[8px] px-1 py-0">MANUAL</Badge>
                      )}
                      <span className="text-[9px] text-muted-foreground ml-auto">
                        {eval_.ruleResults.length} rules, {eval_.incomePolicies.length} income policies
                      </span>
                    </div>
                    {eval_.ruleResults.length > 0 && (
                      <table className="w-full text-[9px]">
                        <tbody>
                          {eval_.ruleResults.map((r, i) => (
                            <tr key={i} className="border-t border-border/20">
                              <td className="py-0.5 pr-1">
                                <Badge className={`text-[7px] px-1 py-0 ${
                                  r.status === 'pass' ? 'bg-green-600 text-white' :
                                  r.status === 'fail' ? 'bg-red-600 text-white' :
                                  r.status === 'manual_review' ? 'bg-amber-500 text-white' :
                                  'bg-muted text-muted-foreground'
                                }`}>{r.status}</Badge>
                              </td>
                              <td className="py-0.5 pr-1 font-semibold">{r.ruleType}</td>
                              <td className="py-0.5 text-muted-foreground">{r.summary}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {eval_.incomePolicies.length > 0 && (
                      <div className="mt-1 text-[9px]">
                        <span className="font-semibold">Income Policies:</span>
                        {eval_.incomePolicies.map((p, i) => (
                          <span key={i} className="ml-1 text-muted-foreground">
                            {p.income_type}@{p.consideration_pct}%{i < eval_.incomePolicies.length - 1 ? ',' : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
