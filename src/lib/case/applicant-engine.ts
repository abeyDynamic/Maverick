/**
 * Applicant Engine — resolves age, tenor eligibility, segment mapping,
 * and binding tenor across main + co-borrowers.
 */

import {
  getAgeFromDob,
  getTenorEligibility,
  calculateMaxTenor,
} from '@/lib/mortgage-utils';
import type { CaseCoBorrower } from './types';

export { getAgeFromDob, getTenorEligibility, calculateMaxTenor };

export interface BindingTenorResult {
  bindingTenor: number;
  bindingName: string;
}

export function resolveBindingTenor(
  mainDob: Date | null,
  mainEmpType: string,
  coBorrowers: CaseCoBorrower[]
): BindingTenorResult {
  const mainAge = getAgeFromDob(mainDob);
  const mainElig = mainAge ? getTenorEligibility(mainAge.totalMonths) : null;

  let minSalaried = mainElig?.salaried ?? 300;
  let minSelfEmployed = mainElig?.selfEmployed ?? 300;
  let bindingName = 'Main Applicant';

  coBorrowers.forEach((cb, i) => {
    const cbAge = getAgeFromDob(cb.dateOfBirth);
    if (cbAge) {
      const cbElig = getTenorEligibility(cbAge.totalMonths);
      if (cbElig.salaried < minSalaried) {
        minSalaried = cbElig.salaried;
        bindingName = cb.name || `Co-Borrower ${i + 1}`;
      }
      if (cbElig.selfEmployed < minSelfEmployed) {
        minSelfEmployed = cbElig.selfEmployed;
      }
    }
  });

  const binding = mainEmpType === 'self_employed' ? minSelfEmployed : minSalaried;
  return { bindingTenor: Math.min(300, Math.max(0, binding)), bindingName };
}

/** Map employment_type to the segment label used in policy_terms */
export function resolveSegment(residencyStatus: string): string {
  return residencyStatus === 'non_resident' ? 'Non-Resident' : 'Resident';
}

/** Map employment_type to the employment label used in policy_terms */
export function resolveEmploymentLabel(employmentType: string, residencyStatus: string): string {
  if (employmentType === 'self_employed') return 'Self Employed';
  if (residencyStatus === 'non_resident') return 'Mixed';
  return 'Salaried';
}
