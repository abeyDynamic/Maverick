import { PolicyFiltersState, PolicyTerm, SEARCH_FIELDS, SortKey } from './policyTypes';

const QUICK_CHIP_KEYWORDS: Record<string, string[]> = {
  max_ltv: ['ltv', 'loan to value'],
  min_salary: ['minimum salary', 'min salary', 'salary'],
  self_employed: ['self-employed', 'self employed'],
  low_doc: ['low doc', 'low-doc', 'lowdoc'],
  dab: ['dab', 'debt against business'],
  vat: ['vat'],
  rental_income: ['rental'],
  buyout: ['buyout', 'buy-out'],
  equity_release: ['equity'],
  documents: ['document'],
  fees: ['fee'],
  tat: ['tat', 'turnaround'],
};

export function applyClientFilters(
  rows: PolicyTerm[],
  search: string,
  filters: PolicyFiltersState,
  sort: SortKey,
): PolicyTerm[] {
  const q = search.trim().toLowerCase();
  let out = rows.filter((r) => {
    if (q) {
      const hit = SEARCH_FIELDS.some((f) => (r[f] ?? '').toString().toLowerCase().includes(q));
      if (!hit) return false;
    }
    for (const key of ['bank','segment','employment_type','product_variant','policy_category','canonical_attribute','value_status','data_status','source_tab'] as const) {
      const sel = filters[key];
      if (sel.length && !sel.includes((r[key] ?? '') as string)) return false;
    }
    if (filters.quickChip) {
      if (filters.quickChip === 'needs_review') {
        if (r.data_status !== 'mapped_needs_review') return false;
      } else if (filters.quickChip === 'formula_needs_update') {
        if (r.value_status !== 'unclear') return false;
      } else {
        const kws = QUICK_CHIP_KEYWORDS[filters.quickChip] ?? [];
        const hay = `${r.canonical_attribute ?? ''} ${r.raw_attribute ?? ''} ${r.policy_category ?? ''} ${r.value ?? ''}`.toLowerCase();
        if (!kws.some((k) => hay.includes(k))) return false;
      }
    }
    return true;
  });

  const cmp = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '');
  switch (sort) {
    case 'bank_asc': out.sort((a,b)=>cmp(a.bank,b.bank)); break;
    case 'category': out.sort((a,b)=>cmp(a.policy_category,b.policy_category)); break;
    case 'attribute': out.sort((a,b)=>cmp(a.canonical_attribute,b.canonical_attribute)); break;
    case 'data_status': out.sort((a,b)=>cmp(a.data_status,b.data_status)); break;
    case 'value_status': out.sort((a,b)=>cmp(a.value_status,b.value_status)); break;
    case 'recent':
      out.sort((a,b)=>(b.updated_at ?? '').localeCompare(a.updated_at ?? '')); break;
    default: break;
  }
  return out;
}

export function uniqueValues(rows: PolicyTerm[], field: keyof PolicyTerm): string[] {
  const set = new Set<string>();
  rows.forEach((r) => { const v = r[field]; if (v != null && v !== '') set.add(String(v)); });
  return Array.from(set).sort();
}
