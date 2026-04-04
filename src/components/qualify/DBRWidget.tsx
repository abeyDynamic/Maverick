import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, calculateStressEMI } from '@/lib/mortgage-utils';

interface Props {
  totalIncome: number;
  totalLiabilities: number;
  loanAmount: number;
  stressRate: number;
  tenorMonths: number;
}

export function DBRWidget({ totalIncome, totalLiabilities, loanAmount, stressRate, tenorMonths }: Props) {
  const stressEMI = useMemo(() => calculateStressEMI(loanAmount, stressRate, tenorMonths), [loanAmount, stressRate, tenorMonths]);
  const dbr = totalIncome > 0 ? ((stressEMI + totalLiabilities) / totalIncome) * 100 : 0;

  const dbrColor = dbr < 42 ? 'text-success' : dbr <= 50 ? 'text-warning' : 'text-destructive';
  const badgeVariant = dbr < 42 ? 'default' : dbr <= 50 ? 'secondary' : 'destructive';
  const badgeText = dbr < 42 ? 'Approved' : dbr <= 50 ? 'Borderline' : 'Declined';

  return (
    <Card className="bg-background shadow-lg border-2 border-border">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">DBR</span>
          <Badge variant={badgeVariant} className={dbr < 42 ? 'bg-success text-success-foreground' : dbr <= 50 ? 'bg-warning text-warning-foreground' : ''}>
            {badgeText}
          </Badge>
        </div>
        <p className={`text-4xl font-bold ${dbrColor}`}>{dbr.toFixed(1)}%</p>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Qualifying Income</span>
            <span className="font-medium text-primary">AED {formatCurrency(totalIncome)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Liabilities</span>
            <span className="font-medium text-primary">AED {formatCurrency(totalLiabilities)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Stress EMI</span>
            <span className="font-medium text-primary">AED {formatCurrency(stressEMI)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
