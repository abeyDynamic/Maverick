import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { isLimitType, normalizeToMonthly, formatCurrency } from '@/lib/mortgage-utils';

export interface LiabilityEntry {
  liability_type: string;
  amount: number;
  credit_card_limit: number;
  recurrence: string;
  closed_before_application: boolean;
  liability_letter_obtained: boolean;
}

interface Props {
  entry: LiabilityEntry;
  onChange: (e: LiabilityEntry) => void;
  onRemove: () => void;
}

export function LiabilityFieldCard({ entry, onChange, onRemove }: Props) {
  const isLimit = isLimitType(entry.liability_type);
  const monthlyImpact = entry.closed_before_application ? 0 :
    isLimit ? entry.credit_card_limit * 0.05 :
    normalizeToMonthly(entry.amount, entry.recurrence);

  return (
    <div className="rounded-lg border p-4 bg-background space-y-3 relative">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-primary text-sm">{entry.liability_type}</h4>
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {isLimit ? (
          <div>
            <Label className="text-xs text-muted-foreground">Limit (AED)</Label>
            <Input type="text" value={entry.credit_card_limit || ''} onChange={e => onChange({ ...entry, credit_card_limit: Number(e.target.value.replace(/,/g, '')) || 0 })} className="mt-1" />
          </div>
        ) : (
          <>
            <div>
              <Label className="text-xs text-muted-foreground">Monthly EMI (AED)</Label>
              <Input type="text" value={entry.amount || ''} onChange={e => onChange({ ...entry, amount: Number(e.target.value.replace(/,/g, '')) || 0 })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Frequency</Label>
              <Select value={entry.recurrence} onValueChange={v => onChange({ ...entry, recurrence: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="bi-annually">Bi-annually</SelectItem>
                  <SelectItem value="annually">Annually</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={entry.closed_before_application} onCheckedChange={v => onChange({ ...entry, closed_before_application: !!v })} />
          <span className="text-xs">Closing before application</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={entry.liability_letter_obtained} onCheckedChange={v => onChange({ ...entry, liability_letter_obtained: !!v })} />
          <span className="text-xs">Liability letter obtained</span>
        </label>
      </div>
      <Badge variant={entry.closed_before_application ? 'outline' : 'secondary'} className="text-xs">
        Monthly Impact: AED {formatCurrency(monthlyImpact)} {entry.closed_before_application && '(excluded)'}
      </Badge>
    </div>
  );
}

export function createLiabilityEntry(type: string): LiabilityEntry {
  return {
    liability_type: type,
    amount: 0,
    credit_card_limit: 0,
    recurrence: 'monthly',
    closed_before_application: false,
    liability_letter_obtained: false,
  };
}
