import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, MessageSquare, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { parsePolicyFitIntent } from '@/lib/policies/policyFitIntentParser';

interface ChatMessage {
  id: string;
  role: 'system' | 'adviser';
  content: string;
}

interface WhatIfChatProps {
  initialAnalysis: string;
  /**
   * Live case context for the AI. When provided, the chat uses the
   * Maverick AI edge function with policy_search_view retrieval.
   * When omitted, the chat falls back to a passive informational mode.
   */
  caseContext?: any;
  /** Available bank names for policy retrieval scoping. */
  availableBanks?: string[];
  /** Case facts used to scope policy_search_view queries. */
  caseFacts?: any;
}

const POLICY_CATEGORIES = [
  'eligibility', 'income_liability', 'transaction',
  'property', 'document', 'tat_validity', 'fee', 'note',
];

function safeLower(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}
function normSegmentForPolicy(s?: unknown): string | undefined {
  const v = safeLower(s);
  if (!v) return undefined;
  if (v.includes('non')) return 'Non-Resident';
  if (v.includes('resident') || v.includes('salaried') || v.includes('self')) return 'Resident';
  return undefined;
}
function normEmploymentForPolicy(s?: unknown): string | undefined {
  const v = safeLower(s);
  if (!v) return undefined;
  if (v.includes('self')) return 'Self Employed';
  if (v.includes('salar')) return 'Salaried';
  if (v.includes('mixed')) return 'Mixed';
  return undefined;
}
function scorePolicyRow(row: any, message: string, focusAreas: string[]): number {
  let score = 0;
  const r = row ?? {};
  const text = safeLower(`${r.canonical_attribute ?? ''} ${r.raw_attribute ?? ''} ${r.attribute_description ?? ''} ${r.value ?? ''}`);
  const m = safeLower(message);
  const focus = Array.isArray(focusAreas) ? focusAreas : [];
  for (const f of focus) if (text.includes(safeLower(f))) score += 4;
  for (const w of m.split(/\s+/)) {
    if (w.length < 4) continue;
    if (text.includes(w)) score += 1;
  }
  if (r.value_status === 'confirmed') score += 1;
  if (r.value_status === 'unclear') score -= 1;
  return score;
}
async function retrievePolicyContext(
  message: string,
  caseFacts: any,
  availableBanks: string[],
): Promise<{ rows: any[]; summary: string }> {
  try {
    const safeMessage = typeof message === 'string' ? message : '';
    const safeBanks = Array.isArray(availableBanks) ? availableBanks : [];
    const safeFacts = caseFacts ?? {};
    const parsed = parsePolicyFitIntent(safeMessage, safeBanks);
    const segment = normSegmentForPolicy(safeFacts.segment);
    const employment = normEmploymentForPolicy(safeFacts.employmentType);

    let q: any = (supabase as any)
      .from('policy_search_view')
      .select('*')
      .in('policy_category', POLICY_CATEGORIES)
      .limit(800);
    if (parsed.selectedBanks.length > 0) q = q.in('bank', parsed.selectedBanks);
    if (segment) q = q.or(`segment.eq.${segment},segment.is.null`);
    if (employment) q = q.or(`employment_type.eq.${employment},employment_type.eq.Mixed,employment_type.is.null`);
    let { data } = await q;
    if (!data || data.length === 0) {
      let q2: any = (supabase as any)
        .from('policy_search_view')
        .select('*')
        .in('policy_category', POLICY_CATEGORIES)
        .limit(800);
      if (parsed.selectedBanks.length > 0) q2 = q2.in('bank', parsed.selectedBanks);
      const r2 = await q2;
      data = r2.data ?? [];
    }
    const rows = (data ?? []) as any[];
    const ranked = rows
      .map(r => ({ r, s: scorePolicyRow(r, safeMessage, parsed.focusAreas) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 60)
      .map(x => ({
        bank: x.r.bank,
        segment: x.r.segment,
        employment_type: x.r.employment_type,
        product_variant: x.r.product_variant,
        category: x.r.policy_category,
        attribute: x.r.canonical_attribute ?? x.r.raw_attribute,
        value: x.r.value,
        normalized_value: x.r.normalized_value,
        value_status: x.r.value_status,
        data_status: x.r.data_status,
        description: x.r.attribute_description,
      }));
    const banksInContext = Array.from(new Set(ranked.map(r => r.bank))).slice(0, 20);
    const summary = `Retrieved ${ranked.length} relevant policy rows across ${banksInContext.length} banks${
      parsed.focusAreas.length ? ` (focus: ${parsed.focusAreas.join(', ')})` : ''
    }.`;
    return { rows: ranked, summary };
  } catch (e) {
    console.warn('Policy retrieval failed:', e);
    return { rows: [], summary: 'No policy context retrieved.' };
  }
}

const FORBIDDEN_AI_PATTERNS: RegExp[] = [
  /\bcentral bank\b/i,
  /\buae central bank\b/i,
  /\buae regulation/i,
  /\ball major banks\b/i,
  /\bguaranteed\b/i,
  /\bqualifies across all banks\b/i,
  /\bpublic guidelines\b/i,
];
function guardAiAnswer(text: string, hasPolicyContext: boolean, hasBankResults: boolean): string {
  if (typeof text !== 'string') return 'No response.';
  if (FORBIDDEN_AI_PATTERNS.some(re => re.test(text))) {
    return "⚠️ This answer attempted to use information outside Maverick's data boundary. Please rerun with more specific case or policy context.";
  }
  if (!hasBankResults && /\b(approved|all banks eligible)\b/i.test(text)) {
    return "⚠️ This answer claimed approval without deterministic Maverick bank results.";
  }
  return text;
}

export default function WhatIfChat({ initialAnalysis, caseContext, availableBanks, caseFacts }: WhatIfChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const adviserMsg: ChatMessage = { id: Date.now().toString(), role: 'adviser', content: text };
    setMessages(prev => [...prev, adviserMsg]);
    setInput('');
    setLoading(true);
    try {
      const policy = await retrievePolicyContext(text, caseFacts, availableBanks ?? []);
      const ctx = {
        ...(caseContext ?? {}),
        whatIfAnalysis: caseContext?.whatIfAnalysis ?? initialAnalysis,
        caseFacts: caseFacts ?? caseContext?.caseFacts ?? null,
        policyContext: policy.rows,
        policyContextSummary: policy.summary,
      };
      const { data, error } = await supabase.functions.invoke('maverick-ai', {
        body: { mode: 'qualification_adviser_chat', payload: { message: text, caseContext: ctx } },
      });
      if (error) throw error;
      const raw: string = data?.answer ?? 'No response.';
      const hasBankResults = Array.isArray(caseContext?.qualificationResults?.bankResults)
        && caseContext.qualificationResults.bankResults.length > 0;
      const safe = guardAiAnswer(raw, policy.rows.length > 0, hasBankResults);
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'system', content: safe }]);
    } catch (e: any) {
      console.error('WhatIfChat AI error:', e);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'system',
        content: '⚠️ Could not reach Maverick AI. Please try again, or check the Maverick policy database connection.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full border rounded-lg bg-background overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-primary text-primary-foreground">
        <MessageSquare className="h-4 w-4" />
        <span className="font-semibold text-sm">What-If Analysis</span>
      </div>

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-3">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              Ask anything about this case — DBR, eligibility, policy, what-ifs.
            </p>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={cn('flex', msg.role === 'adviser' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-line',
                  msg.role === 'adviser'
                    ? 'bg-[#1B2A4A] text-white rounded-br-md'
                    : 'bg-[#E8E4DC] text-foreground rounded-bl-md'
                )}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-[#E8E4DC] text-foreground rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="flex items-center gap-2 p-3 border-t">
        <Input
          placeholder="Ask a what-if or policy question…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          className="flex-1"
          disabled={loading}
        />
        <Button size="icon" onClick={handleSend} disabled={!input.trim() || loading}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
