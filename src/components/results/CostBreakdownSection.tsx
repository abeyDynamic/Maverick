import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { calculateStressEMI, formatCurrency } from '@/lib/mortgage-utils';
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
  monthlyPayment: number;
  rateTerms: string;
  followOnRate: string;
  propertyInsuranceAnnual: number;
  lifeInsuranceMonthly: number;
  processingFeePercent: number;
  processingFeeAED: number;
  valuationFee: number;
  earlySettlement: string;
  mortgageRegistration: number;
  mortgageRelease: number;
  transferCentreFee: number;
  brokerFee: number;
  totalFeesUpfront: number;
  downPayment: number;
  totalRequiredUpfront: number;
}

export default function CostBreakdownSection({ bankResults, loanAmount, propertyValue, nominalRate, tenorMonths, emirate }: Props) {
  const approvedBanks = useMemo(() => bankResults.filter(r => r.eligible), [bankResults]);

  const costs = useMemo((): BankCosts[] => {
    if (approvedBanks.length === 0 || !loanAmount) return [];

    const isDubaiAbuSharjah = ['dubai', 'abu_dhabi', 'sharjah'].includes(emirate);
    const valFee = isDubaiAbuSharjah ? 2500 : 3000;

    return approvedBanks.map(r => {
      const monthlyPayment = calculateStressEMI(loanAmount, nominalRate, tenorMonths);
      const rateTerms = `${nominalRate}% fixed`;
      const followOnRate = `EIBOR 3 Month + margin`;
      const propertyInsuranceAnnual = Math.round(propertyValue * 0.00035);
      const lifeInsuranceMonthly = Math.round(loanAmount * 0.00018);
      const processingFeePercent = 1; // default 1%
      const processingFeeAED = Math.round(loanAmount * processingFeePercent / 100);
      const earlySettlement = '1% of loan outstanding or AED 10,000 whichever is lower';

      const mortgageRegistration = Math.round(loanAmount * 0.0025 + 290);
      const mortgageRelease = 0;
      const transferCentreFee = 4200;
      const brokerFee = 0;

      const totalFeesUpfront = mortgageRegistration + mortgageRelease + transferCentreFee + processingFeeAED + valFee + brokerFee;
      const downPayment = Math.max(0, propertyValue - loanAmount);
      const totalRequiredUpfront = totalFeesUpfront + downPayment;

      return {
        bank: r,
        monthlyPayment: Math.round(monthlyPayment),
        rateTerms,
        followOnRate,
        propertyInsuranceAnnual,
        lifeInsuranceMonthly,
        processingFeePercent,
        processingFeeAED,
        valuationFee: valFee,
        earlySettlement,
        mortgageRegistration,
        mortgageRelease,
        transferCentreFee,
        brokerFee,
        totalFeesUpfront,
        downPayment,
        totalRequiredUpfront,
      };
    });
  }, [approvedBanks, loanAmount, propertyValue, nominalRate, tenorMonths, emirate]);

  if (costs.length === 0) return null;

  const offerRows: { label: string; getValue: (c: BankCosts) => string; bold?: boolean }[] = [
    { label: 'Monthly Mortgage Payment', getValue: c => `AED ${formatCurrency(c.monthlyPayment)}`, bold: true },
    { label: 'Rate Terms', getValue: c => c.rateTerms },
    { label: 'Follow-on Rate', getValue: c => c.followOnRate },
    { label: 'Property Insurance (p.a.)', getValue: c => `AED ${formatCurrency(c.propertyInsuranceAnnual)}` },
    { label: 'Life Insurance (per month)', getValue: c => `AED ${formatCurrency(c.lifeInsuranceMonthly)}` },
    { label: 'Processing Fee', getValue: c => `${c.processingFeePercent}% — AED ${formatCurrency(c.processingFeeAED)}` },
    { label: 'Property Valuation', getValue: c => `AED ${formatCurrency(c.valuationFee)}` },
    { label: 'Early Settlement Fee', getValue: c => c.earlySettlement },
  ];

  const txnRows: { label: string; getValue: (c: BankCosts) => string; bold?: boolean }[] = [
    { label: 'Mortgage Registration (0.25% + 290)', getValue: c => `AED ${formatCurrency(c.mortgageRegistration)}` },
    { label: 'Mortgage Release Fee', getValue: c => `AED ${formatCurrency(c.mortgageRelease)}` },
    { label: 'Transfer Centre Fee (incl. VAT)', getValue: c => `AED ${formatCurrency(c.transferCentreFee)}` },
    { label: 'Bank Processing Fee', getValue: c => `AED ${formatCurrency(c.processingFeeAED)}` },
    { label: 'Property Valuation', getValue: c => `AED ${formatCurrency(c.valuationFee)}` },
    { label: 'Mortgage Broker Fee', getValue: c => `AED ${formatCurrency(c.brokerFee)}` },
    { label: 'TOTAL FEES UPFRONT', getValue: c => `AED ${formatCurrency(c.totalFeesUpfront)}`, bold: true },
    { label: 'Down Payment', getValue: c => `AED ${formatCurrency(c.downPayment)}`, bold: true },
    { label: 'TOTAL REQUIRED UPFRONT', getValue: c => `AED ${formatCurrency(c.totalRequiredUpfront)}`, bold: true },
  ];

  return (
    <Card className="bg-background">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold text-primary">Mortgage Proposal — Approved Banks</CardTitle>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs min-w-[180px] sticky left-0 bg-background z-10"> </TableHead>
              {costs.map(c => (
                <TableHead key={c.bank.bank.id} className="text-xs text-center min-w-[160px]">
                  {c.bank.bank.bank_name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Offer Details Header */}
            <TableRow className="bg-muted/50">
              <TableCell colSpan={costs.length + 1} className="py-1.5 text-xs font-bold text-primary uppercase tracking-wide">
                Offer Details
              </TableCell>
            </TableRow>
            {offerRows.map(row => (
              <TableRow key={row.label}>
                <TableCell className={cn('text-xs sticky left-0 bg-background py-1.5', row.bold && 'font-semibold')}>
                  {row.label}
                </TableCell>
                {costs.map(c => (
                  <TableCell key={c.bank.bank.id} className={cn('text-xs text-center py-1.5', row.bold && 'font-semibold')}>
                    {row.getValue(c)}
                  </TableCell>
                ))}
              </TableRow>
            ))}

            {/* Transaction Fees Header */}
            <TableRow className="bg-muted/50">
              <TableCell colSpan={costs.length + 1} className="py-1.5 text-xs font-bold text-primary uppercase tracking-wide">
                Transaction Fees
              </TableCell>
            </TableRow>
            {txnRows.map(row => (
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
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
