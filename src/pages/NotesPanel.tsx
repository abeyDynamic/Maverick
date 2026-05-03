import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  MessageSquare, X, Sparkles, ChevronDown, ChevronUp,
  Clock, ExternalLink, Send, CheckCircle2, AlertCircle, Edit2,
} from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { COUNTRIES, EMIRATES, calculateStressEMI, formatCurrency } from '@/lib/mortgage-utils';
import { buildWhatIfAnalysis } from '@/lib/case/stage1-engine';
import type { CaseBankResult } from '@/lib/case/stage1-engine';
import type { CaseLiabilityField } from '@/lib/case/types';
import type { PolicyFitCaseFacts } from '@/lib/policies/policyFitTypes';
import { parsePolicyFitIntent } from '@/lib/policies/policyFitIntentParser';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ClientNote {
  id: string;
  note_text: string;
  created_at: string;
  session_label: string | null;
}

export interface ExtractionResult {
  client_name: string | null;
  segment: string | null;
  residency: string | null;
  nationality: string | null;
  dob: string | null;
  employment_type: string | null;
  employer?: string | null;
  property_value: number | null;
  loan_amount: number | null;
  ltv: number | null;
  tenor_months: number | null;
  emirate: string | null;
  transaction_type: string | null;
  property_type: string | null;
  purpose: string | null;
  salary_transfer: boolean | null;
  income_fields: Array<{ income_type: string; amount: number; percent_considered: number; recurrence: string }>;
  liability_fields: Array<{ liability_type: string; amount: number; credit_card_limit: number; recurrence: string; closed_before_application: boolean }>;
  tier2: {
    length_of_service_months: number | null;
    length_of_business_months: number | null;
    aecb_score: number | null;
    salary_credits_count: number | null;
    probation_confirmed: boolean | null;
    employer_category: string | null;
    visa_status: string | null;
    country_of_income: string | null;
    foreign_bureau_available: boolean | null;
    foreign_bureau_score: number | null;
    currency: string | null;
  };
  contact: {
    phone: string | null;
    email: string | null;
    alternate_phone: string | null;
    address: string | null;
  };
  self_employed?: {
    business_name: string | null;
    length_of_business_months: number | null;
    ownership_share_percent: number | null;
    income_route: string | null;   // matches SEIncomeRoute values
    doc_type: 'full_doc' | 'low_doc' | null;
  } | null;
  /** Supporting financial evidence — NOT applied to DBR by default. */
  income_evidence?: Array<{ label: string; amount: number; unit: 'monthly' | 'annual' | 'balance'; note?: string }>;
  /** Liabilities the AI found but that need adviser confirmation before being added to DBR. */
  liabilities_pending?: Array<{ liability_type: string; amount: number; recurrence: string; reason: string }>;
  documents_available?: string[];
  policy_questions?: string[];
  confidence: { personal: number; property: number; income: number; liabilities: number };
  unclear: string[];
}

export interface WhatIfContext {
  totalIncome: number;
  totalLiabilities: number;
  loanAmount: number;
  stressRate: number;
  tenorMonths: number;
  currentDbr: number;
  eligibleBanks: string[];
  ineligibleBanks: string[];
  bankResults: CaseBankResult[];
  liabilityFields: CaseLiabilityField[];
}

interface NotesPanelProps {
  applicantId?: string;
  clientName?: string;
  onClientNameChange?: (name: string) => void;
  onSave?: () => void;
  isSaving?: boolean;
  lastSaved?: Date | null;
  onExtract: (result: ExtractionResult) => void;
  onRequestSave?: () => Promise<string | undefined>;
  whatIfContext: WhatIfContext;
  embedded?: boolean;
  policyFitCaseFacts?: PolicyFitCaseFacts;
  policyFitBanks?: string[];
}

// ── Missing field definitions ──────────────────────────────────────────────

interface MissingField {
  key: string;
  label: string;
  question: string;
  priority: 'critical' | 'important' | 'optional';
  inputType: 'text' | 'number' | 'select' | 'form';
  options?: string[];
}

function getMissingFields(ext: ExtractionResult): MissingField[] {
  const missing: MissingField[] = [];

  if (!ext.segment) missing.push({ key: 'segment', label: 'Client segment', question: 'Are they salaried, self-employed, or based outside UAE?', priority: 'critical', inputType: 'select', options: ['resident_salaried', 'self_employed', 'non_resident'] });
  if (ext.income_fields.length === 0) missing.push({ key: 'income', label: 'Income', question: 'What is the basic salary per month?', priority: 'critical', inputType: 'number' });
  if (!ext.property_value) missing.push({ key: 'property_value', label: 'Property value', question: 'What is the purchase price of the property?', priority: 'critical', inputType: 'number' });
  if (!ext.loan_amount && !ext.ltv) missing.push({ key: 'ltv', label: 'LTV / Loan amount', question: 'How much financing do they need? Or what LTV are they looking at?', priority: 'critical', inputType: 'number' });
  if (!ext.nationality) missing.push({ key: 'nationality', label: 'Nationality', question: 'What is the client\'s nationality?', priority: 'important', inputType: 'select', options: COUNTRIES });
  if (!ext.emirate) missing.push({ key: 'emirate', label: 'Emirate', question: 'Which emirate is the property in?', priority: 'important', inputType: 'select', options: EMIRATES.map(e => e.value) });
  if (!ext.transaction_type) missing.push({ key: 'transaction_type', label: 'Transaction type', question: 'Is this a resale, off-plan, handover, or buyout?', priority: 'important', inputType: 'select', options: ['resale', 'off_plan', 'handover', 'buyout', 'equity'] });
  if (!ext.residency) missing.push({ key: 'residency', label: 'Residency status', question: 'Are they a UAE national, resident expat, or non-resident?', priority: 'important', inputType: 'select', options: ['uae_national', 'resident_expat', 'non_resident'] });
  if (!ext.property_type) missing.push({ key: 'property_type', label: 'Property type', question: 'Apartment, villa, or townhouse?', priority: 'optional', inputType: 'select', options: ['Apartment', 'Villa', 'Townhouse', 'Office Space'] });
  if (!ext.purpose) missing.push({ key: 'purpose', label: 'Purpose', question: 'Is this for self use or investment?', priority: 'optional', inputType: 'select', options: ['Self Use', 'Investment', 'First Home', 'Second Home'] });

  return missing;
}

// ── Rule-based extractor ───────────────────────────────────────────────────

function ruleBasedExtract(notes: string): ExtractionResult {
  const text = notes.toLowerCase();
  const result: ExtractionResult = {
    client_name: null, segment: null, residency: null, nationality: null,
    dob: null, employment_type: null, property_value: null, loan_amount: null,
    ltv: null, tenor_months: null, emirate: null, transaction_type: null, property_type: null,
    purpose: null, salary_transfer: null, income_fields: [], liability_fields: [],
    tier2: {
      length_of_service_months: null, length_of_business_months: null, aecb_score: null,
      salary_credits_count: null, probation_confirmed: null, employer_category: null,
      visa_status: null, country_of_income: null, foreign_bureau_available: null,
      foreign_bureau_score: null, currency: null,
    },
    contact: { phone: null, email: null, alternate_phone: null, address: null },
    self_employed: null,
    income_evidence: [],
    liabilities_pending: [],
    documents_available: [],
    policy_questions: [],
    confidence: { personal: 0, property: 0, income: 0, liabilities: 0 }, unclear: [],
  };

  function parseAmount(str: string): number | null {
    const clean = str.replace(/aed|,|\s/gi, '').trim();
    const match = clean.match(/^([\d.]+)(k|m)?$/i);
    if (!match) return null;
    const num = parseFloat(match[1]);
    if (match[2]?.toLowerCase() === 'k') return num * 1000;
    if (match[2]?.toLowerCase() === 'm') return num * 1000000;
    return num;
  }

  // Client name
  const namePatterns = [
    /(?:client(?:'s)?\s+(?:name|is)|for|prepared\s+for|name\s*:)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})[\s,]/m,
  ];
  for (const pattern of namePatterns) {
    const match = notes.match(pattern);
    if (match?.[1] && match[1].length > 2) { result.client_name = match[1].trim(); break; }
  }

  // Nationality
  for (const country of COUNTRIES) {
    if (text.includes(country.toLowerCase())) { result.nationality = country; result.confidence.personal += 0.4; break; }
  }

  // Residency / Segment
  if (text.includes('uae national') || text.includes('emirati')) {
    result.residency = 'uae_national'; result.segment = 'resident_salaried'; result.confidence.personal += 0.3;
  } else if (text.includes('non-resident') || text.includes('non resident') || text.includes('overseas') || text.includes('based abroad')) {
    result.residency = 'non_resident'; result.segment = 'non_resident'; result.confidence.personal += 0.3;
  } else if (text.includes('resident expat') || text.includes('works in uae') || text.includes('salaried in') || text.includes('employed in uae') || text.includes('lives in dubai') || text.includes('lives in abu dhabi')) {
    result.residency = 'resident_expat'; result.segment = 'resident_salaried'; result.confidence.personal += 0.2;
  }

  // Employment type — does NOT change segment (segment is residency-based)
  if (text.includes('self employed') || text.includes('self-employed') || text.includes('business owner') || text.includes('owns a company') || text.includes('owns the company') || text.includes('100% owner') || text.includes('sole owner') || text.includes('sole proprietor')) {
    result.employment_type = 'self_employed'; result.confidence.personal += 0.3;
  } else if (text.includes('salaried') || text.includes('works at') || text.includes('employed at') || text.includes('in the uae')) {
    result.employment_type = 'salaried'; result.confidence.personal += 0.2;
  }
  // Default segment from residency only
  if (!result.segment) {
    if (result.residency === 'non_resident') result.segment = 'non_resident';
    else if (result.employment_type === 'self_employed') result.segment = 'self_employed';
    else if (result.residency) result.segment = 'resident_salaried';
  }

  // DOB
  const dobPatterns = [
    /(?:dob|date\s+of\s+birth|born(?:\s+on)?)\s*:?\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})/i,
    /(?:dob|date\s+of\s+birth|born(?:\s+on)?)\s*:?\s*(\d{4})[/-](\d{1,2})[/-](\d{1,2})/i,
    /(?:dob|date\s+of\s+birth)\s*:?\s*(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/i,
  ];
  const months: Record<string, string> = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
  for (const p of dobPatterns) {
    const m = notes.match(p);
    if (m) {
      try {
        let dateStr = '';
        if (m[3]?.length === 4) dateStr = `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
        else if (m[1]?.length === 4) dateStr = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
        else if (isNaN(Number(m[2]))) dateStr = `${m[3]}-${months[m[2].toLowerCase().substring(0,3)]}-${m[1].padStart(2,'0')}`;
        if (dateStr) { result.dob = dateStr; result.confidence.personal += 0.3; break; }
      } catch { /* ignore */ }
    }
  }

  // Age
  if (!result.dob) {
    const ageMatch = notes.match(/(?:aged?|is|\bage\b)\s+(\d{2})\s*(?:years?|yrs?|y\.o\.)?/i);
    if (ageMatch) {
      const age = parseInt(ageMatch[1]);
      if (age > 18 && age < 85) {
        const birthYear = new Date().getFullYear() - age;
        result.dob = `${birthYear}-07-01`;
        result.confidence.personal += 0.2;
        result.unclear.push(`Age ${age} used — DOB approximated as ${birthYear}-07-01`);
      }
    }
  }

  // Salary transfer
  if (text.includes('no salary transfer') || text.includes('nstl') || text.includes('non-stl') || text.includes('not transfer')) {
    result.salary_transfer = false;
  } else if (text.includes('salary transfer') || text.includes('\bstl\b') || text.includes('transfer salary')) {
    result.salary_transfer = true;
  }

  // Emirate
  for (const em of EMIRATES) {
    if (text.includes(em.label.toLowerCase())) { result.emirate = em.value; result.confidence.property += 0.2; break; }
  }

  // Property value
  const propMatch = notes.match(/(?:property|apartment|villa|flat|prop|unit)\s+(?:value|worth|for|at|priced|is)?\s*(?:aed\s*)?([\d.,]+[km]?)/i)
    || notes.match(/([\d.,]+[km]?)\s*(?:aed)?\s*(?:property|apartment|villa|flat)/i)
    || notes.match(/(?:buy|purchase|buying|looking\s+at)\s+a?\s*(?:property|prop|apartment|villa|flat)?\s+(?:for|at|worth)?\s*(?:aed\s*)?([\d.,]+[km]?)/i)
    || notes.match(/(?:priced?\s+at|asking\s+price|listed\s+at)\s*(?:aed\s*)?([\d.,]+[km]?)/i);
  if (propMatch) { const val = parseAmount(propMatch[propMatch.length - 1]); if (val && val > 100000) { result.property_value = val; result.confidence.property += 0.4; } }

  // LTV
  const ltvMatch = notes.match(/(\d{2,3})\s*%?\s*ltv/i) || notes.match(/ltv\s*(?:of|:)?\s*(\d{2,3})/i) || notes.match(/(\d{2})%\s*(?:down|deposit)/i);
  if (ltvMatch) {
    const v = parseInt(ltvMatch[1]);
    result.ltv = text.includes('down') || text.includes('deposit') ? 100 - v : v;
    result.confidence.property += 0.3;
  }

  // Loan amount
  const loanMatch = notes.match(/loan\s*(?:amount|of|:)?\s*(?:aed\s*)?([\d.,]+[km]?)/i)
    || notes.match(/(?:finance|mortgage|borrow)\s+(?:of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i);
  if (loanMatch) { const val = parseAmount(loanMatch[loanMatch.length - 1]); if (val && val > 50000) { result.loan_amount = val; result.confidence.property += 0.3; } }

  // Calculate missing
  if (result.property_value && result.ltv && !result.loan_amount) result.loan_amount = Math.round(result.property_value * result.ltv / 100);
  if (result.property_value && result.loan_amount && !result.ltv) result.ltv = Math.round((result.loan_amount / result.property_value) * 100);

  // Tenor
  const tenorM = notes.match(/tenor\s*(?:of|:)?\s*(\d{1,2})\s*(years?|yrs?)/i) || notes.match(/(\d{1,2})\s*(?:years?|yrs?)\s+tenor/i);
  if (tenorM) { const yrs = parseInt(tenorM[1]); if (yrs > 0 && yrs <= 30) result.tenor_months = yrs * 12; }
  const tenorMo = notes.match(/tenor\s*(?:of|:)?\s*(\d{2,3})\s*months?/i);
  if (!result.tenor_months && tenorMo) { const mo = parseInt(tenorMo[1]); if (mo >= 12 && mo <= 360) result.tenor_months = mo; }


  // Transaction type — be conservative. "handover" only if explicit handover language.
  if (text.includes('off-plan') || text.includes('off plan')) result.transaction_type = 'off_plan';
  else if (text.includes('buyout') || text.includes('buy out') || text.includes('re-mortgage') || text.includes('remortgage')) result.transaction_type = 'buyout';
  else if (text.includes('equity release') || text.includes('equity')) result.transaction_type = 'equity';
  else if (/\b(handover|completion|developer\s+handover|final\s+payment\s+(?:due\s+)?(?:at|on)\s+handover)\b/i.test(notes)) result.transaction_type = 'handover';
  else if (text.includes('resale') || text.includes('secondary market') || text.includes('ready purchase') || text.includes('ready property') || /\bpurchase\b/.test(text)) result.transaction_type = 'resale';

  // Property type
  if (text.includes('apartment') || text.includes('flat') || text.includes('studio')) result.property_type = 'Apartment';
  else if (text.includes('townhouse') || text.includes('town house')) result.property_type = 'Townhouse';
  else if (text.includes('villa')) result.property_type = 'Villa';
  else if (text.includes('office')) result.property_type = 'Office Space';
  else if (text.includes('warehouse')) result.property_type = 'Warehouse';

  // Purpose
  if (text.includes('investment') || text.includes('to rent') || text.includes('buy to let')) result.purpose = 'Investment';
  else if (text.includes('self use') || text.includes('own use') || text.includes('to live')) result.purpose = 'Self Use';
  else if (text.includes('first home') || text.includes('first time buyer') || text.includes('first property')) result.purpose = 'First Home';
  else if (text.includes('second home')) result.purpose = 'Second Home';

  // ── Income (DBR) — only true monthly income goes into income_fields ──
  // Everything else (turnover, audited profit, DAB, MCTO) is supporting evidence.

  function pushDbr(type: string, amount: number) {
    if (!amount || amount <= 0) return;
    if (result.income_fields.some(f => f.income_type === type)) return;
    result.income_fields.push({ income_type: type, amount, percent_considered: 100, recurrence: 'monthly' });
    result.confidence.income = Math.min(result.confidence.income + 0.3, 1);
  }
  function pushEvidence(label: string, amount: number, unit: 'monthly' | 'annual' | 'balance', note?: string) {
    if (!amount || amount <= 0) return;
    if (result.income_evidence!.some(e => e.label === label)) return;
    result.income_evidence!.push({ label, amount, unit, note });
  }

  // 1. Explicit "monthly DBR income estimate"
  const dbrInc = notes.match(/(?:monthly\s+)?dbr\s+income(?:\s+estimate)?\s*[:=-]?\s*(?:aed\s*)?([\d.,]+[km]?)/i);
  if (dbrInc) pushDbr('Basic Salary', parseAmount(dbrInc[1]) ?? 0);

  // 2. Salary patterns (only if no DBR estimate already present)
  if (result.income_fields.length === 0) {
    const salPatterns = [
      /basic\s+salary\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i,
      /(?:net|monthly)\s+salary\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i,
      /salary\s+(?:is\s+|of\s+|aed\s+)?([\d.,]+[km]?)\s*(?:\/?\s*mo(?:nth)?|per\s+month)/i,
      /earns?\s+(?:aed\s*)?([\d.,]+[km]?)\s*(?:\/?\s*mo(?:nth)?|per\s+month)/i,
    ];
    for (const p of salPatterns) {
      const m = notes.match(p);
      if (m) { pushDbr('Basic Salary', parseAmount(m[1]) ?? 0); break; }
    }
  }

  // 3. Allowances → DBR
  const housing = notes.match(/housing\s+allowance\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i);
  if (housing) pushDbr('Housing Allowance', parseAmount(housing[1]) ?? 0);
  const transport = notes.match(/transport\s+(?:allowance\s+)?(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i);
  if (transport) pushDbr('Transport Allowance', parseAmount(transport[1]) ?? 0);

  // 4. Rental income → DBR (if explicitly /month or "rental income")
  const rental = notes.match(/rental\s+income\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)\s*(?:\/?\s*mo(?:nth)?|per\s+month)?/i);
  if (rental) pushDbr('Rental Income 1', parseAmount(rental[1]) ?? 0);

  // 5. Supporting evidence (NOT applied to DBR)
  const turnover = notes.match(/(?:annual\s+)?turnover\s*[:=-]?\s*(?:aed\s*)?([\d.,]+[km]?)/i);
  if (turnover) pushEvidence('Annual turnover', parseAmount(turnover[1]) ?? 0, 'annual');

  const audited = notes.match(/(?:latest\s+)?audited\s+(?:net\s+)?profit\s*[:=-]?\s*(?:aed\s*)?([\d.,]+[km]?)/i)
    || notes.match(/audited\s+(?:revenue|financial)s?[^.]{0,40}?(?:aed\s*)?([\d.,]+[km]?)/i);
  if (audited) pushEvidence('Audited net profit', parseAmount(audited[1]) ?? 0, 'annual');

  const cto = notes.match(/(?:company\s+cto|company\s+turnover|average\s+monthly\s+credits?)\s*[:=-]?\s*(?:aed\s*)?([\d.,]+[km]?)/i);
  if (cto) pushEvidence('Company CTO (avg monthly credits)', parseAmount(cto[1]) ?? 0, 'monthly');

  const persDab = notes.match(/personal\s+dab\s*[:=-]?\s*(?:aed\s*)?([\d.,]+[km]?)/i);
  if (persDab) pushEvidence('Personal DAB', parseAmount(persDab[1]) ?? 0, 'balance');
  const compDab = notes.match(/company\s+dab\s*[:=-]?\s*(?:aed\s*)?([\d.,]+[km]?)/i);
  if (compDab) pushEvidence('Company DAB', parseAmount(compDab[1]) ?? 0, 'balance');

  const persMcto = notes.match(/personal\s+mcto\s*[:=-]?\s*(?:aed\s*)?([\d.,]+[km]?)/i);
  if (persMcto) pushEvidence('Personal MCTO', parseAmount(persMcto[1]) ?? 0, 'monthly');
  const compMcto = notes.match(/company\s+mcto\s*[:=-]?\s*(?:aed\s*)?([\d.,]+[km]?)/i);
  if (compMcto) pushEvidence('Company MCTO', parseAmount(compMcto[1]) ?? 0, 'monthly');

  // Own-company salary transfer → evidence + question (not auto-applied)
  const ownSal = notes.match(/own[\s-]?company\s+salary(?:\s+transfer)?\s*[:=-]?\s*(?:aed\s*)?([\d.,]+[km]?)/i);
  if (ownSal) {
    pushEvidence('Own-company salary transfer', parseAmount(ownSal[1]) ?? 0, 'monthly', 'Confirm route: salary or business evidence');
    result.policy_questions!.push('Should own-company salary transfer be treated as salary or business evidence?');
  }

  // Documents
  if (/vat\s+(?:return|filing|available)/i.test(notes)) result.documents_available!.push('VAT returns');
  const auditYears = notes.match(/audited?\s+financials?\s+(?:available\s+)?(?:for\s+)?([\d, ]+(?:and\s+\d{4})?)/i);
  if (auditYears) result.documents_available!.push(`Audited financials: ${auditYears[1].trim()}`);
  if (/2024\s+audit\s*(?::|is)?\s*draft/i.test(notes)) {
    result.documents_available!.push('2024 audit: draft only');
    result.policy_questions!.push('Is the 2024 audit final or draft only?');
  }

  // Liabilities
  const plPatterns = [
    /(?:personal\s+loan|\bpl\b)\s+(?:at\s+\w+\s+)?(?:emi|instalment|of|is)?\s*(?:aed\s*)?([\d.,]+[km]?)/i,
    /(?:pl|personal\s+loan)\s+(?:aed\s*)?([\d.,]+[km]?)\s*(?:\/mo(?:nth)?)?/i,
  ];
  for (const p of plPatterns) {
    const m = notes.match(p);
    if (m) {
      const val = parseAmount(m[m.length - 1]);
      if (val && val > 0 && val < 200000) {
        result.liability_fields.push({ liability_type: 'Personal Loan 1 EMI', amount: val, credit_card_limit: 0, recurrence: 'monthly', closed_before_application: false });
        result.confidence.liabilities = Math.min(result.confidence.liabilities + 0.4, 1);
        break;
      }
    }
  }

  const carMatch = notes.match(/(?:car\s+loan|auto\s+loan|\bal\b|vehicle\s+loan)\s+(?:emi|of|is)?\s*(?:aed\s*)?([\d.,]+[km]?)/i);
  if (carMatch) {
    const val = parseAmount(carMatch[carMatch.length - 1]);
    if (val && val < 100000) {
      result.liability_fields.push({ liability_type: 'Auto Loan 1 EMI', amount: val, credit_card_limit: 0, recurrence: 'monthly', closed_before_application: false });
      result.confidence.liabilities = Math.min(result.confidence.liabilities + 0.3, 1);
    }
  }

  // Credit cards — limit and/or DBR amount
  const ccDbr = notes.match(/credit\s+card\s+(?:dbr|monthly|min(?:imum)?)\s+(?:amount|payment)?\s*[:=-]?\s*(?:aed\s*)?([\d.,]+[km]?)/i);
  const ccLimit = notes.match(/credit\s+card\s+limit\s*[:=-]?\s*(?:aed\s*)?([\d.,]+[km]?)/i);
  if (ccLimit) {
    const v = parseAmount(ccLimit[1]);
    if (v) {
      result.liability_fields.push({ liability_type: 'Credit Card 1 Limit', amount: 0, credit_card_limit: v, recurrence: 'monthly', closed_before_application: false });
      result.confidence.liabilities = Math.min(result.confidence.liabilities + 0.3, 1);
    }
  } else {
    const ccMatches = [...notes.matchAll(/(?:credit\s+card|\bcc\b)\s*(?:\d)?\s*(?:limit\s+)?(?:of\s+|is\s+)?(?:aed\s*)?([\d.,]+[km]?)/gi)];
    ccMatches.slice(0, 3).forEach((m, i) => {
      const val = parseAmount(m[1]);
      if (val) {
        result.liability_fields.push({ liability_type: `Credit Card ${i + 1} Limit`, amount: 0, credit_card_limit: val, recurrence: 'monthly', closed_before_application: false });
        result.confidence.liabilities = Math.min(result.confidence.liabilities + 0.3, 1);
      }
    });
  }
  if (ccDbr) {
    const v = parseAmount(ccDbr[1]) ?? 0;
    // Stash on first credit card row as additional info; surface in evidence too.
    result.income_evidence!.push({ label: 'Credit card DBR amount', amount: v, unit: 'monthly', note: 'Used in DBR (5% of limit by default unless adviser overrides)' });
  }

  const homeLoanMatch = notes.match(/(?:existing\s+mortgage|home\s+loan|existing\s+loan)\s+(?:emi|of|is)?\s*(?:aed\s*)?([\d.,]+[km]?)/i);
  if (homeLoanMatch) {
    const val = parseAmount(homeLoanMatch[homeLoanMatch.length - 1]);
    if (val) {
      result.liability_fields.push({ liability_type: 'Home Loan Existing EMI 1', amount: val, credit_card_limit: 0, recurrence: 'monthly', closed_before_application: false });
      result.confidence.liabilities = Math.min(result.confidence.liabilities + 0.3, 1);
    }
  }

  // Company loan EMI — DO NOT auto-include in DBR. Mark as pending adviser confirmation.
  const compLoan = notes.match(/company\s+loan\s+(?:emi|of|is)?\s*[:=-]?\s*(?:aed\s*)?([\d.,]+[km]?)/i);
  if (compLoan) {
    const val = parseAmount(compLoan[1]);
    if (val) {
      result.liabilities_pending!.push({
        liability_type: 'Company Loan EMI',
        amount: val,
        recurrence: 'monthly',
        reason: 'Bank treatment depends on policy — confirm before adding to DBR.',
      });
      result.policy_questions!.push(`Should company loan AED ${val.toLocaleString()} be included in DBR obligations?`);
    }
  }

  // Self-employed details
  if (result.employment_type === 'self_employed' || /self[\s-]?employed|business owner|owns (a|the) company/i.test(notes)) {
    const se: NonNullable<ExtractionResult['self_employed']> = {
      business_name: null,
      length_of_business_months: null,
      ownership_share_percent: null,
      income_route: null,
      doc_type: null,
    };
    const bn = notes.match(/(?:business|company|firm|trading\s+as)\s*(?:name)?\s*[:=-]?\s*([A-Z][A-Za-z0-9&'.\- ]{2,60}?)(?:\s+(?:LLC|FZE|FZ-?LLC|FZ\s+LLC|DMCC|Ltd|LLP|Inc))?/);
    if (bn?.[1]) se.business_name = bn[1].trim().replace(/\s+/g, ' ');
    const lobM = notes.match(/(?:lob|length\s+of\s+business|business\s+(?:since|running|established|operating)\s+for)\s*[:=-]?\s*(\d{1,3})\s*(years?|yrs?|months?|mos?)/i)
      || notes.match(/(\d{1,3})\s*(years?|yrs?|months?|mos?)\s+(?:in\s+business|of\s+business|of\s+trading|trading)/i);
    if (lobM) {
      const n = parseInt(lobM[1]);
      const unit = lobM[2].toLowerCase();
      se.length_of_business_months = unit.startsWith('year') || unit.startsWith('yr') ? n * 12 : n;
    }
    const ownM = notes.match(/(\d{1,3})\s*%\s*(?:ownership|shareholding|share|stake|owner)/i)
      || notes.match(/(?:ownership|shareholding|share|stake)\s*(?:of|is|:)?\s*(\d{1,3})\s*%/i);
    if (ownM) {
      const pct = parseInt(ownM[1]);
      if (pct > 0 && pct <= 100) se.ownership_share_percent = pct;
    }
    if (/sole\s+(?:owner|proprietor)|100\s*%\s*owner/i.test(notes) && !se.ownership_share_percent) se.ownership_share_percent = 100;

    // Income route inference
    if (/audited\s+(?:revenue|financial|account)/i.test(notes)) { se.income_route = 'audited_revenue'; se.doc_type = 'full_doc'; }
    else if (/vat\s+(?:return|revenue|filing)/i.test(notes)) { se.income_route = 'vat_revenue'; se.doc_type = 'full_doc'; }
    else if (/\bcto\b|company\s+turnover/i.test(notes)) { se.income_route = 'full_doc_cto'; se.doc_type = 'full_doc'; }
    else if (/company\s+(?:dab|daily\s+average\s+balance)/i.test(notes)) { se.income_route = 'low_doc_company_dab'; se.doc_type = 'low_doc'; }
    else if (/company\s+(?:mcto|monthly\s+credit\s+turnover)/i.test(notes)) { se.income_route = 'low_doc_company_mcto'; se.doc_type = 'low_doc'; }
    else if (/(?:personal\s+)?(?:dab|daily\s+average\s+balance)/i.test(notes)) { se.income_route = 'low_doc_personal_dab'; se.doc_type = 'low_doc'; }
    else if (/(?:personal\s+)?(?:mcto|monthly\s+credit\s+turnover)/i.test(notes)) { se.income_route = 'low_doc_personal_mcto'; se.doc_type = 'low_doc'; }

    // Mirror LOB to tier2 for compatibility
    if (se.length_of_business_months && !result.tier2.length_of_business_months) {
      result.tier2.length_of_business_months = se.length_of_business_months;
    }

    if (se.business_name || se.length_of_business_months || se.ownership_share_percent || se.income_route) {
      result.self_employed = se;
      result.confidence.personal = Math.min(result.confidence.personal + 0.2, 1);
    }
  }

  result.confidence.personal = Math.min(result.confidence.personal, 1);
  result.confidence.property = Math.min(result.confidence.property, 1);
  return result;
}

// ── Live DBR estimate ──────────────────────────────────────────────────────

function calcLiveDbr(ext: ExtractionResult, stressRate: number, tenorMonths: number) {
  const totalIncome = ext.income_fields.reduce((s, f) => s + f.amount * f.percent_considered / 100, 0);
  const totalLiab = ext.liability_fields.reduce((s, f) => {
    if (f.closed_before_application) return s;
    if (f.credit_card_limit > 0) return s + f.credit_card_limit * 0.05;
    return s + f.amount;
  }, 0);
  const loanAmt = ext.loan_amount ?? (ext.property_value && ext.ltv ? Math.round(ext.property_value * ext.ltv / 100) : 0);
  const stressEMI = calculateStressEMI(loanAmt, stressRate, tenorMonths);
  const dbr = totalIncome > 0 ? ((stressEMI + totalLiab) / totalIncome) * 100 : 0;
  return { dbr, totalIncome, totalLiab, stressEMI, loanAmt };
}

// ── Qualification card ─────────────────────────────────────────────────────

function QualCard({ extracted, onUpdate, onApply, onDiscard, stressRate, tenorMonths }: {
  extracted: ExtractionResult;
  onUpdate: (updated: ExtractionResult) => void;
  onApply: () => void;
  onDiscard: () => void;
  stressRate: number;
  tenorMonths: number;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const missing = getMissingFields(extracted);
  const critical = missing.filter(f => f.priority === 'critical');
  const important = missing.filter(f => f.priority === 'important');
  const { dbr, totalIncome, totalLiab, stressEMI, loanAmt } = useMemo(
    () => calcLiveDbr(extracted, stressRate, tenorMonths),
    [extracted, stressRate, tenorMonths]
  );

  const dbrColor = dbr === 0 ? 'text-muted-foreground' : dbr <= 40 ? 'text-green-600' : dbr <= 50 ? 'text-amber-600' : 'text-red-600';
  const dbrBg = dbr === 0 ? 'bg-secondary' : dbr <= 40 ? 'bg-green-50 border-green-200' : dbr <= 50 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';

  function applyInlineEdit(field: MissingField) {
    if (!editVal.trim()) { setEditingKey(null); return; }
    const updated = { ...extracted };
    const num = parseFloat(editVal.replace(/,/g, ''));

    if (field.key === 'income') {
      updated.income_fields = [{ income_type: 'Basic Salary', amount: num, percent_considered: 100, recurrence: 'monthly' }];
    } else if (field.key === 'property_value') {
      updated.property_value = num;
      if (updated.ltv) updated.loan_amount = Math.round(num * updated.ltv / 100);
    } else if (field.key === 'ltv') {
      updated.ltv = num;
      if (updated.property_value) updated.loan_amount = Math.round(updated.property_value * num / 100);
    } else if (field.key === 'segment') {
      updated.segment = editVal;
      if (editVal === 'non_resident') updated.residency = 'non_resident';
      else if (editVal === 'self_employed') updated.employment_type = 'self_employed';
      else { updated.employment_type = 'salaried'; updated.residency = updated.residency || 'resident_expat'; }
    } else if (field.key === 'nationality') {
      updated.nationality = editVal;
    } else if (field.key === 'emirate') {
      updated.emirate = editVal;
    } else if (field.key === 'transaction_type') {
      updated.transaction_type = editVal;
    } else if (field.key === 'residency') {
      updated.residency = editVal;
    } else if (field.key === 'property_type') {
      updated.property_type = editVal;
    } else if (field.key === 'purpose') {
      updated.purpose = editVal;
    }

    onUpdate(updated);
    setEditingKey(null);
    setEditVal('');
  }

  // Segment label: residency-based (Resident / Non-Resident), not employment.
  const segmentLabel = extracted.residency === 'non_resident' ? 'Non-Resident'
    : extracted.residency ? 'Resident'
    : extracted.segment === 'non_resident' ? 'Non-Resident'
    : extracted.segment ? 'Resident'
    : null;
  const employmentLabel = extracted.employment_type === 'self_employed' ? 'Self Employed'
    : extracted.employment_type === 'salaried' ? 'Salaried'
    : extracted.employment_type ? extracted.employment_type.replace('_', ' ') : null;

  const caseProfile = [
    extracted.client_name && { label: 'Name', value: extracted.client_name },
    segmentLabel && { label: 'Segment', value: segmentLabel },
    employmentLabel && { label: 'Employment', value: employmentLabel },
    extracted.nationality && { label: 'Nationality', value: extracted.nationality },
    extracted.dob && { label: 'DOB', value: extracted.dob },
    extracted.self_employed?.business_name && { label: 'Business', value: extracted.self_employed.business_name },
    extracted.self_employed?.ownership_share_percent && { label: 'Ownership', value: `${extracted.self_employed.ownership_share_percent}%` },
    extracted.self_employed?.income_route && { label: 'Income route', value: extracted.self_employed.income_route.replace(/_/g, ' ') },
    extracted.self_employed?.doc_type && { label: 'Doc type', value: extracted.self_employed.doc_type.replace('_', '-') },
    extracted.tier2?.length_of_business_months && { label: 'LOB', value: `${extracted.tier2.length_of_business_months} months` },
    extracted.tier2?.length_of_service_months && { label: 'LOS', value: `${extracted.tier2.length_of_service_months} months` },
    extracted.tier2?.aecb_score && { label: 'AECB', value: String(extracted.tier2.aecb_score) },
  ].filter(Boolean) as { label: string; value: string }[];

  const propertyAndLoan = [
    extracted.emirate && { label: 'Emirate', value: extracted.emirate.replace('_', ' ') },
    extracted.property_type && { label: 'Property type', value: extracted.property_type },
    extracted.purpose && { label: 'Purpose', value: extracted.purpose },
    extracted.property_value && { label: 'Property value', value: `AED ${formatCurrency(extracted.property_value)}` },
    extracted.loan_amount && { label: 'Requested loan', value: `AED ${formatCurrency(extracted.loan_amount)}` },
    extracted.ltv && { label: 'LTV', value: `${extracted.ltv}%` },
    extracted.tenor_months && { label: 'Tenor', value: `${extracted.tenor_months} months (${(extracted.tenor_months/12).toFixed(0)} years)` },
    extracted.transaction_type && { label: 'Transaction', value: extracted.transaction_type.replace('_', ' ') },
    extracted.salary_transfer !== null && { label: 'Salary transfer', value: extracted.salary_transfer ? 'Yes' : 'No' },
  ].filter(Boolean) as { label: string; value: string }[];

  const incomeForDbr = extracted.income_fields.map(f => ({
    label: f.income_type,
    value: `AED ${formatCurrency(f.amount)}/mo`,
  }));

  const evidence = (extracted.income_evidence ?? []).map(e => {
    const unit = e.unit === 'monthly' ? '/mo' : e.unit === 'annual' ? '/year' : '';
    return { label: e.label, value: `AED ${formatCurrency(e.amount)}${unit}`, note: e.note };
  });

  const liabIncluded = extracted.liability_fields.map(f => ({
    label: f.liability_type,
    value: f.credit_card_limit > 0
      ? `Limit AED ${formatCurrency(f.credit_card_limit)} (DBR ≈ AED ${formatCurrency(Math.round(f.credit_card_limit * 0.05))}/mo)`
      : `AED ${formatCurrency(f.amount)}/mo`,
  }));

  const liabPending = (extracted.liabilities_pending ?? []).map(p => ({
    label: p.liability_type,
    value: `AED ${formatCurrency(p.amount)}/mo`,
    reason: p.reason,
  }));

  const docs = extracted.documents_available ?? [];
  const policyQs = extracted.policy_questions ?? [];

  function Section({ title, items, tone = 'green' }: {
    title: string;
    items: { label: string; value: string; note?: string; reason?: string }[];
    tone?: 'green' | 'amber' | 'blue' | 'gray';
  }) {
    if (items.length === 0) return null;
    const color = tone === 'green' ? 'border-green-200 bg-green-50 text-green-900'
      : tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-900'
      : tone === 'blue' ? 'border-blue-200 bg-blue-50 text-blue-900'
      : 'border-border bg-secondary text-foreground';
    const titleColor = tone === 'green' ? 'text-green-700'
      : tone === 'amber' ? 'text-amber-700'
      : tone === 'blue' ? 'text-blue-700'
      : 'text-muted-foreground';
    return (
      <div className="space-y-1">
        <p className={`text-[10px] font-semibold uppercase tracking-wide ${titleColor}`}>{title}</p>
        <div className="flex flex-wrap gap-1.5">
          {items.map((f, i) => (
            <div key={i} className={`flex flex-col gap-0.5 rounded-md border px-2 py-1 ${color}`}>
              <span className="text-[10px]"><strong>{f.label}:</strong> {f.value}</span>
              {(f.note || f.reason) && <span className="text-[9px] italic opacity-80">{f.note || f.reason}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className={`rounded-lg border px-3 py-2.5 ${dbrBg}`}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Live DBR estimate</span>
          <span className={`text-xl font-semibold ${dbrColor}`}>{dbr > 0 ? `${dbr.toFixed(1)}%` : '—'}</span>
        </div>
        {dbr > 0 && (
          <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
            <span>Income: <strong>AED {formatCurrency(Math.round(totalIncome))}</strong></span>
            <span>Liabilities: <strong>AED {formatCurrency(Math.round(totalLiab))}</strong></span>
            <span>Stress EMI: <strong>AED {formatCurrency(Math.round(stressEMI))}</strong></span>
            <span>Loan: <strong>AED {formatCurrency(loanAmt)}</strong></span>
          </div>
        )}
        {dbr === 0 && <p className="text-[10px] text-muted-foreground mt-0.5">Add income + property to see estimate</p>}
      </div>

      {critical.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide">Missing — needed for DBR</p>
          {critical.map(field => (
            <div key={field.key} className="border border-red-200 bg-red-50 rounded-lg px-3 py-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-red-800">{field.label}</span>
                {field.inputType !== 'form' && (
                  <button className="text-[10px] text-red-600 flex items-center gap-0.5 hover:underline"
                    onClick={() => { setEditingKey(field.key); setEditVal(''); }}>
                    <Edit2 className="h-2.5 w-2.5" /> Fill in
                  </button>
                )}
              </div>
              <p className="text-[10px] text-red-700 italic">Ask: "{field.question}"</p>
              {editingKey === field.key && (
                <div className="flex gap-1.5 mt-1">
                  {field.inputType === 'select' ? (
                    <select className="flex-1 text-xs border border-red-300 rounded px-2 py-1 bg-white"
                      value={editVal} onChange={e => setEditVal(e.target.value)}>
                      <option value="">Select…</option>
                      {field.options?.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                    </select>
                  ) : (
                    <input type="number" className="flex-1 text-xs border border-red-300 rounded px-2 py-1 bg-white"
                      placeholder="Enter amount…" value={editVal} onChange={e => setEditVal(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') applyInlineEdit(field); }} />
                  )}
                  <Button size="sm" className="h-6 text-[10px] px-2 bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => applyInlineEdit(field)}>OK</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1"
                    onClick={() => setEditingKey(null)}>✕</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {important.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Also needed — bank matching</p>
          {important.map(field => (
            <div key={field.key} className="border border-amber-200 bg-amber-50 rounded-lg px-3 py-1.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-amber-900">{field.label}</span>
                <button className="text-[10px] text-amber-700 flex items-center gap-0.5 hover:underline"
                  onClick={() => { setEditingKey(field.key); setEditVal(''); }}>
                  <Edit2 className="h-2.5 w-2.5" /> Fill in
                </button>
              </div>
              <p className="text-[10px] text-amber-800 italic">"{field.question}"</p>
              {editingKey === field.key && (
                <div className="flex gap-1.5 mt-1">
                  {field.inputType === 'select' ? (
                    <select className="flex-1 text-xs border border-amber-300 rounded px-2 py-1 bg-white"
                      value={editVal} onChange={e => setEditVal(e.target.value)}>
                      <option value="">Select…</option>
                      {field.options?.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                    </select>
                  ) : (
                    <input type="number" className="flex-1 text-xs border border-amber-300 rounded px-2 py-1 bg-white"
                      placeholder="Enter…" value={editVal} onChange={e => setEditVal(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') applyInlineEdit(field); }} />
                  )}
                  <Button size="sm" className="h-6 text-[10px] px-2 bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={() => applyInlineEdit(field)}>OK</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1"
                    onClick={() => setEditingKey(null)}>✕</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {confirmed.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide">Confirmed</p>
          <div className="flex flex-wrap gap-1.5">
            {confirmed.map((f, i) => (
              <div key={i} className="flex items-center gap-1 bg-green-50 border border-green-200 rounded-md px-2 py-1">
                <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />
                <span className="text-[10px] text-green-900"><strong>{f.label}:</strong> {f.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={onDiscard}>Discard</Button>
        <Button size="sm" className="flex-1 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={onApply}>
          Apply all to form
        </Button>
      </div>
    </div>
  );
}

// ── Hidden policy retrieval (powers the What-If chat) ─────────────────────

const POLICY_CATEGORIES = [
  'eligibility', 'income_liability', 'transaction',
  'property', 'document', 'tat_validity', 'fee', 'note',
];

function safeLower(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function normSegmentForPolicy(s?: unknown): string | undefined {
  const v = safeLower(s);
  if (!v) return undefined;
  if (v.includes('non')) return 'Non-Resident';
  if (v.includes('resident') || v.includes('salaried') || v.includes('self')) return 'Resident';
  return undefined;
}

function normEmploymentForPolicy(s?: unknown): string | undefined {
  const v = safeLower(s);
  if (!v) return undefined;
  if (v.includes('self')) return 'Self Employed';
  if (v.includes('salar')) return 'Salaried';
  if (v.includes('mixed')) return 'Mixed';
  return undefined;
}

function scorePolicyRow(row: any, message: string, focusAreas: string[]): number {
  let score = 0;
  const safeRow = row ?? {};
  const text = safeLower(`${safeRow.canonical_attribute ?? ''} ${safeRow.raw_attribute ?? ''} ${safeRow.attribute_description ?? ''} ${safeRow.value ?? ''}`);
  const m = safeLower(message);
  const safeFocus = Array.isArray(focusAreas) ? focusAreas : [];
  for (const f of safeFocus) if (text.includes(safeLower(f))) score += 4;
  for (const w of m.split(/\s+/)) {
    if (w.length < 4) continue;
    if (text.includes(w)) score += 1;
  }
  if (safeRow.ready_for_search) score += 1;
  if (safeRow.value_status === 'confirmed') score += 1;
  if (safeRow.value_status === 'unclear') score -= 1;
  return score;
}


async function retrievePolicyContext(
  message: string,
  caseFacts?: PolicyFitCaseFacts,
  availableBanks?: string[],
): Promise<{ rows: any[]; summary: string }> {
  try {
    const safeMessage = typeof message === 'string' ? message : '';
    const safeAvailableBanks = Array.isArray(availableBanks) ? availableBanks : [];
    const safeCaseFacts: any = caseFacts ?? {};
    const parsed = parsePolicyFitIntent(safeMessage, safeAvailableBanks);
    const segment = normSegmentForPolicy(safeCaseFacts.segment);
    const employment = normEmploymentForPolicy(safeCaseFacts.employmentType);

    let q: any = (supabase as any)
      .from('policy_search_view')
      .select('*')
      .in('policy_category', POLICY_CATEGORIES)
      .limit(800);

    if (parsed.selectedBanks.length > 0) q = q.in('bank', parsed.selectedBanks);
    if (segment) q = q.or(`segment.eq.${segment},segment.is.null`);
    if (employment) q = q.or(`employment_type.eq.${employment},employment_type.eq.Mixed,employment_type.is.null`);

    let { data } = await q;

    if (!data || data.length === 0) {
      let q2: any = (supabase as any)
        .from('policy_search_view')
        .select('*')
        .in('policy_category', POLICY_CATEGORIES)
        .limit(800);
      if (parsed.selectedBanks.length > 0) q2 = q2.in('bank', parsed.selectedBanks);
      const r2 = await q2;
      data = r2.data ?? [];
    }

    const rows = (data ?? []) as any[];
    const ranked = rows
      .map(r => ({ r, s: scorePolicyRow(r, message, parsed.focusAreas) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 60)
      .map(x => ({
        bank: x.r.bank,
        segment: x.r.segment,
        employment_type: x.r.employment_type,
        product_variant: x.r.product_variant,
        category: x.r.policy_category,
        attribute: x.r.canonical_attribute ?? x.r.raw_attribute,
        value: x.r.value,
        normalized_value: x.r.normalized_value,
        value_status: x.r.value_status,
        data_status: x.r.data_status,
        description: x.r.attribute_description,
      }));

    const banksInContext = Array.from(new Set(ranked.map(r => r.bank))).slice(0, 20);
    const summary = `Retrieved ${ranked.length} relevant policy rows across ${banksInContext.length} banks${
      parsed.focusAreas.length ? ` (focus: ${parsed.focusAreas.join(', ')})` : ''
    }.`;
    return { rows: ranked, summary };
  } catch (e) {
    console.warn('Policy retrieval failed:', e);
    return { rows: [], summary: 'No policy context retrieved.' };
  }
}

// ── Main component ─────────────────────────────────────────────────────────

export default function NotesPanel({
  applicantId,
  clientName = '',
  onClientNameChange,
  onSave,
  isSaving = false,
  lastSaved,
  onExtract,
  onRequestSave,
  whatIfContext,
  embedded = false,
  policyFitCaseFacts,
  policyFitBanks,
}: NotesPanelProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [minimised, setMinimised] = useState(false);
  const [tab, setTab] = useState<'notes' | 'whatif' | 'history'>('notes');
  const [draft, setDraft] = useState('');
  const [sessionLabel, setSessionLabel] = useState('');
  const [savedNotes, setSavedNotes] = useState<ClientNote[]>([]);
  const [resolvedId, setResolvedId] = useState<string | undefined>(undefined);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractionResult | null>(null);
  const [extractMode, setExtractMode] = useState<'rule' | 'ai'>('rule');
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const popoutRef = useRef<Window | null>(null);

  useEffect(() => { if (applicantId) setResolvedId(applicantId); }, [applicantId]);
  useEffect(() => {
  if (resolvedId || applicantId) loadHistory();
}, [resolvedId, applicantId]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  useEffect(() => {
    if (tab === 'whatif' && chatMessages.length === 0 && whatIfContext.bankResults.length > 0) {
      const analysis = buildWhatIfAnalysis(whatIfContext.bankResults, whatIfContext.totalIncome, whatIfContext.totalLiabilities, whatIfContext.liabilityFields);
      setChatMessages([{ role: 'assistant', text: analysis || '✅ All banks eligible. Ask me anything about this case.' }]);
    }
  }, [tab]);

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'MAVERICK_NOTES') { setDraft(e.data.text); setOpen(true); setTab('notes'); setExtracted(null); }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  async function loadHistory() {
    const aid = resolvedId || applicantId;
    if (!aid) return;
    setLoadingHistory(true);
    const { data } = await supabase.from('client_notes' as any).select('id, note_text, created_at, session_label').eq('applicant_id', aid).order('created_at', { ascending: false });
    setSavedNotes((data ?? []) as ClientNote[]);
    setLoadingHistory(false);
  }

  async function saveNote(text: string) {
    if (!user || !text.trim()) return;
    let aid = resolvedId || applicantId;
    if (!aid && onRequestSave) {
      aid = await onRequestSave();
      if (aid) setResolvedId(aid);
    }
    if (!aid) {
      toast.error('Please save the case first.');
      return;
    }
    const { error } = await supabase.from('client_notes' as any).insert({
      applicant_id: aid,
      note_text: text.trim(),
      created_by: user.id,
      session_label: sessionLabel.trim() || null,
    });
    if (error) { toast.error('Note could not be saved'); return; }
    toast.success('Note saved');
    setSessionLabel('');
    const { data } = await supabase.from('client_notes' as any)
      .select('id, note_text, created_at, session_label')
      .eq('applicant_id', aid)
      .order('created_at', { ascending: false });
    setSavedNotes((data ?? []) as ClientNote[]);
  }

  async function deleteNote(id: string) {
    await supabase.from('client_notes' as any).delete().eq('id', id);
    setSavedNotes(prev => prev.filter(n => n.id !== id));
  }

  function handleRuleExtract() {
    if (!draft.trim()) return;
    setExtracting(true);
    try { setExtracted(ruleBasedExtract(draft)); } finally { setExtracting(false); }
  }

  async function handleAiExtract() {
    if (!draft.trim()) return;
    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke('maverick-ai', { body: { mode: 'extract', payload: { notes: draft } } });
      if (error) throw error;
      if (data?.extracted) { setExtracted(data.extracted); toast.success('AI extraction complete'); }
      else throw new Error('No data returned');
    } catch (e: any) {
      console.error('AI extract error:', e);
      toast.error('AI extraction failed — using rule-based instead');
      setExtracted(ruleBasedExtract(draft));
    } finally { setExtracting(false); }
  }

  function handleApplyExtraction() {
    if (!extracted) return;
    const fieldCount = [
      extracted.client_name, extracted.segment, extracted.residency, extracted.nationality,
      extracted.dob, extracted.employment_type, extracted.property_value, extracted.loan_amount,
      extracted.ltv, extracted.emirate, extracted.transaction_type, extracted.property_type,
      extracted.purpose, extracted.salary_transfer,
    ].filter(v => v !== null && v !== undefined && v !== '').length
      + extracted.income_fields.length
      + extracted.liability_fields.length;
    onExtract(extracted);
    saveNote(draft);
    setExtracted(null);
    // Keep `draft` so the adviser's notes remain visible in chat for follow-up.
    toast.success(`✓ ${fieldCount} fields applied to form`);
  }

  async function handleChatSend() {
    if (!chatInput.trim() || chatLoading) return;
    const question = chatInput.trim(); setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: question }]);
    setChatLoading(true);
    try {
      // Retrieve compact, relevant policy context behind the scenes.
      const policyContext = await retrievePolicyContext(question, policyFitCaseFacts, policyFitBanks);

      const caseFacts = policyFitCaseFacts ?? null;
      const caseContext = {
        notes: draft || savedNotes[0]?.note_text || '',
        caseFacts,
        qualificationResults: {
          eligibleBanks: whatIfContext.eligibleBanks,
          ineligibleBanks: whatIfContext.ineligibleBanks,
          bankResults: whatIfContext.bankResults.map(r => ({
            bank: r.bank.bankName,
            eligible: r.eligible,
            dbr: r.dbr,
            dbrLimit: r.dbrLimit,
            stressEMI: r.stressEMI,
            stressRate: r.stressRate,
            minSalaryMet: r.minSalaryMet,
            dbrMet: r.dbrMet,
            loanInRange: r.loanInRange,
            effectiveTenor: r.effectiveTenor,
            minSalary: r.bank.minSalary,
            maxTenorMonths: r.bank.maxTenorMonths,
          })),
          totalIncome: whatIfContext.totalIncome,
          totalLiabilities: whatIfContext.totalLiabilities,
          loanAmount: whatIfContext.loanAmount,
          stressRate: whatIfContext.stressRate,
          tenorMonths: whatIfContext.tenorMonths,
          currentDbr: whatIfContext.currentDbr,
        },
        whatIfAnalysis: buildWhatIfAnalysis(
          whatIfContext.bankResults, whatIfContext.totalIncome,
          whatIfContext.totalLiabilities, whatIfContext.liabilityFields
        ),
        liabilityFields: whatIfContext.liabilityFields,
        policyContext: policyContext.rows,
        policyContextSummary: policyContext.summary,
      };

      const { data, error } = await supabase.functions.invoke('maverick-ai', {
        body: { mode: 'qualification_adviser_chat', payload: { message: question, caseContext } },
      });
      if (error) throw error;
      setChatMessages(prev => [...prev, { role: 'assistant', text: data?.answer ?? 'No response.' }]);
    } catch (e: any) {
      console.error('What-if error:', e);
      // Fallback to legacy mode so the chat still works if the edge function
      // hasn't been updated to the new unified mode yet.
      try {
        const { data } = await supabase.functions.invoke('maverick-ai', {
          body: { mode: 'whatif', payload: { question, caseContext: {
            totalIncome: whatIfContext.totalIncome, totalLiabilities: whatIfContext.totalLiabilities,
            loanAmount: whatIfContext.loanAmount, stressRate: whatIfContext.stressRate,
            tenorMonths: whatIfContext.tenorMonths, currentDbr: whatIfContext.currentDbr,
            eligibleBanks: whatIfContext.eligibleBanks, ineligibleBanks: whatIfContext.ineligibleBanks,
            whatIfAnalysis: buildWhatIfAnalysis(whatIfContext.bankResults, whatIfContext.totalIncome, whatIfContext.totalLiabilities, whatIfContext.liabilityFields),
          } } },
        });
        if (data?.answer) {
          setChatMessages(prev => [...prev, { role: 'assistant', text: data.answer }]);
          return;
        }
      } catch { /* ignore */ }
      setChatMessages(prev => [...prev, { role: 'assistant', text: '⚠️ Could not reach AI — check browser console for details.' }]);
    } finally { setChatLoading(false); }
  }

  function handlePopOut() {
    if (popoutRef.current && !popoutRef.current.closed) {
      popoutRef.current.postMessage({ type: 'MAVERICK_DRAFT', text: draft }, '*');
      popoutRef.current.focus();
      return;
    }
    const w = window.open('', 'maverick-notes', 'width=500,height=720,resizable=yes');
    if (!w) { toast.error('Pop-up blocked — allow pop-ups for this site'); return; }
    popoutRef.current = w;
    const escaped = draft.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    w.document.write('<!DOCTYPE html><html><head><title>Maverick Notes</title>'
      + '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;padding:16px;background:#f9f9f7;color:#1a1a18;height:100vh;display:flex;flex-direction:column;gap:10px}'
      + 'h3{font-size:15px;font-weight:600}.hint{font-size:11px;color:#888;line-height:1.5}'
      + 'textarea{flex:1;width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:13px;resize:none;line-height:1.6;font-family:inherit}'
      + 'textarea:focus{outline:none;border-color:#1a1a18}.row{display:flex;gap:8px}'
      + 'button{flex:1;padding:10px;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500}'
      + '.send{background:#1a1a18;color:#fff}.clear{background:#e8e6e0;color:#444}'
      + '.status{font-size:11px;color:#888;text-align:center;min-height:16px}</style></head><body>'
      + '<h3>Client Notes — Maverick</h3>'
      + '<p class="hint">Type notes here. <strong>Send to Maverick</strong> pushes to the form. <strong>Ctrl+Enter</strong> to send quickly.</p>'
      + '<textarea id="n" placeholder="e.g. Indian national, ADNOC, salary 32k...">' + escaped + '</textarea>'
      + '<div class="row"><button class="clear" onclick="clearN()">Clear</button><button class="send" onclick="sendN()">Send to Maverick</button></div>'
      + '<div class="status" id="st"></div>'
      + '<script>var ta=document.getElementById("n"),st=document.getElementById("st");'
      + 'function show(m){st.textContent=m;setTimeout(function(){st.textContent=""},2000);}'
      + 'window.addEventListener("message",function(e){if(e.data&&e.data.type==="MAVERICK_DRAFT"){var inc=e.data.text||"",cur=ta.value||"";ta.value=(cur&&cur!==inc&&!cur.includes(inc.trim()))?cur.trim()+"\\n\\n"+inc.trim():inc;show("Synced");}});'
      + 'function sendN(){var t=ta.value.trim();if(!t){show("Nothing to send");return;}window.opener.postMessage({type:"MAVERICK_NOTES",text:t},"*");show("Sent ✓");}'
      + 'function clearN(){if(confirm("Clear notes?")){ta.value="";show("Cleared");}}'
      + 'ta.addEventListener("keydown",function(e){if(e.ctrlKey&&e.key==="Enter")sendN();});</script></body></html>');
    w.document.close();
  }

  // Floating mode: show collapsed button when closed
  if (!embedded && !open) {
    return (
      <Button variant="outline" size="sm" className="fixed bottom-6 right-6 z-50 shadow-lg gap-2 bg-background" onClick={() => setOpen(true)}>
        <MessageSquare className="h-4 w-4" />
        Client notes
        {savedNotes.length > 0 && <Badge className="h-4 px-1.5 text-[10px] bg-accent text-accent-foreground">{savedNotes.length}</Badge>}
      </Button>
    );
  }

  const wrapClass = embedded
    ? 'flex flex-col h-full'
    : 'fixed bottom-6 right-6 z-50 w-[480px] shadow-2xl max-h-[90vh] flex flex-col';
  const cardClass = embedded
    ? 'flex flex-col h-full rounded-none border-0 border-l'
    : 'border-2 border-primary/20 flex flex-col min-h-0';

  return (
    <div className={wrapClass}>
      <Card className={cardClass}>
        <CardHeader className="py-2.5 px-4 flex flex-row items-center justify-between space-y-0 border-b shrink-0">
          <CardTitle className="text-sm font-semibold text-primary flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Client notes
            {extracted && <Badge className="text-[10px] h-4 px-1.5 bg-blue-100 text-blue-800">Extracted</Badge>}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" title="Pop out to second screen" onClick={handlePopOut}>
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            {!embedded && (
              <>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setMinimised(!minimised)}>
                  {minimised ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setOpen(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </CardHeader>

        {(!minimised || embedded) && (
          <CardContent className="px-4 pb-4 pt-3 space-y-3 overflow-y-auto flex-1 min-h-0">

            {/* ── CLIENT NAME + SAVE — embedded only ── */}
            {embedded && (
              <div className="space-y-1 pb-3 border-b">
                <div className="flex gap-2 items-center">
                  <input
                    className="flex-1 min-w-0 text-sm font-medium border border-input rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Client name…"
                    value={clientName}
                    onChange={e => onClientNameChange?.(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && clientName.trim()) onSave?.(); }}
                  />
                  <Button
                    size="sm"
                    className="h-8 px-3 text-xs bg-accent text-accent-foreground hover:bg-accent/90 shrink-0 gap-1.5"
                    disabled={isSaving || !clientName.trim()}
                    onClick={onSave}
                  >
                    {isSaving ? (
                      <>
                        <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin inline-block" />
                        Saving…
                      </>
                    ) : (
                      'Save case'
                    )}
                  </Button>
                </div>
                {lastSaved && (
                  <p className="text-[10px] text-muted-foreground pl-0.5">
                    ✓ Saved {format(lastSaved, 'HH:mm')}
                  </p>
                )}
              </div>
            )}

            {/* ── TABS ── */}
            <div className="flex gap-1 border-b pb-2 shrink-0 flex-wrap">
              {(['notes', 'whatif', 'history'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}>
                  {t === 'notes' ? 'Notes' : t === 'whatif' ? 'What-If' : `History (${savedNotes.length})`}
                </button>
              ))}
            </div>

            {/* ── NOTES TAB ── */}
            {tab === 'notes' && (
              <div className="space-y-2">
                {!extracted ? (
                  <>
                    <input className="w-full text-xs border border-input rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="Session label — e.g. Initial call, Follow-up 1"
                      value={sessionLabel} onChange={e => setSessionLabel(e.target.value)} />
                    <Textarea className="text-xs min-h-[120px] resize-none"
                      placeholder={`e.g. "Indian national, salaried in UAE, salary 32k, cc limit 50k, looking at 2.5M villa Dubai, resale, 80% LTV..."`}
                      value={draft} onChange={e => setDraft(e.target.value)} />
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">Extract via:</span>
                      <button onClick={() => setExtractMode('rule')} className={`text-[10px] px-2 py-0.5 rounded ${extractMode === 'rule' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground border border-border'}`}>Rule-based (free)</button>
                      <button onClick={() => setExtractMode('ai')} className={`text-[10px] px-2 py-0.5 rounded flex items-center gap-1 ${extractMode === 'ai' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground border border-border'}`}><Sparkles className="h-2.5 w-2.5" />AI (smarter)</button>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 text-xs" disabled={!draft.trim()} onClick={() => saveNote(draft)}>Save only</Button>
                      <Button size="sm" className="flex-1 gap-1.5 text-xs bg-accent text-accent-foreground hover:bg-accent/90"
                        disabled={!draft.trim() || extracting}
                        onClick={extractMode === 'ai' ? handleAiExtract : handleRuleExtract}>
                        <Sparkles className="h-3.5 w-3.5" />{extracting ? 'Extracting…' : 'Extract to form'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-secondary/40 rounded-md px-3 py-2 text-xs text-muted-foreground leading-relaxed max-h-[80px] overflow-y-auto border border-border">
                      {draft}
                    </div>
                    <button className="text-[10px] text-muted-foreground hover:text-foreground underline" onClick={() => setExtracted(null)}>← Edit notes</button>
                    <QualCard
                      extracted={extracted}
                      onUpdate={setExtracted}
                      onApply={handleApplyExtraction}
                      onDiscard={() => setExtracted(null)}
                      stressRate={whatIfContext.stressRate || 7.5}
                      tenorMonths={whatIfContext.tenorMonths || 300}
                    />
                  </>
                )}
              </div>
            )}

            {/* ── WHAT-IF TAB ── */}
            {tab === 'whatif' && (
              <div className="space-y-2">
                <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-primary text-primary-foreground ml-8' : 'bg-secondary text-foreground mr-8'}`}>{msg.text}</div>
                  ))}
                  {chatLoading && <div className="bg-secondary rounded-lg px-3 py-2 text-xs text-muted-foreground mr-8 animate-pulse">Thinking…</div>}
                  <div ref={chatEndRef} />
                </div>
                <div className="text-[10px] text-muted-foreground bg-secondary/40 rounded-md px-2 py-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>Income: <strong>AED {formatCurrency(whatIfContext.totalIncome)}</strong></span>
                  <span>Liabilities: <strong>AED {formatCurrency(whatIfContext.totalLiabilities)}</strong></span>
                  <span>Loan: <strong>AED {formatCurrency(whatIfContext.loanAmount)}</strong></span>
                  <span>DBR: <strong>{whatIfContext.currentDbr.toFixed(1)}%</strong></span>
                </div>
                <div className="flex gap-2">
                  <input className="flex-1 text-xs border border-input rounded-md px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Ask anything — bank fit, policy, restructuring, missing info…"
                    value={chatInput} onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                    disabled={chatLoading} />
                  <Button size="sm" className="px-3" disabled={!chatInput.trim() || chatLoading} onClick={handleChatSend}>
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">Ask about affordability, bank fit, policy, documents, or restructuring.</p>
              </div>
            )}

            {/* Policy Fit tab removed — its capabilities are now part of the What-If chat. */}

            {/* ── HISTORY TAB ── */}
            {tab === 'history' && (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {loadingHistory && <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>}
                {!loadingHistory && savedNotes.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No notes saved yet.</p>}
                {savedNotes.map(note => (
                  <div key={note.id} className="border border-border rounded-lg p-3 space-y-1.5 bg-secondary/40">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3" />{format(new Date(note.created_at), 'dd MMM yyyy, HH:mm')}
                      </div>
                      <div className="flex items-center gap-1">
                        {note.session_label && <Badge variant="outline" className="text-[10px] h-4 px-1.5">{note.session_label}</Badge>}
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive" onClick={() => deleteNote(note.id)}><X className="h-3 w-3" /></Button>
                      </div>
                    </div>
                    <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{note.note_text}</p>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-accent"
                      onClick={() => { setDraft(note.note_text); setTab('notes'); setExtracted(null); }}>
                      <Sparkles className="h-3 w-3 mr-1" />Re-extract
                    </Button>
                  </div>
                ))}
              </div>
            )}

          </CardContent>
        )}
      </Card>
    </div>
  );
}
