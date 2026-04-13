import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Plus, Save, Edit2 } from 'lucide-react';

const SEGMENTS = ['resident', 'non_resident'];
const EMPLOYMENT_SUBTYPES = ['salaried', 'self_employed'];
const DOC_PATHS = ['standard', 'full_doc', 'low_doc', 'na'];
const ROUTE_TYPES = ['dbr', 'dab', 'both', 'manual'];
const INCOME_TYPES = [
  'basic_salary', 'housing_allowance', 'transport_allowance', 'other_allowance',
  'bonus_fixed', 'bonus_variable', 'commission_variable',
  'rental_income_1', 'rental_income_2', 'other_income',
  'business_income', 'freelance_income', 'pension',
];
const AVERAGING_METHODS = ['', 'simple_average', 'weighted_average', 'lowest_of_period'];

interface IncomePolicy {
  id: string;
  bank_id: string;
  bank_name?: string;
  segment: string;
  employment_subtype: string | null;
  doc_path: string | null;
  route_type: string | null;
  income_type: string;
  consideration_pct: number;
  income_basis: string | null;
  averaging_method: string | null;
  averaging_months: number | null;
  requires_documents: boolean;
  conditions: string | null;
  notes: string | null;
  active: boolean;
}

const EMPTY_POLICY: Omit<IncomePolicy, 'id' | 'bank_name'> = {
  bank_id: '', segment: 'resident', employment_subtype: null, doc_path: null,
  route_type: null, income_type: 'basic_salary', consideration_pct: 100,
  income_basis: null, averaging_method: null, averaging_months: null,
  requires_documents: false, conditions: null, notes: null, active: true,
};

export default function IncomePoliciesManagement() {
  const [policies, setPolicies] = useState<IncomePolicy[]>([]);
  const [banks, setBanks] = useState<{ id: string; bank_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterBank, setFilterBank] = useState('all');
  const [filterSegment, setFilterSegment] = useState('all');
  const [filterIncomeType, setFilterIncomeType] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<IncomePolicy | null>(null);
  const [form, setForm] = useState<Omit<IncomePolicy, 'id' | 'bank_name'>>({ ...EMPTY_POLICY });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [polRes, banksRes] = await Promise.all([
      supabase.from('bank_income_policies').select('*, banks!inner(bank_name)').order('bank_id').order('segment').order('income_type') as any,
      supabase.from('banks').select('id, bank_name').order('bank_name'),
    ]);
    if (polRes.data) setPolicies(polRes.data.map((r: any) => ({ ...r, bank_name: r.banks?.bank_name ?? 'Unknown' })));
    if (banksRes.data) setBanks(banksRes.data as any);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => policies.filter(p => {
    if (filterBank !== 'all' && p.bank_id !== filterBank) return false;
    if (filterSegment !== 'all' && p.segment !== filterSegment) return false;
    if (filterIncomeType !== 'all' && p.income_type !== filterIncomeType) return false;
    return true;
  }), [policies, filterBank, filterSegment, filterIncomeType]);

  function openNew() {
    setEditingPolicy(null);
    setForm({ ...EMPTY_POLICY, bank_id: banks[0]?.id ?? '' });
    setShowModal(true);
  }

  function openEdit(pol: IncomePolicy) {
    setEditingPolicy(pol);
    const { id, bank_name, ...rest } = pol;
    setForm(rest);
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.bank_id) { toast.error('Select a bank'); return; }
    setSaving(true);
    const payload: any = { ...form, employment_subtype: form.employment_subtype || null, doc_path: form.doc_path || null, route_type: form.route_type || null, income_basis: form.income_basis || null, averaging_method: form.averaging_method || null, conditions: form.conditions || null, notes: form.notes || null };

    const { data: { user } } = await supabase.auth.getUser();
    let recordId: string;

    if (editingPolicy) {
      const { error } = await supabase.from('bank_income_policies').update(payload).eq('id', editingPolicy.id);
      if (error) { toast.error('Failed to update'); setSaving(false); return; }
      recordId = editingPolicy.id;
    } else {
      const { data, error } = await supabase.from('bank_income_policies').insert(payload).select('id').single();
      if (error || !data) { toast.error('Failed to create'); setSaving(false); return; }
      recordId = data.id;
    }

    await supabase.from('version_log').insert({ table_name: 'bank_income_policies', record_id: recordId, action: editingPolicy ? 'update' : 'create', changed_by: user?.id, details: payload } as any);
    toast.success(editingPolicy ? 'Policy updated' : 'Policy created');
    setSaving(false);
    setShowModal(false);
    fetchData();
  }

  async function toggleActive(pol: IncomePolicy) {
    const newActive = !pol.active;
    await supabase.from('bank_income_policies').update({ active: newActive }).eq('id', pol.id);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('version_log').insert({ table_name: 'bank_income_policies', record_id: pol.id, action: 'update', changed_by: user?.id, details: { active: { old: pol.active, new: newActive } } } as any);
    toast.success(newActive ? 'Policy activated' : 'Policy deactivated');
    fetchData();
  }

  return (
    <div className="space-y-4">
      <Card className="bg-background">
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-[180px]">
              <Label className="text-xs text-muted-foreground">Bank</Label>
              <Select value={filterBank} onValueChange={setFilterBank}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All Banks</SelectItem>{banks.map(b => <SelectItem key={b.id} value={b.id}>{b.bank_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="w-[160px]">
              <Label className="text-xs text-muted-foreground">Segment</Label>
              <Select value={filterSegment} onValueChange={setFilterSegment}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All</SelectItem>{SEGMENTS.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="w-[160px]">
              <Label className="text-xs text-muted-foreground">Income Type</Label>
              <Select value={filterIncomeType} onValueChange={setFilterIncomeType}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All</SelectItem>{INCOME_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button size="sm" className="gap-1 ml-auto" onClick={openNew}><Plus className="h-4 w-4" /> Add Policy</Button>
            <span className="text-xs text-muted-foreground">{filtered.length} policies</span>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-background">
        <CardContent className="p-0">
          {loading ? <p className="p-4 text-muted-foreground text-sm">Loading…</p> : filtered.length === 0 ? <p className="p-4 text-muted-foreground text-sm">No policies match filters.</p> : (
            <ScrollArea className="w-full">
              <div className="min-w-[900px]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Bank</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Segment</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Income Type</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Consider %</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Basis</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Avg Method</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Docs</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Active</th>
                      <th className="w-[60px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p, i) => (
                      <tr key={p.id} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                        <td className="px-3 py-2 font-medium">{p.bank_name}</td>
                        <td className="px-3 py-2 text-xs">{p.segment.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2 text-xs">{p.income_type.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2 text-center font-mono">{p.consideration_pct}%</td>
                        <td className="px-3 py-2 text-xs">{p.income_basis || '—'}</td>
                        <td className="px-3 py-2 text-xs">{p.averaging_method?.replace(/_/g, ' ') || '—'}</td>
                        <td className="px-3 py-2 text-center">{p.requires_documents ? '✓' : '—'}</td>
                        <td className="px-3 py-2 text-center"><Switch checked={p.active} onCheckedChange={() => toggleActive(p)} /></td>
                        <td className="px-3 py-2"><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(p)}><Edit2 className="h-3.5 w-3.5" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingPolicy ? 'Edit Income Policy' : 'New Income Policy'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <Label className="text-xs">Bank *</Label>
              <Select value={form.bank_id} onValueChange={v => setForm(p => ({ ...p, bank_id: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{banks.map(b => <SelectItem key={b.id} value={b.id}>{b.bank_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Segment *</Label>
              <Select value={form.segment} onValueChange={v => setForm(p => ({ ...p, segment: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{SEGMENTS.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Income Type *</Label>
              <Select value={form.income_type} onValueChange={v => setForm(p => ({ ...p, income_type: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{INCOME_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Consideration %</Label>
              <Input type="number" className="h-8 text-sm" value={form.consideration_pct} onChange={e => setForm(p => ({ ...p, consideration_pct: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div>
              <Label className="text-xs">Income Basis</Label>
              <Input className="h-8 text-sm" value={form.income_basis ?? ''} onChange={e => setForm(p => ({ ...p, income_basis: e.target.value || null }))} placeholder="e.g. audited_financials" />
            </div>
            <div>
              <Label className="text-xs">Averaging Method</Label>
              <Select value={form.averaging_method ?? ''} onValueChange={v => setForm(p => ({ ...p, averaging_method: v === '__none__' ? null : v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent><SelectItem value="__none__">None</SelectItem>{AVERAGING_METHODS.filter(Boolean).map(m => <SelectItem key={m} value={m}>{m.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Averaging Months</Label>
              <Input type="number" className="h-8 text-sm" value={form.averaging_months ?? ''} onChange={e => setForm(p => ({ ...p, averaging_months: e.target.value ? parseInt(e.target.value) : null }))} />
            </div>
            <div>
              <Label className="text-xs">Employment Subtype</Label>
              <Select value={form.employment_subtype ?? ''} onValueChange={v => setForm(p => ({ ...p, employment_subtype: v === '__none__' ? null : v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Any</SelectItem>
                  {EMPLOYMENT_SUBTYPES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Doc Path</Label>
              <Select value={form.doc_path ?? ''} onValueChange={v => setForm(p => ({ ...p, doc_path: v === '__none__' ? null : v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Any</SelectItem>
                  {DOC_PATHS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Route Type</Label>
              <Select value={form.route_type ?? ''} onValueChange={v => setForm(p => ({ ...p, route_type: v === '__none__' ? null : v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Any</SelectItem>
                  {ROUTE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Conditions</Label>
              <Input className="h-8 text-sm" value={form.conditions ?? ''} onChange={e => setForm(p => ({ ...p, conditions: e.target.value || null }))} placeholder="e.g. min 6 months continuous" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Notes</Label>
              <Input className="h-8 text-sm" value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value || null }))} />
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-xs">Requires Documents</Label>
              <Switch checked={form.requires_documents} onCheckedChange={v => setForm(p => ({ ...p, requires_documents: v }))} />
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-xs">Active</Label>
              <Switch checked={form.active} onCheckedChange={v => setForm(p => ({ ...p, active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1"><Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
