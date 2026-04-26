import type { QualSegment } from '@/lib/case/types';

interface SegmentSelectorProps {
  value: QualSegment | '';
  onChange: (segment: QualSegment) => void;
}

const SEGMENTS: { value: QualSegment; label: string; sub: string }[] = [
  { value: 'resident_salaried', label: 'Salaried', sub: 'Employed by a UAE company' },
  { value: 'self_employed',     label: 'Self-employed', sub: 'Trade licence holder' },
  { value: 'non_resident',      label: 'Non-resident', sub: 'Buying from outside UAE' },
];

export default function SegmentSelector({ value, onChange }: SegmentSelectorProps) {
  return (
    <div className="space-y-2.5">
      <div className="form-section-title">
        <span>Employment Profile</span>
      </div>
      <p className="text-[13px] text-foreground font-medium mb-3">
        How do lenders see your income?
      </p>
      <div className="grid grid-cols-1 gap-2">
        {SEGMENTS.map(seg => {
          const active = value === seg.value;
          return (
            <button
              key={seg.value}
              type="button"
              onClick={() => onChange(seg.value)}
              className={`
                flex items-center justify-between px-4 py-3 rounded-lg border-[1.5px] text-left
                transition-all duration-130 cursor-pointer w-full
                ${active
                  ? 'border-[hsl(216,75%,12%)] bg-[hsl(216,75%,12%)] text-white shadow-sm'
                  : 'border-[hsl(220,14%,88%)] bg-white text-[hsl(216,14%,52%)] hover:border-[hsl(213,65%,30%)] hover:text-[hsl(213,65%,30%)]'
                }
              `}
            >
              <div>
                <p className={`text-[13px] font-600 font-semibold ${active ? 'text-white' : 'text-[hsl(216,75%,12%)]'}`}>
                  {seg.label}
                </p>
                <p className={`text-[11px] mt-0.5 ${active ? 'text-white/60' : 'text-[hsl(216,14%,55%)]'}`}>
                  {seg.sub}
                </p>
              </div>
              <div className={`
                w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0
                ${active ? 'border-white bg-white' : 'border-[hsl(220,14%,78%)]'}
              `}>
                {active && (
                  <div className="w-2 h-2 rounded-full bg-[hsl(216,75%,12%)]" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
