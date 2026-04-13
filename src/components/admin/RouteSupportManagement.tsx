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
import { Plus, Save, Edit2 } from 'lucide-react';

const SEGMENT_PATHS = ['resident', 'non_resident'];
const ROUTE_TYPES = ['dbr', 'dab', 'both', 'manual'];

interface RouteSupport {
  id: string;
  bank_id: string;
  bank_name?: string;
  segment_path: string;
  route_type: string;
  supported: boolean;
  notes: string | null;
}

export default function RouteSupportManagement() {
  const [routes, setRoutes] = useState<RouteSupport[]>([]);
  const [banks, setBanks] = useState<{ id: string; bank_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterBank, setFilterBank] = useState('all');
  const [filterSegment, setFilterSegment] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingRoute, setEditingRoute] = useState<RouteSupport | null>(null);
  const [form, setForm] = useState({ bank_id: '', segment_path: 'resident_salaried', route_type: 'standard', supported: true, notes: '' });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [routeRes, banksRes] = await Promise.all([
      supabase.from('bank_route_support').select('*, banks!inner(bank_name)').order('bank_id').order('segment_path').order('route_type') as any,
      supabase.from('banks').select('id, bank_name').order('bank_name'),
    ]);
    if (routeRes.data) setRoutes(routeRes.data.map((r: any) => ({ ...r, bank_name: r.banks?.bank_name ?? 'Unknown' })));
    if (banksRes.data) setBanks(banksRes.data as any);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => routes.filter(r => {
    if (filterBank !== 'all' && r.bank_id !== filterBank) return false;
    if (filterSegment !== 'all' && r.segment_path !== filterSegment) return false;
    return true;
  }), [routes, filterBank, filterSegment]);

  async function toggleSupported(route: RouteSupport) {
    const newVal = !route.supported;
    await supabase.from('bank_route_support').update({ supported: newVal }).eq('id', route.id);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('version_log').insert({ table_name: 'bank_route_support', record_id: route.id, action: 'update', changed_by: user?.id, details: { supported: { old: route.supported, new: newVal } } } as any);
    toast.success(`Route ${newVal ? 'enabled' : 'disabled'}`);
    fetchData();
  }

  function openNew() {
    setEditingRoute(null);
    setForm({ bank_id: banks[0]?.id ?? '', segment_path: 'resident_salaried', route_type: 'standard', supported: true, notes: '' });
    setShowModal(true);
  }

  function openEdit(route: RouteSupport) {
    setEditingRoute(route);
    setForm({ bank_id: route.bank_id, segment_path: route.segment_path, route_type: route.route_type, supported: route.supported, notes: route.notes ?? '' });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.bank_id) { toast.error('Select a bank'); return; }
    setSaving(true);
    const payload: any = { bank_id: form.bank_id, segment_path: form.segment_path, route_type: form.route_type, supported: form.supported, notes: form.notes || null };
    const { data: { user } } = await supabase.auth.getUser();
    let recordId: string;

    if (editingRoute) {
      const { error } = await supabase.from('bank_route_support').update(payload).eq('id', editingRoute.id);
      if (error) { toast.error('Failed to update'); setSaving(false); return; }
      recordId = editingRoute.id;
    } else {
      const { data, error } = await supabase.from('bank_route_support').insert(payload).select('id').single();
      if (error || !data) { toast.error('Failed to create'); setSaving(false); return; }
      recordId = data.id;
    }

    await supabase.from('version_log').insert({ table_name: 'bank_route_support', record_id: recordId, action: editingRoute ? 'update' : 'create', changed_by: user?.id, details: payload } as any);
    toast.success(editingRoute ? 'Route updated' : 'Route created');
    setSaving(false);
    setShowModal(false);
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
                <SelectContent><SelectItem value="all">All</SelectItem>{SEGMENT_PATHS.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button size="sm" className="gap-1 ml-auto" onClick={openNew}><Plus className="h-4 w-4" /> Add Route</Button>
            <span className="text-xs text-muted-foreground">{filtered.length} routes</span>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-background">
        <CardContent className="p-0">
          {loading ? <p className="p-4 text-muted-foreground text-sm">Loading…</p> : filtered.length === 0 ? <p className="p-4 text-muted-foreground text-sm">No routes found.</p> : (
            <ScrollArea className="w-full">
              <div className="min-w-[700px]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Bank</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Segment Path</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Route Type</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Supported</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Notes</th>
                      <th className="w-[60px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, i) => (
                      <tr key={r.id} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                        <td className="px-3 py-2 font-medium">{r.bank_name}</td>
                        <td className="px-3 py-2 text-xs">{r.segment_path.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2 text-xs">{r.route_type.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2 text-center">
                          <Switch checked={r.supported} onCheckedChange={() => toggleSupported(r)} />
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate">{r.notes || '—'}</td>
                        <td className="px-3 py-2"><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button></td>
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
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader><DialogTitle>{editingRoute ? 'Edit Route' : 'New Route Support'}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label className="text-xs">Bank *</Label>
              <Select value={form.bank_id} onValueChange={v => setForm(p => ({ ...p, bank_id: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{banks.map(b => <SelectItem key={b.id} value={b.id}>{b.bank_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Segment Path *</Label>
              <Select value={form.segment_path} onValueChange={v => setForm(p => ({ ...p, segment_path: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{SEGMENT_PATHS.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Route Type *</Label>
              <Select value={form.route_type} onValueChange={v => setForm(p => ({ ...p, route_type: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{ROUTE_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-xs">Supported</Label>
              <Switch checked={form.supported} onCheckedChange={v => setForm(p => ({ ...p, supported: v }))} />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Input className="h-8 text-sm" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes" />
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
