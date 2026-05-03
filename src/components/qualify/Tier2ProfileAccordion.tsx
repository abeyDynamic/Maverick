import { useState } from 'react';
import { ChevronDown, ChevronRight, User, Phone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface Tier2Data {
  lengthOfServiceMonths: number | null;
  lengthOfBusinessMonths: number | null;
  aecbScore: number | null;
  salaryCreditsCount: number | null;
  probationConfirmed: boolean | null;
  employerCategory: string | null;
  visaStatus: string | null;
  countryOfIncome: string | null;
  foreignBureauAvailable: boolean | null;
  foreignBureauScore: number | null;
  currency: string | null;
  phone: string | null;
  email: string | null;
  alternatePhone: string | null;
  address: string | null;
  communicationNotes: string | null;
}

interface Props {
  data: Tier2Data;
  segment: string;
  onChange: (data: Tier2Data) => void;
}

export default function Tier2ProfileAccordion({ data, segment, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isSE = segment === 'self_employed';
  const isNR = segment === 'non_resident';
  const isSalaried = segment === 'resident_salaried';

  const populated = [
    data.lengthOfServiceMonths, data.lengthOfBusinessMonths, data.aecbScore,
    data.salaryCreditsCount, data.probationConfirmed, data.employerCategory,
    data.visaStatus, data.countryOfIncome, data.foreignBureauAvailable,
    data.foreignBureauScore, data.phone, data.email,
  ].filter(v => v !== null && v !== undefined && v !== '').length;

  function update<K extends keyof Tier2Data>(key: K, value: Tier2Data[K]) {
    onChange({ ...data, [key]: value });
  }

  function NumInput({ value, onChange: oc, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
    return (
      <Input
        type="number"
        className="h-7 text-xs mt-0.5"
        placeholder={placeholder}
        value={value ?? ''}
        onChange={e => {
          const v = e.target.value;
          oc(v === '' ? null : parseFloat(v));
        }}
      />
    );
  }

  function TriSelect({ value, onChange: oc }: { value: boolean | null; onChange: (v: boolean | null) => void }) {
    return (
      <select
        className="h-7 text-xs mt-0.5 w-full rounded border border-input bg-background px-2"
        value={value === null ? '' : String(value)}
        onChange={e => oc(e.target.value === '' ? null : e.target.value === 'true')}
      >
        <option value="">Not specified</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }

  return (
    <div className="border rounded-md bg-background">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <span>Client Profile (Tier 2)</span>
          {populated > 0 && (
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
              {populated} filled
            </span>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {expanded ? 'Hide' : 'Policy facts and contact'}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t pt-3">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              <User className="h-3 w-3" /> Personal & Policy
            </div>
            <div className="grid grid-cols-2 gap-2">
              {isSalaried && (
                <>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">LOS (months)</Label>
                    <NumInput value={data.lengthOfServiceMonths} onChange={v => update('lengthOfServiceMonths', v)} placeholder="e.g. 24" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Salary credits visible</Label>
                    <NumInput value={data.salaryCreditsCount} onChange={v => update('salaryCreditsCount', v)} placeholder="e.g. 6" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Probation confirmed?</Label>
                    <TriSelect value={data.probationConfirmed} onChange={v => update('probationConfirmed', v)} />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Employer category</Label>
                    <Input
                      className="h-7 text-xs mt-0.5"
                      placeholder="e.g. Listed / Govt"
                      value={data.employerCategory ?? ''}
                      onChange={e => update('employerCategory', e.target.value || null)}
                    />
                  </div>
                </>
              )}

              {isSE && (
                <div>
                  <Label className="text-[10px] text-muted-foreground">LOB (months)</Label>
                  <NumInput value={data.lengthOfBusinessMonths} onChange={v => update('lengthOfBusinessMonths', v)} placeholder="e.g. 36" />
                </div>
              )}

              <div>
                <Label className="text-[10px] text-muted-foreground">AECB score</Label>
                <NumInput value={data.aecbScore} onChange={v => update('aecbScore', v)} placeholder="300-900" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Visa status</Label>
                <Input
                  className="h-7 text-xs mt-0.5"
                  placeholder="e.g. Employment / Golden"
                  value={data.visaStatus ?? ''}
                  onChange={e => update('visaStatus', e.target.value || null)}
                />
              </div>

              {isNR && (
                <>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Country of income</Label>
                    <Input
                      className="h-7 text-xs mt-0.5"
                      value={data.countryOfIncome ?? ''}
                      onChange={e => update('countryOfIncome', e.target.value || null)}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Currency</Label>
                    <Input
                      className="h-7 text-xs mt-0.5"
                      value={data.currency ?? ''}
                      onChange={e => update('currency', e.target.value || null)}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Foreign bureau available?</Label>
                    <TriSelect value={data.foreignBureauAvailable} onChange={v => update('foreignBureauAvailable', v)} />
                  </div>
                  {data.foreignBureauAvailable && (
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Foreign bureau score</Label>
                      <NumInput value={data.foreignBureauScore} onChange={v => update('foreignBureauScore', v)} />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              <Phone className="h-3 w-3" /> Contact
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Phone</Label>
                <Input
                  className="h-7 text-xs mt-0.5"
                  placeholder="+971..."
                  value={data.phone ?? ''}
                  onChange={e => update('phone', e.target.value || null)}
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Email</Label>
                <Input
                  className="h-7 text-xs mt-0.5"
                  type="email"
                  placeholder="name@example.com"
                  value={data.email ?? ''}
                  onChange={e => update('email', e.target.value || null)}
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Alternate phone</Label>
                <Input
                  className="h-7 text-xs mt-0.5"
                  value={data.alternatePhone ?? ''}
                  onChange={e => update('alternatePhone', e.target.value || null)}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-[10px] text-muted-foreground">Address</Label>
                <Input
                  className="h-7 text-xs mt-0.5"
                  value={data.address ?? ''}
                  onChange={e => update('address', e.target.value || null)}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-[10px] text-muted-foreground">Communication notes</Label>
                <Input
                  className="h-7 text-xs mt-0.5"
                  value={data.communicationNotes ?? ''}
                  onChange={e => update('communicationNotes', e.target.value || null)}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
