import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bookmark, Save } from 'lucide-react';
import { toast } from 'sonner';
import { PolicyFiltersState } from '@/lib/policies/policyTypes';

interface SavedSearch {
  id: string;
  name: string;
  search_query: string | null;
  filters: PolicyFiltersState | null;
}

interface Props {
  search: string;
  filters: PolicyFiltersState;
  onApply: (search: string, filters: PolicyFiltersState) => void;
}

export default function SavedSearches({ search, filters, onApply }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<SavedSearch[]>([]);
  const [name, setName] = useState('');

  async function reload() {
    const q = (supabase as any).from('policy_saved_searches').select('*').order('created_at', { ascending: false });
    const { data } = user ? await q.eq('user_id', user.id) : await q.is('user_id', null);
    setItems((data ?? []) as SavedSearch[]);
  }

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [user?.id]);

  async function save() {
    if (!name.trim()) return;
    const { error } = await (supabase as any).from('policy_saved_searches').insert({
      user_id: user?.id ?? null,
      name,
      search_query: search,
      filters,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Search saved');
    setName('');
    reload();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Save current search as..."
          className="h-9 text-xs"
        />
        <Button size="sm" onClick={save} disabled={!name.trim()}>
          <Save className="h-3.5 w-3.5 mr-1" /> Save
        </Button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((s) => (
            <button
              key={s.id}
              onClick={() => onApply(s.search_query ?? '', s.filters ?? ({} as PolicyFiltersState))}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-border bg-background text-xs hover:bg-muted"
            >
              <Bookmark className="h-3 w-3" /> {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
