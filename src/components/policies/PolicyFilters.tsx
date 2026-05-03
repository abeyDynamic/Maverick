import { PolicyFiltersState, PolicyTerm } from '@/lib/policies/policyTypes';
import { uniqueValues } from '@/lib/policies/policyFilters';
import { Button } from '@/components/ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  rows: PolicyTerm[];
  filters: PolicyFiltersState;
  onChange: (f: PolicyFiltersState) => void;
  onClear: () => void;
}

const FIELDS: { key: keyof PolicyFiltersState; label: string; field: keyof PolicyTerm }[] = [
  { key: 'bank', label: 'Bank', field: 'bank' },
  { key: 'segment', label: 'Segment', field: 'segment' },
  { key: 'employment_type', label: 'Employment', field: 'employment_type' },
  { key: 'product_variant', label: 'Product', field: 'product_variant' },
  { key: 'policy_category', label: 'Category', field: 'policy_category' },
  { key: 'canonical_attribute', label: 'Attribute', field: 'canonical_attribute' },
  { key: 'value_status', label: 'Value status', field: 'value_status' },
  { key: 'data_status', label: 'Data status', field: 'data_status' },
  { key: 'source_tab', label: 'Source', field: 'source_tab' },
];

export default function PolicyFilters({ rows, filters, onChange, onClear }: Props) {
  const totalActive = FIELDS.reduce((n, f) => n + (filters[f.key] as string[]).length, 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {FIELDS.map((f) => {
        const opts = uniqueValues(rows, f.field);
        const selected = filters[f.key] as string[];
        return (
          <Popover key={f.key}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-xs">
                {f.label}
                {selected.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px]">
                    {selected.length}
                  </span>
                )}
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <div className="max-h-72 overflow-y-auto">
                {opts.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">No values</p>
                ) : opts.map((opt) => {
                  const checked = selected.includes(opt);
                  return (
                    <button
                      key={opt}
                      onClick={() => {
                        const next = checked ? selected.filter((s) => s !== opt) : [...selected, opt];
                        onChange({ ...filters, [f.key]: next });
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted',
                        checked && 'bg-muted/60',
                      )}
                    >
                      <span className={cn('h-4 w-4 border rounded flex items-center justify-center', checked && 'bg-primary border-primary text-primary-foreground')}>
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <span className="truncate">{opt}</span>
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        );
      })}
      {totalActive > 0 && (
        <Button variant="ghost" size="sm" onClick={onClear} className="text-xs h-9">
          Clear filters ({totalActive})
        </Button>
      )}
    </div>
  );
}
