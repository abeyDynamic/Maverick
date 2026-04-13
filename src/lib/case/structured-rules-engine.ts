/**
 * Structured Rules Engine — reads bank_eligibility_rules and bank_income_policies
 * from Supabase and evaluates them deterministically against case data.
 *
 * Replaces fuzzy policy_terms parsing for critical numeric rules.
 */

import type { QualSegment } from './types';

// ── Types matching Supabase schema ──

export interface EligibilityRule {
  id: string;
  bank_id: string;
  segment: string;
  employment_subtype: string | null;
  doc_path: string | null;
  route_type: string | null;
  rule_type: string;
  operator: string;
  value_numeric: number | null;
  value_text: string | null;
  critical: boolean;
  active: boolean;
  priority: number;
  requires_manual_review: boolean;
  source_note: string | null;
}

export interface IncomePolicy {
  id: string;
  bank_id: string;
  segment: string;
  employment_subtype: string | null;
  doc_path: string | null;
  route_type: string | null;
  income_type: string;
  consideration_pct: number;
  income_basis: string | null;
  averaging_method: string | null;
  averaging_months: number | null;
  requires_documents: boolean;
  conditions: string | null;
  notes: string | null;
  active: boolean;
}

export interface QualProfile {
  segmentPath: QualSegment;
  employmentSubtype: string;
  docPath: string | null;
  routeType: string;
}

// ── Rule matching ──

/**
 * Filter eligibility rules for a specific bank + profile.
 * Uses priority ordering and segment/subtype/doc/route matching with fallback.
 */
export function getMatchingRules(
  rules: EligibilityRule[],
  bankId: string,
  profile: QualProfile,
): EligibilityRule[] {
  return rules
    .filter(r => {
      if (r.bank_id !== bankId || !r.active) return false;
      if (r.segment !== profile.segmentPath && r.segment !== 'all') return false;
      if (r.employment_subtype && r.employment_subtype !== profile.employmentSubtype) return false;
      if (r.doc_path && r.doc_path !== profile.docPath) return false;
      if (r.route_type && r.route_type !== profile.routeType) return false;
      return true;
    })
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

/**
 * Filter income policies for a specific bank + profile.
 */
export function getMatchingIncomePolicies(
  policies: IncomePolicy[],
  bankId: string,
  profile: QualProfile,
): IncomePolicy[] {
  return policies.filter(p => {
    if (p.bank_id !== bankId || !p.active) return false;
    if (p.segment !== profile.segmentPath && p.segment !== 'all') return false;
    if (p.employment_subtype && p.employment_subtype !== profile.employmentSubtype) return false;
    if (p.doc_path && p.doc_path !== profile.docPath) return false;
    if (p.route_type && p.route_type !== profile.routeType) return false;
    return true;
  });
}

// ── Eligibility rule evaluation ──

export interface RuleCheckResult {
  ruleId: string;
  ruleType: string;
  status: 'pass' | 'fail' | 'warn' | 'manual_review';
  summary: string;
  critical: boolean;
  source: {
    operator: string;
    valueNumeric: number | null;
    valueText: string | null;
    sourceNote: string | null;
  };
}

/**
 * Evaluate a single eligibility rule against case data.
 */
export function evaluateRule(
  rule: EligibilityRule,
  caseData: {
    totalIncome: number;
    loanAmount: number;
    ltv: number;
    tenorMonths: number;
    lobMonths: number | null;
    nationality: string;
    emirate: string;
  },
): RuleCheckResult {
  const source = {
    operator: rule.operator,
    valueNumeric: rule.value_numeric,
    valueText: rule.value_text,
    sourceNote: rule.source_note,
  };

  if (rule.requires_manual_review) {
    return {
      ruleId: rule.id,
      ruleType: rule.rule_type,
      status: 'manual_review',
      summary: `${rule.rule_type}: requires manual review${rule.source_note ? ` — ${rule.source_note}` : ''}`,
      critical: rule.critical,
      source,
    };
  }

  const val = rule.value_numeric;
  let actual: number | null = null;
  let label = rule.rule_type;

  switch (rule.rule_type) {
    case 'min_income':
      actual = caseData.totalIncome;
      label = 'Min Income';
      break;
    case 'max_ltv':
      actual = caseData.ltv;
      label = 'Max LTV';
      break;
    case 'max_tenor':
      actual = caseData.tenorMonths;
      label = 'Max Tenor';
      break;
    case 'min_loan':
      actual = caseData.loanAmount;
      label = 'Min Loan';
      break;
    case 'max_loan':
      actual = caseData.loanAmount;
      label = 'Max Loan';
      break;
    case 'min_lob':
      actual = caseData.lobMonths;
      label = 'Min LOB';
      break;
    case 'nationality_restriction':
      return evaluateTextRule(rule, caseData.nationality, source);
    case 'emirate_restriction':
      return evaluateTextRule(rule, caseData.emirate, source);
    default:
      // Unknown rule type — treat as informational
      return {
        ruleId: rule.id,
        ruleType: rule.rule_type,
        status: 'warn',
        summary: `${rule.rule_type}: ${rule.value_text ?? rule.value_numeric ?? 'unknown'} (unhandled rule type)`,
        critical: rule.critical,
        source,
      };
  }

  if (val === null) {
    return {
      ruleId: rule.id,
      ruleType: rule.rule_type,
      status: 'warn',
      summary: `${label}: no numeric value configured`,
      critical: rule.critical,
      source,
    };
  }

  if (actual === null) {
    return {
      ruleId: rule.id,
      ruleType: rule.rule_type,
      status: 'warn',
      summary: `${label}: no case data available`,
      critical: rule.critical,
      source,
    };
  }

  const passed = evaluateOperator(rule.operator, actual, val);
  return {
    ruleId: rule.id,
    ruleType: rule.rule_type,
    status: passed ? 'pass' : 'fail',
    summary: passed
      ? `${label}: ${actual} ${rule.operator} ${val} ✓`
      : `${label}: ${actual} ${rule.operator} ${val} ✗`,
    critical: rule.critical,
    source,
  };
}

function evaluateOperator(op: string, actual: number, threshold: number): boolean {
  switch (op) {
    case '>=': return actual >= threshold;
    case '<=': return actual <= threshold;
    case '>': return actual > threshold;
    case '<': return actual < threshold;
    case '=': case '==': return actual === threshold;
    case '!=': return actual !== threshold;
    default: return false;
  }
}

function evaluateTextRule(
  rule: EligibilityRule,
  actual: string,
  source: RuleCheckResult['source'],
): RuleCheckResult {
  const restrictedList = (rule.value_text ?? '').toLowerCase();
  const actualLower = actual.toLowerCase().trim();

  if (!restrictedList || restrictedList === 'none' || restrictedList === 'n/a') {
    return {
      ruleId: rule.id,
      ruleType: rule.rule_type,
      status: 'pass',
      summary: `${rule.rule_type}: no restrictions`,
      critical: rule.critical,
      source,
    };
  }

  // Check if the actual value is in the restricted list (comma-separated)
  const restricted = restrictedList.split(',').map(s => s.trim());
  const isRestricted = restricted.some(r => r === actualLower || actualLower.includes(r));

  return {
    ruleId: rule.id,
    ruleType: rule.rule_type,
    status: isRestricted ? 'fail' : 'pass',
    summary: isRestricted
      ? `${rule.rule_type}: "${actual}" is restricted — ${rule.value_text}`
      : `${rule.rule_type}: "${actual}" not restricted`,
    critical: rule.critical,
    source,
  };
}

// ── Bulk evaluation for all banks ──

export interface BankStructuredEvaluation {
  bankId: string;
  ruleResults: RuleCheckResult[];
  incomePolicies: IncomePolicy[];
  hasCriticalFail: boolean;
  hasManualReview: boolean;
  allCriticalPass: boolean;
  isAutomatable: boolean; // false if low-doc/NR DAB without complete rules
}

export function evaluateStructuredRulesForBank(
  bankId: string,
  rules: EligibilityRule[],
  policies: IncomePolicy[],
  profile: QualProfile,
  caseData: {
    totalIncome: number;
    loanAmount: number;
    ltv: number;
    tenorMonths: number;
    lobMonths: number | null;
    nationality: string;
    emirate: string;
  },
): BankStructuredEvaluation {
  const matchedRules = getMatchingRules(rules, bankId, profile);
  const matchedPolicies = getMatchingIncomePolicies(policies, bankId, profile);

  const ruleResults = matchedRules.map(r => evaluateRule(r, caseData));

  const hasCriticalFail = ruleResults.some(r => r.critical && r.status === 'fail');
  const hasManualReview = ruleResults.some(r => r.status === 'manual_review');
  const criticalRules = ruleResults.filter(r => r.critical);
  const allCriticalPass = criticalRules.length > 0 && criticalRules.every(r => r.status === 'pass');

  // Conservative: low-doc and NR DAB are non-automatable unless we have sufficient rule coverage
  const isConservativeSegment = profile.docPath === 'low_doc' ||
    (profile.segmentPath === 'non_resident' && profile.routeType === 'dab');
  const isAutomatable = isConservativeSegment
    ? matchedRules.length >= 3 && !hasManualReview  // require minimum rule coverage
    : true;

  return {
    bankId,
    ruleResults,
    incomePolicies: matchedPolicies,
    hasCriticalFail,
    hasManualReview,
    allCriticalPass,
    isAutomatable,
  };
}

/**
 * Get the consideration percentage for a given income type from structured policies.
 * Returns null if no policy found (use UI default).
 */
export function getIncomeConsiderationPct(
  policies: IncomePolicy[],
  bankId: string,
  profile: QualProfile,
  incomeType: string,
): number | null {
  const matched = getMatchingIncomePolicies(policies, bankId, profile);
  const policy = matched.find(p =>
    p.income_type.toLowerCase().replace(/\s+/g, '_') === incomeType.toLowerCase().replace(/\s+/g, '_')
  );
  return policy ? policy.consideration_pct : null;
}
