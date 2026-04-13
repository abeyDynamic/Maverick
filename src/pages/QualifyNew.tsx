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
import {
  COUNTRIES, INCOME_TYPES, LIABILITY_TYPES, TRANSACTION_TYPES, PROPERTY_TYPES,
  PURPOSES, LOAN_TYPE_PREFERENCES, EMIRATES,
  formatCurrency,
} from '@/lib/mortgage-utils';

// ── Engine imports ──
import {
  type CaseBank,
  type CaseIncomeField,
  type CaseLiabilityField,
  type CaseCoBorrower,
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
  saveQualificationSnapshot,
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
  const [qualNotes, setQualNotes] = useState<QualNote[]>([]);
  const [productsByBank, setProductsByBank] = useState<Record<string, ProductData>>({});

  useEffect(() => {
    async function loadBanks() {
      const [bankRes, notesRes] = await Promise.all([
        supabase.from('banks').select('*').eq('active', true),
        supabase.from('qualification_notes').select('*').eq('active', true),
      ]);
      setBanks((bankRes.data ?? []).map(toBankFromRow));
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

  // Fetch products via product engine
  useEffect(() => {
    async function loadProducts() {
      const { data } = await supabase.from('products').select('*') as any;
      const active = filterActiveProducts(data ?? []);
      const map = matchProductsToBank(active, {
        applicantResidency: getApplicantResidency(residency),
        applicantSegment: getApplicantSegment(empType),
        preferredFixedMonths: DEFAULT_COMPARISON_FIXED_MONTHS,
        preferredTransactionType: txnType,
        salaryTransfer,
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

  const effectiveTenor = Math.min(tenorMonths, bindingTenor);

  // ── Stage 1 via engine ──
  const bankResults = useMemo(
    () => runStage1(banks, totalIncome, totalLiabilities, loanAmount, effectiveTenor, stressRate),
    [banks, totalIncome, totalLiabilities, loanAmount, effectiveTenor, stressRate]
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

  // ── Save via snapshot service ──
  async function handleSave() {
    if (!user) return;
    if (!residency) { toast.error('Residency Status is required'); return; }
    if (!nationality) { toast.error('Nationality is required'); return; }
    if (!dob) { toast.error('Date of Birth is required'); return; }

    setSaving(true);
    try {
      const appId = await saveQualificationSnapshot({
        userId: user.id,
        editApplicantId,
        applicant: {
          fullName: clientName,
          residencyStatus: residency,
          nationality,
          dateOfBirth: dob,
          employmentType: empType,
        },
        property: {
          propertyValue, loanAmount, ltv, emirate, isDIFC, isAlAin,
          transactionType: txnType, salaryTransfer, propertyType, purpose,
          loanTypePreference: loanTypePref, preferredTenorMonths: tenorMonths,
          nominalRate, stressRate,
        },
        incomeFields: engineIncomeFields,
        liabilityFields: engineLiabilityFields,
        coBorrowers: engineCoBorrowers,
        bankResults,
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
              bankResults={bankResults}
              qualNotes={qualNotes}
              totalIncome={totalIncome}
              loanAmount={loanAmount}
              employmentType={empType}
              residencyStatus={residency}
              nationality={nationality}
              emirate={emirate}
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
      />
    </div>
  );
}
