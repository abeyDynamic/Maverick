import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, subMonths, subYears, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer,
} from 'recharts';

const TENORS = [
  { key: 'overnight', label: 'Overnight', shortLabel: 'O/N', color: '#F97316' },
  { key: 'one_week', label: '1 Week', shortLabel: '1W', color: '#06B6D4' },
  { key: 'one_month', label: '1 Month', shortLabel: '1M', color: '#3B82F6' },
  { key: 'three_months', label: '3 Months', shortLabel: '3M', color: '#22C55E' },
  { key: 'six_months', label: '6 Months', shortLabel: '6M', color: '#A855F7' },
  { key: 'one_year', label: '1 Year', shortLabel: '1Y', color: '#0A1F44' },
] as const;

type TenorKey = typeof TENORS[number]['key'];

const TIME_RANGES = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
  { label: 'All', months: 0 },
] as const;

interface HistoryRow {
  fixing_date: string;
  overnight: number | null;
  one_week: number | null;
  one_month: number | null;
  three_months: number | null;
  six_months: number | null;
  one_year: number | null;
}

const fmtRate = (v: number | null) => v != null ? `${Number(v).toFixed(5)}%` : '—';

const ChartTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg text-xs">
      <p className="font-semibold mb-1.5">{format(parseISO(row.fixing_date), 'dd/MM/yyyy')}</p>
      {TENORS.map(t => (
        <div key={t.key} className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
          <span className="text-muted-foreground">{t.label}:</span>
          <span className="font-mono font-medium ml-auto">{fmtRate(row[t.key])}</span>
        </div>
      ))}
    </div>
  );
};

export default function DashboardEiborChart() {
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(12);
  const [visibleLines, setVisibleLines] = useState<Record<TenorKey, boolean>>(
    Object.fromEntries(TENORS.map(t => [t.key, true])) as Record<TenorKey, boolean>
  );

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('eibor_history')
      .select('*')
      .order('fixing_date', { ascending: true });
    setHistory((data as HistoryRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchHistory();
    const channel = supabase
      .channel('dashboard-eibor-chart')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eibor_history' }, () => fetchHistory())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchHistory]);

  const chartData = useMemo(() => {
    if (!history.length) return [];
    const cutoff = range > 0
      ? format(range <= 6 ? subMonths(new Date(), range) : subYears(new Date(), range / 12), 'yyyy-MM-dd')
      : null;
    const filtered = cutoff ? history.filter(h => h.fixing_date >= cutoff) : history;
    return filtered.map(h => ({ ...h, dateLabel: format(parseISO(h.fixing_date), 'dd/MM/yy') }));
  }, [history, range]);

  const last30 = useMemo(() => [...history].reverse().slice(0, 30), [history]);

  const toggleLine = (key: TenorKey) => setVisibleLines(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-4">
      <Card className="bg-background">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg text-primary">EIBOR Rate History</CardTitle>
            <div className="flex gap-1">
              {TIME_RANGES.map(tr => (
                <Button
                  key={tr.label}
                  size="sm"
                  variant={range === tr.months ? 'default' : 'outline'}
                  className="h-7 text-xs px-3"
                  onClick={() => setRange(tr.months)}
                >
                  {tr.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">Loading…</div>
          ) : chartData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No EIBOR history data available.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  interval={Math.max(0, Math.floor(chartData.length / 10) - 1)}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  className="fill-muted-foreground"
                  tickFormatter={(v: number) => `${v.toFixed(2)}%`}
                  domain={['auto', 'auto']}
                />
                <RechartsTooltip content={<ChartTooltip />} />
                <Legend
                  onClick={(e: any) => toggleLine(e.dataKey as TenorKey)}
                  wrapperStyle={{ cursor: 'pointer' }}
                  formatter={(value: string, entry: any) => (
                    <span style={{
                      color: visibleLines[entry.dataKey as TenorKey] ? entry.color : '#999',
                      textDecoration: visibleLines[entry.dataKey as TenorKey] ? 'none' : 'line-through',
                    }}>
                      {value}
                    </span>
                  )}
                />
                {TENORS.map(t => (
                  <Line
                    key={t.key}
                    type="monotone"
                    dataKey={t.key}
                    name={t.label}
                    stroke={t.color}
                    strokeWidth={2}
                    dot={false}
                    hide={!visibleLines[t.key]}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {last30.length > 0 && (
        <Card className="bg-background">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Last 30 Days</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[250px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                    {TENORS.map(t => (
                      <th key={t.key} className="text-right px-3 py-2 font-medium text-muted-foreground">{t.shortLabel}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {last30.map((row, i) => (
                    <tr key={row.fixing_date} className={cn(i % 2 === 0 ? 'bg-background' : 'bg-muted/30')}>
                      <td className="px-3 py-1.5 font-mono">{format(parseISO(row.fixing_date), 'dd/MM/yy')}</td>
                      {TENORS.map(t => (
                        <td key={t.key} className="text-right px-3 py-1.5 font-mono">{fmtRate(row[t.key])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
