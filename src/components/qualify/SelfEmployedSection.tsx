import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { SelfEmployedInfo } from '@/lib/case/types';

interface SelfEmployedSectionProps {
  info: SelfEmployedInfo;
  onChange: (info: SelfEmployedInfo) => void;
}

const INCOME_BASIS_OPTIONS = [
  { value: 'audited_financials', label: 'Audited Financials' },
  { value: 'bank_statements', label: 'Bank Statements (6–12 months)' },
  { value: 'trade_license', label: 'Trade License + Returns' },
];

export default function SelfEmployedSection({ info, onChange }: SelfEmployedSectionProps) {
  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold text-primary">Business Information</CardTitle>
          {info.docType === 'low_doc' && (
            <Badge variant="outline" className="text-[9px] border-amber-500 text-amber-600">Low-Doc Path</Badge>
          )}
          {info.docType === 'full_doc' && (
            <Badge variant="outline" className="text-[9px] border-green-600 text-green-700">Full-Doc Path</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <div className="grid gap-3 grid-cols-2">
          <div>
            <Label className="text-xs text-muted-foreground">Documentation Type <span className="text-destructive">*</span></Label>
            <Select value={info.docType} onValueChange={v => onChange({ ...info, docType: v as 'full_doc' | 'low_doc' })}>
              <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full_doc">Full Documentation</SelectItem>
                <SelectItem value="low_doc">Low Documentation</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Business / Company Name</Label>
            <Input
              className="mt-1 h-8 text-xs"
              placeholder="Company name"
              value={info.businessName}
              onChange={e => onChange({ ...info, businessName: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Length of Business (months)</Label>
            <Input
              type="number"
              className="mt-1 h-8 text-xs"
              placeholder="e.g. 36"
              value={info.lengthOfBusinessMonths ?? ''}
              onChange={e => onChange({ ...info, lengthOfBusinessMonths: e.target.value ? Number(e.target.value) : null })}
            />
            {info.lengthOfBusinessMonths !== null && info.lengthOfBusinessMonths < 24 && (
              <p className="text-[10px] text-amber-600 mt-0.5">⚠ Most banks require ≥ 24 months LOB</p>
            )}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Income Basis</Label>
            <Select value={info.incomeBasis} onValueChange={v => onChange({ ...info, incomeBasis: v })}>
              <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {INCOME_BASIS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {info.docType === 'low_doc' && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-2 text-[10px] text-amber-700 dark:text-amber-400">
            ⚠ Low-doc underwriting is limited. Outputs will be marked as <strong>Review Required</strong> and may not reflect full automated eligibility.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
