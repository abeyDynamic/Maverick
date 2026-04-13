/**
 * Stage 1 Engine — DBR / core financial eligibility.
 * Pure function: given banks + financials, returns eligibility results.
 */

import { calculateStressEMI, formatCurrency, isLimitType, normalizeToMonthly } from '@/lib/mortgage-utils';
import type { CaseBank, CaseBankResult, CaseLiabilityField } from './types';

export type { CaseBankResult };

export function runStage1(
  banks: CaseBank[],
  totalIncome: number,
  totalLiabilities: number,
  loanAmount: number,
  tenorMonths: number,
  fallbackStressRate: number
): CaseBankResult[] {
  if (banks.length === 0 || !loanAmount) return [];

  return banks.map(bank => {
    const stressRate = (bank.baseStressRate ?? fallbackStressRate / 100) * 100;
    const stressEMI = calculateStressEMI(loanAmount, stressRate, tenorMonths);
    const dbr = totalIncome > 0 ? ((stressEMI + totalLiabilities) / totalIncome) * 100 : 0;
    const dbrLimit = Math.round(bank.dbrLimit * 10000) / 100;
    const minSalaryMet = totalIncome >= bank.minSalary;
    const dbrMet = dbr <= dbrLimit;
    const eligible = dbrMet && minSalaryMet;

    return { bank, stressRate, stressEMI, dbr, dbrLimit, minSalaryMet, dbrMet, eligible };
  }).sort((a, b) => {
    if (a.eligible && !b.eligible) return -1;
    if (!a.eligible && b.eligible) return 1;
    if (a.eligible && b.eligible) return a.stressEMI - b.stressEMI;
    return (a.dbr - a.dbrLimit) - (b.dbr - b.dbrLimit);
  });
}

export function formatDbrLimit(val: number): string {
  const rounded = Math.round(val * 100) / 100;
  return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2);
}

export function getDeclineReasons(r: CaseBankResult, totalIncome: number): string[] {
  const reasons: string[] = [];
  if (!r.minSalaryMet) {
    reasons.push(`Minimum salary AED ${formatCurrency(r.bank.minSalary)} not met, client income AED ${formatCurrency(totalIncome)}`);
  }
  if (!r.dbrMet) {
    reasons.push(`DBR ${r.dbr.toFixed(1)}% exceeds bank limit of ${formatDbrLimit(r.dbrLimit)}%`);
  }
  return reasons;
}

export function buildWhatIfAnalysis(
  bankResults: CaseBankResult[],
  totalIncome: number,
  totalLiabilities: number,
  liabilityFields: CaseLiabilityField[]
): string {
  const ineligible = bankResults.filter(r => !r.eligible);
  if (ineligible.length === 0) return '';

  const lines: string[] = ['📊 What-If Analysis for Ineligible Banks\n'];

  for (const r of ineligible) {
    lines.push(`▸ ${r.bank.bankName}`);

    if (!r.minSalaryMet) {
      const shortfall = r.bank.minSalary - totalIncome;
      lines.push(`  Min salary requirement not met. Bank requires AED ${formatCurrency(r.bank.minSalary)} monthly. Client income is AED ${formatCurrency(totalIncome)}. Shortfall: AED ${formatCurrency(Math.round(shortfall))}.`);
      if (!r.dbrMet) {
        const excess = (r.stressEMI + totalLiabilities) - (r.dbrLimit / 100 * totalIncome);
        lines.push(`  Additionally, DBR is ${r.dbr.toFixed(1)}% vs limit ${formatDbrLimit(r.dbrLimit)}%. Monthly liability reduction needed: AED ${formatCurrency(Math.round(Math.max(0, excess)))}.`);
      }
    } else {
      const excess = (r.stressEMI + totalLiabilities) - (r.dbrLimit / 100 * totalIncome);
      lines.push(`  Monthly liability reduction needed to qualify: AED ${formatCurrency(Math.round(Math.max(0, excess)))}`);

      const hasCreditCard = liabilityFields.some(f => isLimitType(f.liabilityType) && !f.closedBeforeApplication);
      const hasPersonalLoan = liabilityFields.some(f => f.liabilityType.toLowerCase().includes('personal loan') && !f.closedBeforeApplication);

      if (hasCreditCard && excess > 0) {
        const ccReduction = Math.ceil(excess / 0.05);
        lines.push(`  → Question to ask client: Reducing credit card limit by AED ${formatCurrency(ccReduction)} would achieve this.`);
      }
      if (hasPersonalLoan) {
        const plTotal = liabilityFields
          .filter(f => f.liabilityType.toLowerCase().includes('personal loan') && !f.closedBeforeApplication)
          .reduce((s, f) => s + normalizeToMonthly(f.amount, f.recurrence), 0);
        lines.push(`  → Question to ask client: Closing personal loan(s) saves AED ${formatCurrency(Math.round(plTotal))}/month in liabilities.`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
