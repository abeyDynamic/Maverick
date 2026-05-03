import { CheckCircle2, AlertCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface ReadinessField {
  label: string;
  value: string | null | undefined;
  status: 'confirmed' | 'inferred' | 'missing';
  hint?: string;
}

interface Props {
  segment: string;
  // Tier 1 — DBR
  income: number;
  liabilities: number;
  loanAmount: number;
  tenorMonths: number;
  dob: Date | null;
  empType: string;
  lobMonths?: number | null; // SE only
  ownershipPct?: number | null; // SE only
  incomeRoute?: string; // SE only
  // Tier 2 — Bank policy
  nationality: string;
  residency: string;
  emirate: string;
  txnType: string;
  salaryTransfer: string;
  propertyType: string;
  purpose: string;
}

function FieldRow({ field }: { field: ReadinessField }) {
  const icon = field.status === 'confirmed'
    ? <CheckCircle2 className="h-3 w-3 text-green-600 flex-shrink-0" />
    : field.status === 'inferred'
    ? <AlertCircle className="h-3 w-3 text-amber-500 flex-shrink-0" />
    : <XCircle className="h-3 w-3 text-red-400 flex-shrink-0" />;

  return (
    <div className="flex items-start gap-1.5 py-0.5">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <span className="text-[10px] text-muted-foreground">{field.label}: </span>
        {field.status !== 'missing'
          ? <span className="text-[10px] font-medium text-foreground">{field.value}</span>
          : <span className="text-[10px] text-red-500">Missing{field.hint ? ` — ${field.hint}` : ''}</span>
        }
      </div>
    </div>
  );
}

function fmt(n: number) { return n >= 1000000 ? `AED ${(n/1000000).toFixed(1)}M` : n >= 1000 ? `AED ${(n/1000).toFixed(0)}k` : `AED ${n}`; }

export default function QualificationReadinessCard(props: Props) {
  const [showTier2, setShowTier2] = useState(false);
  const isSE = props.empType === 'self_employed';

  // Tier 1 fields
  const tier1: ReadinessField[] = [
    {
      label: 'Segment',
      value: props.segment === 'resident_salaried' ? 'Resident Salaried' : props.segment === 'self_employed' ? 'Self-Employed' : props.segment === 'non_resident' ? 'Non-Resident' : null,
      status: props.segment ? 'confirmed' : 'missing',
      hint: 'Select segment above',
    },
    {
      label: 'Income',
      value: props.income > 0 ? fmt(props.income) + '/mo' : null,
      status: props.income > 0 ? 'confirmed' : 'missing',
      hint: 'Add income fields',
    },
    {
      label: 'Liabilities',
      value: props.liabilities > 0 ? fmt(props.liabilities) + '/mo' : '0 (confirm)',
      status: props.liabilities > 0 ? 'confirmed' : 'inferred',
    },
    {
      label: 'Loan / Property',
      value: props.loanAmount > 0 ? fmt(props.loanAmount) : null,
      status: props.loanAmount > 0 ? 'confirmed' : 'missing',
      hint: 'Or leave blank for max eligibility',
    },
    {
      label: 'DOB / Age',
      value: props.dob ? `${Math.floor((Date.now() - props.dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000))}y` : null,
      status: props.dob ? 'confirmed' : 'missing',
      hint: 'Needed for accurate tenor — use Age toggle if DOB unknown',
    },
    ...(isSE ? [
      {
        label: 'LOB',
        value: props.lobMonths != null ? `${props.lobMonths} months` : null,
        status: (props.lobMonths != null ? (props.lobMonths < 24 ? 'inferred' : 'confirmed') : 'missing') as 'confirmed' | 'inferred' | 'missing',
        hint: 'Length of business — needed for SE bank eligibility',
      },
      {
        label: 'Ownership Share',
        value: props.ownershipPct != null ? `${props.ownershipPct}%` : null,
        status: (props.ownershipPct != null ? 'confirmed' : 'missing') as 'confirmed' | 'inferred' | 'missing',
        hint: 'Drives qualifying income for SE',
      },
      {
        label: 'Income Route',
        value: props.incomeRoute || null,
        status: (props.incomeRoute ? 'confirmed' : 'missing') as 'confirmed' | 'inferred' | 'missing',
        hint: 'Full doc / Low doc route',
      },
    ] : []),
  ];

  // Tier 2 fields
  const tier2: ReadinessField[] = [
    {
      label: 'Nationality',
      value: props.nationality || null,
      status: props.nationality ? 'confirmed' : 'missing',
      hint: 'Affects bank eligibility rules',
    },
    {
      label: 'Residency',
      value: props.residency || null,
      status: props.residency ? 'confirmed' : 'missing',
    },
    {
      label: 'Emirate',
      value: props.emirate || null,
      status: props.emirate ? 'confirmed' : 'missing',
      hint: 'Ask client — affects routing',
    },
    {
      label: 'Transaction type',
      value: props.txnType || null,
      status: props.txnType ? 'confirmed' : 'missing',
    },
    {
      label: 'STL preference',
      value: props.salaryTransfer === 'both' ? 'Both' : props.salaryTransfer === 'stl' ? 'STL' : props.salaryTransfer === 'nstl' ? 'NSTL' : null,
      status: props.salaryTransfer ? 'confirmed' : 'missing',
    },
    {
      label: 'Property type',
      value: props.propertyType || null,
      status: props.propertyType ? 'confirmed' : 'inferred',
    },
    {
      label: 'Purpose',
      value: props.purpose || null,
      status: props.purpose ? 'confirmed' : 'inferred',
    },
  ];

  const t1Missing = tier1.filter(f => f.status === 'missing').length;
  const t1Ready = t1Missing === 0;
  const t2Missing = tier2.filter(f => f.status === 'missing').length;
  const t2Ready = t2Missing === 0;

  return (
    <div className="border rounded-lg overflow-hidden text-xs bg-background">
      {/* Tier 1 */}
      <div className="px-3 py-2 bg-muted/40 border-b">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Tier 1 — DBR inputs
          </span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${t1Ready ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {t1Ready ? '✓ DBR ready' : `${t1Missing} missing`}
          </span>
        </div>
      </div>
      <div className="px-3 py-2 space-y-0.5">
        {tier1.map(f => <FieldRow key={f.label} field={f} />)}
      </div>

      {/* Tier 2 */}
      <div className="border-t">
        <button
          type="button"
          onClick={() => setShowTier2(v => !v)}
          className="w-full px-3 py-2 bg-muted/40 flex items-center justify-between hover:bg-muted/60 transition-colors"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Tier 2 — Bank policy inputs
          </span>
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${t2Ready ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
              {t2Ready ? '✓ Bank fit ready' : `${t2Missing} missing`}
            </span>
            {showTier2 ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
          </div>
        </button>
        {showTier2 && (
          <div className="px-3 py-2 space-y-0.5">
            {tier2.map(f => <FieldRow key={f.label} field={f} />)}
          </div>
        )}
      </div>
    </div>
  );
}
