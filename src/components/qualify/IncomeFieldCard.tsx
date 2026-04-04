import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { INCOME_DEFAULTS, normalizeToMonthly, formatCurrency } from '@/lib/mortgage-utils';

export interface IncomeEntry {
  income_type: string;
  amount: number;
  percent_considered: number;
  recurrence: string;
}

interface Props {
  entry: IncomeEntry;
  onChange: (e: IncomeEntry) => void;
  onRemove: () => void;
}

export function IncomeFieldCard({ entry, onChange, onRemove }: Props) {
  const effectiveMonthly = normalizeToMonthly(entry.amount * entry.percent_considered / 100, entry.recurrence);

  return (
    <div className="rounded-lg border p-4 bg-background space-y-3 relative">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-primary text-sm">{entry.income_type}</h4>
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Amount (AED)</Label>
          <Input
            type="text"
            value={entry.amount || ''}
            onChange={e => onChange({ ...entry, amount: Number(e.target.value.replace(/,/g, '')) || 0 })}
            className="mt-1"
          />
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
        <div>
          <Label className="text-xs text-muted-foreground">% Considered</Label>
          <Input
            type="number" min={0} max={100}
            value={entry.percent_considered}
            onChange={e => onChange({ ...entry, percent_considered: Number(e.target.value) })}
            className="mt-1"
          />
        </div>
      </div>
      <Badge variant="secondary" className="text-xs">
        Effective Monthly: AED {formatCurrency(effectiveMonthly)}
      </Badge>
    </div>
  );
}

export function createIncomeEntry(type: string): IncomeEntry {
  return {
    income_type: type,
    amount: 0,
    percent_considered: INCOME_DEFAULTS[type] ?? 0,
    recurrence: 'monthly',
  };
}
