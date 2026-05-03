import { Badge } from '@/components/ui/badge';
import { PolicyTerm } from '@/lib/policies/policyTypes';
import { cn } from '@/lib/utils';

export function getPolicyStatus(p: PolicyTerm): { label: string; tone: string } {
  if (p.policy_category === 'unmapped') return { label: 'Unmapped', tone: 'red' };
  if (p.value_status === 'unclear') return { label: 'Formula Needs Update', tone: 'orange' };
  if (p.value_status === 'to_be_updated') return { label: 'To Be Updated', tone: 'amber' };
  if (p.data_status === 'mapped_needs_review') return { label: 'Needs Review', tone: 'amber' };
  if (p.data_status === 'mapped' && p.value_status === 'available') return { label: 'Clean', tone: 'green' };
  return { label: p.data_status ?? 'Unknown', tone: 'gray' };
}

const TONES: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  gray: 'bg-muted text-muted-foreground border-border',
};

export default function PolicyStatusBadge({ policy }: { policy: PolicyTerm }) {
  const s = getPolicyStatus(policy);
  return (
    <Badge variant="outline" className={cn('font-medium', TONES[s.tone])}>
      {s.label}
    </Badge>
  );
}
