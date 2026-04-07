import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { format, subMonths, subYears, parseISO } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Save } from 'lucide-react';
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

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  // Find the fixing_date from the first payload entry
  const fixingDate = payload[0]?.payload?.fixing_date;
  const dateDisplay = fixingDate
    ? format(parseISO(fixingDate), 'dd/MM/yyyy')
    : label;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg text-xs">
      <p className="font-semibold mb-1.5">{dateDisplay}</p>
      {TENORS.map(t => {
        const entry = payload.find((p: any) => p.dataKey === t.key);
        return (
          <div key={t.key} className="flex items-center gap-2 py-0.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
            <span className="text-muted-foreground">{t.label}:</span>
            <span className="font-mono font-medium ml-auto">
              {entry?.value != null ? Number(entry.value).toFixed(5) : '—'}%
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default function EiborManagement() {
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(6);
  const [visibleLines, setVisibleLines] = useState<Record<TenorKey, boolean>>(
    Object.fromEntries(TENORS.map(t => [t.key, true])) as Record<TenorKey, boolean>
  );

  const [formDate, setFormDate] = useState<Date>(new Date());
  const [formValues, setFormValues] = useState<Record<TenorKey, string>>(
    Object.fromEntries(TENORS.map(t => [t.key, ''])) as Record<TenorKey, string>
  );
  const [saving, setSaving] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('eibor_history')
      .select('*')
      .order('fixing_date', { ascending: true });
    if (error) {
      console.error('Failed to load EIBOR history:', error);
      toast.error('Failed to load EIBOR history');
    } else {
      const rows = (data as HistoryRow[]) || [];
      setHistory(rows);
      // Pre-populate form with latest row
      if (rows.length > 0) {
        const latest = rows[rows.length - 1];
        setFormValues({
          overnight: latest.overnight != null ? String(latest.overnight) : '',
          one_week: latest.one_week != null ? String(latest.one_week) : '',
          one_month: latest.one_month != null ? String(latest.one_month) : '',
          three_months: latest.three_months != null ? String(latest.three_months) : '',
          six_months: latest.six_months != null ? String(latest.six_months) : '',
          one_year: latest.one_year != null ? String(latest.one_year) : '',
        });
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const chartData = useMemo(() => {
    if (!history.length) return [];
    const cutoff = range > 0
      ? format(range <= 6 ? subMonths(new Date(), range) : subYears(new Date(), range / 12), 'yyyy-MM-dd')
      : null;
    const filtered = cutoff ? history.filter(h => h.fixing_date >= cutoff) : history;
    return filtered.map(h => ({
      ...h,
      dateLabel: format(parseISO(h.fixing_date), 'dd/MM/yy'),
    }));
  }, [history, range]);

  const latestRow = history.length ? history[history.length - 1] : null;

  const toggleLine = (key: TenorKey) => {
    setVisibleLines(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    const dateStr = format(formDate, 'yyyy-MM-dd');
    const row: Record<string, any> = { fixing_date: dateStr };
    for (const t of TENORS) {
      const val = formValues[t.key].trim();
      row[t.key] = val ? parseFloat(val) : null;
    }

    if (TENORS.every(t => row[t.key] == null)) {
      toast.error('Enter at least one rate');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('eibor_history')
      .upsert(row, { onConflict: 'fixing_date' });

    if (error) {
      console.error('Save failed:', error);
      toast.error('Failed to save EIBOR rates');
      setSaving(false);
      return;
    }

    // Update eibor_rates with 1m, 3m, 6m for stress calculations
    const rateUpdates = [
      { type: '1m', value: row.one_month },
      { type: '3m', value: row.three_months },
      { type: '6m', value: row.six_months },
    ].filter(r => r.value != null);

    for (const ru of rateUpdates) {
      await supabase
        .from('eibor_rates')
        .upsert(
          { rate_type: ru.type, rate: ru.value, effective_date: dateStr, source: 'manual' },
          { onConflict: 'rate_type' }
        );
    }

    toast.success('EIBOR rates updated');
    setSaving(false);
    await fetchHistory();
  };

  return (
    <div className="space-y-6">
      {/* SECTION 1 — Interactive Chart */}
      <Card className="bg-background">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle>EIBOR Rate History</CardTitle>
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
            <div className="h-[320px] flex items-center justify-center text-muted-foreground">Loading…</div>
          ) : chartData.length === 0 ? (
            <div className="h-[320px] flex items-center justify-center text-muted-foreground">
              No EIBOR history data. Add rates below to get started.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
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
                <RechartsTooltip content={<CustomTooltip />} />
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

      {/* SECTION 2 — Current Rates Summary Bar */}
      {latestRow && (
        <Card className="bg-background">
          <CardContent className="pt-6">
            <p className="text-sm font-bold mb-3">
              Latest fixing: {format(parseISO(latestRow.fixing_date), 'dd MMM yyyy')}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
              {TENORS.map(t => (
                <div key={t.key} className="text-center rounded-lg border p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t.shortLabel}</p>
                  <p className="text-lg font-bold font-mono" style={{ color: t.color }}>
                    {latestRow[t.key] != null ? `${Number(latestRow[t.key]).toFixed(5)}%` : '—'}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECTION 3 — Manual Update */}
      <Card className="bg-background">
        <CardHeader>
          <CardTitle className="text-base">Add / Update EIBOR Fixing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <Label className="text-xs">Fixing Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal", !formDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formDate ? format(formDate, 'dd MMM yyyy') : 'Pick date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formDate}
                      onSelect={(d) => d && setFormDate(d)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {TENORS.map(t => (
                <div key={t.key}>
                  <Label className="text-xs">{t.label} (%)</Label>
                  <Input
                    type="number"
                    step="0.00001"
                    placeholder="e.g. 4.85000"
                    value={formValues[t.key]}
                    onChange={e => setFormValues(prev => ({ ...prev, [t.key]: e.target.value }))}
                    className="font-mono text-sm"
                  />
                </div>
              ))}
            </div>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save Rates'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
