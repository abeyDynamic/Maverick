import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  LineChart, Line, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis,
} from 'recharts';
import { ScrollArea } from '@/components/ui/scroll-area';

const TENORS = [
  { key: 'overnight', label: 'O/N', color: '#F97316' },
  { key: 'w1', label: '1W', color: '#06B6D4' },
  { key: 'm1', label: '1M', color: '#3B82F6' },
  { key: 'm3', label: '3M', color: '#22C55E' },
  { key: 'm6', label: '6M', color: '#A855F7' },
  { key: 'y1', label: '1Y', color: '#0A1F44' },
] as const;

const CHART_TENORS = TENORS.filter(t => ['m1', 'm3', 'm6'].includes(t.key));

type TenorKey = typeof TENORS[number]['key'];

interface HistoryRow {
  fixing_date: string;
  overnight: number | null;
  w1: number | null;
  m1: number | null;
  m3: number | null;
  m6: number | null;
  y1: number | null;
}

const fmtRate = (v: number | null) => v != null ? `${Number(v).toFixed(5)}%` : '—';

const MiniTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-md border bg-background p-2 shadow-lg text-xs">
      <p className="font-semibold mb-1">{format(parseISO(row.fixing_date), 'dd/MM/yyyy')}</p>
      {CHART_TENORS.map(t => (
        <div key={t.key} className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
          <span className="text-muted-foreground">{t.label}:</span>
          <span className="font-mono font-medium ml-auto">{fmtRate(row[t.key])}</span>
        </div>
      ))}
    </div>
  );
};

export default function EiborPanel() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('eibor_history')
      .select('*')
      .order('fixing_date', { ascending: false })
      .limit(30);
    setRows((data as HistoryRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('eibor-panel-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eibor_history' }, () => {
        fetchData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const latest = rows.length > 0 ? rows[0] : null;
  const chartData = useMemo(() => [...rows].reverse(), [rows]);

  if (loading && rows.length === 0) {
    return (
      <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
        Loading EIBOR rates…
      </div>
    );
  }

  if (!latest) {
    return (
      <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
        EIBOR rates not yet loaded
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {/* PART A — Today's rates bar (always visible) */}
      <CollapsibleTrigger asChild>
        <button className="w-full rounded-lg bg-muted/50 p-3 text-left hover:bg-muted/70 transition-colors cursor-pointer">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">
              Latest fixing: {format(parseISO(latest.fixing_date), 'dd MMM yyyy')}
            </span>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
          </div>
          <div className="flex flex-wrap gap-2">
            {TENORS.map(t => (
              <span
                key={t.key}
                className="inline-flex items-center gap-1.5 rounded-md bg-background px-2 py-1 text-xs border"
              >
                <span className="font-medium text-muted-foreground">{t.label}</span>
                <span className="font-mono font-semibold" style={{ color: t.color }}>
                  {fmtRate(latest[t.key])}
                </span>
              </span>
            ))}
          </div>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-2 space-y-2">
          {/* PART B — 30-day mini chart */}
          {chartData.length > 1 && (
            <div className="rounded-lg bg-muted/50 p-3">
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <XAxis dataKey="fixing_date" hide />
                  <RechartsTooltip content={<MiniTooltip />} />
                  {CHART_TENORS.map(t => (
                    <Line
                      key={t.key}
                      type="monotone"
                      dataKey={t.key}
                      stroke={t.color}
                      strokeWidth={1.5}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* PART C — Last month table */}
          <div className="rounded-lg bg-muted/50 overflow-hidden">
            <ScrollArea className="max-h-[200px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Date</th>
                    {TENORS.map(t => (
                      <th key={t.key} className="text-right px-2 py-1.5 font-medium text-muted-foreground">{t.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.fixing_date} className={cn(i % 2 === 0 ? 'bg-background' : 'bg-muted/30')}>
                      <td className="px-2 py-1 font-mono">{format(parseISO(row.fixing_date), 'dd/MM/yy')}</td>
                      {TENORS.map(t => (
                        <td key={t.key} className="text-right px-2 py-1 font-mono">
                          {fmtRate(row[t.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
