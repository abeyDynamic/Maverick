import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/mortgage-utils';
import { cn } from '@/lib/utils';
import type { BankResult } from './BankEligibilityTable';

interface Props {
  bankResults: BankResult[];
  loanAmount: number;
  propertyValue: number;
  nominalRate: number;
  tenorMonths: number;
  emirate: string;
}

interface BankCosts {
  bank: BankResult;
  // Monthly
  emi: number;
  lifeInsMonth: number;
  propInsMonth: number;
  totalMonthly: number;
  // Fixed period
  fixedMonths: number;
  fixedPeriodTotal: number;
  rank: number;
  // Upfront
  downPayment: number;
  dldFee: number;
  mortgageReg: number;
  transferCentre: number;
  processingFeePercent: number;
  processingFeeAED: number;
  valuationFee: number;
  totalUpfront: number;
  // Grand total
  grandTotal: number;
}

function calcEMI(loan: number, annualRate: number, months: number): number {
  if (!loan || !annualRate || !months) return 0;
  const r = annualRate / 100 / 12;
  if (r === 0) return loan / months;
  return (loan * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

const RANK_LABELS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
const RANK_COLORS = [
  'bg-yellow-500 text-yellow-950',
  'bg-zinc-300 text-zinc-800',
  'bg-amber-700 text-amber-50',
];

export default function CostBreakdownSection({ bankResults, loanAmount, propertyValue, nominalRate, tenorMonths, emirate }: Props) {
  const approvedBanks = useMemo(() => bankResults.filter(r => r.eligible), [bankResults]);

  const costs = useMemo((): BankCosts[] => {
    if (approvedBanks.length === 0 || !loanAmount) return [];

    const isDubaiAbuSharjah = ['dubai', 'abu_dhabi', 'sharjah'].includes(emirate);
    const valFee = isDubaiAbuSharjah ? 2500 : 3000;
    const isDubai = emirate === 'dubai';

    const unsorted = approvedBanks.map(r => {
      // Defaults (will be replaced by products table data later)
      const lifeInsRate = 0.00018; // 0.018% per month
      const propInsRate = 0.00035; // 0.035% per annum
      const processingFeePercent = 1;
      const fixedMonths = 24; // default fixed period

      const emi = Math.round(calcEMI(loanAmount, nominalRate, tenorMonths));
      const lifeInsMonth = Math.round(loanAmount * lifeInsRate);
      const propInsMonth = Math.round((propertyValue * propInsRate) / 12);
      const totalMonthly = emi + lifeInsMonth + propInsMonth;

      const fixedPeriodTotal = totalMonthly * fixedMonths;

      const downPayment = Math.max(0, propertyValue - loanAmount);
      const dldFee = isDubai ? Math.round(propertyValue * 0.04 + 580) : 0;
      const mortgageReg = Math.round(loanAmount * 0.0025 + 290);
      const transferCentre = 4200;
      const processingFeeAED = Math.round(loanAmount * processingFeePercent / 100);

      const totalUpfront = downPayment + dldFee + mortgageReg + transferCentre + processingFeeAED + valFee;

      // Grand total = fixed period cost + all upfront fees EXCLUDING down payment
      const upfrontExclDown = dldFee + mortgageReg + transferCentre + processingFeeAED + valFee;
      const grandTotal = fixedPeriodTotal + upfrontExclDown;

      return {
        bank: r,
        emi,
        lifeInsMonth,
        propInsMonth,
        totalMonthly,
        fixedMonths,
        fixedPeriodTotal,
        rank: 0,
        downPayment,
        dldFee,
        mortgageReg,
        transferCentre,
        processingFeePercent,
        processingFeeAED,
        valuationFee: valFee,
        totalUpfront,
        grandTotal,
      };
    });

    // Rank by fixedPeriodTotal ascending
    const sorted = [...unsorted].sort((a, b) => a.fixedPeriodTotal - b.fixedPeriodTotal);
    sorted.forEach((c, i) => { c.rank = i; });

    return sorted;
  }, [approvedBanks, loanAmount, propertyValue, nominalRate, tenorMonths, emirate]);

  if (costs.length === 0) return null;

  type Row = { label: string; getValue: (c: BankCosts) => string; bold?: boolean };

  const monthlyRows: Row[] = [
    { label: 'Mortgage EMI', getValue: c => `AED ${formatCurrency(c.emi)}` },
    { label: 'Life Insurance', getValue: c => `AED ${formatCurrency(c.lifeInsMonth)}` },
    { label: 'Property Insurance', getValue: c => `AED ${formatCurrency(c.propInsMonth)}` },
    { label: 'Total Monthly Payment', getValue: c => `AED ${formatCurrency(c.totalMonthly)}`, bold: true },
  ];

  const fixedRows: Row[] = [
    { label: `${costs[0]?.fixedMonths ?? 24}-Month Total Cost`, getValue: c => `AED ${formatCurrency(c.fixedPeriodTotal)}`, bold: true },
  ];

  const upfrontRows: Row[] = [
    { label: 'Down Payment', getValue: c => `AED ${formatCurrency(c.downPayment)}` },
    { label: 'DLD Fee (4% + AED 580)', getValue: c => c.dldFee ? `AED ${formatCurrency(c.dldFee)}` : 'N/A' },
    { label: 'Mortgage Registration', getValue: c => `AED ${formatCurrency(c.mortgageReg)}` },
    { label: 'Transfer Centre Fee', getValue: c => `AED ${formatCurrency(c.transferCentre)}` },
    { label: 'Bank Processing Fee', getValue: c => `${c.processingFeePercent}% — AED ${formatCurrency(c.processingFeeAED)}` },
    { label: 'Property Valuation', getValue: c => `AED ${formatCurrency(c.valuationFee)}` },
    { label: 'Total Upfront', getValue: c => `AED ${formatCurrency(c.totalUpfront)}`, bold: true },
  ];

  const grandRows: Row[] = [
    { label: 'Total Cost of Ownership (Fixed Period)', getValue: c => `AED ${formatCurrency(c.grandTotal)}`, bold: true },
  ];

  const sections: { title: string; rows: Row[]; extra?: 'rank' }[] = [
    { title: 'Monthly Costs', rows: monthlyRows },
    { title: 'Fixed Period Total', rows: fixedRows, extra: 'rank' },
    { title: 'Upfront Costs (One-Time)', rows: upfrontRows },
    { title: 'Grand Total', rows: grandRows },
  ];

  return (
    <Card className="bg-background">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold text-primary">Cost Comparison — Approved Banks</CardTitle>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs min-w-[200px] sticky left-0 bg-background z-10"> </TableHead>
              {costs.map(c => (
                <TableHead key={c.bank.bank.id} className="text-xs text-center min-w-[160px]">
                  {c.bank.bank.bank_name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sections.map(section => (
              <>
                <TableRow key={`h-${section.title}`} className="bg-muted/50">
                  <TableCell colSpan={costs.length + 1} className="py-1.5 text-xs font-bold text-primary uppercase tracking-wide">
                    {section.title}
                  </TableCell>
                </TableRow>
                {section.rows.map(row => (
                  <TableRow key={row.label} className={row.bold ? 'border-t' : ''}>
                    <TableCell className={cn('text-xs sticky left-0 bg-background py-1.5', row.bold && 'font-bold')}>
                      {row.label}
                    </TableCell>
                    {costs.map(c => (
                      <TableCell key={c.bank.bank.id} className={cn('text-xs text-center py-1.5', row.bold && 'font-bold')}>
                        {row.getValue(c)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {section.extra === 'rank' && (
                  <TableRow key="rank-row">
                    <TableCell className="text-xs sticky left-0 bg-background py-1.5 font-semibold">Rank</TableCell>
                    {costs.map(c => (
                      <TableCell key={c.bank.bank.id} className="text-center py-1.5">
                        <Badge className={cn('text-[10px] px-2 py-0.5', RANK_COLORS[c.rank] ?? 'bg-muted text-muted-foreground')}>
                          {RANK_LABELS[c.rank] ?? `${c.rank + 1}th`}
                        </Badge>
                      </TableCell>
                    ))}
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
