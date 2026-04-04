import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { DBRWidget } from '@/components/qualify/DBRWidget';
import { FieldSelector } from '@/components/qualify/FieldSelector';
import { IncomeFieldCard, IncomeEntry, createIncomeEntry } from '@/components/qualify/IncomeFieldCard';
import { LiabilityFieldCard, LiabilityEntry, createLiabilityEntry } from '@/components/qualify/LiabilityFieldCard';
import { CoBorrowerSection, CoBorrowerData, createCoBorrower } from '@/components/qualify/CoBorrowerSection';
import {
  COUNTRIES, INCOME_TYPES, LIABILITY_TYPES, TRANSACTION_TYPES, PROPERTY_TYPES,
  PURPOSES, LOAN_TYPE_PREFERENCES, EMIRATES,
  normalizeToMonthly, isLimitType, formatCurrency, calculateMaxTenor,
  getAgeFromDob, getTenorEligibility
} from '@/lib/mortgage-utils';

export default function QualifyNew() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

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
  const [propertyType, setPropertyType] = useState('');
  const [purpose, setPurpose] = useState('');
  const [loanTypePref, setLoanTypePref] = useState('best');
  const [tenorMonths, setTenorMonths] = useState(300);
  const [nominalRate, setNominalRate] = useState(4.5);
  const [stressRate, setStressRate] = useState(7.5);

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
  const mainTenorElig = useMemo(() => mainAge !== null ? getTenorEligibility(mainAge) : null, [mainAge]);

  // Binding tenor across all applicants
  const { bindingTenor, bindingName } = useMemo(() => {
    let minSalaried = mainTenorElig?.salaried ?? 300;
    let minSelfEmployed = mainTenorElig?.selfEmployed ?? 300;
    let bindName = 'Main Applicant';

    coBorrowers.forEach((cb, i) => {
      const cbAge = getAgeFromDob(cb.date_of_birth);
      if (cbAge !== null) {
        const cbElig = getTenorEligibility(cbAge);
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

  // No effectiveLoan memo — loanAmount is the single source of truth, kept in sync by handlers

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

  async function handleSave() {
    if (!user) return;
    // Validation: only 3 required fields
    if (!residency) { toast.error('Residency Status is required'); return; }
    if (!nationality) { toast.error('Nationality is required'); return; }
    if (!dob) { toast.error('Date of Birth is required'); return; }

    setSaving(true);
    try {
      const { data: applicant, error: appErr } = await supabase
        .from('applicants')
        .insert({
          user_id: user.id,
          residency_status: residency,
          nationality,
          date_of_birth: dob ? format(dob, 'yyyy-MM-dd') : null,
          employment_type: empType || null,
        })
        .select('id')
        .single();

      if (appErr || !applicant) throw appErr || new Error('Failed to create applicant');
      const appId = applicant.id;

      // Property
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
        preferred_tenor_months: Math.min(tenorMonths, bindingTenor),
        nominal_rate: nominalRate,
        stress_rate: stressRate,
      });

      // Income
      if (incomeFields.length > 0) {
        await supabase.from('income_fields').insert(
          incomeFields.map(f => ({ applicant_id: appId, income_type: f.income_type, amount: f.amount, percent_considered: f.percent_considered, recurrence: f.recurrence, owner_type: 'main' }))
        );
      }

      // Liabilities
      if (liabilityFields.length > 0) {
        await supabase.from('liability_fields').insert(
          liabilityFields.map(f => ({ applicant_id: appId, liability_type: f.liability_type, amount: f.amount, credit_card_limit: f.credit_card_limit || null, recurrence: f.recurrence, closed_before_application: f.closed_before_application, liability_letter_obtained: f.liability_letter_obtained, owner_type: 'main' }))
        );
      }

      // Co-borrowers
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
      navigate(`/results/${appId}`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-secondary">
      <header className="bg-primary text-primary-foreground">
        <div className="container mx-auto flex items-center gap-4 py-4 px-6">
          <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-accent" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">New Client Qualification</h1>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
          {/* Left column — Form */}
          <div className="space-y-6">
            {/* SECTION 1 — Personal */}
            <Card className="bg-background">
              <CardHeader><CardTitle className="text-lg text-primary">1. Personal Information</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="text-sm text-muted-foreground">Residency Status <span className="text-destructive">*</span></Label>
                    <Select value={residency} onValueChange={setResidency}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="uae_national">UAE National</SelectItem>
                        <SelectItem value="resident_expat">Resident Expat</SelectItem>
                        <SelectItem value="non_resident">Non-Resident</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Nationality <span className="text-destructive">*</span></Label>
                    <Select value={nationality} onValueChange={setNationality}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Date of Birth <span className="text-destructive">*</span></Label>
                    <Input
                      type="date"
                      className="mt-1"
                      max={format(new Date(), 'yyyy-MM-dd')}
                      min="1940-01-01"
                      value={dob ? format(dob, 'yyyy-MM-dd') : ''}
                      onChange={e => {
                        const v = e.target.value;
                        setDob(v ? new Date(v + 'T00:00:00') : null);
                      }}
                    />
                    {mainAge !== null && mainTenorElig && (
                      <div className="mt-1.5 text-xs text-muted-foreground space-y-0.5">
                        <p>Age: <strong className="text-primary">{mainAge}</strong> | Max tenor: <strong className="text-primary">{mainTenorElig.salaried} months</strong> (salaried) / <strong className="text-primary">{mainTenorElig.selfEmployed} months</strong> (self-employed)</p>
                        {coBorrowers.length > 0 && (
                          <p className="text-accent font-medium">Binding tenor: {bindingTenor} months based on {bindingName}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Employment Type</Label>
                    <Select value={empType} onValueChange={setEmpType}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
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
            <Card className="bg-background">
              <CardHeader><CardTitle className="text-lg text-primary">2. Property & Loan</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="text-sm text-muted-foreground">Property Value (AED)</Label>
                    <Input className="mt-1" value={propertyValue ? formatCurrency(propertyValue) : ''} onChange={e => handlePropertyValueChange(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">LTV: {ltv}%</Label>
                    <Slider className="mt-3" min={0} max={90} step={1} value={[ltv]} onValueChange={handleLtvChange} />
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Loan Amount (AED)</Label>
                    <Input className="mt-1" value={loanAmount ? formatCurrency(loanAmount) : ''} onChange={e => handleLoanAmountChange(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Emirate</Label>
                    <Select value={emirate} onValueChange={handleEmirateChange}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EMIRATES.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {emirate === 'dubai' && (
                      <label className="flex items-center gap-2 mt-2 cursor-pointer">
                        <Checkbox checked={isDIFC} onCheckedChange={v => setIsDIFC(!!v)} />
                        <span className="text-xs text-muted-foreground">Property is in DIFC</span>
                      </label>
                    )}
                    {emirate === 'abu_dhabi' && (
                      <label className="flex items-center gap-2 mt-2 cursor-pointer">
                        <Checkbox checked={isAlAin} onCheckedChange={v => setIsAlAin(!!v)} />
                        <span className="text-xs text-muted-foreground">Property is in Al Ain</span>
                      </label>
                    )}
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Transaction Type</Label>
                    <Select value={txnType} onValueChange={setTxnType}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRANSACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Property Type</Label>
                    <Select value={propertyType} onValueChange={setPropertyType}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {PROPERTY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Purpose</Label>
                    <Select value={purpose} onValueChange={setPurpose}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {PURPOSES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Loan Type Preference</Label>
                    <Select value={loanTypePref} onValueChange={setLoanTypePref}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LOAN_TYPE_PREFERENCES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Preferred Tenor (months)</Label>
                    <Input type="number" className="mt-1" value={tenorMonths} onChange={e => setTenorMonths(Number(e.target.value))} max={bindingTenor} />
                    {tenorMonths > bindingTenor && <p className="text-xs text-destructive mt-1">Exceeds binding tenor of {bindingTenor} months</p>}
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Nominal Rate %</Label>
                    <Input type="number" step="0.01" className="mt-1" value={nominalRate} onChange={e => setNominalRate(Number(e.target.value))} />
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Stress Rate %</Label>
                    <Input type="number" step="0.01" className="mt-1" value={stressRate} onChange={e => setStressRate(Number(e.target.value))} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* SECTION 3 — Income */}
            <Card className="bg-background">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-primary">3. Income</CardTitle>
                  <FieldSelector title="Select income fields" options={INCOME_TYPES} selected={selectedIncomeTypes} onChange={handleIncomeTypesChange} />
                </div>
              </CardHeader>
              <CardContent>
                {incomeFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No income fields selected. Click the button above to add.</p>
                ) : (
                  <div className="space-y-3">
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
            <Card className="bg-background">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-primary">4. Liabilities</CardTitle>
                  <FieldSelector title="Select liability fields" options={LIABILITY_TYPES} selected={selectedLiabilityTypes} onChange={handleLiabilityTypesChange} />
                </div>
              </CardHeader>
              <CardContent>
                {liabilityFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No liability fields selected. Click the button above to add.</p>
                ) : (
                  <div className="space-y-3">
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
            <Card className="bg-background">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-primary">5. Co-Borrowers</CardTitle>
                  <Button variant="outline" size="sm" className="border-accent text-accent hover:bg-accent hover:text-accent-foreground" onClick={() => setCoBorrowers([...coBorrowers, createCoBorrower()])}>
                    <Plus className="mr-1 h-4 w-4" /> Add co-borrower
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {coBorrowers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No co-borrowers added.</p>
                ) : (
                  <div className="space-y-4">
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
            <Button onClick={handleSave} disabled={saving} className="w-full bg-accent text-accent-foreground hover:bg-mid-blue" size="lg">
              <Save className="mr-2 h-5 w-5" />
              {saving ? 'Saving…' : 'Save & View Results'}
            </Button>
          </div>

          {/* Right column — DBR Widget */}
          <div className="hidden lg:block">
            <div className="sticky top-8">
              <DBRWidget
                totalIncome={totalIncome}
                totalLiabilities={totalLiabilities}
                loanAmount={loanAmount}
                stressRate={stressRate}
                tenorMonths={Math.min(tenorMonths, bindingTenor)}
              />
            </div>
          </div>
        </div>

        {/* Mobile DBR — fixed bottom */}
        <div className="lg:hidden fixed bottom-4 right-4 left-4 z-50">
          <DBRWidget
            totalIncome={totalIncome}
            totalLiabilities={totalLiabilities}
            loanAmount={loanAmount}
            stressRate={stressRate}
            tenorMonths={Math.min(tenorMonths, bindingTenor)}
          />
        </div>
      </main>
    </div>
  );
}
