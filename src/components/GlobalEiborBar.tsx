import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';

const TENORS = [
  { key: 'overnight', label: 'O/N' },
  { key: 'w1', label: '1W' },
  { key: 'm1', label: '1M' },
  { key: 'm3', label: '3M' },
  { key: 'm6', label: '6M' },
  { key: 'y1', label: '1Y' },
] as const;

interface LatestRow {
  fixing_date: string;
  overnight: number | null;
  w1: number | null;
  m1: number | null;
  m3: number | null;
  m6: number | null;
  y1: number | null;
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
    <div className="w-full print-hide" style={{ backgroundColor: '#1A4B8C', fontSize: '11px', color: 'white', padding: '4px 16px' }}>
      {latest ? (
        <p className="truncate font-mono">
          EIBOR {format(parseISO(latest.fixing_date), 'dd/MM/yyyy')}
          {TENORS.map(t => (
            <span key={t.key}>{' | '}{t.label}: {fmtRate(latest[t.key])}</span>
          ))}
        </p>
      ) : (
        <p>EIBOR rates not loaded</p>
      )}
    </div>
  );
}
