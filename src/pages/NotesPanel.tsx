import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, X, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotesPanelProps {
  onExtract: (notes: string) => Promise<void>;
  extracting: boolean;
}

export default function NotesPanel({ onExtract, extracting }: NotesPanelProps) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [minimised, setMinimised] = useState(false);

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
      </Button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[420px] shadow-xl">
      <Card className="border-2 border-primary/20">
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold text-primary flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Client notes
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost" size="sm" className="h-7 w-7 p-0"
              onClick={() => setMinimised(!minimised)}
            >
              {minimised
                ? <ChevronUp className="h-3.5 w-3.5" />
                : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost" size="sm" className="h-7 w-7 p-0"
              onClick={() => setOpen(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>

        {!minimised && (
          <CardContent className="px-4 pb-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Type or paste notes from your client conversation. Include anything — salary, liabilities, property details, nationality. The AI will extract what it finds.
            </p>
            <Textarea
              className="text-xs min-h-[160px] resize-none"
              placeholder={`e.g. "Client is Indian national, works at Emirates NBD, basic salary 28k, housing allowance 8k, has a personal loan EMI of 4500/month and one credit card limit 50k. Looking at a 2.2M apartment in Dubai Marina, wants 80% LTV, resale..."`}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
            <Button
              className="w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={!notes.trim() || extracting}
              onClick={() => onExtract(notes)}
            >
              <Sparkles className="h-4 w-4" />
              {extracting ? 'Extracting…' : 'Extract to form'}
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
