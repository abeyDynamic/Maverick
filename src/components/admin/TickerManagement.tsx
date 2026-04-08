import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { Save, Trash2, Pin } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface TickerUpdate {
  id: string;
  content: string;
  category: string;
  active: boolean;
  pinned: boolean;
  created_at: string;
}

const CATEGORIES = [
  { value: 'policy', label: 'Policy ⚡', color: 'text-yellow-400' },
  { value: 'rate', label: 'Rate 📈', color: 'text-green-400' },
  { value: 'general', label: 'General ℹ️', color: 'text-white' },
];

export default function TickerManagement() {
  const [updates, setUpdates] = useState<TickerUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('policy');
  const [newPinned, setNewPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchUpdates = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('ticker_updates')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (data) setUpdates(data as TickerUpdate[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUpdates();
    const channel = supabase
      .channel('admin-ticker')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticker_updates' }, () => fetchUpdates())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchUpdates]);

  const handleAdd = async () => {
    if (!newContent.trim()) { toast.error('Enter update content'); return; }
    setSaving(true);
    const { error } = await supabase
      .from('ticker_updates')
      .insert({ content: newContent.trim(), category: newCategory, pinned: newPinned });
    if (error) { toast.error('Failed to add update'); console.error(error); }
    else { toast.success('Ticker update added'); setNewContent(''); setNewPinned(false); }
    setSaving(false);
  };

  const toggleField = async (id: string, field: 'active' | 'pinned', value: boolean) => {
    const { error } = await supabase
      .from('ticker_updates')
      .update({ [field]: value })
      .eq('id', id);
    if (error) toast.error(`Failed to update ${field}`);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('ticker_updates').delete().eq('id', id);
    if (error) toast.error('Failed to delete');
    else toast.success('Deleted');
  };

  return (
    <div className="space-y-4">
      <Card className="bg-background">
        <CardHeader>
          <CardTitle className="text-base">Add New Ticker Update</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[250px]">
              <Label className="text-xs">Content</Label>
              <Input
                placeholder="e.g. FAB: Max LTV reduced to 75% — effective April 2026"
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
              />
            </div>
            <div className="w-[140px]">
              <Label className="text-xs">Category</Label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Pin</Label>
              <Switch checked={newPinned} onCheckedChange={setNewPinned} />
            </div>
            <Button onClick={handleAdd} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-background">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">All Ticker Updates ({updates.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-4 text-muted-foreground text-sm">Loading…</p>
          ) : updates.length === 0 ? (
            <p className="p-4 text-muted-foreground text-sm">No ticker updates yet.</p>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Content</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground w-20">Category</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground w-16">Active</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground w-16">Pinned</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground w-24">Created</th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {updates.map((u, i) => (
                    <tr key={u.id} className={cn(i % 2 === 0 ? 'bg-background' : 'bg-muted/30')}>
                      <td className="px-3 py-2 max-w-[400px] truncate">{u.content}</td>
                      <td className="px-3 py-2 text-center text-xs">
                        {CATEGORIES.find(c => c.value === u.category)?.label || u.category}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Switch checked={u.active} onCheckedChange={v => toggleField(u.id, 'active', v)} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Switch checked={u.pinned} onCheckedChange={v => toggleField(u.id, 'pinned', v)} />
                      </td>
                      <td className="px-3 py-2 text-center text-xs text-muted-foreground">
                        {format(parseISO(u.created_at), 'dd/MM/yy')}
                      </td>
                      <td className="px-3 py-2">
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(u.id)} className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
