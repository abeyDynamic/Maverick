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
  property_value: number | null;
  loan_amount: number | null;
  ltv: number | null;
  emirate: string | null;
  transaction_type: string | null;
  property_type: string | null;
  purpose: string | null;
  salary_transfer: boolean | null;
  income_fields: Array<{ income_type: string; amount: number; percent_considered: number; recurrence: string }>;
  liability_fields: Array<{ liability_type: string; amount: number; credit_card_limit: number; recurrence: string; closed_before_application: boolean }>;
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
    ltv: null, emirate: null, transaction_type: null, property_type: null,
    purpose: null, salary_transfer: null, income_fields: [], liability_fields: [],
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

  // Employment type
  if (text.includes('self employed') || text.includes('self-employed') || text.includes('business owner') || text.includes('owns a company') || text.includes('owns the company')) {
    result.employment_type = 'self_employed'; result.segment = 'self_employed'; result.confidence.personal += 0.3;
  } else if (text.includes('salaried') || text.includes('works at') || text.includes('employed at') || text.includes('in the uae')) {
    result.employment_type = 'salaried'; if (!result.segment) result.segment = 'resident_salaried'; result.confidence.personal += 0.2;
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

  // Transaction type
  if (text.includes('resale') || text.includes('secondary market')) result.transaction_type = 'resale';
  else if (text.includes('off-plan') || text.includes('off plan')) result.transaction_type = 'off_plan';
  else if (text.includes('handover')) result.transaction_type = 'handover';
  else if (text.includes('buyout') || text.includes('buy out') || text.includes('re-mortgage') || text.includes('remortgage')) result.transaction_type = 'buyout';
  else if (text.includes('equity release') || text.includes('equity')) result.transaction_type = 'equity';

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

  // Income
  const incomeMap = [
    { type: 'Basic Salary', patterns: [
      /basic\s+salary\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i,
      /salary\s+(?:is\s+|of\s+|aed\s+)?([\d.,]+[km]?)/i,
      /earns?\s+(?:aed\s*)?([\d.,]+[km]?)/i,
      /income\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i,
    ]},
    { type: 'Housing Allowance', patterns: [/housing\s+allowance\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i] },
    { type: 'Transport Allowance', patterns: [/transport\s+(?:allowance\s+)?(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i] },
    { type: 'Educational Allowance', patterns: [/(?:education(?:al)?|school)\s+allowance\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i] },
    { type: 'Bonus Fixed', patterns: [/(?:fixed\s+)?bonus\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i] },
    { type: 'Bonus Variable', patterns: [/(?:variable|performance)\s+bonus\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i] },
    { type: 'Commission Variable', patterns: [/commission\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i] },
    { type: 'Rental Income 1', patterns: [/rental\s+income\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i, /rent\s+(?:received|income|of)\s+(?:aed\s*)?([\d.,]+[km]?)/i] },
    { type: 'SE Audited Revenue', patterns: [/(?:audited\s+)?revenue\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i, /turnover\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i] },
    { type: 'SE Personal DAB', patterns: [/(?:personal\s+)?(?:dab|daily\s+average\s+balance)\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i] },
    { type: 'SE Personal MCTO', patterns: [/(?:personal\s+)?(?:mcto|monthly\s+credit\s+turnover)\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i] },
    { type: 'SE Company DAB', patterns: [/company\s+(?:dab|daily\s+average\s+balance)\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i] },
    { type: 'SE Company MCTO', patterns: [/company\s+(?:mcto|monthly\s+credit\s+turnover)\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i] },
  ];
  const addedTypes = new Set<string>();
  for (const { type, patterns } of incomeMap) {
    if (addedTypes.has(type)) continue;
    for (const pattern of patterns) {
      const m = notes.match(pattern);
      if (m) {
        const val = parseAmount(m[m.length - 1]);
        if (val && val > 0) {
          result.income_fields.push({ income_type: type, amount: val, percent_considered: 100, recurrence: 'monthly' });
          result.confidence.income = Math.min(result.confidence.income + 0.3, 1);
          addedTypes.add(type);
          break;
        }
      }
    }
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

  const ccMatches = [...notes.matchAll(/(?:credit\s+card|\bcc\b)\s*(?:\d)?\s*(?:limit\s+)?(?:of\s+|is\s+)?(?:aed\s*)?([\d.,]+[km]?)/gi)];
  ccMatches.slice(0, 3).forEach((m, i) => {
    const val = parseAmount(m[1]);
    if (val) {
      result.liability_fields.push({ liability_type: `Credit Card ${i + 1} Limit`, amount: 0, credit_card_limit: val, recurrence: 'monthly', closed_before_application: false });
      result.confidence.liabilities = Math.min(result.confidence.liabilities + 0.3, 1);
    }
  });

  const homeLoanMatch = notes.match(/(?:existing\s+mortgage|home\s+loan|existing\s+loan)\s+(?:emi|of|is)?\s*(?:aed\s*)?([\d.,]+[km]?)/i);
  if (homeLoanMatch) {
    const val = parseAmount(homeLoanMatch[homeLoanMatch.length - 1]);
    if (val) {
      result.liability_fields.push({ liability_type: 'Home Loan Existing EMI 1', amount: val, credit_card_limit: 0, recurrence: 'monthly', closed_before_application: false });
      result.confidence.liabilities = Math.min(result.confidence.liabilities + 0.3, 1);
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

  const confirmed = [
    extracted.client_name && { label: 'Name', value: extracted.client_name },
    extracted.segment && { label: 'Segment', value: extracted.segment.replace('_', ' ') },
    extracted.nationality && { label: 'Nationality', value: extracted.nationality },
    extracted.dob && { label: 'DOB', value: extracted.dob },
    extracted.employment_type && { label: 'Employment', value: extracted.employment_type.replace('_', ' ') },
    extracted.emirate && { label: 'Emirate', value: extracted.emirate.replace('_', ' ') },
    extracted.property_value && { label: 'Property', value: `AED ${formatCurrency(extracted.property_value)}` },
    extracted.loan_amount && { label: 'Loan', value: `AED ${formatCurrency(extracted.loan_amount)}` },
    extracted.ltv && { label: 'LTV', value: `${extracted.ltv}%` },
    extracted.transaction_type && { label: 'Transaction', value: extracted.transaction_type.replace('_', ' ') },
    extracted.property_type && { label: 'Property type', value: extracted.property_type },
    extracted.purpose && { label: 'Purpose', value: extracted.purpose },
    extracted.salary_transfer !== null && { label: 'Salary transfer', value: extracted.salary_transfer ? 'Yes' : 'No' },
    ...extracted.income_fields.map(f => ({ label: f.income_type, value: `AED ${formatCurrency(f.amount)}/mo` })),
    ...extracted.liability_fields.map(f => ({ label: f.liability_type, value: `AED ${formatCurrency(f.amount || f.credit_card_limit)}` })),
  ].filter(Boolean) as { label: string; value: string }[];

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
    onExtract(extracted);
    saveNote(draft);
    setExtracted(null);
    toast.success('Fields applied to form');
  }

  async function handleChatSend() {
    if (!chatInput.trim() || chatLoading) return;
    const question = chatInput.trim(); setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: question }]);
    setChatLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('maverick-ai', {
        body: { mode: 'whatif', payload: { question, caseContext: { totalIncome: whatIfContext.totalIncome, totalLiabilities: whatIfContext.totalLiabilities, loanAmount: whatIfContext.loanAmount, stressRate: whatIfContext.stressRate, tenorMonths: whatIfContext.tenorMonths, currentDbr: whatIfContext.currentDbr, eligibleBanks: whatIfContext.eligibleBanks, ineligibleBanks: whatIfContext.ineligibleBanks, whatIfAnalysis: buildWhatIfAnalysis(whatIfContext.bankResults, whatIfContext.totalIncome, whatIfContext.totalLiabilities, whatIfContext.liabilityFields) } } },
      });
      if (error) throw error;
      setChatMessages(prev => [...prev, { role: 'assistant', text: data?.answer ?? 'No response.' }]);
    } catch (e: any) {
      console.error('What-if error:', e);
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
            <div className="flex gap-1 border-b pb-2 shrink-0">
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
                    placeholder="e.g. What if salary increases by 5,000?"
                    value={chatInput} onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                    disabled={chatLoading} />
                  <Button size="sm" className="px-3" disabled={!chatInput.trim() || chatLoading} onClick={handleChatSend}>
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">AI has live access to this case — ask anything about eligibility or scenarios.</p>
              </div>
            )}

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
