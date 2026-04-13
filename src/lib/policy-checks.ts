import { formatCurrency } from './mortgage-utils';

export interface PolicyTerm {
  id: string;
  bank: string;
  segment: string;
  employment_type: string;
  attribute: string;
  value: string | null;
}

export interface PolicyCheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'info' | 'no_data';
  summary: string;
  critical: boolean;
  debug?: { attribute: string; rawValue: string | null; parsedNumeric: number | null };
}

/**
 * Safely extract the FIRST standalone number from a policy value string.
 * Handles "12,000", "AED 15,000", "12000" but does NOT concatenate
 * multiple numbers like "12,000 for salaried / 15,000 for SE" into one giant number.
 * Returns null if no clean single number can be isolated.
 */
function parseNumeric(val: string | null): number | null {
  if (!val) return null;
  // Match the first number-like token: optional digits with commas, optional decimal
  const match = val.match(/(?:^|[^0-9])(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/);
  if (!match) return null;
  const cleaned = match[1].replace(/,/g, '');
  const n = parseFloat(cleaned);
  if (isNaN(n)) return null;
  // Sanity: salary/loan values should be reasonable (up to 100M AED)
  if (n > 100_000_000) return null;
  return n;
}

function isNoneValue(val: string | null): boolean {
  if (!val) return true;
  return /^(no|none|no restrictions?|n\/a|na|nil)$/i.test(val.trim());
}

/**
 * Find a policy term by exact attribute match first, then fall back to fuzzy (contains).
 * This prevents matching the wrong row when multiple attributes share a keyword.
 */
function findTermExact(terms: PolicyTerm[], ...candidates: string[]): PolicyTerm | undefined {
  // Pass 1: exact (case-insensitive)
  for (const c of candidates) {
    const found = terms.find(t => t.attribute.toLowerCase().trim() === c.toLowerCase());
    if (found) return found;
  }
  // Pass 2: contains (but only if the keyword is a significant portion of the attribute)
  for (const c of candidates) {
    const found = terms.find(t => t.attribute.toLowerCase().includes(c.toLowerCase()));
    if (found) return found;
  }
  return undefined;
}

function debugInfo(term: PolicyTerm | undefined, parsed: number | null): PolicyCheckResult['debug'] | undefined {
  if (!term) return undefined;
  return { attribute: term.attribute, rawValue: term.value, parsedNumeric: parsed };
}

export function runPolicyChecks(
  terms: PolicyTerm[],
  totalIncome: number,
  loanAmount: number,
  nationality: string,
  emirate: string,
  employmentType: string,
  bankName: string
): PolicyCheckResult[] {
  const checks: PolicyCheckResult[] = [];

  // CHECK 1 — MINIMUM SALARY
  const salaryTerm = findTermExact(terms, 'Minimum Salary', 'Min Salary');
  const minSal = salaryTerm ? parseNumeric(salaryTerm.value) : null;
  if (salaryTerm) {
    if (minSal !== null) {
      const passed = totalIncome >= minSal;
      checks.push({
        name: 'Min Salary',
        status: passed ? 'pass' : 'fail',
        summary: passed
          ? `Min salary AED ${formatCurrency(minSal)} — client earns AED ${formatCurrency(totalIncome)} ✓`
          : `Min salary AED ${formatCurrency(minSal)} — client earns AED ${formatCurrency(totalIncome)} ✗`,
        critical: true,
        debug: debugInfo(salaryTerm, minSal),
      });
    } else {
      // Value exists but is not a clean number — show as info, don't fail
      checks.push({
        name: 'Min Salary',
        status: 'info',
        summary: `Policy: ${salaryTerm.value || 'See bank policy'}`,
        critical: true,
        debug: debugInfo(salaryTerm, null),
      });
    }
  } else {
    checks.push({ name: 'Min Salary', status: 'no_data', summary: 'No policy data', critical: true });
  }

  // CHECK 2 — NATIONALITY
  const natTerm = findTermExact(terms, 'Restricted Nationalities', 'Restricted Nationality');
  if (natTerm) {
    if (isNoneValue(natTerm.value)) {
      checks.push({ name: 'Nationality', status: 'pass', summary: 'No nationality restrictions', critical: false, debug: debugInfo(natTerm, null) });
    } else {
      const mentioned = nationality && natTerm.value?.toLowerCase().includes(nationality.toLowerCase());
      checks.push({
        name: 'Nationality',
        status: mentioned ? 'warn' : 'pass',
        summary: mentioned
          ? `⚠ Restriction: ${natTerm.value}`
          : `No restriction for ${nationality || 'client nationality'}`,
        critical: false,
        debug: debugInfo(natTerm, null),
      });
    }
  } else {
    checks.push({ name: 'Nationality', status: 'no_data', summary: 'No policy data', critical: false });
  }

  // CHECK 3 — EMIRATE
  const emirateTerm = findTermExact(terms, 'Emirate', 'Accepted Emirates', 'Emirates');
  if (emirateTerm) {
    const val = emirateTerm.value || '';
    if (/all emirates/i.test(val) || isNoneValue(emirateTerm.value)) {
      checks.push({ name: 'Emirate', status: 'pass', summary: 'All emirates accepted', critical: false, debug: debugInfo(emirateTerm, null) });
    } else {
      const emirateLabel = emirate.replace(/_/g, ' ');
      const mentioned = val.toLowerCase().includes(emirateLabel.toLowerCase());
      checks.push({
        name: 'Emirate',
        status: mentioned ? 'pass' : 'warn',
        summary: mentioned
          ? `${emirateLabel} accepted`
          : `⚠ ${emirateLabel} may not be covered — policy: ${val}`,
        critical: false,
        debug: debugInfo(emirateTerm, null),
      });
    }
  } else {
    checks.push({ name: 'Emirate', status: 'no_data', summary: 'No policy data', critical: false });
  }

  // CHECK 4 — JOB SEGMENT
  const jobTerm = findTermExact(terms, 'Restricted Job Segment', 'Restricted Job Segments');
  if (jobTerm) {
    if (isNoneValue(jobTerm.value)) {
      checks.push({ name: 'Job Segment', status: 'pass', summary: 'No job restrictions', critical: false, debug: debugInfo(jobTerm, null) });
    } else {
      checks.push({ name: 'Job Segment', status: 'warn', summary: `⚠ ${jobTerm.value}`, critical: false, debug: debugInfo(jobTerm, null) });
    }
  } else {
    checks.push({ name: 'Job Segment', status: 'no_data', summary: 'No policy data', critical: false });
  }

  // CHECK 5 — LOAN AMOUNT
  const minLoanTerm = findTermExact(terms, 'Minimum Loan Amount', 'Min Loan Amount');
  const maxLoanTerm = findTermExact(terms, 'Maximum Loan Amount', 'Max Loan Amount');
  const minLoan = minLoanTerm ? parseNumeric(minLoanTerm.value) : null;
  const maxLoan = maxLoanTerm ? parseNumeric(maxLoanTerm.value) : null;

  if (minLoan !== null || maxLoan !== null) {
    const belowMin = minLoan !== null && loanAmount < minLoan;
    const aboveMax = maxLoan !== null && loanAmount > maxLoan;
    if (belowMin) {
      checks.push({ name: 'Loan Amount', status: 'fail', summary: `Loan AED ${formatCurrency(loanAmount)} below min AED ${formatCurrency(minLoan!)} ✗`, critical: true, debug: debugInfo(minLoanTerm, minLoan) });
    } else if (aboveMax) {
      checks.push({ name: 'Loan Amount', status: 'fail', summary: `Loan AED ${formatCurrency(loanAmount)} exceeds max AED ${formatCurrency(maxLoan!)} ✗`, critical: true, debug: debugInfo(maxLoanTerm, maxLoan) });
    } else {
      const range = [minLoan ? `min AED ${formatCurrency(minLoan)}` : '', maxLoan ? `max AED ${formatCurrency(maxLoan)}` : ''].filter(Boolean).join(', ');
      checks.push({ name: 'Loan Amount', status: 'pass', summary: `Loan AED ${formatCurrency(loanAmount)} within range (${range}) ✓`, critical: true, debug: debugInfo(minLoanTerm, minLoan) });
    }
  } else {
    checks.push({ name: 'Loan Amount', status: 'no_data', summary: 'No policy data', critical: true });
  }

  // CHECK 6 — SE ONLY: LOB
  if (employmentType === 'self_employed') {
    const lobTerm = findTermExact(terms, 'Length of Business', 'Minimum LOB', 'LOB');
    if (lobTerm) {
      checks.push({ name: 'Min LOB', status: 'info', summary: `Requirement: ${lobTerm.value}`, critical: false, debug: debugInfo(lobTerm, null) });
    } else {
      checks.push({ name: 'Min LOB', status: 'no_data', summary: 'No policy data', critical: false });
    }
  } else {
    checks.push({ name: 'Min LOB', status: 'pass', summary: 'N/A (salaried)', critical: false });
  }

  // CHECK 7 — RENTAL INCOME %
  const rentalTerm = findTermExact(terms, 'Rental Income', 'Consider Rental Income');
  if (rentalTerm) {
    checks.push({ name: 'Rental Income', status: 'info', summary: `${rentalTerm.value} at ${bankName}`, critical: false, debug: debugInfo(rentalTerm, null) });
  } else {
    checks.push({ name: 'Rental Income', status: 'no_data', summary: 'No policy data', critical: false });
  }

  // CHECK 8 — BONUS TREATMENT
  const bonusTerm = findTermExact(terms, 'Bonus Treatment', 'Consider Bonus');
  if (bonusTerm) {
    checks.push({ name: 'Bonus Treatment', status: 'info', summary: `${bonusTerm.value} at ${bankName}`, critical: false, debug: debugInfo(bonusTerm, null) });
  } else {
    checks.push({ name: 'Bonus Treatment', status: 'no_data', summary: 'No policy data', critical: false });
  }

  // Debug log all checks with matched policy rows
  if (typeof console !== 'undefined') {
    console.groupCollapsed(`🔍 Stage 2 Policy — ${bankName}`);
    checks.forEach(c => {
      const d = c.debug;
      console.log(
        `${c.status.toUpperCase().padEnd(7)} ${c.name.padEnd(16)} | ` +
        (d ? `attr="${d.attribute}" raw="${d.rawValue}" parsed=${d.parsedNumeric}` : 'no match') +
        ` → ${c.summary}`
      );
    });
    console.groupEnd();
  }

  return checks;
}

export function getStage2Summary(checks: PolicyCheckResult[]): { passed: number; total: number; criticalFail: boolean } {
  const total = checks.length;
  const passed = checks.filter(c => c.status === 'pass' || c.status === 'info' || c.status === 'no_data').length;
  const criticalFail = checks.some(c => c.critical && c.status === 'fail');
  return { passed, total, criticalFail };
}
