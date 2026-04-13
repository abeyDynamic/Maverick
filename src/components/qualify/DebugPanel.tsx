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
import type { CaseIncomeField, CaseLiabilityField, CaseBankResult } from '@/lib/case';

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
}

export default function DebugPanel({
  incomeFields, liabilityFields, totalIncome, totalLiabilities,
  loanAmount, stressRate, tenorMonths, bankResults,
  employmentType, residencyStatus, nationality, emirate,
}: DebugPanelProps) {
  const [visible, setVisible] = useState(false);
  const [incomeOpen, setIncomeOpen] = useState(true);
  const [liabOpen, setLiabOpen] = useState(true);
  const [stage1Open, setStage1Open] = useState(true);
  const [stage2Open, setStage2Open] = useState(false);

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

  // Also log to console for quick access
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
    console.table(liabilityFields.map(f => ({
      type: f.liabilityType,
      rawAmount: f.amount,
      creditCardLimit: f.creditCardLimit,
      recurrence: f.recurrence,
      closed: f.closedBeforeApplication,
      effectiveMonthly: f.closedBeforeApplication ? 0 : isLimitType(f.liabilityType) ? f.creditCardLimit * 0.05 : normalizeToMonthly(f.amount, f.recurrence),
    })));
    console.log('Total Liabilities:', totalLiabilities);
    console.log('Stage 1 inputs:', { totalIncome, totalLiabilities, loanAmount, stressRate, tenorMonths });
    console.log('Stage 2 inputs:', { employmentType, residencyStatus, nationality, emirate });
    console.log('Bank results:', bankResults.map(r => ({
      bank: r.bank.bankName, stressRate: r.stressRate, stressEMI: r.stressEMI,
      dbr: r.dbr, dbrLimit: r.dbrLimit, eligible: r.eligible,
    })));
    console.groupEnd();
  }, [visible, incomeFields, liabilityFields, totalIncome, totalLiabilities, loanAmount, stressRate, tenorMonths, bankResults]);

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

  return (
    <div className="fixed bottom-0 right-0 z-50 w-[480px] max-h-[70vh] overflow-y-auto shadow-2xl border-l border-t border-border bg-background rounded-tl-lg">
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

        {/* STAGE 1 INPUTS/OUTPUTS */}
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

        {/* STAGE 2 INPUTS */}
        <Collapsible open={stage2Open} onOpenChange={setStage2Open}>
          <CollapsibleTrigger className="flex items-center gap-1 font-bold text-foreground">
            {stage2Open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Stage 2 — Policy Check Inputs
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1 text-[10px]">
              <span className="text-muted-foreground">Employment Type:</span>
              <span className="text-right font-semibold">{employmentType || '(not set)'}</span>
              <span className="text-muted-foreground">Residency Status:</span>
              <span className="text-right font-semibold">{residencyStatus || '(not set)'}</span>
              <span className="text-muted-foreground">Policy Segment:</span>
              <span className="text-right font-semibold">{residencyStatus === 'non_resident' ? 'Non-Resident' : 'Resident'}</span>
              <span className="text-muted-foreground">Policy Employment:</span>
              <span className="text-right font-semibold">{employmentType === 'self_employed' ? 'Self Employed' : residencyStatus === 'non_resident' ? 'Mixed' : 'Salaried'}</span>
              <span className="text-muted-foreground">Nationality:</span>
              <span className="text-right font-semibold">{nationality || '(not set)'}</span>
              <span className="text-muted-foreground">Emirate:</span>
              <span className="text-right font-semibold">{emirate || '(not set)'}</span>
              <span className="text-muted-foreground">Loan Amount:</span>
              <span className="text-right font-semibold">AED {formatCurrency(loanAmount)}</span>
              <span className="text-muted-foreground">Total Income (for min salary):</span>
              <span className="text-right font-semibold">AED {formatCurrency(Math.round(totalIncome))}</span>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
