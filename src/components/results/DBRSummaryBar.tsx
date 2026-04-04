import { useMemo } from 'react';
import { calculateStressEMI, formatCurrency } from '@/lib/mortgage-utils';
import { cn } from '@/lib/utils';

interface Props {
  totalIncome: number;
  totalLiabilities: number;
  loanAmount: number;
  stressRate: number;
  tenorMonths: number;
}

export default function DBRSummaryBar({ totalIncome, totalLiabilities, loanAmount, stressRate, tenorMonths }: Props) {
  const stressEMI = useMemo(() => calculateStressEMI(loanAmount, stressRate, tenorMonths), [loanAmount, stressRate, tenorMonths]);
  const dbr = totalIncome > 0 ? ((stressEMI + totalLiabilities) / totalIncome) * 100 : 0;

  const dbrColor = dbr === 0 ? 'text-muted-foreground' : dbr < 42 ? 'text-green-600' : dbr <= 50 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="bg-background rounded-lg border shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0">
          <p className="text-xs text-muted-foreground font-medium">DBR</p>
          <p className={cn('text-3xl font-bold', dbrColor)}>{dbr.toFixed(1)}%</p>
        </div>
        <div className="flex-1 grid grid-cols-3 gap-3 text-xs border-l pl-4">
          <div>
            <p className="text-muted-foreground">Income</p>
            <p className="font-semibold text-primary">AED {formatCurrency(totalIncome)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Liabilities</p>
            <p className="font-semibold text-primary">AED {formatCurrency(totalLiabilities)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Stress EMI</p>
            <p className="font-semibold text-primary">AED {formatCurrency(Math.round(stressEMI))}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
