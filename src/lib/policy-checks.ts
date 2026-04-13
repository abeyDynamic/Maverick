import { formatCurrency } from './mortgage-utils';

export interface PolicyTerm {
  id: string;
  bank: string;
  segment: string;
  employment_type: string;
  attribute: string;
  value: string | null;
}

export interface PolicyCheckDebug {
  source: 'structured' | 'policy_term';
  attribute: string;
  rawValue: string | null;
  parsedNumeric: number | null;
}

export interface PolicyCheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'info' | 'no_data';
  summary: string;
  critical: boolean;
  debug?: PolicyCheckDebug;
}

export interface StructuredPolicyRules {
  minSalary: number | null;
  minLoanAmount: number | null;
  maxLoanAmount: number | null;
  dbrLimit: number | null;
}

export interface PolicyCheckInput {
  terms: PolicyTerm[];
  structuredRules: StructuredPolicyRules;
  totalIncome: number;
  loanAmount: number;
  nationality: string;
  emirate: string;
  employmentType: string;
  bankName: string;
}

export interface Stage2Summary {
  passed: number;
  total: number;
  criticalFail: boolean;
  criticalPass: boolean;
}

/**
 * Safely extract a number only when the entire value is numeric with optional
 * currency decoration. Mixed prose or multiple figures are treated as ambiguous.
 */
function parseNumeric(val: string | null): number | null {
  if (!val) return null;
  const cleaned = val
    .trim()
    .replace(/^aed\s*/i, '')
    .replace(/\s*aed$/i, '')
    .replace(/^usd\s*/i, '')
    .replace(/\s*usd$/i, '')
    .replace(/^\$\s*/, '')
    .replace(/\s+/g, '');

  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(cleaned)) return null;

  const n = Number(cleaned.replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  if (n > 100_000_000) return null;
  return n;
}

function normalizeStructuredRule(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function isNoneValue(val: string | null): boolean {
  if (!val) return true;
  return /^(no|none|no restrictions?|n\/a|na|nil)$/i.test(val.trim());
}

/**
 * Deterministic policy lookup: exact normalized attribute match only.
 */
function findTermExact(terms: PolicyTerm[], ...candidates: string[]): PolicyTerm | undefined {
  const wanted = new Set(candidates.map(c => c.toLowerCase().trim().replace(/\s+/g, ' ')));
  return terms.find(t => wanted.has(t.attribute.toLowerCase().trim().replace(/\s+/g, ' ')));
}

function debugInfo(term: PolicyTerm | undefined, parsed: number | null): PolicyCheckDebug | undefined {
  if (!term) return undefined;
  return { source: 'policy_term', attribute: term.attribute, rawValue: term.value, parsedNumeric: parsed };
}

function structuredDebug(attribute: string, value: number | null): PolicyCheckDebug {
  return {
    source: 'structured',
    attribute,
    rawValue: value === null ? null : String(value),
    parsedNumeric: value,
  };
}

function structuredRangeDebug(minLoan: number | null, maxLoan: number | null): PolicyCheckDebug {
  return {
    source: 'structured',
    attribute: 'banks.min_loan_amount / banks.max_loan_amount',
    rawValue: `min=${minLoan ?? 'n/a'}; max=${maxLoan ?? 'n/a'}`,
    parsedNumeric: null,
  };
}

export function runPolicyChecks({
  terms,
  structuredRules,
  totalIncome,
  loanAmount,
  nationality,
  emirate,
  employmentType,
  bankName,
}: PolicyCheckInput): PolicyCheckResult[] {
  const checks: PolicyCheckResult[] = [];
  const minSalary = normalizeStructuredRule(structuredRules.minSalary);
  const minLoan = normalizeStructuredRule(structuredRules.minLoanAmount);
  const maxLoan = normalizeStructuredRule(structuredRules.maxLoanAmount);

  // CHECK 1 — MINIMUM SALARY (structured bank rule only)
  if (minSalary !== null) {
    const passed = totalIncome >= minSalary;
    checks.push({
      name: 'Min Salary',
      status: passed ? 'pass' : 'fail',
      summary: passed
        ? `Min salary AED ${formatCurrency(minSalary)} — client earns AED ${formatCurrency(totalIncome)} ✓`
        : `Min salary AED ${formatCurrency(minSalary)} — client earns AED ${formatCurrency(totalIncome)} ✗`,
      critical: true,
      debug: structuredDebug('banks.min_salary', minSalary),
    });
  } else {
    checks.push({
      name: 'Min Salary',
      status: 'no_data',
      summary: 'No structured bank min salary',
      critical: true,
      debug: structuredDebug('banks.min_salary', null),
    });
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

  // CHECK 5 — LOAN AMOUNT (structured bank rule only)
  if (minLoan !== null || maxLoan !== null) {
    const belowMin = minLoan !== null && loanAmount < minLoan;
    const aboveMax = maxLoan !== null && loanAmount > maxLoan;
    if (belowMin) {
      checks.push({
        name: 'Loan Amount',
        status: 'fail',
        summary: `Loan AED ${formatCurrency(loanAmount)} below min AED ${formatCurrency(minLoan!)} ✗`,
        critical: true,
        debug: structuredRangeDebug(minLoan, maxLoan),
      });
    } else if (aboveMax) {
      checks.push({
        name: 'Loan Amount',
        status: 'fail',
        summary: `Loan AED ${formatCurrency(loanAmount)} exceeds max AED ${formatCurrency(maxLoan!)} ✗`,
        critical: true,
        debug: structuredRangeDebug(minLoan, maxLoan),
      });
    } else {
      const range = [minLoan ? `min AED ${formatCurrency(minLoan)}` : '', maxLoan ? `max AED ${formatCurrency(maxLoan)}` : ''].filter(Boolean).join(', ');
      checks.push({
        name: 'Loan Amount',
        status: 'pass',
        summary: `Loan AED ${formatCurrency(loanAmount)} within range (${range}) ✓`,
        critical: true,
        debug: structuredRangeDebug(minLoan, maxLoan),
      });
    }
  } else {
    checks.push({
      name: 'Loan Amount',
      status: 'no_data',
      summary: 'No structured bank loan rule',
      critical: true,
      debug: structuredRangeDebug(minLoan, maxLoan),
    });
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
        (d ? `[${d.source}] attr="${d.attribute}" raw="${d.rawValue}" parsed=${d.parsedNumeric}` : 'no match') +
        ` → ${c.summary}`
      );
    });
    console.groupEnd();
  }

  return checks;
}

export function getStage2Summary(checks: PolicyCheckResult[]): Stage2Summary {
  const scoredChecks = checks.filter(c => c.status !== 'info');
  const criticalChecks = checks.filter(c => c.critical);
  const total = scoredChecks.length;
  const passed = scoredChecks.filter(c => c.status === 'pass').length;
  const criticalFail = checks.some(c => c.critical && c.status === 'fail');
  const criticalPass = criticalChecks.length > 0 && criticalChecks.every(c => c.status === 'pass');
  return { passed, total, criticalFail, criticalPass };
}
