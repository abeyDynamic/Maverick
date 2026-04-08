import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Save, AlertTriangle, Plus } from 'lucide-react';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Bank {
  id: string;
  bank_name: string;
  base_stress_rate: number | null;
  stress_eibor_tenor: string | null;
  min_salary: number;
  dbr_limit: number;
  min_loan_amount: number;
  max_loan_amount: number | null;
  max_tenor_months: number;
  active: boolean;
}

interface EditState {
  base_stress_rate: string;
  stress_eibor_tenor: string;
  min_salary: string;
  dbr_limit: string;
  min_loan_amount: string;
  max_loan_amount: string;
  max_tenor_months: string;
  active: boolean;
}

interface NewBankForm {
  bank_name: string;
  short_code: string;
  base_stress_rate: string;
  stress_eibor_tenor: string;
  min_salary: string;
  dbr_limit: string;
  min_loan_amount: string;
  max_loan_amount: string;
  max_tenor_months: string;
  mortgage_types: string[];
  active: boolean;
}

const EMPTY_NEW_BANK: NewBankForm = {
  bank_name: '',
  short_code: '',
  base_stress_rate: '',
  stress_eibor_tenor: '3m',
  min_salary: '',
  dbr_limit: '50',
  min_loan_amount: '',
  max_loan_amount: '',
  max_tenor_months: '300',
  mortgage_types: ['conventional'],
  active: true,
};

const EDITABLE_FIELDS = [
  'base_stress_rate', 'stress_eibor_tenor', 'min_salary', 'dbr_limit',
  'min_loan_amount', 'max_loan_amount', 'max_tenor_months', 'active',
] as const;

export default function BankManagement() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBank, setNewBank] = useState<NewBankForm>({ ...EMPTY_NEW_BANK });
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const [addSaving, setAddSaving] = useState(false);

  const toEditState = (b: Bank): EditState => ({
    base_stress_rate: b.base_stress_rate?.toString() ?? '',
    stress_eibor_tenor: b.stress_eibor_tenor ?? '',
    min_salary: b.min_salary.toString(),
    dbr_limit: b.dbr_limit.toString(),
    min_loan_amount: b.min_loan_amount.toString(),
    max_loan_amount: b.max_loan_amount?.toString() ?? '',
    max_tenor_months: b.max_tenor_months.toString(),
    active: b.active,
  });

  const fetchBanks = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('banks')
      .select('id, bank_name, base_stress_rate, stress_eibor_tenor, min_salary, dbr_limit, min_loan_amount, max_loan_amount, max_tenor_months, active')
      .order('bank_name');
    if (error) {
      console.error(error);
      toast.error('Failed to load banks');
    } else if (data) {
      const banksData = data as Bank[];
      setBanks(banksData);
      const editMap: Record<string, EditState> = {};
      banksData.forEach(b => { editMap[b.id] = toEditState(b); });
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
      base_stress_rate: edit.base_stress_rate ? parseFloat(edit.base_stress_rate) : null,
      stress_eibor_tenor: edit.stress_eibor_tenor || null,
      min_salary: parseFloat(edit.min_salary) || 0,
      dbr_limit: parseFloat(edit.dbr_limit) || 0,
      min_loan_amount: parseFloat(edit.min_loan_amount) || 0,
      max_loan_amount: edit.max_loan_amount ? parseFloat(edit.max_loan_amount) : null,
      max_tenor_months: parseInt(edit.max_tenor_months) || 0,
      active: edit.active,
    };

    const oldValues: Record<string, unknown> = {
      base_stress_rate: bank.base_stress_rate,
      stress_eibor_tenor: bank.stress_eibor_tenor,
      min_salary: bank.min_salary,
      dbr_limit: bank.dbr_limit,
      min_loan_amount: bank.min_loan_amount,
      max_loan_amount: bank.max_loan_amount,
      max_tenor_months: bank.max_tenor_months,
      active: bank.active,
    };

    const changes: Record<string, { old: unknown; new: unknown }> = {};
    for (const key of EDITABLE_FIELDS) {
      if (newValues[key] !== oldValues[key]) {
        changes[key] = { old: oldValues[key], new: newValues[key] };
      }
    }

    if (Object.keys(changes).length === 0) {
      toast.info('No changes to save');
      setSavingId(null);
      return;
    }

    const { error } = await supabase.from('banks').update(newValues).eq('id', bank.id);
    if (error) {
      toast.error('Failed to update bank');
      console.error(error);
      setSavingId(null);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('version_log').insert({
      table_name: 'banks', record_id: bank.id, action: 'update',
      changed_by: user?.id, details: changes,
    } as any);

    toast.success('Bank updated');
    await fetchBanks();
    setSavingId(null);
  };

  /* ─── Add New Bank ─── */
  const handleAddBank = async () => {
    const errors: Record<string, string> = {};
    if (!newBank.bank_name.trim()) errors.bank_name = 'Bank name is required';
    if (!newBank.short_code.trim()) errors.short_code = 'Short code is required';
    else if (newBank.short_code.length > 10) errors.short_code = 'Max 10 characters';
    if (!newBank.base_stress_rate) errors.base_stress_rate = 'Stress rate is required';

    if (Object.keys(errors).length > 0) { setAddErrors(errors); return; }

    setAddSaving(true);
    setAddErrors({});

    const code = newBank.short_code.trim().toLowerCase();

    // Check unique short_code
    const { data: existing } = await supabase
      .from('banks')
      .select('id')
      .eq('short_code', code)
      .limit(1);

    if (existing && existing.length > 0) {
      setAddErrors({ short_code: 'Short code already exists — choose a different one' });
      setAddSaving(false);
      return;
    }

    const payload = {
      bank_name: newBank.bank_name.trim(),
      short_code: code,
      base_stress_rate: parseFloat(newBank.base_stress_rate),
      stress_eibor_tenor: newBank.stress_eibor_tenor,
      min_salary: parseFloat(newBank.min_salary) || 0,
      dbr_limit: parseFloat(newBank.dbr_limit) || 50,
      min_loan_amount: parseFloat(newBank.min_loan_amount) || 0,
      max_loan_amount: newBank.max_loan_amount ? parseFloat(newBank.max_loan_amount) : null,
      max_tenor_months: parseInt(newBank.max_tenor_months) || 300,
      mortgage_types: newBank.mortgage_types,
      active: newBank.active,
    };

    const { data: inserted, error } = await supabase
      .from('banks')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      toast.error('Failed to add bank');
      console.error(error);
      setAddSaving(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('version_log').insert({
      table_name: 'banks', record_id: inserted.id, action: 'create',
      changed_by: user?.id, details: payload,
    } as any);

    toast.success('Bank added successfully');
    setNewBank({ ...EMPTY_NEW_BANK });
    setShowAddModal(false);
    setAddSaving(false);
    await fetchBanks();
  };

  const toggleMortgageType = (type: string) => {
    setNewBank(prev => ({
      ...prev,
      mortgage_types: prev.mortgage_types.includes(type)
        ? prev.mortgage_types.filter(t => t !== type)
        : [...prev.mortgage_types, type],
    }));
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Bank Configuration ({banks.length})</CardTitle>
          <Button size="sm" className="gap-1" onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4" /> Add New Bank
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-4 text-muted-foreground text-sm">Loading…</p>
          ) : banks.length === 0 ? (
            <p className="p-4 text-muted-foreground text-sm">No banks found.</p>
          ) : (
            <ScrollArea className="w-full">
              <div className="min-w-[900px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[140px]">Bank Name</TableHead>
                      <TableHead className="w-[100px] text-center">Stress %</TableHead>
                      <TableHead className="w-[80px] text-center">Tenor</TableHead>
                      <TableHead className="w-[110px] text-center">Min Salary</TableHead>
                      <TableHead className="w-[80px] text-center">DBR %</TableHead>
                      <TableHead className="w-[110px] text-center">Min Loan</TableHead>
                      <TableHead className="w-[110px] text-center">Max Loan</TableHead>
                      <TableHead className="w-[80px] text-center">Tenor Mo</TableHead>
                      <TableHead className="w-[60px] text-center">Active</TableHead>
                      <TableHead className="w-[70px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {banks.map(bank => {
                      const edit = edits[bank.id];
                      if (!edit) return null;
                      return (
                        <TableRow key={bank.id}>
                          <TableCell className="font-medium text-sm">{bank.bank_name}</TableCell>
                          <TableCell>
                            <Input type="number" step="0.01" className="h-8 text-center text-sm"
                              value={edit.base_stress_rate}
                              onChange={e => updateField(bank.id, 'base_stress_rate', e.target.value)} />
                          </TableCell>
                          <TableCell>
                            <Input type="text" className="h-8 text-center text-sm"
                              value={edit.stress_eibor_tenor}
                              onChange={e => updateField(bank.id, 'stress_eibor_tenor', e.target.value)} />
                          </TableCell>
                          <TableCell>
                            <Input type="number" step="1000" className="h-8 text-center text-sm"
                              value={edit.min_salary}
                              onChange={e => updateField(bank.id, 'min_salary', e.target.value)} />
                          </TableCell>
                          <TableCell>
                            <Input type="number" step="1" className="h-8 text-center text-sm"
                              value={edit.dbr_limit}
                              onChange={e => updateField(bank.id, 'dbr_limit', e.target.value)} />
                          </TableCell>
                          <TableCell>
                            <Input type="number" step="10000" className="h-8 text-center text-sm"
                              value={edit.min_loan_amount}
                              onChange={e => updateField(bank.id, 'min_loan_amount', e.target.value)} />
                          </TableCell>
                          <TableCell>
                            <Input type="number" step="100000" className="h-8 text-center text-sm"
                              value={edit.max_loan_amount}
                              onChange={e => updateField(bank.id, 'max_loan_amount', e.target.value)} />
                          </TableCell>
                          <TableCell>
                            <Input type="number" step="12" className="h-8 text-center text-sm"
                              value={edit.max_tenor_months}
                              onChange={e => updateField(bank.id, 'max_tenor_months', e.target.value)} />
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch checked={edit.active}
                              onCheckedChange={v => updateField(bank.id, 'active', v)} />
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" className="h-8 gap-1"
                              disabled={savingId === bank.id}
                              onClick={() => handleSave(bank)}>
                              <Save className="h-3.5 w-3.5" />
                              {savingId === bank.id ? '…' : 'Save'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Add New Bank Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New Bank</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2">
              <Label className="text-xs">Bank Name *</Label>
              <Input value={newBank.bank_name}
                onChange={e => setNewBank(p => ({ ...p, bank_name: e.target.value }))}
                placeholder="e.g. First Abu Dhabi Bank" />
              {addErrors.bank_name && <p className="text-xs text-destructive mt-1">{addErrors.bank_name}</p>}
            </div>
            <div>
              <Label className="text-xs">Short Code *</Label>
              <Input value={newBank.short_code} maxLength={10}
                onChange={e => setNewBank(p => ({ ...p, short_code: e.target.value.toLowerCase() }))}
                placeholder="e.g. fab" />
              {addErrors.short_code && <p className="text-xs text-destructive mt-1">{addErrors.short_code}</p>}
            </div>
            <div>
              <Label className="text-xs">Base Stress Rate % *</Label>
              <Input type="number" step="0.01" value={newBank.base_stress_rate}
                onChange={e => setNewBank(p => ({ ...p, base_stress_rate: e.target.value }))}
                placeholder="e.g. 7.37" />
              {addErrors.base_stress_rate && <p className="text-xs text-destructive mt-1">{addErrors.base_stress_rate}</p>}
            </div>
            <div>
              <Label className="text-xs">Stress EIBOR Tenor</Label>
              <Select value={newBank.stress_eibor_tenor}
                onValueChange={v => setNewBank(p => ({ ...p, stress_eibor_tenor: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1m">1m</SelectItem>
                  <SelectItem value="3m">3m</SelectItem>
                  <SelectItem value="6m">6m</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Min Salary AED</Label>
              <Input type="number" value={newBank.min_salary}
                onChange={e => setNewBank(p => ({ ...p, min_salary: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">DBR Limit %</Label>
              <Input type="number" value={newBank.dbr_limit}
                onChange={e => setNewBank(p => ({ ...p, dbr_limit: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Min Loan AED</Label>
              <Input type="number" value={newBank.min_loan_amount}
                onChange={e => setNewBank(p => ({ ...p, min_loan_amount: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Max Loan AED</Label>
              <Input type="number" value={newBank.max_loan_amount}
                onChange={e => setNewBank(p => ({ ...p, max_loan_amount: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Max Tenor Months</Label>
              <Input type="number" value={newBank.max_tenor_months}
                onChange={e => setNewBank(p => ({ ...p, max_tenor_months: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs mb-2 block">Mortgage Types</Label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={newBank.mortgage_types.includes('conventional')}
                    onCheckedChange={() => toggleMortgageType('conventional')} />
                  Conventional
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={newBank.mortgage_types.includes('islamic')}
                    onCheckedChange={() => toggleMortgageType('islamic')} />
                  Islamic
                </label>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Active</Label>
              <Switch checked={newBank.active}
                onCheckedChange={v => setNewBank(p => ({ ...p, active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button onClick={handleAddBank} disabled={addSaving}>
              {addSaving ? 'Saving…' : 'Save Bank'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
