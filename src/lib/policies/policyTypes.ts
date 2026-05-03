export interface PolicyTerm {
  id: string;
  policy_ref: string | null;
  bank: string | null;
  segment: string | null;
  employment_type: string | null;
  product_variant: string | null;
  raw_attribute: string | null;
  canonical_attribute: string | null;
  policy_category: string | null;
  target_module: string | null;
  value: string | null;
  normalized_value: string | null;
  value_status: string | null;
  data_status: string | null;
  attribute_description: string | null;
  cleaning_notes: string | null;
  source_tab: string | null;
  ready_for_search: boolean | null;
  ready_for_rule_engine: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface PolicyFiltersState {
  bank: string[];
  segment: string[];
  employment_type: string[];
  product_variant: string[];
  policy_category: string[];
  canonical_attribute: string[];
  value_status: string[];
  data_status: string[];
  source_tab: string[];
  quickChip: string | null;
}

export const EMPTY_FILTERS: PolicyFiltersState = {
  bank: [], segment: [], employment_type: [], product_variant: [],
  policy_category: [], canonical_attribute: [], value_status: [],
  data_status: [], source_tab: [], quickChip: null,
};

export type SortKey =
  | 'relevance' | 'bank_asc' | 'category' | 'attribute'
  | 'recent' | 'data_status' | 'value_status';

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'relevance', label: 'Search relevance' },
  { value: 'bank_asc', label: 'Bank A–Z' },
  { value: 'category', label: 'Category' },
  { value: 'attribute', label: 'Attribute' },
  { value: 'recent', label: 'Recently updated' },
  { value: 'data_status', label: 'Data status' },
  { value: 'value_status', label: 'Value status' },
];

export const QUICK_CHIPS: { key: string; label: string; match?: { field: keyof PolicyTerm; values: string[] } }[] = [
  { key: 'max_ltv', label: 'Max LTV' },
  { key: 'min_salary', label: 'Minimum Salary' },
  { key: 'self_employed', label: 'Self-Employed' },
  { key: 'low_doc', label: 'Low Doc' },
  { key: 'dab', label: 'DAB' },
  { key: 'vat', label: 'VAT' },
  { key: 'rental_income', label: 'Rental Income' },
  { key: 'buyout', label: 'Buyout' },
  { key: 'equity_release', label: 'Equity Release' },
  { key: 'documents', label: 'Documents' },
  { key: 'fees', label: 'Fees' },
  { key: 'tat', label: 'TAT' },
  { key: 'needs_review', label: 'Needs Review' },
  { key: 'formula_needs_update', label: 'Formula Needs Update' },
];

export const FLAG_TYPES = [
  { value: 'to_be_updated', label: 'To Be Updated' },
  { value: 'unclear', label: 'Unclear' },
  { value: 'incorrect', label: 'Incorrect' },
  { value: 'outdated', label: 'Outdated' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'important', label: 'Important' },
  { value: 'convert_to_rule', label: 'Convert to Rule' },
  { value: 'needs_bank_confirmation', label: 'Needs Bank Confirmation' },
] as const;

export const SEARCH_FIELDS = [
  'bank', 'segment', 'employment_type', 'product_variant',
  'raw_attribute', 'canonical_attribute', 'policy_category',
  'value', 'normalized_value', 'attribute_description', 'source_tab',
] as const;
