import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, X, Sparkles, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ClientNote {
  id: string;
  note_text: string;
  created_at: string;
  session_label: string | null;
}

interface NotesPanelProps {
  applicantId?: string;
  onExtract: (notes: string) => Promise<void>;
  extracting: boolean;
}

export default function NotesPanel({ applicantId, onExtract, extracting }: NotesPanelProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [minimised, setMinimised] = useState(false);
  const [tab, setTab] = useState<'write' | 'history'>('write');
  const [draft, setDraft] = useState('');
  const [sessionLabel, setSessionLabel] = useState('');
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!open || !applicantId) return;
    loadHistory();
  }, [open, applicantId]);

  async function loadHistory() {
    if (!applicantId) return;
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from('client_notes' as any)
      .select('id, note_text, created_at, session_label')
      .eq('applicant_id', applicantId)
      .order('created_at', { ascending: false });
    if (!error) setNotes((data ?? []) as ClientNote[]);
    setLoadingHistory(false);
  }

  async function saveNote(text: string): Promise<void> {
    if (!user || !applicantId || !text.trim()) return;
    const { error } = await supabase.from('client_notes' as any).insert({
      applicant_id: applicantId,
      note_text: text.trim(),
      created_by: user.id,
      session_label: sessionLabel.trim() || null,
    });
    if (error) { toast.error('Note could not be saved'); return; }
    toast.success('Note saved');
    setDraft('');
    setSessionLabel('');
    loadHistory();
  }

  async function handleExtract() {
    if (!draft.trim()) return;
    await saveNote(draft);
    await onExtract(draft);
  }

  async function deleteNote(id: string) {
    await supabase.from('client_notes' as any).delete().eq('id', id);
    setNotes(prev => prev.filter(n => n.id !== id));
    toast.success('Note deleted');
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="fixed bottom-6 right-6 z-50 shadow-lg gap-2 bg-background"
        onClick={() => setOpen(true)}
      >
        <MessageSquare className="h-4 w-4" />
        Client notes
        {notes.length > 0 && (
          <Badge className="h-4 px-1.5 text-[10px] bg-accent text-accent-foreground">
            {notes.length}
          </Badge>
        )}
      </Button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[440px] shadow-xl">
      <Card className="border-2 border-primary/20">
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0 border-b">
          <CardTitle className="text-sm font-semibold text-primary flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Client notes
            {notes.length > 0 && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                {notes.length} saved
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
              onClick={() => setMinimised(!minimised)}>
              {minimised ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
              onClick={() => setOpen(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>

        {!minimised && (
          <CardContent className="px-4 pb-4 pt-3 space-y-3">
            <div className="flex gap-1">
              {(['write', 'history'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'
                  }`}>
                  {t === 'write' ? 'Write note' : `History (${notes.length})`}
                </button>
              ))}
            </div>

            {tab === 'write' && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Type or paste notes from your client conversation. The AI will extract relevant fields into the qualification form.
                </p>
                <input
                  className="w-full text-xs border border-input rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Session label (optional) — e.g. Initial call, Follow-up 1"
                  value={sessionLabel}
                  onChange={e => setSessionLabel(e.target.value)}
                />
                <Textarea
                  className="text-xs min-h-[160px] resize-none"
                  placeholder={`e.g. "Client is Indian national, works at Emirates NBD, basic salary 28k, housing allowance 8k, has a personal loan EMI 4,500/month and credit card limit 50k. Looking at a 2.2M apartment in Dubai Marina, resale, wants 80% LTV..."`}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                />
                {!applicantId && draft.trim() && (
                  <p className="text-[10px] text-amber-600">
                    Note will be saved after the qualification is first saved.
                  </p>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs"
                    disabled={!draft.trim() || !applicantId}
                    onClick={() => saveNote(draft)}>
                    Save note only
                  </Button>
                  <Button size="sm"
                    className="flex-1 gap-1.5 text-xs bg-accent text-accent-foreground hover:bg-accent/90"
                    disabled={!draft.trim() || extracting}
                    onClick={handleExtract}>
                    <Sparkles className="h-3.5 w-3.5" />
                    {extracting ? 'Extracting…' : 'Save & extract to form'}
                  </Button>
                </div>
              </div>
            )}

            {tab === 'history' && (
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {loadingHistory && (
                  <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>
                )}
                {!loadingHistory && notes.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No notes saved yet for this client.
                  </p>
                )}
                {notes.map(note => (
                  <div key={note.id} className="border border-border rounded-lg p-3 space-y-1.5 bg-secondary/40">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {format(new Date(note.created_at), 'dd MMM yyyy, HH:mm')}
                      </div>
                      <div className="flex items-center gap-1">
                        {note.session_label && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                            {note.session_label}
                          </Badge>
                        )}
                        <Button variant="ghost" size="sm"
                          className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteNote(note.id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                      {note.note_text}
                    </p>
                    <Button variant="ghost" size="sm"
                      className="h-6 text-[10px] px-2 text-accent hover:text-accent"
                      disabled={extracting}
                      onClick={() => { setDraft(note.note_text); setTab('write'); }}>
                      <Sparkles className="h-3 w-3 mr-1" />
                      Re-extract this note
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
