/**
 * Product Matching Engine — selects the best product per bank
 * based on applicant profile and preferences.
 *
 * Extracted from QualifyNew.tsx product selection logic.
 */

import type { ProductData } from '@/components/results/CostBreakdownSection';

export type ProductRow = ProductData & {
  active?: boolean | null;
  life_ins_monthly?: number | string | null;
  mortgage_type?: string | null;
  processing_fee?: number | string | null;
  prop_ins_annual?: number | string | null;
  product_type?: string | null;
  residency?: string | null;
  segment?: string | null;
  status?: string | null;
  transaction_type?: string | null;
  validity_end?: string | null;
};

export interface ProductSelectionContext {
  applicantResidency: string | null;
  applicantSegment: string | null;
  preferredFixedMonths: number;
  preferredTransactionType: string;
  salaryTransfer: boolean | 'stl' | 'nstl' | 'both';
}

export const DEFAULT_COMPARISON_FIXED_MONTHS = 24;

function normalizeMatchValue(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]+/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeProcessingFeePercent(value: number | null): number | null {
  if (value === null) return null;
  if (value > 0 && value < 0.5) return value * 100;
  if (value > 10) return null;
  return value;
}

function normalizeRateToDecimal(rate: number | null): number | null {
  if (rate === null) return null;
  return rate > 1 ? rate / 100 : rate;
}

export function getApplicantSegment(employmentType: string): string | null {
  const normalized = normalizeMatchValue(employmentType);
  if (!normalized) return null;
  if (normalized.includes('salary')) return 'salaried';
  if (normalized.includes('self')) return 'self_employed';
  return null;
}

export function getApplicantResidency(residencyStatus: string): string | null {
  const normalized = normalizeMatchValue(residencyStatus);
  if (!normalized) return null;
  return normalized === 'non_resident' ? 'non_resident' : 'resident_expat';
}

function parseFixedPeriodMonths(product: Pick<ProductRow, 'fixed_period' | 'fixed_period_months'>): number | null {
  const fixedPeriodMonths = toNullableNumber(product.fixed_period_months);
  if (fixedPeriodMonths !== null) return fixedPeriodMonths;

  const fixedPeriod = product.fixed_period?.toLowerCase().trim();
  if (!fixedPeriod || fixedPeriod.includes('variable')) return null;

  const yearMatch = fixedPeriod.match(/(\d+)\s*yr/);
  if (yearMatch) return Number(yearMatch[1]) * 12;

  const monthMatch = fixedPeriod.match(/(\d+)\s*(?:month|months|m)\b/);
  if (monthMatch) return Number(monthMatch[1]);

  return null;
}

function formatRateValue(rate: number): string {
  return rate.toFixed(2);
}

function matchesApplicantSegment(productSegment: string | null | undefined, applicantSegment: string | null): boolean {
  if (!applicantSegment) return true;
  const normalized = normalizeMatchValue(productSegment);
  if (!normalized || ['all', 'any', 'both'].includes(normalized)) return true;
  return normalized === applicantSegment;
}

function matchesApplicantResidency(productResidency: string | null | undefined, applicantResidency: string | null): boolean {
  if (!applicantResidency) return true;
  const normalized = normalizeMatchValue(productResidency);
  if (!normalized || ['all', 'any', 'both'].includes(normalized)) return true;
  if (applicantResidency === 'non_resident') return normalized === 'non_resident';
  return ['resident_expat', 'resident', 'expat', 'uae_national', 'national'].includes(normalized);
}

function getTransactionMatchPriority(productTxnType: string | null | undefined, preferredTxnType: string): number {
  const np = normalizeMatchValue(productTxnType);
  const nPref = normalizeMatchValue(preferredTxnType);
  if (!nPref) return 0;
  if (!np || ['all', 'any', 'both'].includes(np)) return 1;
  if (np === nPref) return 0;
  if (nPref === 'handover_resale' && ['handover', 'resale'].includes(np)) return 1;
  if (nPref === 'buyout_equity' && np === 'buyout') return 1;
  return 2;
}

function formatMatchedRateLabel(product: ProductRow): string {
  const fixedMonths = parseFixedPeriodMonths(product);
  const fixedLabel = fixedMonths
    ? `${fixedMonths % 12 === 0 ? `${fixedMonths / 12}yr` : `${fixedMonths}m`} fixed`
    : 'variable';
  const stlLabel = product.salary_transfer ? ' STL' : '';
  const rate = normalizeRateToDecimal(toNullableNumber(product.rate)) ?? 0;
  return `Rate: ${formatRateValue(rate * 100)}% (${fixedLabel}${stlLabel})`;
}

export function selectPreferredProduct(products: ProductRow[], context: ProductSelectionContext): ProductData | null {
  if (products.length === 0) return null;

  const matched = products.filter(p =>
    matchesApplicantSegment(p.segment, context.applicantSegment) &&
    matchesApplicantResidency(p.residency, context.applicantResidency)
  );

  const rated = matched
    .map(p => ({
      ...p,
      fixedMonths: parseFixedPeriodMonths(p),
      numericRate: normalizeRateToDecimal(toNullableNumber(p.rate)),
      transactionPriority: getTransactionMatchPriority(p.transaction_type, context.preferredTransactionType),
    }))
    .filter(p => p.numericRate !== null);

  if (rated.length === 0) return null;

  const chosen = [...rated].sort((a, b) => {
    if (a.transactionPriority !== b.transactionPriority) return a.transactionPriority - b.transactionPriority;

    // STL preference — 'stl'/true/both prefer STL, 'nstl'/false prefer NSTL
    if (context.salaryTransfer === 'stl' || context.salaryTransfer === true || context.salaryTransfer === 'both') {
      const stA = a.salary_transfer === true ? 0 : 1;
      const stB = b.salary_transfer === true ? 0 : 1;
      if (stA !== stB) return stA - stB;
    } else if (context.salaryTransfer === 'nstl' || context.salaryTransfer === false) {
      const stA = a.salary_transfer === false ? 0 : 1;
      const stB = b.salary_transfer === false ? 0 : 1;
      if (stA !== stB) return stA - stB;
    }

    const fpA = a.fixedMonths === context.preferredFixedMonths ? 0 : a.fixedMonths === null ? 2 : 1;
    const fpB = b.fixedMonths === context.preferredFixedMonths ? 0 : b.fixedMonths === null ? 2 : 1;
    if (fpA !== fpB) return fpA - fpB;

    const dA = a.fixedMonths === null ? Infinity : Math.abs(a.fixedMonths - context.preferredFixedMonths);
    const dB = b.fixedMonths === null ? Infinity : Math.abs(b.fixedMonths - context.preferredFixedMonths);
    if (dA !== dB) return dA - dB;

    return (a.numericRate ?? Infinity) - (b.numericRate ?? Infinity);
  })[0];

  if (!chosen) return null;

  return {
    bank_id: chosen.bank_id,
    rate: chosen.numericRate,
    fixed_period_months: chosen.fixedMonths,
    processing_fee_percent: normalizeProcessingFeePercent(toNullableNumber(chosen.processing_fee_percent) ?? toNullableNumber(chosen.processing_fee)),
    valuation_fee: toNullableNumber(chosen.valuation_fee),
    life_ins_monthly_percent: toNullableNumber(chosen.life_ins_monthly_percent) ?? toNullableNumber(chosen.life_ins_monthly),
    prop_ins_annual_percent: toNullableNumber(chosen.prop_ins_annual_percent) ?? toNullableNumber(chosen.prop_ins_annual),
    follow_on_margin: toNullableNumber(chosen.follow_on_margin),
    eibor_benchmark: chosen.eibor_benchmark ?? null,
    salary_transfer: chosen.salary_transfer ?? false,
    fixed_period: chosen.fixed_period ?? null,
    comparison_fixed_months: context.preferredFixedMonths,
    rate_label: formatMatchedRateLabel(chosen),
  };
}

/**
 * Filter raw product rows from Supabase into active, valid products.
 */
export function filterActiveProducts(rows: ProductRow[]): ProductRow[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return rows.filter(p => {
    if (!p.bank_id || toNullableNumber(p.rate) === null) return false;
    if (typeof p.active === 'boolean' && !p.active) return false;
    if (p.status && normalizeMatchValue(p.status) !== 'active') return false;
    if (p.validity_end) {
      const end = new Date(p.validity_end);
      end.setHours(0, 0, 0, 0);
      if (!(end > today)) return false;
    }
    return true;
  });
}

/**
 * Given filtered products and a context, returns a map of bankId → best ProductData.
 */
export function matchProductsToBank(
  products: ProductRow[],
  context: ProductSelectionContext
): Record<string, ProductData> {
  const grouped = products.reduce<Record<string, ProductRow[]>>((acc, p) => {
    if (!acc[p.bank_id]) acc[p.bank_id] = [];
    acc[p.bank_id].push(p);
    return acc;
  }, {});

  const map: Record<string, ProductData> = {};
  for (const [bankId, bankProducts] of Object.entries(grouped)) {
    const selected = selectPreferredProduct(bankProducts, context);
    if (selected) map[bankId] = selected;
  }
  return map;
}
