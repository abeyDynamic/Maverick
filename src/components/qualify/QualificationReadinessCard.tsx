import { useMemo } from 'react';
import { formatCurrency } from '@/lib/mortgage-utils';
import { cn } from '@/lib/utils';
import type { CaseBankResult } from '@/lib/case/stage1-engine';

export interface ProductData {
  bank_id: string;
  rate: number | null;
  fixed_period_months: number | null;
  processing_fee_percent: number | null;
  valuation_fee: number | null;
  life_ins_monthly_percent: number | null;
  prop_ins_annual_percent: number | null;
  follow_on_margin: number | null;
  eibor_benchmark: number | string | null;
  salary_transfer: boolean;
  fixed_period: string | null;
  comparison_fixed_months?: number | null;
  rate_label?: string | null;
}

interface Props {
  bankResults: CaseBankResult[];
  loanAmount: number;
  propertyValue: number;
  nominalRate: number;
  tenorMonths: number;
  emirate: string;
  productsByBank: Record<string, ProductData>;
}

interface BankCosts {
  bank: CaseBankResult;
  usedRate: number;
  displayRatePercent: number;
  rateLabel: string;
  rateSource: 'product' | 'manual';
  emi: number;
  lifeInsMonth: number;
  propInsMonth: number;
  totalMonthly: number;
  fixedMonths: number;
  fixedPeriodTotal: number;
  rank: number;
  downPayment: number;
  dldFee: number;
  mortgageReg: number;
  transferCentre: number;
  processingFeePercent: number;
  processingFeeAED: number;
  valuationFee: number;
  totalUpfront: number;
  grandTotal: number;
}

function calcEMI(loan: number, annualRate: number, months: number): number {
  if (!loan || !annualRate || !months) return 0;
  const r = annualRate / 12;
  if (r === 0) return loan / months;
  return (loan * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

const RANK_LABELS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

export default function CostBreakdownSection({ bankResults, loanAmount, propertyValue, nominalRate, tenorMonths, emirate, productsByBank }: Props) {
  const approvedBanks = useMemo(() => bankResults.filter(r => r.eligible), [bankResults]);

  const costs = useMemo((): BankCosts[] => {
    if (approvedBanks.length === 0 || !loanAmount) return [];
    const isDubai = emirate === 'dubai';
    const isDubaiAbuSharjah = ['dubai', 'abu_dhabi', 'sharjah'].includes(emirate);
    const defaultValFee = isDubaiAbuSharjah ? 2500 : 3000;

    const unsorted = approvedBanks.map(r => {
      const product = productsByBank[r.bank.id];
      const rawRate = product?.rate ?? null;
      const usedRate = rawRate !== null ? rawRate : nominalRate / 100;
      const displayRatePercent = usedRate * 100;
      const rateSource: 'product' | 'manual' = product?.rate != null ? 'product' : 'manual';
      const rateLabel = product?.rate_label ?? `${displayRatePercent.toFixed(2)}% (manual)`;
      const lifeInsRate = product?.life_ins_monthly_percent ?? 0.00018;
      const propInsRate = product?.prop_ins_annual_percent ?? 0.00035;
      const rawProcFee = product?.processing_fee_percent;
      const processingFeePercent = (rawProcFee !== null && rawProcFee !== undefined && rawProcFee >= 0 && rawProcFee <= 10) ? rawProcFee : 1;
      const fixedMonths = product?.comparison_fixed_months ?? product?.fixed_period_months ?? 24;
      const valFee = product?.valuation_fee ?? defaultValFee;

      const emi = Math.round(calcEMI(loanAmount, usedRate, tenorMonths));
      const lifeInsMonth = Math.round(loanAmount * lifeInsRate);
      const propInsMonth = Math.round((propertyValue * propInsRate) / 12);
      const totalMonthly = emi + lifeInsMonth + propInsMonth;
      const fixedPeriodTotal = totalMonthly * fixedMonths;
      const downPayment = Math.max(0, propertyValue - loanAmount);
      const dldFee = isDubai ? Math.round(propertyValue * 0.04 + 580) : 0;
      const mortgageReg = Math.round(loanAmount * 0.0025 + 290);
      const transferCentre = 4200;
      const processingFeeAED = Math.round(loanAmount * processingFeePercent / 100);
      const upfrontExclDown = dldFee + mortgageReg + transferCentre + processingFeeAED + valFee;
      const totalUpfront = downPayment + upfrontExclDown;
      const grandTotal = fixedPeriodTotal + upfrontExclDown;

      return {
        bank: r, usedRate, displayRatePercent, rateLabel, rateSource, emi,
        lifeInsMonth, propInsMonth, totalMonthly, fixedMonths, fixedPeriodTotal, rank: 0,
        downPayment, dldFee, mortgageReg, transferCentre,
        processingFeePercent, processingFeeAED, valuationFee: valFee,
        totalUpfront, grandTotal,
      };
    });

    const sorted = [...unsorted].sort((a, b) => a.fixedPeriodTotal - b.fixedPeriodTotal);
    sorted.forEach((c, i) => { c.rank = i; });
    return sorted;
  }, [approvedBanks, loanAmount, propertyValue, nominalRate, tenorMonths, emirate, productsByBank]);

  if (costs.length === 0) return null;

  const fixedMonths = costs[0]?.fixedMonths ?? 24;

  return (
    <div className="surface overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="form-section-title mb-0">
          <span>Cost Comparison · Approved Banks</span>
        </div>
      </div>

      {/* Bank columns header */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-[hsl(220,18%,97%)]">
              <th className="text-left px-4 py-2.5 section-label min-w-[160px]"> </th>
              {costs.map(c => (
                <th key={c.bank.bank.id} className="text-center px-4 py-2.5 min-w-[140px]">
                  <p className="text-[13px] font-semibold text-foreground">{c.bank.bank.bankName}</p>
                  <p className="text-[10px] text-muted-foreground font-normal mt-0.5 font-mono">{c.rateLabel}</p>
                  {/* Rank badge */}
                  <div className="flex justify-center mt-1.5">
                    <span className={cn(
                      'text-[10px] font-bold px-2 py-0.5 rounded-full',
                      c.rank === 0 ? 'bg-[hsl(174,85%,32%)] text-white' :
                      c.rank === 1 ? 'bg-[hsl(216,75%,12%)] text-white' :
                      c.rank === 2 ? 'bg-amber-600 text-white' :
                      'bg-border text-muted-foreground'
                    )}>
                      {RANK_LABELS[c.rank] ?? `${c.rank + 1}th`}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Monthly section */}
            <SectionHeader label="Monthly Costs" colCount={costs.length} />
            <Row label="EMI" costs={costs} getValue={c => formatCurrency(c.emi)}
              getSub={c => `at ${c.displayRatePercent.toFixed(2)}%`} />
            <Row label="Life Insurance" costs={costs} getValue={c => formatCurrency(c.lifeInsMonth)} />
            <Row label="Property Insurance" costs={costs} getValue={c => formatCurrency(c.propInsMonth)} />
            <Row label="Total Monthly" costs={costs} getValue={c => formatCurrency(c.totalMonthly)} bold />

            {/* Fixed period */}
            <SectionHeader label={`${fixedMonths}-Month Total`} colCount={costs.length} />
            <Row label={`${fixedMonths}-Month Cost`} costs={costs} getValue={c => formatCurrency(c.fixedPeriodTotal)} bold highlight />

            {/* Upfront */}
            <SectionHeader label="One-Time Upfront" colCount={costs.length} />
            <Row label="Down Payment" costs={costs} getValue={c => formatCurrency(c.downPayment)} />
            <Row label="DLD Fee" costs={costs} getValue={c => c.dldFee ? formatCurrency(c.dldFee) : 'N/A'} />
            <Row label="Mortgage Registration" costs={costs} getValue={c => formatCurrency(c.mortgageReg)} />
            <Row label="Transfer Centre" costs={costs} getValue={c => formatCurrency(c.transferCentre)} />
            <Row label="Processing Fee" costs={costs}
              getValue={c => formatCurrency(c.processingFeeAED)}
              getSub={c => `${c.processingFeePercent}%`} />
            <Row label="Valuation" costs={costs} getValue={c => formatCurrency(c.valuationFee)} />
            <Row label="Total Upfront" costs={costs} getValue={c => formatCurrency(c.totalUpfront)} bold />

            {/* Grand total */}
            <SectionHeader label="Total Cost of Ownership" colCount={costs.length} />
            <Row label={`Fixed Period + Upfront`} costs={costs} getValue={c => formatCurrency(c.grandTotal)} bold highlight />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionHeader({ label, colCount }: { label: string; colCount: number }) {
  return (
    <tr className="bg-[hsl(220,18%,97%)] border-t border-border">
      <td colSpan={colCount + 1} className="px-4 py-2">
        <span className="section-label">{label}</span>
      </td>
    </tr>
  );
}

function Row({ label, costs, getValue, getSub, bold, highlight }: {
  label: string;
  costs: BankCosts[];
  getValue: (c: BankCosts) => string;
  getSub?: (c: BankCosts) => string;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <tr className={cn('border-t border-border/50', highlight && 'bg-[hsl(174,85%,32%,0.03)]')}>
      <td className={cn('px-4 py-2.5 text-[12.5px] text-muted-foreground', bold && 'font-semibold text-foreground')}>
        {label}
      </td>
      {costs.map(c => (
        <td key={c.bank.bank.id} className="px-4 py-2.5 text-center">
          <p className={cn('text-[12.5px] font-mono', bold ? 'font-semibold text-foreground' : 'text-foreground',
            highlight && 'text-[hsl(216,75%,12%)]')}>
            AED {getValue(c)}
          </p>
          {getSub && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{getSub(c)}</p>
          )}
        </td>
      ))}
    </tr>
  );
}
