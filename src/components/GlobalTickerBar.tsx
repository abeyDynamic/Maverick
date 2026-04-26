import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';

const TENORS = [
  { key: 'overnight', label: 'O/N' },
  { key: 'w1',        label: '1W'  },
  { key: 'm1',        label: '1M'  },
  { key: 'm3',        label: '3M'  },
  { key: 'm6',        label: '6M'  },
  { key: 'y1',        label: '1Y'  },
] as const;

interface EiborRow {
  fixing_date: string;
  overnight: number | null;
  w1: number | null; m1: number | null; m3: number | null;
  m6: number | null; y1: number | null;
}

interface TickerUpdate {
  id: string; content: string; category: string; active: boolean; pinned: boolean;
}

const fmtRate = (v: number | null) => v != null ? `${Number(v).toFixed(5)}%` : '—';

export default function GlobalTickerBar() {
  const [eiborText, setEiborText] = useState('');
  const [updates, setUpdates] = useState<TickerUpdate[]>([]);
  const [paused, setPaused] = useState(false);
  const innerRef = useRef<HTMLDivElement>(null);

  const fetchEibor = useCallback(async () => {
    const { data } = await supabase
      .from('eibor_history').select('*')
      .order('fixing_date', { ascending: false }).limit(1);
    if (data?.length) {
      const row = data[0] as EiborRow;
      const dateStr = format(parseISO(row.fixing_date), 'dd/MM/yyyy');
      const rates = TENORS.map(t => `${t.label} ${fmtRate(row[t.key])}`).join('  ·  ');
      setEiborText(`EIBOR ${dateStr}  ·  ${rates}`);
    }
  }, []);

  const fetchUpdates = useCallback(async () => {
    const { data } = await supabase.from('ticker_updates').select('*')
      .eq('active', true)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (data) setUpdates(data as TickerUpdate[]);
  }, []);

  useEffect(() => {
    fetchEibor(); fetchUpdates();
    const c1 = supabase.channel('ticker-eibor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eibor_history' }, fetchEibor).subscribe();
    const c2 = supabase.channel('ticker-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticker_updates' }, fetchUpdates).subscribe();
    return () => { supabase.removeChannel(c1); supabase.removeChannel(c2); };
  }, [fetchEibor, fetchUpdates]);

  const ICONS: Record<string, string> = { policy: '⚡', rate: '↑', general: '·' };
  const segments: string[] = [];
  if (eiborText) segments.push(eiborText);
  updates.forEach(u => segments.push(`${ICONS[u.category] ?? '·'}  ${u.content}`));
  const fullText = segments.join('          ');

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const measure = () => {
      const hw = inner.scrollWidth / 2;
      inner.style.setProperty('--scroll-width', `${hw}px`);
      inner.style.setProperty('--scroll-duration', `${hw / 70}s`);
    };
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(inner);
    return () => obs.disconnect();
  }, [fullText]);

  if (!fullText) return null;

  return (
    <div
      className="w-full overflow-hidden print-hide"
      style={{ backgroundColor: 'hsl(216,75%,9%)', height: '26px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        ref={innerRef}
        className="ticker-scroll inline-flex items-center whitespace-nowrap h-full"
        style={{
          fontSize: '11px',
          color: 'rgba(255,255,255,0.55)',
          fontFamily: "'DM Mono', monospace",
          letterSpacing: '0.03em',
          animationPlayState: paused ? 'paused' : 'running',
        }}
      >
        <span className="px-8">{fullText}</span>
        <span className="px-8">{fullText}</span>
      </div>
    </div>
  );
}
