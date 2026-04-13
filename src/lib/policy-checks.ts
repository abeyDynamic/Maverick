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
  critical: boolean; // critical checks affect eligibility
}

function parseNumeric(val: string | null): number | null {
  if (!val) return null;
  const cleaned = val.replace(/[^0-9.,]/g, '').replace(/,/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function isNoneValue(val: string | null): boolean {
  if (!val) return true;
  return /^(no|none|no restrictions?|n\/a|na|nil)$/i.test(val.trim());
}

function findTerm(terms: PolicyTerm[], attribute: string): PolicyTerm | undefined {
  return terms.find(t => t.attribute.toLowerCase() === attribute.toLowerCase());
}

function findTermFuzzy(terms: PolicyTerm[], ...keywords: string[]): PolicyTerm | undefined {
  return terms.find(t => keywords.some(k => t.attribute.toLowerCase().includes(k.toLowerCase())));
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
  const salaryTerm = findTermFuzzy(terms, 'minimum salary', 'min salary');
  if (salaryTerm) {
    const minSal = parseNumeric(salaryTerm.value);
    if (minSal !== null) {
      const passed = totalIncome >= minSal;
      checks.push({
        name: 'Min Salary',
        status: passed ? 'pass' : 'fail',
        summary: passed
          ? `Min salary AED ${formatCurrency(minSal)} — client earns AED ${formatCurrency(totalIncome)} ✓`
          : `Min salary AED ${formatCurrency(minSal)} — client earns AED ${formatCurrency(totalIncome)} ✗`,
        critical: true,
      });
    } else {
      checks.push({ name: 'Min Salary', status: 'info', summary: salaryTerm.value || 'See policy', critical: true });
    }
  } else {
    checks.push({ name: 'Min Salary', status: 'no_data', summary: 'No policy data', critical: true });
  }

  // CHECK 2 — NATIONALITY
  const natTerm = findTermFuzzy(terms, 'restricted nationalit', 'nationality');
  if (natTerm) {
    if (isNoneValue(natTerm.value)) {
      checks.push({ name: 'Nationality', status: 'pass', summary: 'No nationality restrictions', critical: false });
    } else {
      const mentioned = nationality && natTerm.value?.toLowerCase().includes(nationality.toLowerCase());
      checks.push({
        name: 'Nationality',
        status: mentioned ? 'warn' : 'pass',
        summary: mentioned
          ? `⚠ Restriction: ${natTerm.value}`
          : `No restriction for ${nationality || 'client nationality'}`,
        critical: false,
      });
    }
  } else {
    checks.push({ name: 'Nationality', status: 'no_data', summary: 'No policy data', critical: false });
  }

  // CHECK 3 — EMIRATE
  const emirateTerm = findTermFuzzy(terms, 'emirate');
  if (emirateTerm) {
    const val = emirateTerm.value || '';
    if (/all emirates/i.test(val) || isNoneValue(emirateTerm.value)) {
      checks.push({ name: 'Emirate', status: 'pass', summary: 'All emirates accepted', critical: false });
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
      });
    }
  } else {
    checks.push({ name: 'Emirate', status: 'no_data', summary: 'No policy data', critical: false });
  }

  // CHECK 4 — JOB SEGMENT
  const jobTerm = findTermFuzzy(terms, 'restricted job segment', 'restricted job');
  if (jobTerm) {
    if (isNoneValue(jobTerm.value)) {
      checks.push({ name: 'Job Segment', status: 'pass', summary: 'No job restrictions', critical: false });
    } else {
      checks.push({ name: 'Job Segment', status: 'warn', summary: `⚠ ${jobTerm.value}`, critical: false });
    }
  } else {
    checks.push({ name: 'Job Segment', status: 'no_data', summary: 'No policy data', critical: false });
  }

  // CHECK 5 — LOAN AMOUNT
  const minLoanTerm = findTermFuzzy(terms, 'min loan amount', 'minimum loan');
  const maxLoanTerm = findTermFuzzy(terms, 'max loan amount', 'maximum loan');
  const minLoan = minLoanTerm ? parseNumeric(minLoanTerm.value) : null;
  const maxLoan = maxLoanTerm ? parseNumeric(maxLoanTerm.value) : null;

  if (minLoan !== null || maxLoan !== null) {
    const belowMin = minLoan !== null && loanAmount < minLoan;
    const aboveMax = maxLoan !== null && loanAmount > maxLoan;
    if (belowMin) {
      checks.push({ name: 'Loan Amount', status: 'fail', summary: `Loan AED ${formatCurrency(loanAmount)} below min AED ${formatCurrency(minLoan!)} ✗`, critical: true });
    } else if (aboveMax) {
      checks.push({ name: 'Loan Amount', status: 'fail', summary: `Loan AED ${formatCurrency(loanAmount)} exceeds max AED ${formatCurrency(maxLoan!)} ✗`, critical: true });
    } else {
      const range = [minLoan ? `min AED ${formatCurrency(minLoan)}` : '', maxLoan ? `max AED ${formatCurrency(maxLoan)}` : ''].filter(Boolean).join(', ');
      checks.push({ name: 'Loan Amount', status: 'pass', summary: `Loan AED ${formatCurrency(loanAmount)} within range (${range}) ✓`, critical: true });
    }
  } else {
    checks.push({ name: 'Loan Amount', status: 'no_data', summary: 'No policy data', critical: true });
  }

  // CHECK 6 — SE ONLY: LOB
  if (employmentType === 'self_employed') {
    const lobTerm = findTermFuzzy(terms, 'length of business', 'lob');
    if (lobTerm) {
      checks.push({ name: 'Min LOB', status: 'info', summary: `Requirement: ${lobTerm.value}`, critical: false });
    } else {
      checks.push({ name: 'Min LOB', status: 'no_data', summary: 'No policy data', critical: false });
    }
  } else {
    checks.push({ name: 'Min LOB', status: 'pass', summary: 'N/A (salaried)', critical: false });
  }

  // CHECK 7 — RENTAL INCOME %
  const rentalTerm = findTermFuzzy(terms, 'rental income', 'consider rental');
  if (rentalTerm) {
    checks.push({ name: 'Rental Income', status: 'info', summary: `${rentalTerm.value} at ${bankName}`, critical: false });
  } else {
    checks.push({ name: 'Rental Income', status: 'no_data', summary: 'No policy data', critical: false });
  }

  // CHECK 8 — BONUS TREATMENT
  const bonusTerm = findTermFuzzy(terms, 'bonus', 'consider bonus');
  if (bonusTerm) {
    checks.push({ name: 'Bonus Treatment', status: 'info', summary: `${bonusTerm.value} at ${bankName}`, critical: false });
  } else {
    checks.push({ name: 'Bonus Treatment', status: 'no_data', summary: 'No policy data', critical: false });
  }

  return checks;
}

export function getStage2Summary(checks: PolicyCheckResult[]): { passed: number; total: number; criticalFail: boolean } {
  const total = checks.length;
  const passed = checks.filter(c => c.status === 'pass' || c.status === 'info' || c.status === 'no_data').length;
  const criticalFail = checks.some(c => c.critical && c.status === 'fail');
  return { passed, total, criticalFail };
}
