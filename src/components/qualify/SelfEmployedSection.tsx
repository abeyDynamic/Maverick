import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { SelfEmployedInfo, SEIncomeRoute } from '@/lib/case/types';
import { getLOBWarning } from '@/lib/mortgage-utils';

interface Props {
  info: SelfEmployedInfo;
  onChange: (info: SelfEmployedInfo) => void;
}

const INCOME_ROUTE_OPTIONS: { value: SEIncomeRoute; label: string; docType: 'full_doc' | 'low_doc'; group: string }[] = [
  { value: 'audited_revenue',       label: 'Audited Revenue (Revenue × Profit Margin × Ownership %)', docType: 'full_doc',  group: 'Full Documentation' },
  { value: 'vat_revenue',           label: 'VAT Return Revenue (× Ownership %)',                       docType: 'full_doc',  group: 'Full Documentation' },
  { value: 'full_doc_cto',          label: 'Company Turnover — CTO (Bank applies margin × Ownership %)', docType: 'full_doc', group: 'Full Documentation' },
  { value: 'low_doc_personal_dab',  label: 'Personal DAB — Daily Average Balance',                     docType: 'low_doc',   group: 'Low Doc — Personal Accounts' },
  { value: 'low_doc_personal_mcto', label: 'Personal MCTO — Monthly Credit Turnover',                  docType: 'low_doc',   group: 'Low Doc — Personal Accounts' },
  { value: 'low_doc_company_dab',   label: 'Company DAB — Daily Average Balance',                      docType: 'low_doc',   group: 'Low Doc — Company Accounts' },
  { value: 'low_doc_company_mcto',  label: 'Company MCTO — Monthly Credit Turnover',                   docType: 'low_doc',   group: 'Low Doc — Company Accounts' },
];

const isCompanyRoute = (r: SEIncomeRoute) => r === 'low_doc_company_dab' || r === 'low_doc_company_mcto';
const isLowDoc = (r: SEIncomeRoute) => r.startsWith('low_doc');
const isFullDoc = (r: SEIncomeRoute) => r.startsWith('audited') || r.startsWith('vat') || r.startsWith('full_doc');

export default function SelfEmployedSection({ info, onChange }: Props) {
  const lobWarning = getLOBWarning(info.lengthOfBusinessMonths);
  const selectedRoute = INCOME_ROUTE_OPTIONS.find(o => o.value === info.incomeRoute);
  const docType = selectedRoute?.docType ?? info.docType;

  const ownershipPct = info.ownershipSharePercent;
  const mashreqOk = ownershipPct !== null && ownershipPct >= 100;
  const cbdOk = ownershipPct !== null && ownershipPct > 0;

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold text-primary">Business Information</CardTitle>
          {docType === 'low_doc' && <Badge variant="outline" className="text-[9px] border-amber-500 text-amber-600">Low-Doc</Badge>}
          {docType === 'full_doc' && <Badge variant="outline" className="text-[9px] border-green-600 text-green-700">Full-Doc</Badge>}
          {lobWarning.level === 'critical' && <Badge variant="outline" className="text-[9px] border-red-500 text-red-600">LOB Critical</Badge>}
          {lobWarning.level === 'warning' && <Badge variant="outline" className="text-[9px] border-amber-500 text-amber-600">LOB Warning</Badge>}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <div className="grid gap-3 grid-cols-2">

          {/* Company name */}
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">Business / Company Name</Label>
            <Input className="mt-1 h-8 text-xs" placeholder="Company name" value={info.businessName}
              onChange={e => onChange({ ...info, businessName: e.target.value })} />
          </div>

          {/* LOB */}
          <div>
            <Label className="text-xs text-muted-foreground">Length of Business (months)</Label>
            <Input type="number" className="mt-1 h-8 text-xs" placeholder="e.g. 36"
              value={info.lengthOfBusinessMonths ?? ''}
              onChange={e => onChange({ ...info, lengthOfBusinessMonths: e.target.value ? Number(e.target.value) : null })} />
            {lobWarning.level !== 'none' && (
              <p className={`text-[10px] mt-0.5 ${lobWarning.level === 'critical' ? 'text-red-600' : 'text-amber-600'}`}>
                ⚠ {lobWarning.message}
              </p>
            )}
          </div>

          {/* Ownership share */}
          <div>
            <Label className="text-xs text-muted-foreground">Ownership Share (%)</Label>
            <Input type="number" min="0" max="100" className="mt-1 h-8 text-xs" placeholder="e.g. 100"
              value={info.ownershipSharePercent ?? ''}
              onChange={e => onChange({ ...info, ownershipSharePercent: e.target.value ? Number(e.target.value) : null })} />
            {ownershipPct !== null && ownershipPct < 100 && (
              <p className="text-[10px] text-amber-600 mt-0.5">
                Partnership — qualifying income = amount × {ownershipPct}%
              </p>
            )}
          </div>

          {/* Income route */}
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">Income Route</Label>
            <Select value={info.incomeRoute}
              onValueChange={v => {
                const route = v as SEIncomeRoute;
                const dt = INCOME_ROUTE_OPTIONS.find(o => o.value === route)?.docType ?? '';
                onChange({ ...info, incomeRoute: route, docType: dt as 'full_doc' | 'low_doc' | '' });
              }}>
              <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select income route" /></SelectTrigger>
              <SelectContent>
                {['Full Documentation', 'Low Doc — Personal Accounts', 'Low Doc — Company Accounts'].map(group => (
                  <div key={group}>
                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{group}</div>
                    {INCOME_ROUTE_OPTIONS.filter(o => o.group === group).map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Low doc note — personal */}
          {isLowDoc(info.incomeRoute) && !isCompanyRoute(info.incomeRoute) && (
            <div className="col-span-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded p-2 text-[10px] text-blue-700 dark:text-blue-400">
              ℹ Personal accounts: lower of DAB and MCTO is used as qualifying income.<br/>
              Rental income is not added separately — already captured in account balances.
            </div>
          )}

          {/* Company account constraints */}
          {isCompanyRoute(info.incomeRoute) && (
            <div className="col-span-2 space-y-1">
              <div className={`rounded p-2 text-[10px] border ${mashreqOk ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                <strong>Mashreq:</strong> {mashreqOk ? '✓ 100% ownership — company accounts eligible' : `✗ Requires 100% ownership. Client at ${ownershipPct ?? '?'}% — not eligible for company account route at Mashreq.`}
              </div>
              <div className={`rounded p-2 text-[10px] border ${cbdOk ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                <strong>CBD:</strong> {cbdOk ? `✓ Partnership accepted — income = company amount × ${ownershipPct}% ownership` : 'Enter ownership share to calculate CBD eligibility'}
              </div>
              <p className="text-[10px] text-muted-foreground">Lower of company DAB and MCTO used as qualifying income.</p>
            </div>
          )}

          {/* Full doc ownership note */}
          {isFullDoc(info.incomeRoute) && ownershipPct !== null && ownershipPct < 100 && (
            <div className="col-span-2 bg-amber-50 border border-amber-200 rounded p-2 text-[10px] text-amber-700">
              ℹ Full doc qualifying income = declared amount × {ownershipPct}% ownership share.
            </div>
          )}

          {/* General low doc warning */}
          {isLowDoc(info.incomeRoute) && (
            <div className="col-span-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-2 text-[10px] text-amber-700 dark:text-amber-400">
              ⚠ Low-doc route — bank eligibility is limited. Results will be marked as Review Required.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
