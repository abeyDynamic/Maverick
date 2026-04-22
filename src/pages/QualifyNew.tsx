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
import GlobalTickerBar from '@/components/GlobalTickerBar';
import BankEligibilityTable from '@/components/results/BankEligibilityTable';
import WhatIfChat from '@/components/results/WhatIfChat';
import CostBreakdownSection, { type ProductData } from '@/components/results/CostBreakdownSection';
import DebugPanel from '@/components/qualify/DebugPanel';
import SegmentSelector from '@/components/qualify/SegmentSelector';
import NotesPanel, { type ExtractionResult, type WhatIfContext } from '@/components/qualify/NotesPanel';
import SelfEmployedSection from '@/components/qualify/SelfEmployedSection';
import QualificationReadinessCard from '@/components/qualify/QualificationReadinessCard';
import NonResidentSection from '@/components/qualify/NonResidentSection';
import {
  COUNTRIES, INCOME_TYPES, LIABILITY_TYPES, TRANSACTION_TYPES, PROPERTY_TYPES,
  PURPOSES, LOAN_TYPE_PREFERENCES, EMIRATES,
  formatCurrency, calculateStressEMI,
} from '@/lib/mortgage-utils';

// ── Engine imports ──
import {
  type CaseBank,
  type CaseIncomeField,
  type CaseLiabilityField,
  type CaseCoBorrower,
  type ProductRow,
  type PolicyTerm,
  type QualSegment,
  type SelfEmployedInfo,
  type NonResidentInfo,
  type EligibilityRule,
  type IncomePolicy,
  type BankStructuredEvaluation,
  EMPTY_SE_INFO,
  EMPTY_NR_INFO,
  deriveSegment,
  toBankFromRow,
  calcTotalIncome,
  calcTotalLiabilities,
  resolveBindingTenor,
  getAgeFromDob,
  getTenorEligibility,
  calculateMaxTenor,
  runStage1,
  buildWhatIfAnalysis,
  getApplicantSegment,
  getApplicantResidency,
  filterActiveProducts,
  matchProductsToBank,
  DEFAULT_COMPARISON_FIXED_MONTHS,
  evaluateStage2ForBanks,
  getStage2PolicyFilters,
  saveQualificationSnapshot,
  evaluateStructuredRulesForBank,
} from '@/lib/case';

// ── Adapters: convert UI entries to Case engine fields ──
function toEngineIncome(fields: IncomeEntry[]): CaseIncomeField[] {
  return fields.map(f => ({
    incomeType: f.income_type,
    amount: f.amount,
    percentConsidered: f.percent_considered,
    recurrence: f.recurrence,
  }));
}

function toEngineLiability(fields: LiabilityEntry[]): CaseLiabilityField[] {
  return fields.map(f => ({
    liabilityType: f.liability_type,
    amount: f.amount,
    creditCardLimit: f.credit_card_limit,
    recurrence: f.recurrence,
    closedBeforeApplication: f.closed_before_application,
    liabilityLetterObtained: f.liability_letter_obtained,
  }));
}

function toEngineCoBorrowers(cbs: CoBorrowerData[]): CaseCoBorrower[] {
  return cbs.map(cb => ({
    name: cb.name,
    relationship: cb.relationship,
    employmentType: cb.employment_type,
    dateOfBirth: cb.date_of_birth,
    residencyStatus: cb.residency_status,
    incomeFields: toEngineIncome(cb.incomeFields),
    liabilityFields: toEngineLiability(cb.liabilityFields),
    selectedIncomeTypes: cb.selectedIncomeTypes,
    selectedLiabilityTypes: cb.selectedLiabilityTypes,
  }));
}

interface QualifyNewProps {
  editApplicantId?: string;
}

export default function QualifyNew({ editApplicantId }: QualifyNewProps = {}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  // Banks, notes & products from Supabase
  const [banks, setBanks] = useState<CaseBank[]>([]);
  const [allBanks, setAllBanks] = useState<CaseBank[]>([]);
  const [qualNotes, setQualNotes] = useState<QualNote[]>([]);
  const [productRows, setProductRows] = useState<ProductRow[]>([]);
  const [policyTerms, setPolicyTerms] = useState<PolicyTerm[]>([]);
  const [routeSupport, setRouteSupport] = useState<{ bank_id: string; segment_path: string; route_type: string; supported: boolean }[]>([]);
  const [routeExclusions, setRouteExclusions] = useState<Record<string, string>>({});
  const [eligibilityRules, setEligibilityRules] = useState<EligibilityRule[]>([]);
  const [incomePolicies, setIncomePolicies] = useState<IncomePolicy[]>([]);

  useEffect(() => {
    async function loadReferenceData() {
      const [bankRes, notesRes, productRes, routeRes, rulesRes, policiesRes] = await Promise.all([
        supabase.from('banks').select('*').eq('active', true),
        supabase.from('qualification_notes').select('*').eq('active', true),
        supabase.from('products').select('*') as any,
        supabase.from('bank_route_support').select('bank_id, segment_path, route_type, supported') as any,
        supabase.from('bank_eligibility_rules').select('*').eq('active', true) as any,
        supabase.from('bank_income_policies').select('*').eq('active', true) as any,
      ]);
      const allBankData = (bankRes.data ?? []).map(toBankFromRow);
      setAllBanks(allBankData);
      setBanks(allBankData);
      setQualNotes((notesRes.data ?? []) as any);
      setProductRows(filterActiveProducts((productRes.data ?? []) as ProductRow[]));
      setRouteSupport((routeRes.data ?? []) as any);
      setEligibilityRules((rulesRes.data ?? []) as EligibilityRule[]);
      setIncomePolicies((policiesRes.data ?? []) as IncomePolicy[]);
    }
    loadReferenceData();
  }, []);

  // Segment
  const [segment, setSegment] = useState<QualSegment | ''>('');
  const [seInfo, setSeInfo] = useState<SelfEmployedInfo>({ ...EMPTY_SE_INFO });
  const [nrInfo, setNrInfo] = useState<NonResidentInfo>({ ...EMPTY_NR_INFO });

  // Client name
  const [clientName, setClientName] = useState('');

  // Section 1 — Personal
  const [residency, setResidency] = useState('');
  const [nationality, setNationality] = useState('');
  const [dob, setDob] = useState<Date | null>(null);
  const [dobInputMode, setDobInputMode] = useState<'dob' | 'age'>('dob');
  const [ageInput, setAgeInput] = useState<string>('');
  const [empType, setEmpType] = useState('');

  // Section 2 — Property
  const [propertyValue, setPropertyValue] = useState(0);
  const [ltv, setLtv] = useState(80);
  const [loanAmount, setLoanAmount] = useState(0);
  const [emirate, setEmirate] = useState('dubai');
  const [isDIFC, setIsDIFC] = useState(false);
  const [isAlAin, setIsAlAin] = useState(false);
  const [txnType, setTxnType] = useState('resale');
  const [salaryTransfer, setSalaryTransfer] = useState<'stl' | 'nstl' | 'both'>('both');
  const [propertyType, setPropertyType] = useState('');
  const [purpose, setPurpose] = useState('');
  const [loanTypePref, setLoanTypePref] = useState('best');
  const [tenorMonths, setTenorMonths] = useState(300);
  const [nominalRate, setNominalRate] = useState(4.5);
  const [stressRate, setStressRate] = useState(7.5);

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

  // ── Derived values via engines ──
  const mainAge = useMemo(() => getAgeFromDob(dob), [dob]);

  function applyAgeInput(ageStr: string) {
    setAgeInput(ageStr);
    const age = parseInt(ageStr);
    if (!isNaN(age) && age > 18 && age < 90) {
      // Approximate DOB from age — use July 1 of birth year as midpoint
      const birthYear = new Date().getFullYear() - age;
      setDob(new Date(birthYear, 6, 1)); // July 1
    }
  }
  const mainTenorElig = useMemo(() => mainAge !== null ? getTenorEligibility(mainAge.totalMonths) : null, [mainAge]);

  const { bindingTenor, bindingName } = useMemo(
    () => resolveBindingTenor(dob, empType, toEngineCoBorrowers(coBorrowers)),
    [dob, empType, coBorrowers]
  );

  const maxTenor = useMemo(() => calculateMaxTenor(dob, empType), [dob, empType]);

  const engineIncomeFields = useMemo(() => toEngineIncome(incomeFields), [incomeFields]);
  const engineLiabilityFields = useMemo(() => toEngineLiability(liabilityFields), [liabilityFields]);
  const engineCoBorrowers = useMemo(() => toEngineCoBorrowers(coBorrowers), [coBorrowers]);

  const totalIncome = useMemo(
    () => calcTotalIncome(engineIncomeFields, engineCoBorrowers),
    [engineIncomeFields, engineCoBorrowers]
  );

  const totalLiabilities = useMemo(
    () => calcTotalLiabilities(engineLiabilityFields, engineCoBorrowers),
    [engineLiabilityFields, engineCoBorrowers]
  );

  // Extended tenor cap (age 70) — absolute maximum for ADIB/Mashreq
  // bindingTenor (age 65) is advisory — adviser can override up to age 70
  const extendedTenor = useMemo(() => {
    if (!dob) return 300;
    const ageMonths = getAgeFromDob(dob)?.totalMonths ?? 0;
    return Math.min(300, Math.max(0, 70 * 12 - ageMonths - 3));
  }, [dob]);
  const effectiveTenor = dob
    ? Math.min(tenorMonths, extendedTenor)   // hard cap at age 70
    : Math.min(tenorMonths, 300);

  // ── Stage 1 via engine ──
  const bankResults = useMemo(
    () => runStage1(banks, totalIncome, totalLiabilities, loanAmount, effectiveTenor, stressRate),
    [banks, totalIncome, totalLiabilities, loanAmount, effectiveTenor, stressRate]
  );

  const { policySegment, policyEmployment } = useMemo(
    () => getStage2PolicyFilters(residency, empType),
    [residency, empType]
  );

  const bankNames = useMemo(
    () => [...new Set(banks.map(bank => bank.bankName))].sort(),
    [banks]
  );

  const bankNamesKey = useMemo(() => bankNames.join('|'), [bankNames]);

  useEffect(() => {
    if (bankNames.length === 0) {
      setPolicyTerms([]);
      return;
    }

    async function loadPolicyTerms() {
      const { data } = await supabase
        .from('policy_terms')
        .select('*')
        .in('bank', bankNames)
        .eq('segment', policySegment)
        .eq('employment_type', policyEmployment);

      setPolicyTerms((data ?? []) as PolicyTerm[]);
    }

    loadPolicyTerms();
  }, [bankNames, bankNamesKey, policyEmployment, policySegment]);

  const resolvedSegment: QualSegment = segment || deriveSegment(residency, empType);

  // Derive qualification profile fields
  const qualProfile = useMemo(() => {
    const segmentPath = resolvedSegment;
    const employmentSubtype = empType || 'salaried';
    const docPath = resolvedSegment === 'self_employed' ? (seInfo.docType || 'full_doc') : null;
    const routeType = resolvedSegment === 'non_resident' && nrInfo.dabRequired ? 'dab'
      : salaryTransfer === 'stl' ? 'salary_transfer' : salaryTransfer === 'nstl' ? 'non_salary_transfer' : 'salary_transfer';
    return { segmentPath, employmentSubtype, docPath, routeType };
  }, [resolvedSegment, empType, seInfo.docType, nrInfo.dabRequired, salaryTransfer]);

  // Route support filtering — exclude banks that don't support this route
  useEffect(() => {
    if (routeSupport.length === 0) {
      setBanks(allBanks);
      setRouteExclusions({});
      return;
    }
    const exclusions: Record<string, string> = {};
    const filtered = allBanks.filter(bank => {
      const bankRoutes = routeSupport.filter(r => r.bank_id === bank.id && r.segment_path === qualProfile.segmentPath);
      if (bankRoutes.length === 0) return true; // no route data = allow
      const matchingRoute = bankRoutes.find(r => r.route_type === qualProfile.routeType);
      if (matchingRoute && !matchingRoute.supported) {
        exclusions[bank.id] = `Route not supported: ${qualProfile.segmentPath}/${qualProfile.routeType}`;
        return false;
      }
      return true;
    });
    setBanks(filtered);
    setRouteExclusions(exclusions);
  }, [allBanks, routeSupport, qualProfile.segmentPath, qualProfile.routeType]);

  const stage2ByBank = useMemo(
    () => evaluateStage2ForBanks(bankResults, policyTerms, {
      totalIncome,
      loanAmount,
      nationality,
      emirate,
      employmentType: empType,
      segment: resolvedSegment,
    }),
    [bankResults, policyTerms, totalIncome, loanAmount, nationality, emirate, empType, resolvedSegment]
  );

  // ── Structured rules evaluation per bank ──
  const structuredEvalByBank = useMemo<Record<string, BankStructuredEvaluation>>(() => {
    if (eligibilityRules.length === 0 && incomePolicies.length === 0) return {};
    const result: Record<string, BankStructuredEvaluation> = {};
    for (const br of bankResults) {
      result[br.bank.id] = evaluateStructuredRulesForBank(
        br.bank.id,
        eligibilityRules,
        incomePolicies,
        qualProfile as any,
        {
          totalIncome,
          loanAmount,
          ltv,
          tenorMonths: effectiveTenor,
          lobMonths: seInfo.lengthOfBusinessMonths,
          nationality,
          emirate,
        },
      );
    }
    return result;
  }, [bankResults, eligibilityRules, incomePolicies, qualProfile, totalIncome, loanAmount, ltv, effectiveTenor, seInfo.lengthOfBusinessMonths, nationality, emirate]);

  // ── Final eligibility: combine Stage 1, Stage 2 (legacy), and structured rules ──
  const finalEligibleBankIds = useMemo(() => {
    return Object.values(stage2ByBank)
      .filter(entry => {
        // Legacy stage2 check
        if (!entry.productEligible) return false;
        // If structured rules exist for this bank, also require no critical fail
        const structured = structuredEvalByBank[entry.bankId];
        if (structured && structured.ruleResults.length > 0) {
          if (structured.hasCriticalFail) return false;
          if (!structured.isAutomatable) return false;
        }
        return true;
      })
      .map(entry => entry.bankId);
  }, [stage2ByBank, structuredEvalByBank]);

  const finalEligibleBankIdSet = useMemo(
    () => new Set(finalEligibleBankIds),
    [finalEligibleBankIds]
  );

  const finalEligibleBankResults = useMemo(
    () => bankResults.filter(result => finalEligibleBankIdSet.has(result.bank.id)),
    [bankResults, finalEligibleBankIdSet]
  );

  // ── Product filtering: respect segment/doc/route fields on products ──
  const productsByBank = useMemo<Record<string, ProductData>>(
    () => {
      const segmentFilteredProducts = productRows.filter(product => {
        if (!finalEligibleBankIdSet.has(product.bank_id)) return false;
        // Filter by product segment/doc/route fields if they exist
        const p = product as any;
        if (p.employment_subtype && p.employment_subtype !== qualProfile.employmentSubtype) return false;
        if (p.doc_path && p.doc_path !== qualProfile.docPath) return false;
        if (p.route_type && p.route_type !== qualProfile.routeType) return false;
        if (p.manual_only) return false;
        return true;
      });
      return matchProductsToBank(segmentFilteredProducts, {
        applicantResidency: getApplicantResidency(residency),
        applicantSegment: getApplicantSegment(empType),
        preferredFixedMonths: DEFAULT_COMPARISON_FIXED_MONTHS,
        preferredTransactionType: txnType,
        salaryTransfer: salaryTransfer, // 'stl' | 'nstl' | 'both' — product engine handles all three
      });
    },
    [productRows, finalEligibleBankIdSet, residency, empType, txnType, salaryTransfer, qualProfile]
  );

  const stage2DebugRows = useMemo(
    () => Object.values(stage2ByBank)
      .map(entry => entry.debug)
      .sort((a, b) => a.bankName.localeCompare(b.bankName)),
    [stage2ByBank]
  );

  const whatIfAnalysis = useMemo(
    () => buildWhatIfAnalysis(bankResults, totalIncome, totalLiabilities, engineLiabilityFields),
    [bankResults, totalIncome, totalLiabilities, engineLiabilityFields]
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

  // ── Notes extraction handler — hydrates form state from extracted result ──
  function handleExtract(result: ExtractionResult) {
    if (result.client_name) setClientName(result.client_name);
    if (result.segment) setSegment(result.segment as any);
    if (result.residency) setResidency(result.residency);
    if (result.nationality) setNationality(result.nationality);
    if (result.dob) setDob(new Date(result.dob + 'T00:00:00'));
    if (result.employment_type) setEmpType(result.employment_type);
    if (result.emirate) setEmirate(result.emirate);
    if (result.property_value) setPropertyValue(result.property_value);
    if (result.loan_amount) setLoanAmount(result.loan_amount);
    if (result.ltv) setLtv(result.ltv);
    if (result.transaction_type) setTxnType(result.transaction_type);
    if (result.property_type) setPropertyType(result.property_type);
    if (result.purpose) setPurpose(result.purpose);
    if (result.salary_transfer !== null) setSalaryTransfer(result.salary_transfer ? 'stl' : 'nstl');
    if (result.income_fields.length > 0) {
      setSelectedIncomeTypes(result.income_fields.map(f => f.income_type));
      setIncomeFields(result.income_fields.map(f => ({
        income_type: f.income_type,
        amount: f.amount,
        percent_considered: f.percent_considered,
        recurrence: f.recurrence as any,
      })));
    }
    if (result.liability_fields.length > 0) {
      setSelectedLiabilityTypes(result.liability_fields.map(f => f.liability_type));
      setLiabilityFields(result.liability_fields.map(f => ({
        liability_type: f.liability_type,
        amount: f.amount,
        credit_card_limit: f.credit_card_limit,
        recurrence: f.recurrence as any,
        closed_before_application: f.closed_before_application,
        liability_letter_obtained: false,
      })));
    }
  }

  // ── Save via snapshot service ──
  async function handleSave() {
    if (!user) return;
    if (!residency) { toast.error('Residency Status is required'); return; }
    if (!nationality) { toast.error('Nationality is required'); return; }
    // DOB optional — tenor uses default 300m if not provided

    setSaving(true);
    try {
      const resolvedSegment = segment || deriveSegment(residency, empType);
      const appId = await saveQualificationSnapshot({
        userId: user.id,
        editApplicantId,
        applicant: {
          fullName: clientName,
          residencyStatus: residency,
          nationality,
          dateOfBirth: dob,
          employmentType: empType,
          segment: resolvedSegment,
          selfEmployedInfo: resolvedSegment === 'self_employed' ? seInfo : undefined,
          nonResidentInfo: resolvedSegment === 'non_resident' ? nrInfo : undefined,
        },
        property: {
          propertyValue, loanAmount, ltv, emirate, isDIFC, isAlAin,
          transactionType: txnType, salaryTransfer: salaryTransfer === 'stl', propertyType, purpose,
          loanTypePreference: loanTypePref, preferredTenorMonths: tenorMonths,
          nominalRate, stressRate,
        },
        incomeFields: engineIncomeFields,
        liabilityFields: engineLiabilityFields,
        coBorrowers: engineCoBorrowers,
        bankResults,
        stage2ByBank,
        finalEligibleBankIds,
        productsByBank,
        qualNotes,
        effectiveTenor,
      });

      toast.success('Qualification saved!');
      navigate(`/qualify/${appId}`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  // Lightweight save for notes — saves the case silently and returns the applicantId
  async function handleSaveForNotes(): Promise<string | undefined> {
    if (!user) return undefined;
    // If already saved, just return the existing id
    if (editApplicantId) return editApplicantId;
    try {
      const resolvedSegment = segment || deriveSegment(residency || 'resident_expat', empType);
      const appId = await saveQualificationSnapshot({
        userId: user.id,
        editApplicantId,
        applicant: {
          fullName: clientName || 'New Client',
          residencyStatus: residency || 'resident_expat',
          nationality: nationality || '',
          dateOfBirth: dob || null,
          employmentType: empType,
          segment: resolvedSegment,
        },
        property: {
          propertyValue, loanAmount, ltv, emirate, isDIFC, isAlAin,
          transactionType: txnType, salaryTransfer: salaryTransfer === 'stl', propertyType, purpose,
          loanTypePreference: loanTypePref, preferredTenorMonths: tenorMonths,
          nominalRate, stressRate,
        },
        incomeFields: engineIncomeFields,
        liabilityFields: engineLiabilityFields,
        coBorrowers: engineCoBorrowers,
        bankResults,
        stage2ByBank,
        finalEligibleBankIds,
        productsByBank,
        qualNotes,
        effectiveTenor,
      });
      // Update URL silently without navigation
      window.history.replaceState(null, '', `/qualify/${appId}`);
      return appId;
    } catch {
      return undefined;
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
      <GlobalTickerBar />

      {/* Three-column layout */}
      <div className="flex flex-1 min-h-0">

        {/* COLUMN 1 — Smart form (26%) */}
        <div className="w-[26%] bg-background overflow-y-auto border-r flex flex-col">
          <div className="p-4 space-y-3 flex-1">

            {/* Client name + save row */}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Client Name</Label>
                <Input className="mt-1 h-8 text-xs" placeholder="Enter client name…" value={clientName} onChange={e => setClientName(e.target.value)} />
              </div>
              <Button onClick={handleSave} disabled={saving || !segment} size="sm" className="h-8 px-3 text-xs bg-accent text-accent-foreground hover:bg-accent/90 shrink-0">
                <Save className="h-3.5 w-3.5 mr-1" />
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>

            {/* Segment selector */}
            <SegmentSelector
              value={segment}
              onChange={(seg) => {
                setSegment(seg);
                if (seg === 'resident_salaried') {
                  if (!residency || residency === 'non_resident') setResidency('resident_expat');
                  setEmpType('salaried');
                } else if (seg === 'self_employed') {
                  if (!residency || residency === 'non_resident') setResidency('resident_expat');
                  setEmpType('self_employed');
                } else if (seg === 'non_resident') {
                  setResidency('non_resident');
                  setEmpType(nrInfo.employmentTypeNR || 'salaried');
                }
              }}
            />

            {segment && (
              <div className="space-y-3">

                {/* ── PERSONAL — condensed ── */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">Personal</p>
                  <div className="grid grid-cols-2 gap-2">
                    {segment !== 'non_resident' && (
                      <div className="col-span-2">
                        <Label className="text-[10px] text-muted-foreground">Residency <span className="text-destructive">*</span></Label>
                        <Select value={residency} onValueChange={setResidency}>
                          <SelectTrigger className="mt-0.5 h-7 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="uae_national">UAE National</SelectItem>
                            <SelectItem value="resident_expat">Resident Expat</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="col-span-2">
                      <Label className="text-[10px] text-muted-foreground">Nationality <span className="text-destructive">*</span></Label>
                      <Select value={nationality} onValueChange={setNationality}>
                        <SelectTrigger className="mt-0.5 h-7 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent className="max-h-60">
                          {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center justify-between mb-0.5">
                        <Label className="text-[10px] text-muted-foreground">Date of Birth / Age</Label>
                        <div className="flex gap-0 bg-muted rounded overflow-hidden">
                          <button type="button" onClick={() => setDobInputMode('dob')}
                            className={`text-[10px] px-2 py-0.5 ${dobInputMode === 'dob' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/80'}`}>
                            DOB
                          </button>
                          <button type="button" onClick={() => setDobInputMode('age')}
                            className={`text-[10px] px-2 py-0.5 ${dobInputMode === 'age' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/80'}`}>
                            Age
                          </button>
                        </div>
                      </div>
                      {dobInputMode === 'dob' ? (
                        <Input type="date" className="h-7 text-xs" max={format(new Date(), 'yyyy-MM-dd')} min="1940-01-01"
                          value={dob ? format(dob, 'yyyy-MM-dd') : ''}
                          onChange={e => { const v = e.target.value; setDob(v ? new Date(v + 'T00:00:00') : null); }} />
                      ) : (
                        <Input type="number" className="h-7 text-xs" placeholder="e.g. 45" min="18" max="85"
                          value={ageInput}
                          onChange={e => applyAgeInput(e.target.value)} />
                      )}
                      {mainAge !== null && mainTenorElig && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Age: <strong className="text-primary">{mainAge.years}y</strong>
                          · Standard max: <strong className="text-primary">{mainTenorElig.salaried}m</strong>
                          · Extended (70): <strong className="text-primary">{Math.min(300, Math.max(0, 70*12 - (mainAge.totalMonths) - 3))}m</strong>
                          <span className="text-amber-600"> (ADIB/Mashreq no conditions; others need employer letter)</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Segment-specific sections */}
                  {segment === 'self_employed' && <SelfEmployedSection info={seInfo} onChange={setSeInfo} />}

                  {/* Live qualification readiness card */}
                  {segment && (
                    <QualificationReadinessCard
                      segment={segment}
                      income={totalIncome}
                      liabilities={totalLiabilities}
                      loanAmount={loanAmount}
                      tenorMonths={tenorMonths}
                      dob={dob}
                      empType={empType}
                      lobMonths={seInfo.lengthOfBusinessMonths}
                      ownershipPct={seInfo.ownershipSharePercent}
                      incomeRoute={seInfo.incomeRoute}
                      nationality={nationality}
                      residency={residency}
                      emirate={emirate}
                      txnType={txnType}
                      salaryTransfer={salaryTransfer}
                      propertyType={propertyType}
                      purpose={purpose}
                    />
                  )}
                  {segment === 'non_resident' && (
                    <NonResidentSection info={nrInfo} onChange={(info) => { setNrInfo(info); setEmpType(info.employmentTypeNR || 'salaried'); }} />
                  )}
                </div>

                {/* ── PROPERTY — condensed ── */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">Property & Loan</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <Label className="text-[10px] text-muted-foreground">Property Value (AED)</Label>
                      <Input className="mt-0.5 h-7 text-xs" value={propertyValue ? formatCurrency(propertyValue) : ''} onChange={e => handlePropertyValueChange(e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[10px] text-muted-foreground">LTV: {ltv}%</Label>
                      <Slider className="mt-2" min={0} max={90} step={1} value={[ltv]} onValueChange={handleLtvChange} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[10px] text-muted-foreground">Loan Amount (AED)</Label>
                      <Input className="mt-0.5 h-7 text-xs" value={loanAmount ? formatCurrency(loanAmount) : ''} onChange={e => handleLoanAmountChange(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Emirate</Label>
                      <Select value={emirate} onValueChange={handleEmirateChange}>
                        <SelectTrigger className="mt-0.5 h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{EMIRATES.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
                      </Select>
                      {emirate === 'dubai' && <label className="flex items-center gap-1 mt-1 cursor-pointer"><Checkbox checked={isDIFC} onCheckedChange={v => setIsDIFC(!!v)} className="h-3 w-3" /><span className="text-[10px] text-muted-foreground">DIFC</span></label>}
                      {emirate === 'abu_dhabi' && <label className="flex items-center gap-1 mt-1 cursor-pointer"><Checkbox checked={isAlAin} onCheckedChange={v => setIsAlAin(!!v)} className="h-3 w-3" /><span className="text-[10px] text-muted-foreground">Al Ain</span></label>}
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Transaction</Label>
                      <Select value={txnType} onValueChange={setTxnType}>
                        <SelectTrigger className="mt-0.5 h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{TRANSACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Salary Transfer</Label>
                      <Select value={salaryTransfer} onValueChange={v => setSalaryTransfer(v as 'stl' | 'nstl' | 'both')}>
                        <SelectTrigger className="mt-0.5 h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="both">Both (STL + NSTL)</SelectItem>
                          <SelectItem value="stl">Salary Transfer (STL)</SelectItem>
                          <SelectItem value="nstl">No Salary Transfer (NSTL)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Property Type</Label>
                      <Select value={propertyType} onValueChange={setPropertyType}>
                        <SelectTrigger className="mt-0.5 h-7 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{PROPERTY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Purpose</Label>
                      <Select value={purpose} onValueChange={setPurpose}>
                        <SelectTrigger className="mt-0.5 h-7 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{PURPOSES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Loan Type</Label>
                      <Select value={loanTypePref} onValueChange={setLoanTypePref}>
                        <SelectTrigger className="mt-0.5 h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{LOAN_TYPE_PREFERENCES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Tenor (months)</Label>
                      <Input type="number" className="mt-0.5 h-7 text-xs" value={tenorMonths}
                        onChange={e => setTenorMonths(Math.max(1, Number(e.target.value)))}
                        min={12} max={300} />
                      {dob && tenorMonths > bindingTenor && tenorMonths <= (extendedTenor ?? 300) && (
                        <p className="text-[10px] text-amber-600">⚠ Exceeds age-65 standard ({bindingTenor}m). Supported by ADIB and Mashreq up to age 70 — other banks need employer letter.</p>
                      )}
                      {dob && extendedTenor !== undefined && tenorMonths > extendedTenor && (
                        <p className="text-[10px] text-destructive">Exceeds age-70 maximum ({extendedTenor}m).</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Nominal Rate %</Label>
                      <Input type="number" step="0.01" className="mt-0.5 h-7 text-xs" value={nominalRate} onChange={e => setNominalRate(Number(e.target.value))} />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Stress Rate %</Label>
                      <Input type="number" step="0.01" className="mt-0.5 h-7 text-xs" value={stressRate} onChange={e => setStressRate(Number(e.target.value))} />
                    </div>
                  </div>
                </div>

                {/* ── INCOME ── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b pb-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Income</p>
                    <FieldSelector title="Select income fields" options={INCOME_TYPES} selected={selectedIncomeTypes} onChange={handleIncomeTypesChange} />
                  </div>
                  {incomeFields.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground text-center py-2">No income fields selected.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {incomeFields.map((f, i) => (
                        <IncomeFieldCard key={f.income_type} entry={f}
                          onChange={e => { const arr = [...incomeFields]; arr[i] = e; setIncomeFields(arr); }}
                          onRemove={() => { setSelectedIncomeTypes(selectedIncomeTypes.filter(t => t !== f.income_type)); setIncomeFields(incomeFields.filter((_, j) => j !== i)); }} />
                      ))}
                    </div>
                  )}
                </div>

                {/* ── LIABILITIES ── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b pb-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Liabilities</p>
                    <FieldSelector title="Select liability fields" options={LIABILITY_TYPES} selected={selectedLiabilityTypes} onChange={handleLiabilityTypesChange} />
                  </div>
                  {liabilityFields.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground text-center py-2">No liability fields selected.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {liabilityFields.map((f, i) => (
                        <LiabilityFieldCard key={f.liability_type} entry={f}
                          onChange={e => { const arr = [...liabilityFields]; arr[i] = e; setLiabilityFields(arr); }}
                          onRemove={() => { setSelectedLiabilityTypes(selectedLiabilityTypes.filter(t => t !== f.liability_type)); setLiabilityFields(liabilityFields.filter((_, j) => j !== i)); }} />
                      ))}
                    </div>
                  )}
                </div>

                {/* ── CO-BORROWERS ── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b pb-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Co-Borrowers</p>
                    <Button variant="outline" size="sm" className="h-6 text-[10px] border-accent text-accent hover:bg-accent hover:text-accent-foreground px-2" onClick={() => setCoBorrowers([...coBorrowers, createCoBorrower()])}>
                      <Plus className="mr-1 h-3 w-3" /> Add
                    </Button>
                  </div>
                  {coBorrowers.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground text-center py-2">No co-borrowers added.</p>
                  ) : (
                    <div className="space-y-2">
                      {coBorrowers.map((cb, i) => (
                        <CoBorrowerSection key={i} index={i} data={cb}
                          onChange={d => { const arr = [...coBorrowers]; arr[i] = d; setCoBorrowers(arr); }}
                          onRemove={() => setCoBorrowers(coBorrowers.filter((_, j) => j !== i))} />
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        </div>

        {/* COLUMN 2 — Results (44%) */}
        <div className="w-[44%] bg-secondary overflow-y-auto">
          <div className="p-4 space-y-3">
            {clientName && <p className="text-sm font-semibold text-primary">{clientName}</p>}
            <SessionRemindersPanel notes={qualNotes.filter(n => !n.bank_id)} warningsOnly={false} />
            <div className="sticky top-0 z-10">
              <DBRSummaryBar totalIncome={totalIncome} totalLiabilities={totalLiabilities} loanAmount={loanAmount} stressRate={stressRate} tenorMonths={effectiveTenor} />
            </div>
            <BankEligibilityTable bankResults={bankResults} stage2ByBank={stage2ByBank} qualNotes={qualNotes} totalIncome={totalIncome} loanAmount={loanAmount} employmentType={empType} residencyStatus={residency} nationality={nationality} emirate={emirate} />
            <CostBreakdownSection bankResults={finalEligibleBankResults} loanAmount={loanAmount} propertyValue={propertyValue} nominalRate={nominalRate} tenorMonths={effectiveTenor} emirate={emirate} productsByBank={productsByBank} />
          </div>
        </div>

        {/* COLUMN 3 — Notes + What-If (30%) */}
        <div className="w-[30%] bg-background flex flex-col min-h-0">
          <NotesPanel
            embedded
            applicantId={editApplicantId}
            onExtract={handleExtract}
            onRequestSave={handleSaveForNotes}
            whatIfContext={{
              totalIncome,
              totalLiabilities,
              loanAmount,
              stressRate,
              tenorMonths: effectiveTenor,
              currentDbr: totalIncome > 0
                ? ((calculateStressEMI(loanAmount, stressRate, effectiveTenor) + totalLiabilities) / totalIncome) * 100
                : 0,
              eligibleBanks: bankResults.filter(r => r.eligible).map(r => r.bank.bankName),
              ineligibleBanks: bankResults.filter(r => !r.eligible).map(r => r.bank.bankName),
              bankResults,
              liabilityFields: engineLiabilityFields,
            }}
          />
        </div>

      </div>

      {/* Developer Debug Panel — toggle with Ctrl+Shift+D */}
      <DebugPanel
        incomeFields={engineIncomeFields}
        liabilityFields={engineLiabilityFields}
        totalIncome={totalIncome}
        totalLiabilities={totalLiabilities}
        loanAmount={loanAmount}
        stressRate={stressRate}
        tenorMonths={effectiveTenor}
        bankResults={bankResults}
        employmentType={empType}
        residencyStatus={residency}
        nationality={nationality}
        emirate={emirate}
        stage2DebugRows={stage2DebugRows}
        segment={resolvedSegment}
        segmentRoute={segment === 'self_employed' ? `SE/${seInfo.docType || 'unset'}` : segment === 'non_resident' ? `NR/${nrInfo.dabRequired ? 'DAB' : 'standard'}` : 'resident_salaried'}
        qualProfile={qualProfile}
        routeExclusions={routeExclusions}
        structuredEvalByBank={structuredEvalByBank}
      />

    </div>
  );
}
