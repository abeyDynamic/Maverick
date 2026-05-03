import { PolicyTerm } from '@/lib/policies/policyTypes';
import PolicyStatusBadge from './PolicyStatusBadge';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  rows: PolicyTerm[];
  onSelect: (p: PolicyTerm) => void;
}

function truncate(s: string | null, n = 80) {
  if (!s) return '—';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export default function PolicyResultsTable({ rows, onSelect }: Props) {
  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <div className="overflow-x-auto max-h-[60vh]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/60 backdrop-blur z-10">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Bank</th>
              <th className="px-3 py-2 font-medium">Segment</th>
              <th className="px-3 py-2 font-medium">Employment</th>
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Attribute</th>
              <th className="px-3 py-2 font-medium">Value</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-t border-border hover:bg-muted/40 cursor-pointer"
                onClick={() => onSelect(r)}
              >
                <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">{r.bank ?? '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.segment ?? '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.employment_type ?? '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.product_variant ?? '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.policy_category ?? '—'}</td>
                <td className="px-3 py-2 max-w-[180px] truncate" title={r.canonical_attribute ?? ''}>
                  {r.canonical_attribute ?? r.raw_attribute ?? '—'}
                </td>
                <td className="px-3 py-2 max-w-[260px]" title={r.value ?? ''}>
                  {truncate(r.normalized_value ?? r.value)}
                </td>
                <td className="px-3 py-2"><PolicyStatusBadge policy={r} /></td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{r.source_tab ?? '—'}</td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      const text = `${r.bank} | ${r.canonical_attribute ?? r.raw_attribute}: ${r.normalized_value ?? r.value ?? ''}`;
                      navigator.clipboard.writeText(text);
                      toast.success('Copied');
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
