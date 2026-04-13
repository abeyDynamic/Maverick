import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Save, Edit2, X } from 'lucide-react';

const SEGMENTS = ['resident', 'non_resident'];
const EMPLOYMENT_SUBTYPES = ['salaried', 'self_employed'];
const DOC_PATHS = ['standard', 'full_doc', 'low_doc', 'na'];
const ROUTE_TYPES = ['dbr', 'dab', 'both', 'manual'];
const RULE_TYPES = [
  'min_income', 'dbr_limit', 'min_loan_amount', 'max_loan_amount',
  'max_tenor_months', 'min_lob_months', 'max_ltv',
  'requires_manual_review', 'nationality_restriction', 'emirate_restriction',
  'job_segment_restriction', 'industry_restriction', 'audited_fs_requirement',
  'min_length_service_months', 'min_avg_balance_3m',
];
const OPERATORS = ['>=', '<=', '==', '!=', 'in', 'not_in'];

interface Rule {
  id: string;
  bank_id: string;
  bank_name?: string;
  segment: string;
  employment_subtype: string | null;
  doc_path: string | null;
  route_type: string | null;
  rule_type: string;
  operator: string;
  value_numeric: number | null;
  value_text: string | null;
  critical: boolean;
  active: boolean;
  priority: number;
  requires_manual_review: boolean;
  source_note: string | null;
}

const EMPTY_RULE: Omit<Rule, 'id' | 'bank_name'> = {
  bank_id: '', segment: 'resident', employment_subtype: null, doc_path: null,
  route_type: null, rule_type: 'min_income', operator: '>=', value_numeric: null,
  value_text: null, critical: true, active: true, priority: 0,
  requires_manual_review: false, source_note: null,
};

export default function EligibilityRulesManagement() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [banks, setBanks] = useState<{ id: string; bank_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterBank, setFilterBank] = useState('all');
  const [filterSegment, setFilterSegment] = useState('all');
  const [filterRuleType, setFilterRuleType] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [form, setForm] = useState<Omit<Rule, 'id' | 'bank_name'>>({ ...EMPTY_RULE });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [rulesRes, banksRes] = await Promise.all([
      supabase.from('bank_eligibility_rules').select('*, banks!inner(bank_name)').order('bank_id').order('segment').order('priority') as any,
      supabase.from('banks').select('id, bank_name').order('bank_name'),
    ]);
    if (rulesRes.data) {
      setRules(rulesRes.data.map((r: any) => ({ ...r, bank_name: r.banks?.bank_name ?? 'Unknown' })));
    }
    if (banksRes.data) setBanks(banksRes.data as any);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => rules.filter(r => {
    if (filterBank !== 'all' && r.bank_id !== filterBank) return false;
    if (filterSegment !== 'all' && r.segment !== filterSegment) return false;
    if (filterRuleType !== 'all' && r.rule_type !== filterRuleType) return false;
    return true;
  }), [rules, filterBank, filterSegment, filterRuleType]);

  function openNew() {
    setEditingRule(null);
    setForm({ ...EMPTY_RULE, bank_id: banks[0]?.id ?? '' });
    setShowModal(true);
  }

  function openEdit(rule: Rule) {
    setEditingRule(rule);
    setForm({
      bank_id: rule.bank_id, segment: rule.segment, employment_subtype: rule.employment_subtype,
      doc_path: rule.doc_path, route_type: rule.route_type, rule_type: rule.rule_type,
      operator: rule.operator, value_numeric: rule.value_numeric, value_text: rule.value_text,
      critical: rule.critical, active: rule.active, priority: rule.priority,
      requires_manual_review: rule.requires_manual_review, source_note: rule.source_note,
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.bank_id) { toast.error('Select a bank'); return; }
    setSaving(true);
    const payload: any = {
      bank_id: form.bank_id, segment: form.segment,
      employment_subtype: form.employment_subtype || null,
      doc_path: form.doc_path || null, route_type: form.route_type || null,
      rule_type: form.rule_type, operator: form.operator,
      value_numeric: form.value_numeric, value_text: form.value_text || null,
      critical: form.critical, active: form.active, priority: form.priority,
      requires_manual_review: form.requires_manual_review, source_note: form.source_note || null,
    };

    const { data: { user } } = await supabase.auth.getUser();
    let recordId: string;

    if (editingRule) {
      const { error } = await supabase.from('bank_eligibility_rules').update(payload).eq('id', editingRule.id);
      if (error) { toast.error('Failed to update rule'); setSaving(false); return; }
      recordId = editingRule.id;
    } else {
      const { data, error } = await supabase.from('bank_eligibility_rules').insert(payload).select('id').single();
      if (error || !data) { toast.error('Failed to create rule'); setSaving(false); return; }
      recordId = data.id;
    }

    await supabase.from('version_log').insert({
      table_name: 'bank_eligibility_rules', record_id: recordId,
      action: editingRule ? 'update' : 'create', changed_by: user?.id, details: payload,
    } as any);

    toast.success(editingRule ? 'Rule updated' : 'Rule created');
    setSaving(false);
    setShowModal(false);
    fetchData();
  }

  async function toggleActive(rule: Rule) {
    const newActive = !rule.active;
    await supabase.from('bank_eligibility_rules').update({ active: newActive }).eq('id', rule.id);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('version_log').insert({
      table_name: 'bank_eligibility_rules', record_id: rule.id,
      action: 'update', changed_by: user?.id, details: { active: { old: rule.active, new: newActive } },
    } as any);
    toast.success(newActive ? 'Rule activated' : 'Rule deactivated');
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
                <SelectContent>
                  <SelectItem value="all">All Banks</SelectItem>
                  {banks.map(b => <SelectItem key={b.id} value={b.id}>{b.bank_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[160px]">
              <Label className="text-xs text-muted-foreground">Segment</Label>
              <Select value={filterSegment} onValueChange={setFilterSegment}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Segments</SelectItem>
                  {SEGMENTS.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[160px]">
              <Label className="text-xs text-muted-foreground">Rule Type</Label>
              <Select value={filterRuleType} onValueChange={setFilterRuleType}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {RULE_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" className="gap-1 ml-auto" onClick={openNew}>
              <Plus className="h-4 w-4" /> Add Rule
            </Button>
            <span className="text-xs text-muted-foreground">{filtered.length} rules</span>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-background">
        <CardContent className="p-0">
          {loading ? (
            <p className="p-4 text-muted-foreground text-sm">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-muted-foreground text-sm">No rules match filters.</p>
          ) : (
            <ScrollArea className="w-full">
              <div className="min-w-[900px]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Bank</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Segment</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Emp Sub</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Doc</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Route</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Rule</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Op</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Value</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Critical</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Active</th>
                      <th className="w-[60px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, i) => (
                      <tr key={r.id} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                        <td className="px-3 py-2 font-medium">{r.bank_name}</td>
                        <td className="px-3 py-2 text-xs">{r.segment.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2 text-xs">{r.employment_subtype || '—'}</td>
                        <td className="px-3 py-2 text-xs">{r.doc_path || '—'}</td>
                        <td className="px-3 py-2 text-xs">{r.route_type || '—'}</td>
                        <td className="px-3 py-2 text-xs">{r.rule_type.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2 text-center text-xs">{r.operator}</td>
                        <td className="px-3 py-2 text-right text-xs font-mono">{r.value_numeric ?? r.value_text ?? '—'}</td>
                        <td className="px-3 py-2 text-center">
                          {r.critical && <Badge variant="destructive" className="text-[9px] px-1 py-0">Critical</Badge>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Switch checked={r.active} onCheckedChange={() => toggleActive(r)} />
                        </td>
                        <td className="px-3 py-2">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(r)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
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
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Edit Rule' : 'New Eligibility Rule'}</DialogTitle>
          </DialogHeader>
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
              <Label className="text-xs">Employment Subtype</Label>
              <Select value={form.employment_subtype ?? '__none__'} onValueChange={v => setForm(p => ({ ...p, employment_subtype: v === '__none__' ? null : v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Any</SelectItem>
                  {EMPLOYMENT_SUBTYPES.filter(Boolean).map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Doc Path</Label>
              <Select value={form.doc_path ?? '__none__'} onValueChange={v => setForm(p => ({ ...p, doc_path: v === '__none__' ? null : v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Any</SelectItem>
                  {DOC_PATHS.filter(Boolean).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Route Type</Label>
              <Select value={form.route_type ?? '__none__'} onValueChange={v => setForm(p => ({ ...p, route_type: v === '__none__' ? null : v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Any</SelectItem>
                  {ROUTE_TYPES.filter(Boolean).map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Rule Type *</Label>
              <Select value={form.rule_type} onValueChange={v => setForm(p => ({ ...p, rule_type: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{RULE_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Operator *</Label>
              <Select value={form.operator} onValueChange={v => setForm(p => ({ ...p, operator: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{OPERATORS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Numeric Value</Label>
              <Input type="number" className="h-8 text-sm" value={form.value_numeric ?? ''}
                onChange={e => setForm(p => ({ ...p, value_numeric: e.target.value ? parseFloat(e.target.value) : null }))} />
            </div>
            <div>
              <Label className="text-xs">Text Value</Label>
              <Input className="h-8 text-sm" value={form.value_text ?? ''}
                onChange={e => setForm(p => ({ ...p, value_text: e.target.value || null }))} />
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <Input type="number" className="h-8 text-sm" value={form.priority}
                onChange={e => setForm(p => ({ ...p, priority: parseInt(e.target.value) || 0 }))} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Source Note</Label>
              <Input className="h-8 text-sm" value={form.source_note ?? ''}
                onChange={e => setForm(p => ({ ...p, source_note: e.target.value || null }))} placeholder="e.g. Bank circular #123" />
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-xs">Critical</Label>
              <Switch checked={form.critical} onCheckedChange={v => setForm(p => ({ ...p, critical: v }))} />
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-xs">Requires Manual Review</Label>
              <Switch checked={form.requires_manual_review} onCheckedChange={v => setForm(p => ({ ...p, requires_manual_review: v }))} />
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-xs">Active</Label>
              <Switch checked={form.active} onCheckedChange={v => setForm(p => ({ ...p, active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1">
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
