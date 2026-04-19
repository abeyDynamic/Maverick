import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  MessageSquare, X, Sparkles, ChevronDown, ChevronUp,
  Clock, ExternalLink, Send, Zap,
} from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { COUNTRIES, EMIRATES } from '@/lib/mortgage-utils';
import type { CaseBankResult } from '@/lib/case/stage1-engine';
import type { CaseLiabilityField } from '@/lib/case/types';

export interface ClientNote {
  id: string;
  note_text: string;
  created_at: string;
  session_label: string | null;
}

export interface ExtractionResult {
  client_name: string | null;
  segment: string | null;
  residency: string | null;
  nationality: string | null;
  dob: string | null;
  employment_type: string | null;
  property_value: number | null;
  loan_amount: number | null;
  ltv: number | null;
  emirate: string | null;
  transaction_type: string | null;
  property_type: string | null;
  purpose: string | null;
  salary_transfer: boolean | null;
  income_fields: Array<{ income_type: string; amount: number; percent_considered: number; recurrence: string; }>;
  liability_fields: Array<{ liability_type: string; amount: number; credit_card_limit: number; recurrence: string; closed_before_application: boolean; }>;
  confidence: { personal: number; property: number; income: number; liabilities: number; };
  unclear: string[];
}

export interface WhatIfContext {
  totalIncome: number;
  totalLiabilities: number;
  loanAmount: number;
  stressRate: number;
  tenorMonths: number;
  currentDbr: number;
  eligibleBanks: string[];
  ineligibleBanks: string[];
  whatIfAnalysis: string;
  bankResults: CaseBankResult[];
  liabilityFields: CaseLiabilityField[];
}

interface NotesPanelProps {
  applicantId?: string;
  onExtract: (result: ExtractionResult) => void;
  whatIfContext: WhatIfContext;
}

interface ChatMessage { role: 'user' | 'assistant'; content: string; }

function ruleBasedExtract(notes: string): ExtractionResult {
  const result: ExtractionResult = {
    client_name: null, segment: null, residency: null, nationality: null,
    dob: null, employment_type: null, property_value: null, loan_amount: null,
    ltv: null, emirate: null, transaction_type: null, property_type: null,
    purpose: null, salary_transfer: null, income_fields: [], liability_fields: [],
    confidence: { personal: 0, property: 0, income: 0, liabilities: 0 },
    unclear: [],
  };
  function parseAmount(str: string): number | null {
    const clean = str.replace(/aed|,|\s/gi, '').trim();
    const match = clean.match(/^([\d.]+)(k|m)?$/i);
    if (!match) return null;
    const num = parseFloat(match[1]);
    if (match[2]?.toLowerCase() === 'k') return num * 1000;
    if (match[2]?.toLowerCase() === 'm') return num * 1000000;
    return num;
  }
  const t = notes.toLowerCase();
  for (const country of COUNTRIES) {
    if (t.includes(country.toLowerCase())) { result.nationality = country; result.confidence.personal += 0.4; break; }
  }
  if (t.includes('uae national') || t.includes('emirati')) { result.residency = 'uae_national'; result.segment = 'resident_salaried'; result.confidence.personal += 0.3; }
  else if (t.includes('non-resident') || t.includes('non resident') || t.includes('overseas')) { result.residency = 'non_resident'; result.segment = 'non_resident'; result.confidence.personal += 0.3; }
  else if (t.includes('resident') || t.includes('lives in dubai') || t.includes('lives in uae')) { result.residency = 'resident_expat'; result.segment = 'resident_salaried'; result.confidence.personal += 0.2; }
  if (t.includes('self employed') || t.includes('self-employed') || t.includes('business owner')) { result.employment_type = 'self_employed'; result.segment = 'self_employed'; result.confidence.personal += 0.3; }
  else if (t.includes('salaried') || t.includes('works at') || t.includes('works for') || t.includes('employed')) { result.employment_type = 'salaried'; if (!result.segment) result.segment = 'resident_salaried'; result.confidence.personal += 0.2; }
  if (t.includes('salary transfer') || t.includes(' stl')) result.salary_transfer = true;
  else if (t.includes('no salary transfer') || t.includes('non-stl')) result.salary_transfer = false;
  for (const em of EMIRATES) { if (t.includes(em.label.toLowerCase())) { result.emirate = em.value; result.confidence.property += 0.2; break; } }
  const propMatch = notes.match(/(?:property|apartment|villa|flat)\s+(?:worth|value[d]?|price[d]?|at|for)?\s*(?:aed\s*)?([\d.,]+[km]?)/i) || notes.match(/([\d.,]+[km]?)\s*(?:aed)?\s*(?:apartment|villa|flat|property)/i);
  if (propMatch) { const val = parseAmount(propMatch[propMatch.length - 1]); if (val && val > 100000) { result.property_value = val; result.confidence.property += 0.4; } }
  const ltvMatch = notes.match(/(\d{2,3})\s*%?\s*ltv/i) || notes.match(/ltv\s*(?:of|:)?\s*(\d{2,3})/i);
  if (ltvMatch) { result.ltv = parseInt(ltvMatch[1]); result.confidence.property += 0.3; }
  const loanMatch = notes.match(/loan\s*(?:amount|of)?\s*(?:is|:)?\s*(?:aed\s*)?([\d.,]+[km]?)/i);
  if (loanMatch) { const val = parseAmount(loanMatch[loanMatch.length - 1]); if (val && val > 50000) { result.loan_amount = val; result.confidence.property += 0.3; } }
  if (result.property_value && result.ltv && !result.loan_amount) result.loan_amount = Math.round(result.property_value * result.ltv / 100);
  if (result.property_value && result.loan_amount && !result.ltv) result.ltv = Math.round((result.loan_amount / result.property_value) * 100);
  if (t.includes('resale')) result.transaction_type = 'resale';
  else if (t.includes('off-plan') || t.includes('off plan')) result.transaction_type = 'off_plan';
  else if (t.includes('handover')) result.transaction_type = 'handover';
  if (t.includes('apartment') || t.includes('flat')) result.property_type = 'Apartment';
  else if (t.includes('villa')) result.property_type = 'Villa';
  else if (t.includes('townhouse')) result.property_type = 'Townhouse';
  if (t.includes('investment') || t.includes('to rent')) result.purpose = 'Investment';
  else if (t.includes('own use') || t.includes('self use') || t.includes('to live')) result.purpose = 'Self Use';
  else if (t.includes('first home') || t.includes('first time')) result.purpose = 'First Home';
  const incomePatterns: Array<{ type: string; regex: RegExp }> = [
    { type: 'Basic Salary', regex: /basic\s+salary\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i },
    { type: 'Basic Salary', regex: /salary\s+(?:of\s+|is\s+|aed\s+)?([\d.,]+[km]?)/i },
    { type: 'Basic Salary', regex: /earns?\s+(?:aed\s*)?([\d.,]+[km]?)/i },
    { type: 'Housing Allowance', regex: /housing\s+allowance\s+(?:of\s+|is\s+)?(?:aed\s*)?([\d.,]+[km]?)/i },
    { type: 'Transport Allowance', regex: /transport\s+allowance\s+(?:of\s+|is\s+)?(?:aed\s*)?([\d.,]+[km]?)/i },
    { type: 'Bonus Fixed', regex: /(?:fixed\s+)?bonus\s+(?:of\s+|is\s+)?(?:aed\s*)?([\d.,]+[km]?)/i },
    { type: 'Commission Variable', regex: /commission\s+(?:of\s+|is\s+)?(?:aed\s*)?([\d.,]+[km]?)/i },
    { type: 'Rental Income 1', regex: /rental\s+income\s+(?:of\s+|is\s+)?(?:aed\s*)?([\d.,]+[km]?)/i },
  ];
  const addedTypes = new Set<string>();
  for (const { type, regex } of incomePatterns) {
    if (addedTypes.has(type)) continue;
    const m = notes.match(regex);
    if (m) { const val = parseAmount(m[m.length - 1]); if (val && val > 0) { result.income_fields.push({ income_type: type, amount: val, percent_considered: 100, recurrence: 'monthly' }); result.confidence.income = Math.min(result.confidence.income + 0.35, 1); addedTypes.add(type); } }
  }
  const plMatch = notes.match(/personal\s+loan\s+(?:emi|instalment|payment)\s+(?:of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i);
  if (plMatch) { const val = parseAmount(plMatch[plMatch.length - 1]); if (val) { result.liability_fields.push({ liability_type: 'Personal Loan 1 EMI', amount: val, credit_card_limit: 0, recurrence: 'monthly', closed_before_application: false }); result.confidence.liabilities = Math.min(result.confidence.liabilities + 0.4, 1); } }
  const carMatch = notes.match(/(?:car|auto)\s+loan\s+(?:emi|payment)?\s+(?:of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i);
  if (carMatch) { const val = parseAmount(carMatch[carMatch.length - 1]); if (val) { result.liability_fields.push({ liability_type: 'Auto Loan 1 EMI', amount: val, credit_card_limit: 0, recurrence: 'monthly', closed_before_application: false }); result.confidence.liabilities = Math.min(result.confidence.liabilities + 0.3, 1); } }
  const ccMatches = [...notes.matchAll(/credit\s+card\s+(?:limit\s+)?(?:of\s+)?(?:aed\s*)?([\d.,]+[km]?)/gi)];
  ccMatches.slice(0, 3).forEach((m, i) => { const val = parseAmount(m[1]); if (val) { result.liability_fields.push({ liability_type: `Credit Card ${i + 1} Limit`, amount: 0, credit_card_limit: val, recurrence: 'monthly', closed_before_application: false }); result.confidence.liabilities = Math.min(result.confidence.liabilities + 0.3, 1); } });
  result.confidence.personal = Math.min(result.confidence.personal, 1);
  result.confidence.property = Math.min(result.confidence.property, 1);
  return result;
}

function ConfidenceBar({ label, score }: { label: string; score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground w-6 text-right">{pct}%</span>
    </div>
  );
}

function ExtractionPreview({ result, onApply, onDiscard }: { result: ExtractionResult; onApply: () => void; onDiscard: () => void; }) {
  const fields = [
    { label: 'Name', value: result.client_name },
    { label: 'Segment', value: result.segment?.replace(/_/g, ' ') ?? null },
    { label: 'Nationality', value: result.nationality },
    { label: 'Residency', value: result.residency?.replace(/_/g, ' ') ?? null },
    { label: 'Emirate', value: result.emirate?.replace(/_/g, ' ') ?? null },
    { label: 'Property value', value: result.property_value ? `AED ${result.property_value.toLocaleString()}` : null },
    { label: 'Loan amount', value: result.loan_amount ? `AED ${result.loan_amount.toLocaleString()}` : null },
    { label: 'LTV', value: result.ltv ? `${result.ltv}%` : null },
    { label: 'Transaction', value: result.transaction_type?.replace(/_/g, ' ') ?? null },
    { label: 'Property type', value: result.property_type },
    { label: 'Purpose', value: result.purpose },
    { label: 'Salary transfer', value: result.salary_transfer === null ? null : result.salary_transfer ? 'Yes' : 'No' },
  ].filter(f => f.value !== null);

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium">Extraction preview — review before applying</p>
      <div className="space-y-1 p-2 bg-secondary/40 rounded-lg">
        <ConfidenceBar label="Personal" score={result.confidence.personal} />
        <ConfidenceBar label="Property" score={result.confidence.property} />
        <ConfidenceBar label="Income" score={result.confidence.income} />
        <ConfidenceBar label="Liabilities" score={result.confidence.liabilities} />
      </div>
      {fields.length > 0 && (
        <div className="space-y-1">
          {fields.map(f => (
            <div key={f.label} className="flex items-center justify-between text-xs py-0.5 border-b border-border/40 last:border-0">
              <span className="text-muted-foreground">{f.label}</span>
              <span className="font-medium">{f.value}</span>
            </div>
          ))}
        </div>
      )}
      {result.income_fields.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Income</p>
          {result.income_fields.map((f, i) => (
            <div key={i} className="flex justify-between text-xs py-0.5 border-b border-border/40 last:border-0">
              <span className="text-muted-foreground">{f.income_type}</span>
              <span className="font-medium">AED {f.amount.toLocaleString()}/mo</span>
            </div>
          ))}
        </div>
      )}
      {result.liability_fields.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Liabilities</p>
          {result.liability_fields.map((f, i) => (
            <div key={i} className="flex justify-between text-xs py-0.5 border-b border-border/40 last:border-0">
              <span className="text-muted-foreground">{f.liability_type}</span>
              <span className="font-medium">{f.credit_card_limit > 0 ? `Limit AED ${f.credit_card_limit.toLocaleString()}` : `AED ${f.amount.toLocaleString()}/mo`}</span>
            </div>
          ))}
        </div>
      )}
      {result.unclear.length > 0 && (
        <div className="text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded p-2">
          Couldn't determine: {result.unclear.join(', ')}
        </div>
      )}
      {fields.length === 0 && result.income_fields.length === 0 && result.liability_fields.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">Nothing extracted — try adding more detail.</p>
      )}
      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={onDiscard}>Discard</Button>
        <Button size="sm" className="flex-1 text-xs bg-accent text-accent-foreground hover:bg-accent/90" onClick={onApply}>Apply to form</Button>
      </div>
    </div>
  );
}

export default function NotesPanel({ applicantId, onExtract, whatIfContext }: NotesPanelProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [minimised, setMinimised] = useState(false);
  const [tab, setTab] = useState<'notes' | 'whatif' | 'history'>('notes');
  const [draft, setDraft] = useState('');
  const [sessionLabel, setSessionLabel] = useState('');
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!open || !applicantId) return; loadHistory(); }, [open, applicantId]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);
  useEffect(() => {
    if (tab === 'whatif' && chatMessages.length === 0) {
      setChatMessages([{ role: 'assistant', content: whatIfContext.whatIfAnalysis || 'All banks are currently eligible — no what-if scenarios needed. Ask me anything about this case.' }]);
    }
  }, [tab]);

  async function loadHistory() {
    if (!applicantId) return;
    setLoadingHistory(true);
    const { data } = await supabase.from('client_notes' as any).select('id, note_text, created_at, session_label').eq('applicant_id', applicantId).order('created_at', { ascending: false });
    setNotes((data ?? []) as ClientNote[]);
    setLoadingHistory(false);
  }

  async function saveNote(text: string) {
    if (!user || !applicantId || !text.trim()) return;
    const { error } = await supabase.from('client_notes' as any).insert({ applicant_id: applicantId, note_text: text.trim(), created_by: user.id, session_label: sessionLabel.trim() || null });
    if (error) { toast.error('Note could not be saved'); return; }
    toast.success('Note saved'); setSessionLabel(''); loadHistory();
  }

  async function handleRuleExtract() {
    if (!draft.trim()) return;
    setExtracting(true);
    await saveNote(draft);
    setExtractionResult(ruleBasedExtract(draft));
    setExtracting(false);
  }

  async function handleAiExtract() {
    if (!draft.trim()) return;
    setExtracting(true);
    await saveNote(draft);
    try {
      const { data, error } = await supabase.functions.invoke('claude-proxy', { body: { mode: 'extract', payload: { notes: draft } } });
      if (error) throw error;
      if (data?.extracted) setExtractionResult(data.extracted as ExtractionResult);
      else toast.error('AI extraction failed — try Quick extract instead');
    } catch { toast.error('AI extraction failed — try Quick extract instead'); }
    finally { setExtracting(false); }
  }

  function applyExtraction() {
    if (!extractionResult) return;
    onExtract(extractionResult);
    setExtractionResult(null);
    setDraft('');
    toast.success('Form updated from notes');
  }

  async function handleChatSend() {
    if (!chatInput.trim() || chatLoading) return;
    const question = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: question }]);
    setChatLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('claude-proxy', {
        body: { mode: 'whatif', payload: { question, caseContext: { totalIncome: whatIfContext.totalIncome, totalLiabilities: whatIfContext.totalLiabilities, loanAmount: whatIfContext.loanAmount, stressRate: whatIfContext.stressRate, tenorMonths: whatIfContext.tenorMonths, currentDbr: whatIfContext.currentDbr, eligibleBanks: whatIfContext.eligibleBanks, ineligibleBanks: whatIfContext.ineligibleBanks, whatIfAnalysis: whatIfContext.whatIfAnalysis } } },
      });
      if (error) throw error;
      setChatMessages(prev => [...prev, { role: 'assistant', content: data?.answer ?? 'Unable to process.' }]);
    } catch { setChatMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong — please try again.' }]); }
    finally { setChatLoading(false); }
  }

  async function deleteNote(id: string) {
    await supabase.from('client_notes' as any).delete().eq('id', id);
    setNotes(prev => prev.filter(n => n.id !== id));
    toast.success('Note deleted');
  }

  function openPopOut() {
    const w = window.open('', 'maverick-notes', 'width=480,height=660,resizable=yes');
    if (!w) { toast.error('Pop-out blocked — allow popups for this site'); return; }
    w.document.write(`<html><head><title>Maverick — Client Notes</title><style>*{box-sizing:border-box}body{font-family:sans-serif;padding:16px;background:#f5f5f5;font-size:13px;margin:0}h3{margin:0 0 12px;font-size:15px;color:#1a3c5e}input,textarea{width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:12px;font-family:inherit;margin-bottom:8px}textarea{height:220px;resize:vertical}button{padding:8px 20px;background:#1a3c5e;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;width:100%}button:hover{background:#2a5a8e}.msg{margin-top:12px;padding:8px;background:#e8f4e8;border-radius:6px;font-size:11px;color:#2a6b2a;display:none}</style></head><body><h3>📋 Client Notes</h3><input id="label" placeholder="Session label (optional) — e.g. Initial call"/><textarea id="notes" placeholder="Type or paste your client notes here...&#10;&#10;e.g. Client is Indian national, works at ADNOC, salary 35k..."></textarea><button onclick="sync()">Sync to Maverick →</button><div class="msg" id="msg">✓ Synced! Click Quick Extract or AI Extract in Maverick.</div><script>function sync(){var n=document.getElementById('notes').value,l=document.getElementById('label').value;if(!n.trim())return;localStorage.setItem('maverick_popout_notes',JSON.stringify({notes:n,label:l,ts:Date.now()}));document.getElementById('msg').style.display='block';}</script></body></html>`);
    w.document.close();
    const interval = setInterval(() => {
      try {
        const raw = localStorage.getItem('maverick_popout_notes');
        if (!raw) return;
        const { notes: n, label: l, ts } = JSON.parse(raw);
        if (Date.now() - ts < 5000) { setDraft(n); if (l) setSessionLabel(l); localStorage.removeItem('maverick_popout_notes'); setOpen(true); setTab('notes'); toast.success('Notes synced from pop-out window'); clearInterval(interval); }
      } catch { /* ignore */ }
    }, 1000);
    setTimeout(() => clearInterval(interval), 300000);
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="fixed bottom-6 right-6 z-50 shadow-lg gap-2 bg-background" onClick={() => setOpen(true)}>
        <MessageSquare className="h-4 w-4" />
        Client notes
        {notes.length > 0 && <Badge className="h-4 px-1.5 text-[10px] bg-accent text-accent-foreground">{notes.length}</Badge>}
      </Button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[460px] shadow-xl">
      <Card className="border-2 border-primary/20">
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0 border-b">
          <CardTitle className="text-sm font-semibold text-primary flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Client notes
            {notes.length > 0 && <Badge variant="outline" className="text-[10px] h-4 px-1.5">{notes.length} saved</Badge>}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Pop out to second screen" onClick={openPopOut}><ExternalLink className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setMinimised(!minimised)}>{minimised ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setOpen(false)}><X className="h-3.5 w-3.5" /></Button>
          </div>
        </CardHeader>

        {!minimised && (
          <CardContent className="px-4 pb-4 pt-3 space-y-3">
            <div className="flex gap-1">
              {(['notes', 'whatif', 'history'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}>
                  {t === 'notes' ? 'Notes' : t === 'whatif' ? 'What-If' : `History (${notes.length})`}
                </button>
              ))}
            </div>

            {tab === 'notes' && (
              <div className="space-y-2">
                {!extractionResult ? (
                  <>
                    <p className="text-xs text-muted-foreground">Type or paste notes. <strong>Quick extract</strong> is free and instant. <strong>AI extract</strong> handles complex or ambiguous notes.</p>
                    <input className="w-full text-xs border border-input rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder="Session label (optional) — e.g. Initial call, Follow-up 1" value={sessionLabel} onChange={e => setSessionLabel(e.target.value)} />
                    <Textarea className="text-xs min-h-[140px] resize-none" placeholder={`e.g. "Client is Indian national, works at Emirates NBD, basic salary 28k, housing allowance 8k, personal loan EMI 4,500/month, credit card limit 50k. Looking at 2.2M apartment in Dubai Marina, resale, 80% LTV, salary transfer..."`} value={draft} onChange={e => setDraft(e.target.value)} />
                    {!applicantId && draft.trim() && <p className="text-[10px] text-amber-600">Note will be saved after the qualification is first saved.</p>}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 text-xs gap-1" disabled={!draft.trim() || extracting} onClick={handleRuleExtract}>
                        <Zap className="h-3 w-3" />{extracting ? 'Extracting…' : 'Quick extract'}
                      </Button>
                      <Button size="sm" className="flex-1 text-xs gap-1 bg-accent text-accent-foreground hover:bg-accent/90" disabled={!draft.trim() || extracting} onClick={handleAiExtract}>
                        <Sparkles className="h-3 w-3" />{extracting ? 'Extracting…' : 'AI extract'}
                      </Button>
                    </div>
                    <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" disabled={!draft.trim() || !applicantId} onClick={() => saveNote(draft)}>Save note only</Button>
                  </>
                ) : (
                  <ExtractionPreview result={extractionResult} onApply={applyExtraction} onDiscard={() => setExtractionResult(null)} />
                )}
              </div>
            )}

            {tab === 'whatif' && (
              <div className="flex flex-col" style={{ height: 360 }}>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 pb-2">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`text-xs rounded-lg p-2.5 leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-primary text-primary-foreground ml-8' : 'bg-secondary text-foreground mr-8'}`}>{msg.content}</div>
                  ))}
                  {chatLoading && <div className="bg-secondary text-foreground text-xs rounded-lg p-2.5 mr-8 animate-pulse">Analysing…</div>}
                  <div ref={chatEndRef} />
                </div>
                <div className="flex gap-2 pt-2 border-t">
                  <input className="flex-1 text-xs border border-input rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder="e.g. What if salary increases by 5k?" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleChatSend()} disabled={chatLoading} />
                  <Button size="sm" className="h-8 w-8 p-0 bg-accent text-accent-foreground" onClick={handleChatSend} disabled={!chatInput.trim() || chatLoading}><Send className="h-3.5 w-3.5" /></Button>
                </div>
                <p className="text-[10px] text-muted-foreground text-center pt-1">AI has full access to current case data</p>
              </div>
            )}

            {tab === 'history' && (
              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {loadingHistory && <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>}
                {!loadingHistory && notes.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No notes saved yet for this client.</p>}
                {notes.map(note => (
                  <div key={note.id} className="border border-border rounded-lg p-3 space-y-1.5 bg-secondary/40">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Clock className="h-3 w-3" />{format(new Date(note.created_at), 'dd MMM yyyy, HH:mm')}</div>
                      <div className="flex items-center gap-1">
                        {note.session_label && <Badge variant="outline" className="text-[10px] h-4 px-1.5">{note.session_label}</Badge>}
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive" onClick={() => deleteNote(note.id)}><X className="h-3 w-3" /></Button>
                      </div>
                    </div>
                    <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap line-clamp-4">{note.note_text}</p>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-accent" onClick={() => { setDraft(note.note_text); setTab('notes'); }}>
                      <Sparkles className="h-3 w-3 mr-1" />Re-extract this note
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
