import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Edit2, Copy, Archive, Zap, Save, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Product {
  id: string;
  bank_id: string;
  bank_name: string;
  segment: string | null;
  residency: string | null;
  fixed_period: string | null;
  salary_transfer: boolean;
  rate: number | null;
  follow_on_margin: number | null;
  eibor_benchmark: string | null;
  stress_rate: number | null;
  life_ins_monthly_percent: number | null;
  prop_ins_annual_percent: number | null;
  valuation_fee: number | null;
  processing_fee: number | null;
  processing_fee_percent: number | null;
  early_settlement_fee: string | null;
  partial_settlement: string | null;
  key_points: string | null;
  status: string;
  validity_end: string | null;
  created_at: string;
  active: boolean;
}

interface BankGroup {
  bank_name: string;
  bank_id: string;
  products: Product[];
  activeCount: number;
  draftCount: number;
  retiredCount: number;
}

const SEGMENTS = [
  { value: 'salaried', label: 'Salaried' },
  { value: 'self_employed', label: 'Self Employed' },
  { value: 'non_resident', label: 'Non Resident' },
];

const RESIDENCIES = [
  { value: 'resident_expat', label: 'Resident/Expat' },
  { value: 'non_resident', label: 'Non Resident' },
];

const FIXED_PERIODS = [
  { value: '1yr', label: '1yr' },
  { value: '2yr', label: '2yr' },
  { value: '3yr', label: '3yr' },
  { value: '5yr', label: '5yr' },
  { value: 'variable', label: 'Variable' },
];

const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'retired', label: 'Retired' },
];

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') return <Badge className="bg-green-600/20 text-green-700 border-green-600/30 hover:bg-green-600/20">Active</Badge>;
  if (status === 'draft') return <Badge variant="secondary">Draft</Badge>;
  return <Badge variant="outline" className="text-muted-foreground line-through">Retired</Badge>;
}

function formatPct(val: number | null): string {
  if (val == null) return '—';
  return `${val}%`;
}

export default function ProductManagement() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [banks, setBanks] = useState<{ id: string; bank_name: string }[]>([]);
  const [filterBank, setFilterBank] = useState('all');
  const [filterSegment, setFilterSegment] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [showRetired, setShowRetired] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string | number | null>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*, banks!inner(bank_name)')
      .order('segment')
      .order('fixed_period');
    if (error) {
      console.error(error);
      toast.error('Failed to load products');
      setLoading(false);
      return;
    }
    if (data) {
      const mapped = data.map((d: any) => ({
        ...d,
        bank_name: d.banks?.bank_name ?? 'Unknown',
        status: d.status ?? (d.active ? 'active' : 'retired'),
      })) as Product[];
      mapped.sort((a, b) => {
        const cmp = a.bank_name.localeCompare(b.bank_name);
        if (cmp !== 0) return cmp;
        return (a.segment ?? '').localeCompare(b.segment ?? '');
      });
      setProducts(mapped);
    }
    setLoading(false);
  }, []);

  const fetchBanks = useCallback(async () => {
    const { data } = await supabase.from('banks').select('id, bank_name').order('bank_name');
    if (data) setBanks(data as any);
  }, []);

  useEffect(() => { fetchProducts(); fetchBanks(); }, [fetchProducts, fetchBanks]);

  const filtered = useMemo(() => {
    return products.filter(p => {
      if (filterBank !== 'all' && p.bank_id !== filterBank) return false;
      if (filterSegment !== 'all' && p.segment !== filterSegment) return false;
      if (filterStatus !== 'all' && p.status !== filterStatus) return false;
      return true;
    });
  }, [products, filterBank, filterSegment, filterStatus]);

  const groups = useMemo((): BankGroup[] => {
    const map = new Map<string, BankGroup>();
    filtered.forEach(p => {
      if (!map.has(p.bank_id)) {
        map.set(p.bank_id, { bank_name: p.bank_name, bank_id: p.bank_id, products: [], activeCount: 0, draftCount: 0, retiredCount: 0 });
      }
      const g = map.get(p.bank_id)!;
      g.products.push(p);
      if (p.status === 'active') g.activeCount++;
      else if (p.status === 'draft') g.draftCount++;
      else g.retiredCount++;
    });
    return Array.from(map.values()).sort((a, b) => a.bank_name.localeCompare(b.bank_name));
  }, [filtered]);

  const toggleGroup = (bankId: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      next.has(bankId) ? next.delete(bankId) : next.add(bankId);
      return next;
    });
  };

  const toggleRetired = (bankId: string) => {
    setShowRetired(prev => {
      const next = new Set(prev);
      next.has(bankId) ? next.delete(bankId) : next.add(bankId);
      return next;
    });
  };

  const startEdit = (p: Product) => {
    setEditingId(p.id);
    setEditForm({
      rate: p.rate,
      follow_on_margin: p.follow_on_margin,
      eibor_benchmark: p.eibor_benchmark,
      stress_rate: p.stress_rate,
      life_ins_monthly_percent: p.life_ins_monthly_percent,
      prop_ins_annual_percent: p.prop_ins_annual_percent,
      valuation_fee: p.valuation_fee,
      processing_fee: p.processing_fee,
      early_settlement_fee: p.early_settlement_fee,
      partial_settlement: p.partial_settlement,
      key_points: p.key_points,
      status: p.status,
    });
  };

  const handleEditSave = async (product: Product) => {
    setSavingId(product.id);
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    const updatePayload: Record<string, unknown> = {};

    const fields = ['rate', 'follow_on_margin', 'eibor_benchmark', 'stress_rate',
      'life_ins_monthly_percent', 'prop_ins_annual_percent', 'valuation_fee',
      'processing_fee', 'early_settlement_fee', 'partial_settlement', 'key_points', 'status'] as const;

    for (const key of fields) {
      const oldVal = (product as any)[key];
      let newVal: unknown = editForm[key];
      if (['rate', 'follow_on_margin', 'stress_rate', 'life_ins_monthly_percent',
        'prop_ins_annual_percent', 'valuation_fee', 'processing_fee'].includes(key)) {
        newVal = newVal != null && newVal !== '' ? parseFloat(String(newVal)) : null;
      }
      if (newVal !== oldVal) {
        changes[key] = { old: oldVal, new: newVal };
        updatePayload[key] = newVal;
      }
    }

    if (Object.keys(changes).length === 0) {
      toast.info('No changes to save');
      setSavingId(null);
      return;
    }

    if (updatePayload.status) {
      updatePayload.active = updatePayload.status === 'active';
    }

    const { error } = await supabase.from('products').update(updatePayload).eq('id', product.id);
    if (error) { toast.error('Failed to update product'); console.error(error); setSavingId(null); return; }

    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('version_log').insert({
      table_name: 'products', record_id: product.id, action: 'update',
      changed_by: user?.id, details: changes,
    } as any);

    toast.success('Product updated');
    setEditingId(null);
    setSavingId(null);
    await fetchProducts();
  };

  const handleRetire = async (product: Product) => {
    const today = new Date().toISOString().split('T')[0];
    const { error } = await supabase.from('products')
      .update({ status: 'retired', active: false, validity_end: today })
      .eq('id', product.id);
    if (error) { toast.error('Failed to retire product'); return; }

    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('version_log').insert({
      table_name: 'products', record_id: product.id, action: 'retire',
      changed_by: user?.id, details: { status: { old: product.status, new: 'retired' }, validity_end: { old: null, new: today } },
    } as any);

    toast.success('Product retired');
    await fetchProducts();
  };

  const handleClone = async (product: Product) => {
    const { id, bank_name, ...rest } = product;
    const clonePayload: any = {
      ...rest,
      status: 'draft',
      active: false,
      validity_end: null,
    };
    delete clonePayload.banks;
    delete clonePayload.created_at;

    const { data, error } = await supabase.from('products').insert(clonePayload).select('id').single();
    if (error) { toast.error('Failed to clone product'); console.error(error); return; }

    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('version_log').insert({
      table_name: 'products', record_id: data.id, action: 'clone',
      changed_by: user?.id, details: { cloned_from: id },
    } as any);

    toast.success('Product cloned as draft — edit and activate when ready');
    await fetchProducts();
  };

  const handleActivate = async (product: Product) => {
    // Check for duplicate active product
    const { data: existing } = await supabase.from('products')
      .select('id')
      .eq('bank_id', product.bank_id)
      .eq('segment', product.segment ?? '')
      .eq('residency', product.residency ?? '')
      .eq('fixed_period', product.fixed_period ?? '')
      .eq('salary_transfer', product.salary_transfer)
      .eq('status', 'active')
      .neq('id', product.id);

    if (existing && existing.length > 0) {
      toast.error('An active product already exists for this combination — retire it first');
      return;
    }

    const { error } = await supabase.from('products')
      .update({ status: 'active', active: true })
      .eq('id', product.id);
    if (error) { toast.error('Failed to activate product'); return; }

    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('version_log').insert({
      table_name: 'products', record_id: product.id, action: 'activate',
      changed_by: user?.id, details: { status: { old: 'draft', new: 'active' } },
    } as any);

    toast.success('Product activated');
    await fetchProducts();
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
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
                  {SEGMENTS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[140px]">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground ml-auto">{filtered.length} products</p>
          </div>
        </CardContent>
      </Card>

      {/* Grouped table */}
      {loading ? (
        <p className="text-muted-foreground text-sm p-4">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="text-muted-foreground text-sm p-4">No products match filters.</p>
      ) : (
        groups.map(group => {
          const isOpen = openGroups.has(group.bank_id);
          const retiredVisible = showRetired.has(group.bank_id);
          const nonRetired = group.products.filter(p => p.status !== 'retired');
          const retired = group.products.filter(p => p.status === 'retired');

          return (
            <Card key={group.bank_id} className="bg-background overflow-hidden">
              <Collapsible open={isOpen} onOpenChange={() => toggleGroup(group.bank_id)}>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <span className="font-semibold text-sm">{group.bank_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {group.activeCount > 0 && <Badge className="bg-green-600/20 text-green-700 border-green-600/30 hover:bg-green-600/20">{group.activeCount} active</Badge>}
                      {group.draftCount > 0 && <Badge variant="secondary">{group.draftCount} draft</Badge>}
                      {group.retiredCount > 0 && <Badge variant="outline" className="text-muted-foreground">{group.retiredCount} retired</Badge>}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Segment</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Residency</th>
                          <th className="text-center px-3 py-2 font-medium text-muted-foreground text-xs">Fixed Period</th>
                          <th className="text-center px-3 py-2 font-medium text-muted-foreground text-xs">STL</th>
                          <th className="text-center px-3 py-2 font-medium text-muted-foreground text-xs">Rate %</th>
                          <th className="text-center px-3 py-2 font-medium text-muted-foreground text-xs">Follow-on %</th>
                          <th className="text-center px-3 py-2 font-medium text-muted-foreground text-xs">Life Ins</th>
                          <th className="text-center px-3 py-2 font-medium text-muted-foreground text-xs">Prop Ins</th>
                          <th className="text-center px-3 py-2 font-medium text-muted-foreground text-xs">Status</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nonRetired.map((p, i) => (
                          <ProductRow key={p.id} product={p} index={i}
                            editingId={editingId} editForm={editForm} setEditForm={setEditForm}
                            savingId={savingId} onStartEdit={startEdit}
                            onSave={handleEditSave} onCancel={() => setEditingId(null)}
                            onRetire={handleRetire} onClone={handleClone} onActivate={handleActivate} />
                        ))}
                      </tbody>
                    </table>

                    {retired.length > 0 && (
                      <div className="border-t">
                        <button
                          className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
                          onClick={(e) => { e.stopPropagation(); toggleRetired(group.bank_id); }}
                        >
                          {retiredVisible ? '▾ Hide' : '▸ Show'} {retired.length} retired product{retired.length > 1 ? 's' : ''}
                        </button>
                        {retiredVisible && (
                          <table className="w-full text-sm">
                            <tbody>
                              {retired.map((p, i) => (
                                <ProductRow key={p.id} product={p} index={i}
                                  editingId={editingId} editForm={editForm} setEditForm={setEditForm}
                                  savingId={savingId} onStartEdit={startEdit}
                                  onSave={handleEditSave} onCancel={() => setEditingId(null)}
                                  onRetire={handleRetire} onClone={handleClone} onActivate={handleActivate} />
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })
      )}
    </div>
  );
}

/* ─── Product Row ─── */
interface ProductRowProps {
  product: Product;
  index: number;
  editingId: string | null;
  editForm: Record<string, string | number | null>;
  setEditForm: React.Dispatch<React.SetStateAction<Record<string, string | number | null>>>;
  savingId: string | null;
  onStartEdit: (p: Product) => void;
  onSave: (p: Product) => void;
  onCancel: () => void;
  onRetire: (p: Product) => void;
  onClone: (p: Product) => void;
  onActivate: (p: Product) => void;
}

function ProductRow({ product: p, index, editingId, editForm, setEditForm, savingId, onStartEdit, onSave, onCancel, onRetire, onClone, onActivate }: ProductRowProps) {
  const isEditing = editingId === p.id;
  const isRetired = p.status === 'retired';
  const isDraft = p.status === 'draft';

  return (
    <>
      <tr className={cn(
        index % 2 === 0 ? 'bg-background' : 'bg-muted/20',
        isRetired && 'opacity-50'
      )}>
        <td className="px-3 py-2 text-xs capitalize">{p.segment?.replace('_', ' ') ?? '—'}</td>
        <td className="px-3 py-2 text-xs capitalize">{p.residency?.replace('_', ' ') ?? '—'}</td>
        <td className="px-3 py-2 text-xs text-center">{p.fixed_period ?? '—'}</td>
        <td className="px-3 py-2 text-center">
          <Badge variant={p.salary_transfer ? 'default' : 'outline'} className="text-[10px] px-1.5">
            {p.salary_transfer ? 'Yes' : 'No'}
          </Badge>
        </td>
        <td className="px-3 py-2 text-center text-xs font-medium">{formatPct(p.rate)}</td>
        <td className="px-3 py-2 text-center text-xs">{formatPct(p.follow_on_margin)}</td>
        <td className="px-3 py-2 text-center text-xs">{formatPct(p.life_ins_monthly_percent)}</td>
        <td className="px-3 py-2 text-center text-xs">{formatPct(p.prop_ins_annual_percent)}</td>
        <td className="px-3 py-2 text-center"><StatusBadge status={p.status} /></td>
        <td className="px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => onStartEdit(p)}>
              <Edit2 className="h-3 w-3" /> Edit
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => onClone(p)}>
              <Copy className="h-3 w-3" /> Clone
            </Button>
            {isDraft && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-green-700" onClick={() => onActivate(p)}>
                <Zap className="h-3 w-3" /> Activate
              </Button>
            )}
            {p.status === 'active' && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-destructive">
                    <Archive className="h-3 w-3" /> Retire
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Retire this product?</AlertDialogTitle>
                    <AlertDialogDescription>
                      It will no longer appear in qualification results. This action can be undone by cloning and activating a new version.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onRetire(p)}>Retire</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </td>
      </tr>
      {isEditing && (
        <tr>
          <td colSpan={10} className="p-0">
            <div className="bg-muted/30 border-y px-4 py-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                <EditField label="Rate %" field="rate" form={editForm} setForm={setEditForm} type="number" step="0.01" />
                <EditField label="Follow-on Margin %" field="follow_on_margin" form={editForm} setForm={setEditForm} type="number" step="0.01" />
                <EditField label="EIBOR Benchmark" field="eibor_benchmark" form={editForm} setForm={setEditForm} />
                <EditField label="Stress Rate" field="stress_rate" form={editForm} setForm={setEditForm} type="number" step="0.01" />
                <EditField label="Life Ins Monthly %" field="life_ins_monthly_percent" form={editForm} setForm={setEditForm} type="number" step="0.001" />
                <EditField label="Prop Ins Annual %" field="prop_ins_annual_percent" form={editForm} setForm={setEditForm} type="number" step="0.01" />
                <EditField label="Valuation Fee" field="valuation_fee" form={editForm} setForm={setEditForm} type="number" />
                <EditField label="Processing Fee" field="processing_fee" form={editForm} setForm={setEditForm} type="number" step="0.01" />
                <EditField label="Early Settlement" field="early_settlement_fee" form={editForm} setForm={setEditForm} />
                <EditField label="Partial Settlement" field="partial_settlement" form={editForm} setForm={setEditForm} />
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">Key Points</Label>
                  <Textarea className="text-sm h-16 mt-1" value={String(editForm.key_points ?? '')}
                    onChange={e => setEditForm(prev => ({ ...prev, key_points: e.target.value || null }))} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select value={String(editForm.status ?? 'active')}
                    onValueChange={v => setEditForm(prev => ({ ...prev, status: v }))}>
                    <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Button size="sm" className="gap-1" disabled={savingId === p.id} onClick={() => onSave(p)}>
                  <Save className="h-3.5 w-3.5" /> {savingId === p.id ? 'Saving…' : 'Save'}
                </Button>
                <Button size="sm" variant="ghost" className="gap-1" onClick={onCancel}>
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ─── Edit Field Helper ─── */
function EditField({ label, field, form, setForm, type = 'text', step }: {
  label: string; field: string;
  form: Record<string, string | number | null>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string | number | null>>>;
  type?: string; step?: string;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type={type} step={step} className="h-8 text-sm mt-1"
        value={form[field] ?? ''}
        onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value || null }))} />
    </div>
  );
}
