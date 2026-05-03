import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { PolicyTerm } from '@/lib/policies/policyTypes';

export default function PolicyNoteForm({ policy }: { policy: PolicyTerm }) {
  const { user } = useAuth();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!note.trim()) return;
    setBusy(true);
    const { error } = await (supabase as any).from('policy_term_notes').insert({
      policy_term_id: policy.id,
      adviser_id: user?.id ?? null,
      note,
      note_type: 'general',
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Note saved');
    setNote('');
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Adviser note for this policy term..."
        className="min-h-[80px]"
      />
      <Button size="sm" onClick={save} disabled={busy || !note.trim()}>Add note</Button>
    </div>
  );
}
