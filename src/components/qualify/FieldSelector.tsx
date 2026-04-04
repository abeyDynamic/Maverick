import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';

interface Props {
  title: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function FieldSelector({ title, options, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);

  function toggle(item: string) {
    setDraft(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]);
  }

  function apply() {
    onChange(draft);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(selected); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="border-accent text-accent hover:bg-accent hover:text-accent-foreground">
          <Plus className="mr-1 h-4 w-4" /> {title}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-80 overflow-y-auto py-2">
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-3 cursor-pointer hover:bg-secondary rounded px-2 py-1.5">
              <Checkbox checked={draft.includes(opt)} onCheckedChange={() => toggle(opt)} />
              <span className="text-sm">{opt}</span>
            </label>
          ))}
        </div>
        <Button onClick={apply} className="w-full bg-accent text-accent-foreground hover:bg-mid-blue">Apply Selection</Button>
      </DialogContent>
    </Dialog>
  );
}
