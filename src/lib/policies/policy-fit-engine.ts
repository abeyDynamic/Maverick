import type {
  BankPolicyFitResult,
  PolicyFitCaseFacts,
  PolicyFitCheck,
  PolicyFitIntent,
  PolicyFitReport,
  PolicySearchRow,
} from './policyFitTypes';

// ── Helpers ────────────────────────────────────────────────────────────────

const MANUAL_REVIEW_PATTERNS = [
  'case by case', 'subject to approval', 'exception', 'depends on profile',
  'check with rm', 'compliance approval', 'manual', 'credit discretion',
  'deviation', 'case-by-case',
];

function lc(v: string | null | undefined): string {
  return (v ?? '').toLowerCase();
}

function parsePercent(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = String(v).match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : null;
}

function parseAed(v: string | null | undefined): number | null {
  if (!v) return null;
  const cleaned = String(v).replace(/aed|,/gi, '').trim();
  const m = cleaned.match(/([\d.]+)\s*(k|m|million|thousand)?/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (isNaN(n)) return null;
  const unit = (m[2] ?? '').toLowerCase();
  if (unit.startsWith('k') || unit === 'thousand') n *= 1_000;
  if (unit.startsWith('m')) n *= 1_000_000;
  return n;
}

function parseMonths(v: string | null | undefined): number | null {
  if (!v) return null;
  const s = String(v).toLowerCase();
  const yr = s.match(/(\d+(?:\.\d+)?)\s*(?:year|yr)/);
  if (yr) return Math.round(parseFloat(yr[1]) * 12);
  const mo = s.match(/(\d+)\s*month/);
  if (mo) return parseInt(mo[1], 10);
  const num = s.match(/^\s*(\d+)\s*$/);
  if (num) return parseInt(num[1], 10);
  return null;
}

function isManualReview(v: string | null | undefined): boolean {
  const s = lc(v);
  if (!s) return false;
  return MANUAL_REVIEW_PATTERNS.some(p => s.includes(p));
}

function isUnclear(row: PolicySearchRow): boolean {
  return lc(row.value_status) === 'unclear';
}

function isPositiveSignal(v: string | null | undefined): boolean {
  const s = lc(v);
  if (!s) return false;
  return /\b(yes|allowed|accepted|considered|eligible|supported|available|permitted|100%|up to 100%)\b/.test(s);
}

function isNegativeSignal(v: string | null | undefined): boolean {
  const s = lc(v);
  if (!s) return false;
  return /\b(no|not allowed|not accepted|not considered|excluded|ineligible|not supported|prohibited|blocked)\b/.test(s);
}

// ── Main engine ────────────────────────────────────────────────────────────

export function buildPolicyFitReport(params: {
  caseFacts: PolicyFitCaseFacts;
  policyRows: PolicySearchRow[];
  intent: PolicyFitIntent;
  selectedBanks?: string[];
}): PolicyFitReport {
  const { caseFacts, policyRows, intent, selectedBanks } = params;

  // Compute requestedLtv if missing
  const facts: PolicyFitCaseFacts = { ...caseFacts };
  if (
    facts.requestedLtv == null &&
    facts.propertyValue && facts.propertyValue > 0 &&
    facts.requestedLoanAmount && facts.requestedLoanAmount > 0
  ) {
    facts.requestedLtv = (facts.requestedLoanAmount / facts.propertyValue) * 100;
  }

  // Filter rows
  let rows = Array.isArray(policyRows) ? policyRows : [];
  const safeSelected = Array.isArray(selectedBanks) ? selectedBanks : [];
  if (safeSelected.length > 0) {
    const set = new Set(safeSelected.map(b => lc(b as any)));
    rows = rows.filter(r => r?.bank && set.has(lc(r.bank as any)));
  }

  // Group by bank+variant
  const groups = new Map<string, PolicySearchRow[]>();
  for (const r of rows) {
    const key = `${r.bank}::${r.product_variant ?? ''}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  const bankReports: BankPolicyFitResult[] = [];
  for (const [key, gRows] of groups) {
    const [bank, variant] = key.split('::');
    bankReports.push(evaluateBank(bank, variant || null, gRows, facts));
  }

  // Overall summary
  const overallSummary = {
    banksReviewed: bankReports.length,
    fit: bankReports.filter(b => b.fitStatus === 'fit').length,
    conditionalFit: bankReports.filter(b => b.fitStatus === 'conditional_fit').length,
    notFit: bankReports.filter(b => b.fitStatus === 'not_fit').length,
    needsInput: bankReports.filter(b => b.fitStatus === 'needs_adviser_input').length,
    manualReview: bankReports.filter(b => b.fitStatus === 'manual_review').length,
  };

  // Rankings
  const byIncome = [...bankReports].sort((a, b) =>
    b.incomeRecognitionScore - a.incomeRecognitionScore ||
    a.missingInputs.length - b.missingInputs.length ||
    a.manualReviewRiskScore - b.manualReviewRiskScore,
  );
  const fitOrder: Record<string, number> = { fit: 0, conditional_fit: 1, manual_review: 2, needs_adviser_input: 3, not_fit: 4 };
  const byElig = [...bankReports].sort((a, b) =>
    b.eligibilityScore - a.eligibilityScore ||
    (fitOrder[a.fitStatus] ?? 99) - (fitOrder[b.fitStatus] ?? 99) ||
    a.failedChecks.length - b.failedChecks.length ||
    a.missingInputs.length - b.missingInputs.length,
  );
  const byLtv = [...bankReports].sort((a, b) => b.ltvScore - a.ltvScore);
  const byManualRisk = [...bankReports].sort((a, b) => a.manualReviewRiskScore - b.manualReviewRiskScore);

  return {
    generatedAt: new Date().toISOString(),
    intent,
    selectedBanks,
    caseSummary: facts,
    overallSummary,
    rankings: {
      highestIncomeRecognition: byIncome.slice(0, 8),
      highestEligibility: byElig.slice(0, 8),
      highestLtv: byLtv.slice(0, 8),
      lowestManualReviewRisk: byManualRisk.slice(0, 8),
    },
    bankReports,
  };
}

// ── Per-bank evaluation ────────────────────────────────────────────────────

function mkCheck(
  row: PolicySearchRow,
  result: PolicyFitCheck['result'],
  reason: string,
  caseValue?: PolicyFitCheck['caseValue'],
): PolicyFitCheck {
  return {
    checkType: row.canonical_attribute,
    canonicalAttribute: row.canonical_attribute,
    policyValue: row.value ?? row.normalized_value,
    caseValue,
    result,
    reason,
    policyRef: row.policy_ref,
    dataStatus: row.data_status,
    valueStatus: row.value_status,
  };
}

function evaluateBank(
  bank: string,
  variant: string | null,
  rows: PolicySearchRow[],
  facts: PolicyFitCaseFacts,
): BankPolicyFitResult {
  const passed: PolicyFitCheck[] = [];
  const failed: PolicyFitCheck[] = [];
  const missing: PolicyFitCheck[] = [];
  const manual: PolicyFitCheck[] = [];
  const documents: PolicyFitCheck[] = [];
  const fees: PolicyFitCheck[] = [];
  const incomeNotes: PolicyFitCheck[] = [];
  const adviserActions: string[] = [];

  let incomeRecognitionScore = 0;
  let eligibilityScore = 0;
  let ltvScore = 0;
  let documentBurdenScore = 0;
  let manualReviewRiskScore = 0;
  let maxLtv: number | null = null;

  for (const row of rows) {
    const attr = lc(row.canonical_attribute);
    const cat = lc(row.policy_category);
    const value = row.value ?? row.normalized_value;
    const unclear = isUnclear(row);
    const isManual = isManualReview(value);

    // Manual review aggregation
    if (isManual) {
      manual.push(mkCheck(row, 'manual_review', 'Policy value indicates case-by-case / discretionary handling.'));
      manualReviewRiskScore += 1;
      eligibilityScore -= 1.5;
    }

    // A. Max LTV
    if (attr === 'max_ltv' || attr.includes('max_ltv') || attr.endsWith('_ltv')) {
      const polLtv = parsePercent(value);
      if (polLtv != null) {
        if (maxLtv == null || polLtv > maxLtv) maxLtv = polLtv;
        if (facts.requestedLtv == null) {
          missing.push(mkCheck(row, 'missing_input', 'Property value or loan amount missing — cannot compute requested LTV.', null));
          eligibilityScore -= 1;
        } else if (facts.requestedLtv <= polLtv) {
          passed.push(mkCheck(row, 'pass', `Requested LTV ${facts.requestedLtv.toFixed(1)}% ≤ policy max ${polLtv}%.`, facts.requestedLtv));
          eligibilityScore += 2;
        } else {
          const result: PolicyFitCheck['result'] =
            facts.propertyValue && facts.propertyValue * (polLtv / 100) > 0 ? 'conditional' : 'fail';
          (result === 'conditional' ? failed : failed).push(
            mkCheck(row, result, `Requested LTV ${facts.requestedLtv.toFixed(1)}% exceeds policy max ${polLtv}%. Reduce loan to ~AED ${Math.round((facts.propertyValue ?? 0) * polLtv / 100).toLocaleString()}.`, facts.requestedLtv),
          );
          eligibilityScore -= 3;
          adviserActions.push(`Reduce loan to fit ${polLtv}% LTV at ${bank}.`);
        }
      } else if (unclear) {
        manual.push(mkCheck(row, 'unclear_policy', 'Max LTV value unclear — needs confirmation.'));
      }
      continue;
    }

    // B. Min income / minimum salary
    if (attr.includes('min_income') || attr.includes('min_salary') || attr.includes('minimum_salary')) {
      const polMin = parseAed(value);
      if (polMin != null) {
        if (facts.totalIncome == null) {
          missing.push(mkCheck(row, 'missing_input', 'Total income missing.'));
          eligibilityScore -= 1;
        } else if (facts.totalIncome >= polMin) {
          passed.push(mkCheck(row, 'pass', `Income AED ${facts.totalIncome.toLocaleString()} meets min AED ${polMin.toLocaleString()}.`, facts.totalIncome));
          eligibilityScore += 2;
          incomeRecognitionScore += 1;
        } else {
          failed.push(mkCheck(row, 'fail', `Income AED ${facts.totalIncome.toLocaleString()} below policy min AED ${polMin.toLocaleString()}.`, facts.totalIncome));
          eligibilityScore -= 3;
        }
      } else if (unclear) {
        manual.push(mkCheck(row, 'unclear_policy', 'Min salary value unclear.'));
      }
      continue;
    }

    // C. Min/Max loan amount
    if (attr.includes('min_loan_amount') || attr.includes('max_loan_amount')) {
      const lim = parseAed(value);
      if (lim != null && facts.requestedLoanAmount != null) {
        const isMin = attr.includes('min');
        const ok = isMin ? facts.requestedLoanAmount >= lim : facts.requestedLoanAmount <= lim;
        if (ok) { passed.push(mkCheck(row, 'pass', `Loan AED ${facts.requestedLoanAmount.toLocaleString()} ${isMin ? '≥ min' : '≤ max'} AED ${lim.toLocaleString()}.`)); eligibilityScore += 1; }
        else { failed.push(mkCheck(row, 'fail', `Loan AED ${facts.requestedLoanAmount.toLocaleString()} ${isMin ? '< min' : '> max'} AED ${lim.toLocaleString()}.`)); eligibilityScore -= 2; }
      } else if (facts.requestedLoanAmount == null) {
        missing.push(mkCheck(row, 'missing_input', 'Requested loan amount missing.'));
      }
      continue;
    }

    // D. Min LOS
    if (attr.includes('min_los') || attr.includes('length_of_service')) {
      const polM = parseMonths(value);
      if (polM != null) {
        if (facts.losMonths == null) {
          missing.push(mkCheck(row, 'missing_input', `LOS required (policy ${polM} months) — adviser to provide.`));
          adviserActions.push('Provide Length of Service (months).');
          eligibilityScore -= 0.5;
        } else if (facts.losMonths >= polM) {
          passed.push(mkCheck(row, 'pass', `LOS ${facts.losMonths}m ≥ policy ${polM}m.`)); eligibilityScore += 1;
        } else {
          failed.push(mkCheck(row, 'fail', `LOS ${facts.losMonths}m < policy ${polM}m.`)); eligibilityScore -= 2;
        }
      }
      continue;
    }

    // E. Min LOB
    if (attr.includes('min_lob') || attr.includes('length_of_business')) {
      const polM = parseMonths(value);
      if (polM != null) {
        if (facts.lobMonths == null) {
          missing.push(mkCheck(row, 'missing_input', `LOB required (policy ${polM} months).`));
          adviserActions.push('Provide Length of Business (months).');
          eligibilityScore -= 0.5;
        } else if (facts.lobMonths >= polM) {
          passed.push(mkCheck(row, 'pass', `LOB ${facts.lobMonths}m ≥ policy ${polM}m.`)); eligibilityScore += 1;
        } else {
          failed.push(mkCheck(row, 'fail', `LOB ${facts.lobMonths}m < policy ${polM}m.`));
          eligibilityScore -= 2;
          adviserActions.push(`${bank} requires LOB ≥ ${polM}m.`);
        }
      }
      continue;
    }

    // F. Income recognition terms
    const incomeKeywords = [
      'consider_rental', 'rental_income', 'consider_bonus', 'variable_pay', 'bonus',
      'commission', 'audit', 'vat', 'dab', 'cto', 'income_calculation',
      'industry_margin', 'company_liabilities', 'income_recognition',
    ];
    if (incomeKeywords.some(k => attr.includes(k))) {
      const positive = isPositiveSignal(value) || /allowed|considered|yes/i.test(value ?? '');
      const negative = isNegativeSignal(value);
      let result: PolicyFitCheck['result'] = 'info_only';
      let reason = `Policy: ${value ?? '—'}`;
      if (unclear) { result = 'unclear_policy'; reason = 'Income recognition policy value unclear.'; }
      else if (positive) { result = 'pass'; incomeRecognitionScore += 2; reason = `Bank supports: ${value}`; }
      else if (negative) { result = 'fail'; incomeRecognitionScore -= 1; reason = `Bank does not support: ${value}`; }
      const check = mkCheck(row, result, reason);
      incomeNotes.push(check);

      // Required-input checks
      if (attr.includes('audit') && facts.auditAvailable == null) {
        missing.push(mkCheck(row, 'missing_input', 'Audit availability not specified.'));
        adviserActions.push('Confirm whether audited financials are available.');
      }
      if (attr.includes('vat') && facts.vatAvailable == null) {
        missing.push(mkCheck(row, 'missing_input', 'VAT availability not specified.'));
        adviserActions.push('Confirm whether VAT returns are available.');
      }
      if (attr.includes('dab') && facts.dab == null) {
        missing.push(mkCheck(row, 'missing_input', 'DAB not entered.'));
        adviserActions.push('Provide Daily Average Balance.');
      }
      if (attr.includes('cto') && facts.cto == null) {
        missing.push(mkCheck(row, 'missing_input', 'CTO not entered.'));
        adviserActions.push('Provide Credit Turnover.');
      }
      if (attr.includes('rental') && facts.rentalIncome == null) {
        missing.push(mkCheck(row, 'missing_input', 'Rental income not entered.'));
      }
      if (attr.includes('bonus') && facts.bonusIncome == null) {
        // optional
      }
      if (attr.includes('lob') && facts.lobMonths == null) {
        missing.push(mkCheck(row, 'missing_input', 'LOB not entered.'));
      }
      continue;
    }

    // G. Transaction rows
    if (cat === 'transaction' || attr.includes('buyout') || attr.includes('equity') || attr.includes('transaction')) {
      const tx = lc(facts.transactionType);
      const matchesTx =
        (attr.includes('buyout') && tx.includes('buyout')) ||
        (attr.includes('equity') && tx.includes('equity')) ||
        (tx && attr.includes(tx));
      if (!facts.transactionType) {
        const c = mkCheck(row, 'info_only', `Transaction policy: ${value ?? '—'} (case transaction type not set)`);
        passed.length; // no-op
        incomeNotes.length;
        // not added to passed/failed
        if (isManual) manual.push(c);
      } else if (matchesTx) {
        if (isPositiveSignal(value)) { passed.push(mkCheck(row, 'pass', `Bank supports ${facts.transactionType}: ${value}`)); eligibilityScore += 1; }
        else if (isNegativeSignal(value)) { failed.push(mkCheck(row, 'fail', `Bank does not support ${facts.transactionType}: ${value}`)); eligibilityScore -= 2; }
        else if (unclear) manual.push(mkCheck(row, 'unclear_policy', 'Transaction support unclear.'));
        else passed.push(mkCheck(row, 'info_only', `Transaction policy: ${value ?? '—'}`));
      }
      continue;
    }

    // H. Documents
    if (cat === 'document' || attr.includes('document') || attr.includes('doc_required')) {
      documents.push(mkCheck(row, unclear ? 'unclear_policy' : 'info_only', value ?? '—'));
      documentBurdenScore += 1;
      continue;
    }

    // I. Fee / TAT
    if (cat === 'fee' || cat === 'tat_validity' || attr.includes('fee') || attr.includes('tat')) {
      fees.push(mkCheck(row, unclear ? 'unclear_policy' : 'info_only', value ?? '—'));
      continue;
    }

    // Generic eligibility category
    if (cat === 'eligibility') {
      if (unclear) manual.push(mkCheck(row, 'unclear_policy', `Eligibility value unclear: ${value ?? '—'}`));
      else if (isPositiveSignal(value)) { passed.push(mkCheck(row, 'pass', `${row.canonical_attribute}: ${value}`)); eligibilityScore += 0.5; }
      else if (isNegativeSignal(value)) { failed.push(mkCheck(row, 'fail', `${row.canonical_attribute}: ${value}`)); eligibilityScore -= 1; }
    }
  }

  if (maxLtv != null) ltvScore = maxLtv;

  // Fit status logic
  const hardFail = failed.some(f => f.result === 'fail');
  const blockingMissing = missing.length >= 3;
  let fitStatus: BankPolicyFitResult['fitStatus'];
  if (hardFail) fitStatus = 'not_fit';
  else if (blockingMissing) fitStatus = 'needs_adviser_input';
  else if (manualReviewRiskScore >= 2) fitStatus = 'manual_review';
  else if (manual.some(m => m.result === 'unclear_policy') || missing.length > 0) fitStatus = 'conditional_fit';
  else if (passed.length >= 3) fitStatus = 'fit';
  else fitStatus = 'conditional_fit';

  const summaryParts: string[] = [];
  summaryParts.push(`${passed.length} passed, ${failed.length} failed, ${missing.length} missing input${missing.length === 1 ? '' : 's'}.`);
  if (manual.length > 0) summaryParts.push(`${manual.length} manual-review item${manual.length === 1 ? '' : 's'}.`);
  if (maxLtv != null) summaryParts.push(`Max LTV ${maxLtv}%.`);

  return {
    bank,
    productVariant: variant,
    fitStatus,
    incomeRecognitionScore: round(incomeRecognitionScore),
    eligibilityScore: round(eligibilityScore),
    ltvScore: round(ltvScore),
    documentBurdenScore: round(documentBurdenScore),
    manualReviewRiskScore: round(manualReviewRiskScore),
    matchedPolicyTerms: rows.length,
    passedChecks: passed,
    failedChecks: failed,
    missingInputs: missing,
    manualReviewItems: manual,
    documentRequirements: documents,
    feeAndTatNotes: fees,
    incomeRecognitionNotes: incomeNotes,
    adviserActions: Array.from(new Set(adviserActions)),
    summary: summaryParts.join(' '),
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
