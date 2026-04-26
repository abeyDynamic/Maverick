import { useMemo } from 'react';
import { calculateStressEMI, formatCurrency } from '@/lib/mortgage-utils';

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

  const fillPct = Math.min(dbr, 100);

  const colorClass = dbr === 0 ? 'text-white/40'
    : dbr < 42 ? 'text-[hsl(174,85%,55%)]'
    : dbr <= 50 ? 'text-amber-400'
    : 'text-red-400';

  const fillColor = dbr === 0 ? 'bg-white/10'
    : dbr < 42 ? 'bg-[hsl(174,85%,42%)]'
    : dbr <= 50 ? 'bg-amber-400'
    : 'bg-red-400';

  const statusLabel = dbr === 0 ? null
    : dbr < 42 ? '· within limits'
    : dbr <= 50 ? '· borderline'
    : '· exceeds limit';

  const statusColor = dbr < 42 ? 'text-[hsl(174,85%,55%)]'
    : dbr <= 50 ? 'text-amber-400'
    : 'text-red-400';

  return (
    <div className="result-panel">
      {/* Eyebrow */}
      <p className="result-panel-eyebrow">Debt Service Ratio</p>

      {/* Big number */}
      <div className="flex items-baseline gap-2">
        <span className={`result-panel-figure ${colorClass}`}>
          {dbr > 0 ? dbr.toFixed(1) : '—'}
        </span>
        {dbr > 0 && (
          <span className="text-white/50 text-lg font-light">%</span>
        )}
        {statusLabel && (
          <span className={`text-sm font-medium ${statusColor}`}>{statusLabel}</span>
        )}
      </div>

      {/* Teal progress bar */}
      <div className="teal-progress-track">
        <div className={`teal-progress-fill ${fillColor}`} style={{ width: `${fillPct}%` }} />
      </div>

      {/* Breakdown row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Monthly Income', value: totalIncome > 0 ? formatCurrency(totalIncome) : '—' },
          { label: 'Liabilities', value: totalLiabilities > 0 ? formatCurrency(totalLiabilities) : '—' },
          { label: 'Stress EMI', value: stressEMI > 0 ? formatCurrency(Math.round(stressEMI)) : '—' },
        ].map(item => (
          <div key={item.label}>
            <p className="result-panel-eyebrow">{item.label}</p>
            <p className="text-white font-medium text-sm font-mono mt-1">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
