import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';

const TENORS = [
  { key: 'overnight', label: 'O/N' },
  { key: 'one_week', label: '1W' },
  { key: 'one_month', label: '1M' },
  { key: 'three_months', label: '3M' },
  { key: 'six_months', label: '6M' },
  { key: 'one_year', label: '1Y' },
] as const;

interface LatestRow {
  fixing_date: string;
  overnight: number | null;
  one_week: number | null;
  one_month: number | null;
  three_months: number | null;
  six_months: number | null;
  one_year: number | null;
}

const fmtRate = (v: number | null) => v != null ? `${Number(v).toFixed(5)}%` : '—';

export default function GlobalEiborBar() {
  const [latest, setLatest] = useState<LatestRow | null>(null);

  const fetchLatest = async () => {
    const { data } = await supabase
      .from('eibor_history')
      .select('*')
      .order('fixing_date', { ascending: false })
      .limit(1);
    if (data && data.length > 0) setLatest(data[0] as LatestRow);
  };

  useEffect(() => {
    fetchLatest();

    const channel = supabase
      .channel('global-eibor-bar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eibor_history' }, () => {
        fetchLatest();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="w-full" style={{ backgroundColor: '#1A4B8C', fontSize: '12px', color: 'white' }}>
      <div className="container mx-auto px-6 py-1">
        {latest ? (
          <p className="truncate font-mono">
            EIBOR {format(parseISO(latest.fixing_date), 'dd/MM/yyyy')}
            {TENORS.map(t => (
              <span key={t.key}>{' | '}{t.label}: {fmtRate(latest[t.key])}</span>
            ))}
          </p>
        ) : (
          <p>EIBOR rates not loaded — update in admin panel</p>
        )}
      </div>
    </div>
  );
}
