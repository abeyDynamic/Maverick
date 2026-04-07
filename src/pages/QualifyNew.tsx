import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { QualNote } from '@/components/results/BankEligibilityTable';
import { SessionRemindersPanel } from '@/components/results/BankEligibilityTable';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Plus, Save } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { FieldSelector } from '@/components/qualify/FieldSelector';
import { IncomeFieldCard, IncomeEntry, createIncomeEntry } from '@/components/qualify/IncomeFieldCard';
import { LiabilityFieldCard, LiabilityEntry, createLiabilityEntry } from '@/components/qualify/LiabilityFieldCard';
import { CoBorrowerSection, CoBorrowerData, createCoBorrower } from '@/components/qualify/CoBorrowerSection';
import DBRSummaryBar from '@/components/results/DBRSummaryBar';
import GlobalEiborBar from '@/components/GlobalEiborBar';
import BankEligibilityTable, { useBankResults, buildWhatIfAnalysis } from '@/components/results/BankEligibilityTable';
import WhatIfChat from '@/components/results/WhatIfChat';
import CostBreakdownSection, { type ProductData } from '@/components/results/CostBreakdownSection';
import {
  COUNTRIES, INCOME_TYPES, LIABILITY_TYPES, TRANSACTION_TYPES, PROPERTY_TYPES,
  PURPOSES, LOAN_TYPE_PREFERENCES, EMIRATES,
  normalizeToMonthly, isLimitType, formatCurrency, calculateMaxTenor,
  getAgeFromDob, getTenorEligibility
} from '@/lib/mortgage-utils';

interface Bank {
  id: string;
  bank_name: string;
  base_stress_rate: number | null;
  min_salary: number;
  dbr_limit: number;
  max_tenor_months: number;
  min_loan_amount: number;
  max_loan_amount: number | null;
}

type ProductRow = ProductData & {
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

interface ProductSelectionContext {
  applicantResidency: string | null;
  applicantSegment: string | null;
  preferredFixedMonths: number;
  preferredTransactionType: string;
  salaryTransfer: boolean;
}

const DEFAULT_COMPARISON_FIXED_MONTHS = 24;

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

/** Normalize processing fee to a percentage value (e.g. 1 for 1%).
 *  Handles: decimal form (0.01 → 1%), percentage form (1 → 1%), absurd values (>10 → null) */
function normalizeProcessingFeePercent(value: number | null): number | null {
  if (value === null) return null;
  // If stored as decimal (e.g. 0.01 for 1%), convert to percentage
  if (value > 0 && value < 0.5) return value * 100;
  // If clearly unreasonable (>10%), likely a flat fee or data error — ignore
  if (value > 10) return null;
  return value;
}

/** Normalize product rate to annual decimal form (e.g. 0.0399 stays 0.0399, 3.99 becomes 0.0399) */
function normalizeRateToDecimal(rate: number | null): number | null {
  if (rate === null) return null;
  return rate > 1 ? rate / 100 : rate;
}

function getApplicantSegment(employmentType: string): string | null {
  const normalized = normalizeMatchValue(employmentType);
  if (!normalized) return null;
  if (normalized.includes('salary')) return 'salaried';
  if (normalized.includes('self')) return 'self_employed';
  return null;
}

function getApplicantResidency(residencyStatus: string): string | null {
  const normalized = normalizeMatchValue(residencyStatus);
  if (!normalized) return null;
  return normalized === 'non_resident' ? 'non_resident' : 'resident_expat';
}

function parseFixedPeriodMonths(product: Pick<ProductRow, 'fixed_period' | 'fixed_period_months'>): number | null {
  const fixedPeriodMonths = toNullableNumber(product.fixed_period_months);
  if (fixedPeriodMonths !== null) {
    return fixedPeriodMonths;
  }

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

  const normalizedSegment = normalizeMatchValue(productSegment);
  if (!normalizedSegment || ['all', 'any', 'both'].includes(normalizedSegment)) return true;

  return normalizedSegment === applicantSegment;
}

function matchesApplicantResidency(productResidency: string | null | undefined, applicantResidency: string | null): boolean {
  if (!applicantResidency) return true;

  const normalizedResidency = normalizeMatchValue(productResidency);
  if (!normalizedResidency || ['all', 'any', 'both'].includes(normalizedResidency)) return true;

  if (applicantResidency === 'non_resident') {
    return normalizedResidency === 'non_resident';
  }

  return [
    'resident_expat',
    'resident',
    'expat',
    'uae_national',
    'national',
  ].includes(normalizedResidency);
}

function getTransactionMatchPriority(productTransactionType: string | null | undefined, preferredTransactionType: string): number {
  const normalizedProductTransaction = normalizeMatchValue(productTransactionType);
  const normalizedPreferredTransaction = normalizeMatchValue(preferredTransactionType);

  if (!normalizedPreferredTransaction) return 0;
  if (!normalizedProductTransaction || ['all', 'any', 'both'].includes(normalizedProductTransaction)) return 1;
  if (normalizedProductTransaction === normalizedPreferredTransaction) return 0;

  if (
    normalizedPreferredTransaction === 'handover_resale' &&
    ['handover', 'resale'].includes(normalizedProductTransaction)
  ) {
    return 1;
  }

  if (normalizedPreferredTransaction === 'buyout_equity' && normalizedProductTransaction === 'buyout') {
    return 1;
  }

  return 2;
}

function formatMatchedRateLabel(product: ProductRow): string {
  const fixedMonths = parseFixedPeriodMonths(product);
  const fixedLabel = fixedMonths
    ? `${fixedMonths % 12 === 0 ? `${fixedMonths / 12}yr` : `${fixedMonths}m`} fixed`
    : 'variable';
  const salaryTransferLabel = product.salary_transfer ? ' STL' : '';
  const rate = normalizeRateToDecimal(toNullableNumber(product.rate)) ?? 0;

  return `Rate: ${formatRateValue(rate * 100)}% (${fixedLabel}${salaryTransferLabel})`;
}

function selectPreferredProduct(products: ProductRow[], context: ProductSelectionContext): ProductData | null {
  if (products.length === 0) return null;

  const matchedProducts = products.filter(product => (
    matchesApplicantSegment(product.segment, context.applicantSegment) &&
    matchesApplicantResidency(product.residency, context.applicantResidency)
  ));

  const ratedProducts = matchedProducts
    .map(product => ({
      ...product,
      fixedMonths: parseFixedPeriodMonths(product),
      numericRate: normalizeRateToDecimal(toNullableNumber(product.rate)),
      transactionPriority: getTransactionMatchPriority(product.transaction_type, context.preferredTransactionType),
    }))
    .filter(product => product.numericRate !== null);

  if (ratedProducts.length === 0) return null;

  const chosen = [...ratedProducts].sort((a, b) => {
    if (a.transactionPriority !== b.transactionPriority) {
      return a.transactionPriority - b.transactionPriority;
    }

    if (context.salaryTransfer) {
      const salaryTransferPriorityA = a.salary_transfer === true ? 0 : 1;
      const salaryTransferPriorityB = b.salary_transfer === true ? 0 : 1;
      if (salaryTransferPriorityA !== salaryTransferPriorityB) {
        return salaryTransferPriorityA - salaryTransferPriorityB;
      }
    }

    const fixedPeriodPriorityA = a.fixedMonths === context.preferredFixedMonths ? 0 : a.fixedMonths === null ? 2 : 1;
    const fixedPeriodPriorityB = b.fixedMonths === context.preferredFixedMonths ? 0 : b.fixedMonths === null ? 2 : 1;
    if (fixedPeriodPriorityA !== fixedPeriodPriorityB) {
      return fixedPeriodPriorityA - fixedPeriodPriorityB;
    }

    const fixedPeriodDistanceA = a.fixedMonths === null ? Number.POSITIVE_INFINITY : Math.abs(a.fixedMonths - context.preferredFixedMonths);
    const fixedPeriodDistanceB = b.fixedMonths === null ? Number.POSITIVE_INFINITY : Math.abs(b.fixedMonths - context.preferredFixedMonths);
    if (fixedPeriodDistanceA !== fixedPeriodDistanceB) {
      return fixedPeriodDistanceA - fixedPeriodDistanceB;
    }

    return (a.numericRate ?? Number.POSITIVE_INFINITY) - (b.numericRate ?? Number.POSITIVE_INFINITY);
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

// QualNote imported from BankEligibilityTable

interface QualifyNewProps {
  editApplicantId?: string;
}

export default function QualifyNew({ editApplicantId }: QualifyNewProps = {}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  // Banks, notes & products from Supabase
  const [banks, setBanks] = useState<Bank[]>([]);
  const [qualNotes, setQualNotes] = useState<QualNote[]>([]);
  const [productsByBank, setProductsByBank] = useState<Record<string, ProductData>>({});

  useEffect(() => {
    async function loadBanks() {
      const [bankRes, notesRes] = await Promise.all([
        supabase.from('banks').select('*').eq('active', true),
        supabase.from('qualification_notes').select('*').eq('active', true),
      ]);
      setBanks((bankRes.data ?? []) as any);
      setQualNotes((notesRes.data ?? []) as any);
    }
    loadBanks();
  }, []);

  // Client name
  const [clientName, setClientName] = useState('');

  // Section 1 — Personal
  const [residency, setResidency] = useState('');
  const [nationality, setNationality] = useState('');
  const [dob, setDob] = useState<Date | null>(null);
  const [empType, setEmpType] = useState('');

  // Section 2 — Property
  const [propertyValue, setPropertyValue] = useState(0);
  const [ltv, setLtv] = useState(80);
  const [loanAmount, setLoanAmount] = useState(0);
  const [emirate, setEmirate] = useState('dubai');
  const [isDIFC, setIsDIFC] = useState(false);
  const [isAlAin, setIsAlAin] = useState(false);
  const [txnType, setTxnType] = useState('resale');
  const [salaryTransfer, setSalaryTransfer] = useState(true);
  const [propertyType, setPropertyType] = useState('');
  const [purpose, setPurpose] = useState('');
  const [loanTypePref, setLoanTypePref] = useState('best');
  const [tenorMonths, setTenorMonths] = useState(300);
  const [nominalRate, setNominalRate] = useState(4.5);
  const [stressRate, setStressRate] = useState(7.5);

  // Fetch products and select the best-matched rate per bank for cost comparison
  useEffect(() => {
    async function loadProducts() {
      const applicantSegment = getApplicantSegment(empType);
      const applicantResidency = getApplicantResidency(residency);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data } = await supabase
        .from('products')
        .select('*') as any;

      const filteredProducts = ((data ?? []) as ProductRow[]).filter(product => {
        if (!product.bank_id || toNullableNumber(product.rate) === null) return false;
        if (typeof product.active === 'boolean' && !product.active) return false;
        if (product.status && normalizeMatchValue(product.status) !== 'active') return false;

        if (product.validity_end) {
          const validityEnd = new Date(product.validity_end);
          validityEnd.setHours(0, 0, 0, 0);
          if (!(validityEnd > today)) return false;
        }

        return true;
      });

      const groupedProducts = filteredProducts.reduce<Record<string, ProductRow[]>>((acc, product) => {
        if (!acc[product.bank_id]) acc[product.bank_id] = [];
        acc[product.bank_id].push(product);
        return acc;
      }, {});

      const map: Record<string, ProductData> = {};
      Object.entries(groupedProducts).forEach(([bankId, bankProducts]) => {
        const selectedProduct = selectPreferredProduct(bankProducts, {
          applicantResidency,
          applicantSegment,
          preferredFixedMonths: DEFAULT_COMPARISON_FIXED_MONTHS,
          preferredTransactionType: txnType,
          salaryTransfer,
        });
        if (selectedProduct) {
          map[bankId] = selectedProduct;
        }
      });

      setProductsByBank(map);
    }

    loadProducts();
  }, [txnType, salaryTransfer, empType, residency]);

  // Load existing applicant data when editing
  useEffect(() => {
    if (!editApplicantId) return;
    async function loadApplicant() {
      const [appRes, propRes, incRes, liabRes, cbRes] = await Promise.all([
        supabase.from('applicants').select('*').eq('id', editApplicantId).single(),
        supabase.from('property_details').select('*').eq('applicant_id', editApplicantId).single(),
        supabase.from('income_fields').select('*').eq('applicant_id', editApplicantId),
        supabase.from('liability_fields').select('*').eq('applicant_id', editApplicantId),
        supabase.from('co_borrowers').select('*').eq('applicant_id', editApplicantId).order('index' as any),
      ]);

      const app = appRes.data as any;
      const prop = propRes.data as any;

      if (app) {
        setClientName(app.full_name || '');
        setResidency(app.residency_status || '');
        setNationality(app.nationality || '');
        setDob(app.date_of_birth ? new Date(app.date_of_birth + 'T00:00:00') : null);
        setEmpType(app.employment_type || '');
      }

      if (prop) {
        setPropertyValue(prop.property_value || 0);
        setLoanAmount(prop.loan_amount || 0);
        setLtv(prop.ltv || 80);
        setEmirate(prop.emirate || 'dubai');
        setIsDIFC(prop.is_difc || false);
        setIsAlAin(prop.is_al_ain || false);
        setTxnType(prop.transaction_type || 'resale');
        setPropertyType(prop.property_type || '');
        setPurpose(prop.purpose || '');
        setLoanTypePref(prop.loan_type_preference || 'best');
        setTenorMonths(prop.preferred_tenor_months || 300);
        setNominalRate(prop.nominal_rate || 4.5);
        setStressRate(prop.stress_rate || 7.5);
        // salary_transfer may not be in property_details; keep default
      }

      const incData = (incRes.data ?? []) as any[];
      const mainIncome = incData.filter((f: any) => f.owner_type === 'main');
      if (mainIncome.length > 0) {
        setSelectedIncomeTypes(mainIncome.map((f: any) => f.income_type));
        setIncomeFields(mainIncome.map((f: any) => ({
          income_type: f.income_type,
          amount: f.amount || 0,
          percent_considered: f.percent_considered || 100,
          recurrence: f.recurrence || 'monthly',
        })));
      }

      const liabData = (liabRes.data ?? []) as any[];
      const mainLiab = liabData.filter((f: any) => f.owner_type === 'main');
      if (mainLiab.length > 0) {
        setSelectedLiabilityTypes(mainLiab.map((f: any) => f.liability_type));
        setLiabilityFields(mainLiab.map((f: any) => ({
          liability_type: f.liability_type,
          amount: f.amount || 0,
          credit_card_limit: f.credit_card_limit || 0,
          recurrence: f.recurrence || 'monthly',
          closed_before_application: f.closed_before_application || false,
          liability_letter_obtained: f.liability_letter_obtained || false,
        })));
      }

      const cbData = (cbRes.data ?? []) as any[];
      if (cbData.length > 0) {
        const cbs: CoBorrowerData[] = cbData.map((cb: any, i: number) => {
          const cbIncome = incData.filter((f: any) => f.owner_type === 'co_borrower' && f.co_borrower_index === i);
          const cbLiab = liabData.filter((f: any) => f.owner_type === 'co_borrower' && f.co_borrower_index === i);
          return {
            name: cb.name || '',
            relationship: cb.relationship || '',
            employment_type: cb.employment_type || '',
            date_of_birth: cb.date_of_birth ? new Date(cb.date_of_birth + 'T00:00:00') : null,
            residency_status: cb.residency_status || '',
            incomeFields: cbIncome.map((f: any) => ({
              income_type: f.income_type,
              amount: f.amount || 0,
              percent_considered: f.percent_considered || 100,
              recurrence: f.recurrence || 'monthly',
            })),
            liabilityFields: cbLiab.map((f: any) => ({
              liability_type: f.liability_type,
              amount: f.amount || 0,
              credit_card_limit: f.credit_card_limit || 0,
              recurrence: f.recurrence || 'monthly',
              closed_before_application: f.closed_before_application || false,
              liability_letter_obtained: f.liability_letter_obtained || false,
            })),
            selectedIncomeTypes: cbIncome.map((f: any) => f.income_type),
            selectedLiabilityTypes: cbLiab.map((f: any) => f.liability_type),
          };
        });
        setCoBorrowers(cbs);
      }
    }
    loadApplicant();
  }, [editApplicantId]);

  // Section 3 — Income
  const [selectedIncomeTypes, setSelectedIncomeTypes] = useState<string[]>([]);
  const [incomeFields, setIncomeFields] = useState<IncomeEntry[]>([]);

  // Section 4 — Liabilities
  const [selectedLiabilityTypes, setSelectedLiabilityTypes] = useState<string[]>([]);
  const [liabilityFields, setLiabilityFields] = useState<LiabilityEntry[]>([]);

  // Section 5 — Co-borrowers
  const [coBorrowers, setCoBorrowers] = useState<CoBorrowerData[]>([]);

  // Derived — tenor eligibility
  const mainAge = useMemo(() => getAgeFromDob(dob), [dob]);
  const mainTenorElig = useMemo(() => mainAge !== null ? getTenorEligibility(mainAge.totalMonths) : null, [mainAge]);

  const { bindingTenor, bindingName } = useMemo(() => {
    let minSalaried = mainTenorElig?.salaried ?? 300;
    let minSelfEmployed = mainTenorElig?.selfEmployed ?? 300;
    let bindName = 'Main Applicant';

    coBorrowers.forEach((cb, i) => {
      const cbAge = getAgeFromDob(cb.date_of_birth);
      if (cbAge !== null) {
        const cbElig = getTenorEligibility(cbAge.totalMonths);
        if (cbElig.salaried < minSalaried) {
          minSalaried = cbElig.salaried;
          bindName = cb.name || `Co-Borrower ${i + 1}`;
        }
        if (cbElig.selfEmployed < minSelfEmployed) {
          minSelfEmployed = cbElig.selfEmployed;
        }
      }
    });

    const binding = empType === 'self_employed' ? minSelfEmployed : minSalaried;
    return { bindingTenor: Math.min(300, Math.max(0, binding)), bindingName: bindName };
  }, [mainTenorElig, coBorrowers, empType]);

  const maxTenor = useMemo(() => calculateMaxTenor(dob, empType), [dob, empType]);

  const totalIncome = useMemo(() => {
    let total = 0;
    for (const f of incomeFields) {
      total += normalizeToMonthly(f.amount * f.percent_considered / 100, f.recurrence);
    }
    for (const cb of coBorrowers) {
      for (const f of cb.incomeFields) {
        total += normalizeToMonthly(f.amount * f.percent_considered / 100, f.recurrence);
      }
    }
    return total;
  }, [incomeFields, coBorrowers]);

  const totalLiabilities = useMemo(() => {
    let total = 0;
    const calcLiab = (fields: LiabilityEntry[]) => {
      for (const f of fields) {
        if (f.closed_before_application) continue;
        if (isLimitType(f.liability_type)) total += f.credit_card_limit * 0.05;
        else total += normalizeToMonthly(f.amount, f.recurrence);
      }
    };
    calcLiab(liabilityFields);
    for (const cb of coBorrowers) calcLiab(cb.liabilityFields);
    return total;
  }, [liabilityFields, coBorrowers]);

  const effectiveTenor = Math.min(tenorMonths, bindingTenor);

  // Bank results for what-if
  const bankResults = useBankResults(banks, totalIncome, totalLiabilities, loanAmount, effectiveTenor, stressRate);
  const whatIfAnalysis = useMemo(
    () => buildWhatIfAnalysis(bankResults, totalIncome, totalLiabilities, liabilityFields),
    [bankResults, totalIncome, totalLiabilities, liabilityFields]
  );

  function handleIncomeTypesChange(types: string[]) {
    setSelectedIncomeTypes(types);
    const existing = incomeFields.filter(f => types.includes(f.income_type));
    const newTypes = types.filter(t => !incomeFields.find(f => f.income_type === t));
    setIncomeFields([...existing, ...newTypes.map(createIncomeEntry)]);
  }

  function handleLiabilityTypesChange(types: string[]) {
    setSelectedLiabilityTypes(types);
    const existing = liabilityFields.filter(f => types.includes(f.liability_type));
    const newTypes = types.filter(t => !liabilityFields.find(f => f.liability_type === t));
    setLiabilityFields([...existing, ...newTypes.map(createLiabilityEntry)]);
  }

  function handlePropertyValueChange(val: string) {
    const n = Number(val.replace(/,/g, '')) || 0;
    setPropertyValue(n);
    setLoanAmount(Math.round(n * ltv / 100));
  }

  function handleLtvChange(vals: number[]) {
    setLtv(vals[0]);
    if (propertyValue > 0) setLoanAmount(Math.round(propertyValue * vals[0] / 100));
  }

  function handleLoanAmountChange(val: string) {
    const n = Number(val.replace(/,/g, '')) || 0;
    setLoanAmount(n);
    if (propertyValue > 0) setLtv(Math.round((n / propertyValue) * 100));
  }

  function handleEmirateChange(val: string) {
    setEmirate(val);
    if (val !== 'dubai') setIsDIFC(false);
    if (val !== 'abu_dhabi') setIsAlAin(false);
  }

  // Helper: build serializable bank_results JSONB
  function buildSavedBankResults() {
    return bankResults.map(r => {
      const product = productsByBank[r.bank.id];
      const noteCount = qualNotes.filter(n => n.bank_id === r.bank.id).length;
      return {
        bank_name: r.bank.bank_name,
        stress_rate: r.stressRate,
        monthly_emi: Math.round(r.stressEMI),
        dbr_percent: Math.round(r.dbr * 10) / 10,
        dbr_limit: r.dbrLimit,
        min_salary_met: r.minSalaryMet,
        eligible: r.eligible,
        product_rate: product?.rate != null ? Math.round((product.rate as number) * 10000) / 100 : null,
        fixed_period: product?.fixed_period ?? null,
        qualification_notes_count: noteCount,
      };
    });
  }

  // Helper: build serializable cost_comparison JSONB
  function buildSavedCostComparison() {
    const approved = bankResults.filter(r => r.eligible);
    if (approved.length === 0 || !loanAmount) return [];

    const isDubaiAbuSharjah = ['dubai', 'abu_dhabi', 'sharjah'].includes(emirate);
    const defaultValFee = isDubaiAbuSharjah ? 2500 : 3000;
    const isDubai = emirate === 'dubai';

    const calcEMI = (loan: number, annualRate: number, months: number) => {
      if (!loan || !annualRate || !months) return 0;
      const r = annualRate / 12;
      if (r === 0) return loan / months;
      return (loan * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
    };

    const entries = approved.map(r => {
      const product = productsByBank[r.bank.id];
      const usedRate = product?.rate ?? nominalRate / 100;
      const lifeInsRate = product?.life_ins_monthly_percent ?? 0.00018;
      const propInsRate = product?.prop_ins_annual_percent ?? 0.00035;
      const rawProcFee = product?.processing_fee_percent;
      const processingFeePercent = (rawProcFee !== null && rawProcFee !== undefined && rawProcFee >= 0 && rawProcFee <= 10) ? rawProcFee : 1;
      const fixedMonths = product?.comparison_fixed_months ?? product?.fixed_period_months ?? 24;
      const valFee = product?.valuation_fee ?? defaultValFee;

      const emi = Math.round(calcEMI(loanAmount, usedRate, effectiveTenor));
      const lifeIns = Math.round(loanAmount * lifeInsRate);
      const propIns = Math.round((propertyValue * propInsRate) / 12);
      const totalMonthly = emi + lifeIns + propIns;
      const fixedPeriodTotal = totalMonthly * fixedMonths;

      const dldFee = isDubai ? Math.round(propertyValue * 0.04 + 580) : 0;
      const mortgageReg = Math.round(loanAmount * 0.0025 + 290);
      const transferCentre = 4200;
      const processingFeeAED = Math.round(loanAmount * processingFeePercent / 100);
      const upfrontCosts = dldFee + mortgageReg + transferCentre + processingFeeAED + valFee;
      const grandTotal = fixedPeriodTotal + upfrontCosts;

      return {
        bank_name: r.bank.bank_name,
        nominal_rate: Math.round(usedRate * 10000) / 100,
        monthly_emi: emi,
        life_ins: lifeIns,
        prop_ins: propIns,
        total_monthly: totalMonthly,
        fixed_period_total: fixedPeriodTotal,
        upfront_costs: upfrontCosts,
        grand_total: grandTotal,
        rank: 0,
      };
    });

    entries.sort((a, b) => a.fixed_period_total - b.fixed_period_total);
    entries.forEach((e, i) => { e.rank = i; });
    return entries;
  }

  async function handleSave() {
    if (!user) return;
    if (!residency) { toast.error('Residency Status is required'); return; }
    if (!nationality) { toast.error('Nationality is required'); return; }
    if (!dob) { toast.error('Date of Birth is required'); return; }

    setSaving(true);
    try {
      const savedBankResults = buildSavedBankResults();
      const savedCostComparison = buildSavedCostComparison();
      const representativeDbr = savedBankResults.length > 0 ? savedBankResults[0].dbr_percent : null;

      let appId: string;

      if (editApplicantId) {
        // Update existing applicant
        appId = editApplicantId;
        await supabase.from('applicants').update({
          full_name: clientName || null,
          residency_status: residency,
          nationality,
          date_of_birth: dob ? format(dob, 'yyyy-MM-dd') : null,
          employment_type: empType || null,
        } as any).eq('id', appId);

        // Delete old related records and re-insert
        await Promise.all([
          supabase.from('property_details').delete().eq('applicant_id', appId),
          supabase.from('income_fields').delete().eq('applicant_id', appId),
          supabase.from('liability_fields').delete().eq('applicant_id', appId),
          supabase.from('co_borrowers').delete().eq('applicant_id', appId),
        ]);
      } else {
        // Create new applicant
        const { data: applicant, error: appErr } = await supabase
          .from('applicants')
          .insert({
            user_id: user.id,
            full_name: clientName || null,
            residency_status: residency,
            nationality,
            date_of_birth: dob ? format(dob, 'yyyy-MM-dd') : null,
            employment_type: empType || null,
          } as any)
          .select('id')
          .single();

        if (appErr || !applicant) throw appErr || new Error('Failed to create applicant');
        appId = applicant.id;
      }

      // Always insert a new qualification_results snapshot
      await supabase.from('qualification_results').insert({
        applicant_id: appId,
        loan_amount: loanAmount || null,
        dbr_percent: representativeDbr,
        bank_results: savedBankResults,
        cost_comparison: savedCostComparison,
      } as any);

      await supabase.from('property_details').insert({
        applicant_id: appId,
        property_value: propertyValue || null,
        loan_amount: loanAmount || null,
        ltv: ltv || null,
        emirate,
        is_difc: isDIFC,
        is_al_ain: isAlAin,
        transaction_type: txnType,
        property_type: propertyType || null,
        purpose: purpose || null,
        loan_type_preference: loanTypePref,
        preferred_tenor_months: effectiveTenor,
        nominal_rate: nominalRate,
        stress_rate: stressRate,
      });

      if (incomeFields.length > 0) {
        await supabase.from('income_fields').insert(
          incomeFields.map(f => ({ applicant_id: appId, income_type: f.income_type, amount: f.amount, percent_considered: f.percent_considered, recurrence: f.recurrence, owner_type: 'main' }))
        );
      }

      if (liabilityFields.length > 0) {
        await supabase.from('liability_fields').insert(
          liabilityFields.map(f => ({ applicant_id: appId, liability_type: f.liability_type, amount: f.amount, credit_card_limit: f.credit_card_limit || null, recurrence: f.recurrence, closed_before_application: f.closed_before_application, liability_letter_obtained: f.liability_letter_obtained, owner_type: 'main' }))
        );
      }

      for (let i = 0; i < coBorrowers.length; i++) {
        const cb = coBorrowers[i];
        await supabase.from('co_borrowers').insert({
          applicant_id: appId, index: i, name: cb.name, relationship: cb.relationship,
          employment_type: cb.employment_type, date_of_birth: cb.date_of_birth ? format(cb.date_of_birth, 'yyyy-MM-dd') : null,
          residency_status: cb.residency_status,
        });
        if (cb.incomeFields.length > 0) {
          await supabase.from('income_fields').insert(
            cb.incomeFields.map(f => ({ applicant_id: appId, income_type: f.income_type, amount: f.amount, percent_considered: f.percent_considered, recurrence: f.recurrence, owner_type: 'co_borrower', co_borrower_index: i }))
          );
        }
        if (cb.liabilityFields.length > 0) {
          await supabase.from('liability_fields').insert(
            cb.liabilityFields.map(f => ({ applicant_id: appId, liability_type: f.liability_type, amount: f.amount, credit_card_limit: f.credit_card_limit || null, recurrence: f.recurrence, closed_before_application: f.closed_before_application, liability_letter_obtained: f.liability_letter_obtained, owner_type: 'co_borrower', co_borrower_index: i }))
          );
        }
      }

      toast.success('Qualification saved!');
      navigate(`/qualify/${appId}`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-primary text-primary-foreground flex-shrink-0">
        <div className="flex items-center gap-4 py-3 px-6">
          <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary/80" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">{editApplicantId ? 'Edit Qualification' : 'New Qualification'}</h1>
        </div>
      </header>

      {/* Two-column layout */}
      <div className="flex flex-1 min-h-0">
        {/* LEFT PANEL — Form (40%) */}
        <div className="w-[40%] bg-background overflow-y-auto border-r">
          <div className="p-6 space-y-5">
            {/* CLIENT NAME */}
            <div>
              <Label className="text-xs text-muted-foreground font-semibold">Client Name</Label>
              <Input
                className="mt-1 h-9 text-sm"
                placeholder="Enter client name…"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
              />
            </div>

            {/* SECTION 1 — Personal */}
            <Card>
              <CardHeader className="py-3 px-4"><CardTitle className="text-sm font-semibold text-primary">1. Personal Information</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="grid gap-3 grid-cols-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Residency Status <span className="text-destructive">*</span></Label>
                    <Select value={residency} onValueChange={setResidency}>
                      <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="uae_national">UAE National</SelectItem>
                        <SelectItem value="resident_expat">Resident Expat</SelectItem>
                        <SelectItem value="non_resident">Non-Resident</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Nationality <span className="text-destructive">*</span></Label>
                    <Select value={nationality} onValueChange={setNationality}>
                      <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Date of Birth <span className="text-destructive">*</span></Label>
                    <Input
                      type="date"
                      className="mt-1 h-8 text-xs"
                      max={format(new Date(), 'yyyy-MM-dd')}
                      min="1940-01-01"
                      value={dob ? format(dob, 'yyyy-MM-dd') : ''}
                      onChange={e => {
                        const v = e.target.value;
                        setDob(v ? new Date(v + 'T00:00:00') : null);
                      }}
                    />
                    {mainAge !== null && mainTenorElig && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Age: <strong className="text-primary">{mainAge.years}y</strong> | Max tenor: <strong className="text-primary">{mainTenorElig.salaried}m</strong> (sal) / <strong className="text-primary">{mainTenorElig.selfEmployed}m</strong> (SE)
                      </p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Employment Type</Label>
                    <Select value={empType} onValueChange={setEmpType}>
                      <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="salaried">Salaried</SelectItem>
                        <SelectItem value="self_employed">Self-Employed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* SECTION 2 — Property */}
            <Card>
              <CardHeader className="py-3 px-4"><CardTitle className="text-sm font-semibold text-primary">2. Property & Loan</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="grid gap-3 grid-cols-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Property Value (AED)</Label>
                    <Input className="mt-1 h-8 text-xs" value={propertyValue ? formatCurrency(propertyValue) : ''} onChange={e => handlePropertyValueChange(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">LTV: {ltv}%</Label>
                    <Slider className="mt-3" min={0} max={90} step={1} value={[ltv]} onValueChange={handleLtvChange} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Loan Amount (AED)</Label>
                    <Input className="mt-1 h-8 text-xs" value={loanAmount ? formatCurrency(loanAmount) : ''} onChange={e => handleLoanAmountChange(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Emirate</Label>
                    <Select value={emirate} onValueChange={handleEmirateChange}>
                      <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EMIRATES.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {emirate === 'dubai' && (
                      <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer">
                        <Checkbox checked={isDIFC} onCheckedChange={v => setIsDIFC(!!v)} className="h-3.5 w-3.5" />
                        <span className="text-[10px] text-muted-foreground">DIFC</span>
                      </label>
                    )}
                    {emirate === 'abu_dhabi' && (
                      <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer">
                        <Checkbox checked={isAlAin} onCheckedChange={v => setIsAlAin(!!v)} className="h-3.5 w-3.5" />
                        <span className="text-[10px] text-muted-foreground">Al Ain</span>
                      </label>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Transaction Type</Label>
                    <Select value={txnType} onValueChange={setTxnType}>
                      <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRANSACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Salary Transfer</Label>
                    <Select value={salaryTransfer ? 'yes' : 'no'} onValueChange={v => setSalaryTransfer(v === 'yes')}>
                      <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Property Type</Label>
                    <Select value={propertyType} onValueChange={setPropertyType}>
                      <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {PROPERTY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Purpose</Label>
                    <Select value={purpose} onValueChange={setPurpose}>
                      <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {PURPOSES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Loan Type Preference</Label>
                    <Select value={loanTypePref} onValueChange={setLoanTypePref}>
                      <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LOAN_TYPE_PREFERENCES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Preferred Tenor (months)</Label>
                    <Input type="number" className="mt-1 h-8 text-xs" value={tenorMonths} onChange={e => setTenorMonths(Number(e.target.value))} max={bindingTenor} />
                    {tenorMonths > bindingTenor && <p className="text-[10px] text-destructive mt-0.5">Exceeds binding tenor of {bindingTenor} months</p>}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Nominal Rate %</Label>
                    <Input type="number" step="0.01" className="mt-1 h-8 text-xs" value={nominalRate} onChange={e => setNominalRate(Number(e.target.value))} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Stress Rate %</Label>
                    <Input type="number" step="0.01" className="mt-1 h-8 text-xs" value={stressRate} onChange={e => setStressRate(Number(e.target.value))} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* SECTION 3 — Income */}
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-primary">3. Income</CardTitle>
                  <FieldSelector title="Select income fields" options={INCOME_TYPES} selected={selectedIncomeTypes} onChange={handleIncomeTypesChange} />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {incomeFields.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center">No income fields selected.</p>
                ) : (
                  <div className="space-y-2">
                    {incomeFields.map((f, i) => (
                      <IncomeFieldCard key={f.income_type} entry={f}
                        onChange={e => { const arr = [...incomeFields]; arr[i] = e; setIncomeFields(arr); }}
                        onRemove={() => { setSelectedIncomeTypes(selectedIncomeTypes.filter(t => t !== f.income_type)); setIncomeFields(incomeFields.filter((_, j) => j !== i)); }} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* SECTION 4 — Liabilities */}
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-primary">4. Liabilities</CardTitle>
                  <FieldSelector title="Select liability fields" options={LIABILITY_TYPES} selected={selectedLiabilityTypes} onChange={handleLiabilityTypesChange} />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {liabilityFields.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center">No liability fields selected.</p>
                ) : (
                  <div className="space-y-2">
                    {liabilityFields.map((f, i) => (
                      <LiabilityFieldCard key={f.liability_type} entry={f}
                        onChange={e => { const arr = [...liabilityFields]; arr[i] = e; setLiabilityFields(arr); }}
                        onRemove={() => { setSelectedLiabilityTypes(selectedLiabilityTypes.filter(t => t !== f.liability_type)); setLiabilityFields(liabilityFields.filter((_, j) => j !== i)); }} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* SECTION 5 — Co-borrowers */}
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-primary">5. Co-Borrowers</CardTitle>
                  <Button variant="outline" size="sm" className="h-7 text-xs border-accent text-accent hover:bg-accent hover:text-accent-foreground" onClick={() => setCoBorrowers([...coBorrowers, createCoBorrower()])}>
                    <Plus className="mr-1 h-3 w-3" /> Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {coBorrowers.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center">No co-borrowers added.</p>
                ) : (
                  <div className="space-y-3">
                    {coBorrowers.map((cb, i) => (
                      <CoBorrowerSection key={i} index={i} data={cb}
                        onChange={d => { const arr = [...coBorrowers]; arr[i] = d; setCoBorrowers(arr); }}
                        onRemove={() => setCoBorrowers(coBorrowers.filter((_, j) => j !== i))} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Save */}
            <Button onClick={handleSave} disabled={saving} className="w-full bg-accent text-accent-foreground hover:bg-accent/90" size="lg">
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving…' : editApplicantId ? 'Save & Update' : 'Save Qualification'}
            </Button>
          </div>
        </div>

        {/* RIGHT PANEL — Results (60%) */}
        <div className="w-[60%] bg-secondary overflow-y-auto">
          <div className="p-6 space-y-4">
            {/* Client name display */}
            {clientName && (
              <p className="text-sm font-semibold text-primary">{clientName}</p>
            )}


            {/* Session Reminders — global notes above DBR bar */}
            <SessionRemindersPanel
              notes={qualNotes.filter(n => !n.bank_id)}
              warningsOnly={false}
            />

            {/* Pinned DBR Summary */}
            <div className="sticky top-0 z-10">
              <DBRSummaryBar
                totalIncome={totalIncome}
                totalLiabilities={totalLiabilities}
                loanAmount={loanAmount}
                stressRate={stressRate}
                tenorMonths={effectiveTenor}
              />
            </div>

            {/* Bank Eligibility Table */}
            <BankEligibilityTable
              banks={banks}
              qualNotes={qualNotes}
              totalIncome={totalIncome}
              totalLiabilities={totalLiabilities}
              loanAmount={loanAmount}
              tenorMonths={effectiveTenor}
              stressRate={stressRate}
              employmentType={empType}
              residencyStatus={residency}
            />

            {/* Cost Breakdown */}
            <CostBreakdownSection
              bankResults={bankResults}
              loanAmount={loanAmount}
              propertyValue={propertyValue}
              nominalRate={nominalRate}
              tenorMonths={effectiveTenor}
              emirate={emirate}
              productsByBank={productsByBank}
            />

            {/* What-If Chat */}
            <div style={{ height: '400px' }}>
              <WhatIfChat initialAnalysis={whatIfAnalysis || '✅ All banks are eligible — no what-if scenarios needed.'} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
