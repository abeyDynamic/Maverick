import type { PolicyFitIntent } from './policyFitTypes';

// Canonical bank name -> aliases (lowercased, no punctuation)
const BANK_ALIASES: Record<string, string[]> = {
  'ENBD': ['enbd', 'emirates nbd', 'emirates n b d'],
  'ADCB': ['adcb', 'abu dhabi commercial'],
  'ADIB': ['adib', 'abu dhabi islamic'],
  'DIB': ['dib', 'dubai islamic'],
  'EIB': ['eib', 'emirates islamic'],
  'CBD': ['cbd', 'commercial bank of dubai'],
  'FAB': ['fab', 'first abu dhabi'],
  'HSBC': ['hsbc'],
  'Mashreq': ['mashreq', 'mashreq bank', 'mashreqbank'],
  'NBF': ['nbf', 'national bank of fujairah'],
  'RAK Bank': ['rak', 'rak bank', 'rakbank', 'national bank of ras al khaimah'],
  'Standard Chartered': ['scb', 'standard chartered', 'stanchart'],
  'Arab Bank': ['arab bank'],
  'Ajman Bank': ['ajman bank'],
  'Al Hilal Bank': ['al hilal', 'al hilal bank', 'alhilal'],
  'Bank of Baroda': ['bank of baroda', 'baroda'],
  'Sharjah Islamic Bank': ['sib', 'sharjah islamic', 'sharjah islamic bank'],
  'UAB': ['uab', 'united arab bank'],
};

function safeLower(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function normalize(s: unknown): string {
  return safeLower(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parsePolicyFitIntent(
  message: string,
  availableBanks: string[],
): {
  intent: PolicyFitIntent;
  selectedBanks: string[];
  includeAllBanks: boolean;
  focusAreas: string[];
} {
  const text = normalize(message);
  const focusAreas: string[] = [];

  // Match banks by alias, then resolve back to availableBanks
  const matchedCanonicals = new Set<string>();
  for (const [canonical, aliases] of Object.entries(BANK_ALIASES)) {
    for (const a of aliases) {
      // word-boundary-ish match
      const re = new RegExp(`(^|[^a-z0-9])${a.replace(/ /g, ' +')}([^a-z0-9]|$)`, 'i');
      if (re.test(text)) {
        matchedCanonicals.add(canonical);
        break;
      }
    }
  }

  const selectedBanks: string[] = [];
  const lowerAvail = availableBanks.map(b => ({ raw: b, n: normalize(b) }));
  for (const canonical of matchedCanonicals) {
    const aliases = BANK_ALIASES[canonical];
    const hit = lowerAvail.find(b =>
      b.n === normalize(canonical) ||
      aliases.some(a => b.n.includes(normalize(a)) || normalize(a).includes(b.n)),
    );
    if (hit && !selectedBanks.includes(hit.raw)) selectedBanks.push(hit.raw);
    else if (!hit && !selectedBanks.includes(canonical)) selectedBanks.push(canonical);
  }

  const includeAllBanks = /\ball banks?\b|across all banks|every bank|each bank/.test(text);

  // Focus area heuristics
  if (/\baudit/.test(text)) focusAreas.push('audit');
  if (/\bvat\b/.test(text)) focusAreas.push('vat');
  if (/\bdab\b|daily average balance/.test(text)) focusAreas.push('dab');
  if (/\bcto\b|credit turnover/.test(text)) focusAreas.push('cto');
  if (/low doc/.test(text)) focusAreas.push('low_doc');
  if (/full doc/.test(text)) focusAreas.push('full_doc');
  if (/rental/.test(text)) focusAreas.push('rental');
  if (/bonus/.test(text)) focusAreas.push('bonus');
  if (/commission/.test(text)) focusAreas.push('commission');
  if (/buyout/.test(text)) focusAreas.push('buyout');
  if (/equity/.test(text)) focusAreas.push('equity');
  if (/lob|length of business/.test(text)) focusAreas.push('lob');
  if (/los|length of service/.test(text)) focusAreas.push('los');
  if (/document/.test(text)) focusAreas.push('documents');

  // Intent detection — order matters
  let intent: PolicyFitIntent;
  if (/highest income|income consideration|recognize income|consider.*income|highest.*income/.test(text)) {
    intent = 'highest_income_recognition';
  } else if (/highest eligibility|best eligibility|best fit|strongest.*eligibility|strongest for/.test(text)) {
    intent = 'highest_eligibility';
  } else if (/highest ltv|max(?:imum)? ltv|best ltv/.test(text)) {
    intent = 'highest_ltv';
  } else if (/document/.test(text)) {
    intent = 'document_gap_review';
  } else if (/manual review|exception|case by case|deviation|credit discretion/.test(text)) {
    intent = 'manual_review_flags';
  } else if (/buyout|equity release|transaction|support.*buyout/.test(text)) {
    intent = 'transaction_fit';
  } else if (/audit|\bvat\b|\bdab\b|\bcto\b|low doc|full doc/.test(text)) {
    intent = focusAreas.length > 1 ? 'income_policy_comparison' : 'route_suggestion';
  } else if (/blocked|fail|reject/.test(text)) {
    intent = 'highest_eligibility';
  } else if (/compare/.test(text) && selectedBanks.length >= 2) {
    intent = 'policy_fit_for_selected_banks';
  } else if (selectedBanks.length > 0) {
    intent = 'policy_fit_for_selected_banks';
  } else if (includeAllBanks) {
    intent = 'policy_fit_all_banks';
  } else {
    intent = 'general_policy_question';
  }

  return { intent, selectedBanks, includeAllBanks, focusAreas };
}
