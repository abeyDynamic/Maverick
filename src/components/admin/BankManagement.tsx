import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Save, AlertTriangle } from 'lucide-react';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';

interface Bank {
  id: string;
  bank_name: string;
  base_stress_rate: number | null;
  min_salary: number;
  dbr_limit: number;
  max_ltv: number | null;
  active: boolean;
}

interface EditState {
  base_stress_rate: string;
  min_salary: string;
  dbr_limit: string;
  max_ltv: string;
  active: boolean;
}

export default function BankManagement() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchBanks = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('banks')
      .select('id, bank_name, base_stress_rate, min_salary, dbr_limit, max_ltv, active')
      .order('bank_name');
    if (error) {
      console.error(error);
      toast.error('Failed to load banks');
    } else if (data) {
      const banksData = data as Bank[];
      setBanks(banksData);
      const editMap: Record<string, EditState> = {};
      banksData.forEach(b => {
        editMap[b.id] = {
          base_stress_rate: b.base_stress_rate?.toString() ?? '',
          min_salary: b.min_salary.toString(),
          dbr_limit: b.dbr_limit.toString(),
          max_ltv: (b.max_ltv ?? 80).toString(),
          active: b.active,
        };
      });
      setEdits(editMap);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchBanks(); }, [fetchBanks]);

  const updateField = (bankId: string, field: keyof EditState, value: string | boolean) => {
    setEdits(prev => ({ ...prev, [bankId]: { ...prev[bankId], [field]: value } }));
  };

  const handleSave = async (bank: Bank) => {
    const edit = edits[bank.id];
    if (!edit) return;

    setSavingId(bank.id);

    const newValues = {
      base_stress_rate: parseFloat(edit.base_stress_rate) || null,
      min_salary: parseFloat(edit.min_salary) || 0,
      dbr_limit: parseFloat(edit.dbr_limit) || 0,
      max_ltv: parseFloat(edit.max_ltv) || 80,
      active: edit.active,
    };

    // Build diff for version_log
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    if (newValues.base_stress_rate !== bank.base_stress_rate) {
      changes.base_stress_rate = { old: bank.base_stress_rate, new: newValues.base_stress_rate };
    }
    if (newValues.min_salary !== bank.min_salary) {
      changes.min_salary = { old: bank.min_salary, new: newValues.min_salary };
    }
    if (newValues.dbr_limit !== bank.dbr_limit) {
      changes.dbr_limit = { old: bank.dbr_limit, new: newValues.dbr_limit };
    }
    if (newValues.max_ltv !== (bank.max_ltv ?? 80)) {
      changes.max_ltv = { old: bank.max_ltv ?? 80, new: newValues.max_ltv };
    }
    if (newValues.active !== bank.active) {
      changes.active = { old: bank.active, new: newValues.active };
    }

    if (Object.keys(changes).length === 0) {
      toast.info('No changes to save');
      setSavingId(null);
      return;
    }

    const { error } = await supabase
      .from('banks')
      .update(newValues)
      .eq('id', bank.id);

    if (error) {
      toast.error('Failed to update bank');
      console.error(error);
      setSavingId(null);
      return;
    }

    // Log to version_log
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('version_log').insert({
      table_name: 'banks',
      record_id: bank.id,
      action: 'update',
      changed_by: user?.id,
      details: changes,
    } as any);

    toast.success('Bank updated');
    await fetchBanks();
    setSavingId(null);
  };

  return (
    <div className="space-y-4">
      <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800 dark:text-amber-200 text-sm">
          Changes to stress rates affect all live DBR calculations immediately. Changes to min salary and DBR limits affect bank eligibility immediately.
        </AlertDescription>
      </Alert>

      <Card className="bg-background">
        <CardHeader>
          <CardTitle className="text-base">Bank Configuration ({banks.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-4 text-muted-foreground text-sm">Loading…</p>
          ) : banks.length === 0 ? (
            <p className="p-4 text-muted-foreground text-sm">No banks found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bank Name</TableHead>
                  <TableHead className="w-[120px] text-center">Stress Rate %</TableHead>
                  <TableHead className="w-[130px] text-center">Min Salary AED</TableHead>
                  <TableHead className="w-[100px] text-center">DBR Limit %</TableHead>
                  <TableHead className="w-[100px] text-center">Max LTV %</TableHead>
                  <TableHead className="w-[80px] text-center">Active</TableHead>
                  <TableHead className="w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {banks.map(bank => {
                  const edit = edits[bank.id];
                  if (!edit) return null;
                  return (
                    <TableRow key={bank.id}>
                      <TableCell className="font-medium">{bank.bank_name}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8 text-center text-sm"
                          value={edit.base_stress_rate}
                          onChange={e => updateField(bank.id, 'base_stress_rate', e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="1000"
                          className="h-8 text-center text-sm"
                          value={edit.min_salary}
                          onChange={e => updateField(bank.id, 'min_salary', e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="1"
                          className="h-8 text-center text-sm"
                          value={edit.dbr_limit}
                          onChange={e => updateField(bank.id, 'dbr_limit', e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="1"
                          className="h-8 text-center text-sm"
                          value={edit.max_ltv}
                          onChange={e => updateField(bank.id, 'max_ltv', e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={edit.active}
                          onCheckedChange={v => updateField(bank.id, 'active', v)}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1"
                          disabled={savingId === bank.id}
                          onClick={() => handleSave(bank)}
                        >
                          <Save className="h-3.5 w-3.5" />
                          {savingId === bank.id ? '…' : 'Save'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
