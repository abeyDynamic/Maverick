/**
 * Liability Engine — calculates total monthly liability burden
 * from main applicant + co-borrowers.
 */

import { normalizeToMonthly, isLimitType } from '@/lib/mortgage-utils';
import type { CaseLiabilityField, CaseCoBorrower } from './types';

export function calcFieldLiabilities(fields: CaseLiabilityField[]): number {
  return fields.reduce((sum, f) => {
    if (f.closedBeforeApplication) return sum;
    if (isLimitType(f.liabilityType)) return sum + f.creditCardLimit * 0.05;
    return sum + normalizeToMonthly(f.amount, f.recurrence);
  }, 0);
}

export function calcTotalLiabilities(
  mainFields: CaseLiabilityField[],
  coBorrowers: CaseCoBorrower[] = []
): number {
  let total = calcFieldLiabilities(mainFields);
  for (const cb of coBorrowers) {
    total += calcFieldLiabilities(cb.liabilityFields);
  }
  return total;
}
