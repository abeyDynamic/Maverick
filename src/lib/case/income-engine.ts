/**
 * Income Engine — calculates total qualifying monthly income
 * from main applicant + co-borrowers.
 */

import { normalizeToMonthly } from '@/lib/mortgage-utils';
import type { CaseIncomeField, CaseCoBorrower } from './types';

export function calcFieldIncome(fields: CaseIncomeField[]): number {
  return fields.reduce((sum, f) => {
    return sum + normalizeToMonthly(f.amount * f.percentConsidered / 100, f.recurrence);
  }, 0);
}

export function calcTotalIncome(
  mainFields: CaseIncomeField[],
  coBorrowers: CaseCoBorrower[] = []
): number {
  let total = calcFieldIncome(mainFields);
  for (const cb of coBorrowers) {
    total += calcFieldIncome(cb.incomeFields);
  }
  return total;
}
