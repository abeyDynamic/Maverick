import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Save } from 'lucide-react';
import { cn } from '@/lib/utils';

const TENORS = [
  { key: 'overnight', label: 'Overnight', shortLabel: 'O/N', color: '#F97316' },
  { key: 'one_week', label: '1 Week', shortLabel: '1W', color: '#06B6D4' },
  { key: 'one_month', label: '1 Month', shortLabel: '1M', color: '#3B82F6' },
  { key: 'three_months', label: '3 Months', shortLabel: '3M', color: '#22C55E' },
  { key: 'six_months', label: '6 Months', shortLabel: '6M', color: '#A855F7' },
  { key: 'one_year', label: '1 Year', shortLabel: '1Y', color: '#0A1F44' },
] as const;

type TenorKey = typeof TENORS[number]['key'];

export default function EiborManagement() {
  const [formDate, setFormDate] = useState<Date>(new Date());
  const [formValues, setFormValues] = useState<Record<TenorKey, string>>(
    Object.fromEntries(TENORS.map(t => [t.key, ''])) as Record<TenorKey, string>
  );
  const [saving, setSaving] = useState(false);
  const [latestDate, setLatestDate] = useState<string | null>(null);

  const fetchLatest = useCallback(async () => {
    const { data } = await supabase
      .from('eibor_history')
      .select('*')
      .order('fixing_date', { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      const row = data[0] as any;
      setLatestDate(row.fixing_date);
      setFormValues({
        overnight: row.overnight != null ? String(row.overnight) : '',
        one_week: row.one_week != null ? String(row.one_week) : '',
        one_month: row.one_month != null ? String(row.one_month) : '',
        three_months: row.three_months != null ? String(row.three_months) : '',
        six_months: row.six_months != null ? String(row.six_months) : '',
        one_year: row.one_year != null ? String(row.one_year) : '',
      });
    }
  }, []);

  useEffect(() => { fetchLatest(); }, [fetchLatest]);

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

    // Update eibor_rates for stress calculations
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
    await fetchLatest();
  };

  return (
    <Card className="bg-background">
      <CardHeader>
        <CardTitle className="text-base">Add / Update EIBOR Fixing</CardTitle>
        {latestDate && (
          <p className="text-sm text-muted-foreground">
            Current rates from: <strong>{format(parseISO(latestDate), 'dd MMM yyyy')}</strong>
          </p>
        )}
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
  );
}
