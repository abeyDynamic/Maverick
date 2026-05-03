import { QUICK_CHIPS } from '@/lib/policies/policyTypes';
import { cn } from '@/lib/utils';

interface Props {
  active: string | null;
  onChange: (k: string | null) => void;
}

export default function PolicyQuickChips({ active, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {QUICK_CHIPS.map((c) => {
        const isActive = active === c.key;
        return (
          <button
            key={c.key}
            onClick={() => onChange(isActive ? null : c.key)}
            className={cn(
              'px-3 py-1 rounded-full text-xs border transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-foreground border-border hover:bg-muted',
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
