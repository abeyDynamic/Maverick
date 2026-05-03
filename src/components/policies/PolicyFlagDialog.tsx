import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FLAG_TYPES, PolicyTerm } from '@/lib/policies/policyTypes';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  policy: PolicyTerm | null;
  defaultType?: string;
}

export default function PolicyFlagDialog({ open, onOpenChange, policy, defaultType }: Props) {
  const { user } = useAuth();
  const [type, setType] = useState(defaultType ?? 'unclear');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!policy) return;
    setSubmitting(true);
    const { error } = await (supabase as any).from('policy_term_flags').insert({
      policy_term_id: policy.id,
      flagged_by: user?.id ?? null,
      flag_type: type,
      flag_reason: reason || null,
      status: 'open',
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Flag submitted');
    setReason('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Flag policy term</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Flag type</label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FLAG_TYPES.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setType(f.value)}
                  className={`px-2.5 py-1 text-xs rounded-full border ${type === f.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Reason (optional)</label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Add context for this flag..."
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>Submit flag</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
