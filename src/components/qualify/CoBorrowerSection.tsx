import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Trash2 } from 'lucide-react';
import { FieldSelector } from './FieldSelector';
import { IncomeFieldCard, IncomeEntry, createIncomeEntry } from './IncomeFieldCard';
import { LiabilityFieldCard, LiabilityEntry, createLiabilityEntry } from './LiabilityFieldCard';
import { INCOME_TYPES, LIABILITY_TYPES, getAgeFromDob, getTenorEligibility } from '@/lib/mortgage-utils';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export interface CoBorrowerData {
  name: string;
  relationship: string;
  employment_type: string;
  date_of_birth: Date | null;
  residency_status: string;
  incomeFields: IncomeEntry[];
  liabilityFields: LiabilityEntry[];
  selectedIncomeTypes: string[];
  selectedLiabilityTypes: string[];
}

interface Props {
  index: number;
  data: CoBorrowerData;
  onChange: (d: CoBorrowerData) => void;
  onRemove: () => void;
}

export function CoBorrowerSection({ index, data, onChange, onRemove }: Props) {
  const [open, setOpen] = useState(true);

  function updateIncome(types: string[]) {
    const existing = data.incomeFields.filter(f => types.includes(f.income_type));
    const newTypes = types.filter(t => !data.incomeFields.find(f => f.income_type === t));
    onChange({ ...data, selectedIncomeTypes: types, incomeFields: [...existing, ...newTypes.map(createIncomeEntry)] });
  }

  function updateLiability(types: string[]) {
    const existing = data.liabilityFields.filter(f => types.includes(f.liability_type));
    const newTypes = types.filter(t => !data.liabilityFields.find(f => f.liability_type === t));
    onChange({ ...data, selectedLiabilityTypes: types, liabilityFields: [...existing, ...newTypes.map(createLiabilityEntry)] });
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-background">
      <div className="flex items-center justify-between p-4">
        <CollapsibleTrigger className="flex items-center gap-2 hover:text-accent">
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          <span className="font-medium text-primary">Co-Borrower {index + 1}{data.name ? ` — ${data.name}` : ''}</span>
        </CollapsibleTrigger>
        <Button variant="ghost" size="sm" onClick={onRemove} className="text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <CollapsibleContent className="px-4 pb-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Full Name</Label>
            <Input value={data.name} onChange={e => onChange({ ...data, name: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Relationship</Label>
            <Select value={data.relationship} onValueChange={v => onChange({ ...data, relationship: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {['Husband','Wife','Father','Mother','Son','Daughter','Brother','Sister'].map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Employment Type</Label>
            <Select value={data.employment_type} onValueChange={v => onChange({ ...data, employment_type: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="salaried">Salaried</SelectItem>
                <SelectItem value="self_employed">Self-Employed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Date of Birth</Label>
            <Input
              type="date"
              className="mt-1"
              max={format(new Date(), 'yyyy-MM-dd')}
              min="1940-01-01"
              value={data.date_of_birth ? format(data.date_of_birth, 'yyyy-MM-dd') : ''}
              onChange={e => {
                const v = e.target.value;
                onChange({ ...data, date_of_birth: v ? new Date(v + 'T00:00:00') : null });
              }}
            />
            {(() => {
              const cbAge = getAgeFromDob(data.date_of_birth);
              if (cbAge === null) return null;
              const elig = getTenorEligibility(cbAge.totalMonths);
              return (
                <p className="mt-1 text-xs text-muted-foreground">
                  Age: <strong className="text-primary">{cbAge.years}</strong> years | Max tenor: <strong className="text-primary">{elig.salaried}m</strong> (salaried) / <strong className="text-primary">{elig.selfEmployed}m</strong> (self-employed)
                </p>
              );
            })()}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Residency Status</Label>
            <Select value={data.residency_status} onValueChange={v => onChange({ ...data, residency_status: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="uae_national">UAE National</SelectItem>
                <SelectItem value="resident_expat">Resident Expat</SelectItem>
                <SelectItem value="non_resident">Non-Resident</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-3 mb-3">
            <h4 className="text-sm font-medium text-primary">Income</h4>
            <FieldSelector title="Select income fields" options={INCOME_TYPES} selected={data.selectedIncomeTypes} onChange={updateIncome} />
          </div>
          <div className="space-y-3">
            {data.incomeFields.map((f, i) => (
              <IncomeFieldCard key={f.income_type} entry={f}
                onChange={e => { const arr = [...data.incomeFields]; arr[i] = e; onChange({ ...data, incomeFields: arr }); }}
                onRemove={() => onChange({ ...data, selectedIncomeTypes: data.selectedIncomeTypes.filter(t => t !== f.income_type), incomeFields: data.incomeFields.filter((_, j) => j !== i) })} />
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-3 mb-3">
            <h4 className="text-sm font-medium text-primary">Liabilities</h4>
            <FieldSelector title="Select liability fields" options={LIABILITY_TYPES} selected={data.selectedLiabilityTypes} onChange={updateLiability} />
          </div>
          <div className="space-y-3">
            {data.liabilityFields.map((f, i) => (
              <LiabilityFieldCard key={f.liability_type} entry={f}
                onChange={e => { const arr = [...data.liabilityFields]; arr[i] = e; onChange({ ...data, liabilityFields: arr }); }}
                onRemove={() => onChange({ ...data, selectedLiabilityTypes: data.selectedLiabilityTypes.filter(t => t !== f.liability_type), liabilityFields: data.liabilityFields.filter((_, j) => j !== i) })} />
            ))}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function createCoBorrower(): CoBorrowerData {
  return { name: '', relationship: '', employment_type: '', date_of_birth: null, residency_status: '', incomeFields: [], liabilityFields: [], selectedIncomeTypes: [], selectedLiabilityTypes: [] };
}
