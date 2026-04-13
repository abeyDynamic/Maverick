import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Briefcase, Building2, Globe } from 'lucide-react';
import type { QualSegment } from '@/lib/case/types';

interface SegmentSelectorProps {
  value: QualSegment | '';
  onChange: (segment: QualSegment) => void;
}

const SEGMENTS: { value: QualSegment; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: 'resident_salaried',
    label: 'Resident Salaried',
    description: 'UAE national or resident expat with salaried employment',
    icon: <Briefcase className="h-5 w-5" />,
  },
  {
    value: 'self_employed',
    label: 'Self-Employed',
    description: 'Business owner — full-doc or low-doc path',
    icon: <Building2 className="h-5 w-5" />,
  },
  {
    value: 'non_resident',
    label: 'Non-Resident',
    description: 'Applicant residing outside the UAE',
    icon: <Globe className="h-5 w-5" />,
  },
];

export default function SegmentSelector({ value, onChange }: SegmentSelectorProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground">Select Applicant Segment</p>
      <div className="grid grid-cols-3 gap-2">
        {SEGMENTS.map(seg => {
          const active = value === seg.value;
          return (
            <Card
              key={seg.value}
              className={`cursor-pointer transition-all border-2 ${
                active
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-primary/40'
              }`}
              onClick={() => onChange(seg.value)}
            >
              <CardContent className="p-3 text-center space-y-1.5">
                <div className={`mx-auto w-fit ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                  {seg.icon}
                </div>
                <p className="text-xs font-semibold">{seg.label}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{seg.description}</p>
                {active && <Badge variant="default" className="text-[9px] px-1.5 py-0">Selected</Badge>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
