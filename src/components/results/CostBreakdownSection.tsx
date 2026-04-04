import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { calculateStressEMI, formatCurrency } from '@/lib/mortgage-utils';
import { cn } from '@/lib/utils';
import type { BankResult } from './BankEligibilityTable';

interface Props {
  bankResults: BankResult[];
  loanAmount: number;
  propertyValue: number;
  nominalRate: number;
  tenorMonths: number;
}

interface CostItem {
  bank: BankResult;
  monthlyEMI: number;
  interestCost24: number;
  processingFee: number | null;
  valuationFee: number;
  lifeInsurance: number;
  propertyInsurance: number;
  dldFee: number;
  mortgageRegistration: number;
  transferCentreFee: number;
  totalCost: number;
  rank: number;
}

export default function CostBreakdownSection({ bankResults, loanAmount, propertyValue, nominalRate, tenorMonths }: Props) {
  const approvedBanks = useMemo(() => bankResults.filter(r => r.eligible), [bankResults]);

  const costItems = useMemo((): CostItem[] => {
    if (approvedBanks.length === 0 || !loanAmount) return [];

    const items = approvedBanks.map(r => {
      // Monthly EMI at nominal rate
      const monthlyEMI = calculateStressEMI(loanAmount, nominalRate, tenorMonths);
      // 24-month interest cost = (monthlyEMI × 24) - (principal paid in 24 months)
      const totalPaid24 = monthlyEMI * 24;
      // Calculate principal remaining after 24 months
      const monthlyRate = nominalRate / 100 / 12;
      let balance = loanAmount;
      for (let i = 0; i < 24; i++) {
        const interest = balance * monthlyRate;
        const principal = monthlyEMI - interest;
        balance -= principal;
      }
      const interestCost24 = totalPaid24 - (loanAmount - balance);

      const processingFee: number | null = null; // TBC - from products table
      const valuationFee = 3500;
      // Life insurance: 0.028% of loan per month × 24
      const lifeInsurance = Math.round(loanAmount * 0.00028 * 24);
      // Property insurance: 0.1% of property value annually × 2 years
      const propertyInsurance = Math.round(propertyValue * 0.001 * 2);
      // DLD fee: 4% of property value + AED 580
      const dldFee = Math.round(propertyValue * 0.04 + 580);
      // Mortgage registration: 0.25% of loan amount + AED 290
      const mortgageRegistration = Math.round(loanAmount * 0.0025 + 290);
      const transferCentreFee = 4200;

      const totalCost = Math.round(
        interestCost24 +
        (processingFee ?? 0) +
        valuationFee +
        lifeInsurance +
        propertyInsurance +
        dldFee +
        mortgageRegistration +
        transferCentreFee
      );

      return {
        bank: r,
        monthlyEMI: Math.round(monthlyEMI),
        interestCost24: Math.round(interestCost24),
        processingFee,
        valuationFee,
        lifeInsurance,
        propertyInsurance,
        dldFee,
        mortgageRegistration,
        transferCentreFee,
        totalCost,
        rank: 0,
      };
    });

    // Sort by total cost and assign ranks
    items.sort((a, b) => a.totalCost - b.totalCost);
    items.forEach((item, i) => { item.rank = i + 1; });

    return items;
  }, [approvedBanks, loanAmount, propertyValue, nominalRate, tenorMonths]);

  if (costItems.length === 0) return null;

  const rankBadge = (rank: number) => {
    if (rank === 1) return <Badge className="bg-green-600 text-white text-[10px] px-1.5 py-0">1st — Cheapest</Badge>;
    if (rank === 2) return <Badge className="bg-blue-600 text-white text-[10px] px-1.5 py-0">2nd</Badge>;
    if (rank === 3) return <Badge className="bg-amber-600 text-white text-[10px] px-1.5 py-0">3rd</Badge>;
    return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{rank}th</Badge>;
  };

  return (
    <Card className="bg-background">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold text-primary">24-Month Cost Breakdown — Approved Banks</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid gap-3">
          {costItems.map(item => (
            <div
              key={item.bank.bank.id}
              className={cn(
                'rounded-lg border p-3 space-y-2',
                item.rank === 1 ? 'border-green-300 bg-green-50/50 dark:bg-green-950/10' : 'bg-background'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-primary">{item.bank.bank.bank_name}</span>
                {rankBadge(item.rank)}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <Row label="Monthly EMI (nominal)" value={`AED ${formatCurrency(item.monthlyEMI)}`} />
                <Row label="24-month interest cost" value={`AED ${formatCurrency(item.interestCost24)}`} />
                <Row label="Processing fee" value={item.processingFee !== null ? `AED ${formatCurrency(item.processingFee)}` : 'TBC'} muted={item.processingFee === null} />
                <Row label="Valuation fee" value={`AED ${formatCurrency(item.valuationFee)}`} />
                <Row label="Life insurance (24m)" value={`AED ${formatCurrency(item.lifeInsurance)}`} />
                <Row label="Property insurance (2yr)" value={`AED ${formatCurrency(item.propertyInsurance)}`} />
                <Row label="DLD fee (4% + 580)" value={`AED ${formatCurrency(item.dldFee)}`} />
                <Row label="Mortgage registration" value={`AED ${formatCurrency(item.mortgageRegistration)}`} />
                <Row label="Transfer centre fee" value={`AED ${formatCurrency(item.transferCentreFee)}`} />
              </div>
              <div className="flex items-center justify-between pt-1 border-t text-sm font-bold">
                <span className="text-primary">Total 24-Month Cost</span>
                <span className={item.rank === 1 ? 'text-green-600' : 'text-primary'}>AED {formatCurrency(item.totalCost)}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('text-right font-medium', muted ? 'text-muted-foreground italic' : 'text-primary')}>{value}</span>
    </>
  );
}
