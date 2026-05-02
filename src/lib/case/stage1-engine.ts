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
    // Convention: bank.baseStressRate, bank.dbrLimit, and fallbackStressRate
    // are all stored as DISPLAY PERCENTS (e.g. 7.37 means 7.37%, 50 means 50%).
    // calculateStressEMI also expects a display percent. Do NOT scale here.
    const stressRate = bank.baseStressRate ?? fallbackStressRate;

    // B17: clamp tenor by the bank's own maximum (don't lengthen beyond
    // applicant cap, don't lengthen beyond bank cap).
    const effectiveBankTenor = bank.maxTenorMonths != null
      ? Math.min(tenorMonths, bank.maxTenorMonths)
      : tenorMonths;

    const stressEMI = calculateStressEMI(loanAmount, stressRate, effectiveBankTenor);
    const dbr = totalIncome > 0 ? ((stressEMI + totalLiabilities) / totalIncome) * 100 : 0;
    const dbrLimit = bank.dbrLimit;
    const minSalaryMet = totalIncome >= bank.minSalary;
    const dbrMet = dbr <= dbrLimit;

    // B18: hard loan-range check at Stage 1. A bank cannot be eligible if the
    // requested loan amount sits outside its [minLoanAmount, maxLoanAmount] window.
    const minOk = bank.minLoanAmount == null || loanAmount >= bank.minLoanAmount;
    const maxOk = bank.maxLoanAmount == null || loanAmount <= bank.maxLoanAmount;
    const loanInRange = minOk && maxOk;

    const eligible = dbrMet && minSalaryMet && loanInRange;

    return {
      bank, stressRate, stressEMI, dbr, dbrLimit,
      minSalaryMet, dbrMet, loanInRange, eligible,
      effectiveTenor: effectiveBankTenor,
    };
  }).sort((a, b) => {
    if (a.eligible && !b.eligible) return -1;
    if (!a.eligible && b.eligible) return 1;
    // Among eligible banks, prefer the one with the most DBR headroom
    // (lower dbr/dbrLimit ratio means more cushion for the client).
    if (a.eligible && b.eligible) {
      const aHead = a.dbrLimit - a.dbr;
      const bHead = b.dbrLimit - b.dbr;
      return bHead - aHead;
    }
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
