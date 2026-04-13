import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { COUNTRIES } from '@/lib/mortgage-utils';
import type { NonResidentInfo } from '@/lib/case/types';

interface NonResidentSectionProps {
  info: NonResidentInfo;
  onChange: (info: NonResidentInfo) => void;
}

export default function NonResidentSection({ info, onChange }: NonResidentSectionProps) {
  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold text-primary">Non-Resident Details</CardTitle>
          {info.dabRequired && (
            <Badge variant="outline" className="text-[9px] border-amber-500 text-amber-600">DAB Required</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <div className="grid gap-3 grid-cols-2">
          <div>
            <Label className="text-xs text-muted-foreground">Country of Residence <span className="text-destructive">*</span></Label>
            <Select value={info.countryOfResidence} onValueChange={v => onChange({ ...info, countryOfResidence: v })}>
              <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent className="max-h-60">
                {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Income Source Country</Label>
            <Select value={info.incomeSourceCountry} onValueChange={v => onChange({ ...info, incomeSourceCountry: v })}>
              <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Same as residence" /></SelectTrigger>
              <SelectContent className="max-h-60">
                {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Employment Type (NR)</Label>
            <Select value={info.employmentTypeNR} onValueChange={v => onChange({ ...info, employmentTypeNR: v })}>
              <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="salaried">Salaried</SelectItem>
                <SelectItem value="self_employed">Self-Employed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col justify-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={info.dabRequired}
                onCheckedChange={v => onChange({ ...info, dabRequired: !!v })}
                className="h-3.5 w-3.5"
              />
              <span className="text-xs text-muted-foreground">DAB (Debt Acknowledgement) Required</span>
            </label>
          </div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded p-2 text-[10px] text-blue-700 dark:text-blue-400">
          ℹ Non-resident underwriting uses the <strong>Non-Resident</strong> policy segment. Some banks may have limited NR product availability.
          {info.dabRequired && (
            <span className="block mt-1">⚠ DAB route is <strong>manual review</strong> — automated eligibility may be incomplete.</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
