import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PolicyTerm } from '@/lib/policies/policyTypes';

export function usePolicySearch() {
  const [rows, setRows] = useState<PolicyTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      // Fetch in pages to cover ~1900 rows past the default 1000 cap.
      const PAGE = 1000;
      let from = 0;
      const all: PolicyTerm[] = [];
      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data, error } = await (supabase as any)
            .from('policy_search_view')
            .select('*')
            .range(from, from + PAGE - 1);
          if (error) throw error;
          const batch = (data ?? []) as PolicyTerm[];
          all.push(...batch);
          if (batch.length < PAGE) break;
          from += PAGE;
        }
        if (!cancelled) setRows(all);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load policies');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { rows, loading, error };
}
