import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Send, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { usePolicyFitChat } from '@/hooks/usePolicyFitChat';
import type { BankPolicyFitResult, PolicyFitCaseFacts, PolicyFitReport } from '@/lib/policies/policyFitTypes';
import { cn } from '@/lib/utils';

interface Props {
  caseFacts: PolicyFitCaseFacts;
  availableBanks?: string[];
}

const SUGGESTED_PROMPTS = [
  'Run fit report for all banks',
  'Compare ENBD, Mashreq and HSBC',
  'Which bank can consider the highest income?',
  'Which bank gives strongest eligibility?',
  'Which banks need manual review?',
  'What if audit is not available?',
  'Which banks support buyout?',
  'Which banks consider rental income?',
  'Which banks are blocked by LOB?',
];

interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
  report?: PolicyFitReport;
}

export default function PolicyFitChatPanel({ caseFacts, availableBanks = [] }: Props) {
  const { runPolicyFitChat, loading } = usePolicyFitChat({ caseFacts, availableBanks });
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    try {
      const { report, aiSummary } = await runPolicyFitChat(q);
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: aiSummary ?? buildLocalSummary(report),
        report,
      }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', text: `⚠️ Policy fit failed: ${e?.message ?? 'unknown error'}` }]);
    }
  }

  return (
    <div className="space-y-2 flex flex-col min-h-0">
      {/* Suggested prompt chips */}
      {messages.length === 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">Ask a Policy Fit question:</p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_PROMPTS.map(p => (
              <button
                key={p}
                onClick={() => send(p)}
                disabled={loading}
                className="text-[10px] px-2 py-1 rounded-md border border-border hover:bg-secondary transition-colors text-foreground"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
        {messages.map((m, i) => (
          <div key={i}>
            <div className={cn(
              'rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap',
              m.role === 'user' ? 'bg-primary text-primary-foreground ml-8' : 'bg-secondary text-foreground mr-8',
            )}>
              {m.text}
            </div>
            {m.report && <ReportView report={m.report} />}
          </div>
        ))}
        {loading && <div className="bg-secondary rounded-lg px-3 py-2 text-xs text-muted-foreground mr-8 animate-pulse">Reviewing policies…</div>}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 pt-1">
        <input
          className="flex-1 text-xs border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Ask a Policy Fit question…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          disabled={loading}
        />
        <Button size="sm" className="px-3" disabled={!input.trim() || loading} onClick={() => send()}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">Deterministic engine — AI only explains, never overrides fit status.</p>
    </div>
  );
}

// ── Report rendering ─────────────────────────────────────────────────────

function buildLocalSummary(r: PolicyFitReport): string {
  const o = r.overallSummary;
  const lines = [
    `Reviewed ${o.banksReviewed} bank${o.banksReviewed === 1 ? '' : 's'}: ${o.fit} fit · ${o.conditionalFit} conditional · ${o.notFit} not fit · ${o.needsInput} need input · ${o.manualReview} manual review.`,
  ];
  const top = r.rankings.highestEligibility[0];
  if (top) lines.push(`Strongest eligibility: ${top.bank} (score ${top.eligibilityScore}).`);
  const inc = r.rankings.highestIncomeRecognition[0];
  if (inc && inc.bank !== top?.bank) lines.push(`Highest income recognition: ${inc.bank} (score ${inc.incomeRecognitionScore}).`);
  return lines.join(' ');
}

function ReportView({ report }: { report: PolicyFitReport }) {
  return (
    <div className="mt-2 space-y-2">
      <RankingsBlock report={report} />
      <div className="space-y-2">
        {report.bankReports.map((b, i) => <BankCard key={`${b.bank}-${b.productVariant ?? ''}-${i}`} b={b} />)}
      </div>
    </div>
  );
}

function RankingsBlock({ report }: { report: PolicyFitReport }) {
  const groups: Array<{ title: string; items: BankPolicyFitResult[]; metric: (b: BankPolicyFitResult) => string | number }> = [
    { title: 'Highest income recognition', items: report.rankings.highestIncomeRecognition.slice(0, 5), metric: b => b.incomeRecognitionScore },
    { title: 'Strongest eligibility', items: report.rankings.highestEligibility.slice(0, 5), metric: b => b.eligibilityScore },
    { title: 'Highest LTV', items: report.rankings.highestLtv.slice(0, 5), metric: b => b.ltvScore ? `${b.ltvScore}%` : '—' },
    { title: 'Lowest manual review risk', items: report.rankings.lowestManualReviewRisk.slice(0, 5), metric: b => b.manualReviewRiskScore },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {groups.map(g => (
        <div key={g.title} className="border border-border rounded-md p-2 bg-secondary/30">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{g.title}</p>
          {g.items.length === 0 && <p className="text-[10px] text-muted-foreground">—</p>}
          <ol className="text-[11px] space-y-0.5">
            {g.items.map((b, i) => (
              <li key={`${b.bank}-${i}`} className="flex justify-between gap-2">
                <span className="truncate">{i + 1}. {b.bank}</span>
                <span className="text-muted-foreground tabular-nums">{g.metric(b)}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  fit: 'bg-green-100 text-green-800',
  conditional_fit: 'bg-amber-100 text-amber-800',
  not_fit: 'bg-red-100 text-red-800',
  needs_adviser_input: 'bg-blue-100 text-blue-800',
  manual_review: 'bg-orange-100 text-orange-800',
};

function BankCard({ b }: { b: BankPolicyFitResult }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-md bg-background">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-secondary/40 transition-colors"
      >
        <div className="flex flex-col items-start gap-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">{b.bank}</span>
            {b.productVariant && <span className="text-[10px] text-muted-foreground">· {b.productVariant}</span>}
            <Badge className={cn('text-[9px] h-4 px-1.5 capitalize', STATUS_TONE[b.fitStatus] ?? 'bg-muted text-foreground')}>
              {b.fitStatus.replace(/_/g, ' ')}
            </Badge>
          </div>
          <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-2">
            <span>Income {b.incomeRecognitionScore}</span>
            <span>Elig {b.eligibilityScore}</span>
            <span>LTV {b.ltvScore || '—'}{b.ltvScore ? '%' : ''}</span>
            <span>Manual {b.manualReviewRiskScore}</span>
          </div>
        </div>
        {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-[11px]">
          <p className="text-muted-foreground">{b.summary}</p>
          {b.adviserActions.length > 0 && (
            <div>
              <p className="font-semibold text-foreground mb-0.5 flex items-center gap-1"><Sparkles className="h-3 w-3" /> Adviser actions</p>
              <ul className="list-disc pl-4 space-y-0.5">{b.adviserActions.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </div>
          )}
          <Section title="Passed" items={b.passedChecks} tone="text-green-700" />
          <Section title="Failed" items={b.failedChecks} tone="text-red-700" />
          <Section title="Missing inputs" items={b.missingInputs} tone="text-blue-700" />
          <Section title="Manual review" items={b.manualReviewItems} tone="text-orange-700" />
          <Section title="Income recognition" items={b.incomeRecognitionNotes} tone="text-foreground" />
          <Section title="Documents" items={b.documentRequirements} tone="text-muted-foreground" />
          <Section title="Fees & TAT" items={b.feeAndTatNotes} tone="text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

function Section({ title, items, tone }: { title: string; items: any[]; tone: string }) {
  if (!items || items.length === 0) return null;
  return (
    <details className="group">
      <summary className={cn('cursor-pointer font-semibold text-[10px] uppercase tracking-wide', tone)}>
        {title} ({items.length})
      </summary>
      <ul className="mt-1 space-y-1 pl-2 border-l border-border">
        {items.slice(0, 12).map((c, i) => (
          <li key={i} className="text-[11px]">
            <span className="font-medium">{c.canonicalAttribute}</span>
            <span className="text-muted-foreground"> — {c.reason}</span>
            {c.policyValue && <span className="block text-[10px] text-muted-foreground italic">policy: {c.policyValue}</span>}
          </li>
        ))}
        {items.length > 12 && <li className="text-[10px] text-muted-foreground">+ {items.length - 12} more</li>}
      </ul>
    </details>
  );
}
