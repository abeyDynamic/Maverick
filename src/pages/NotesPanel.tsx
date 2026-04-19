import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  MessageSquare, X, Sparkles, ChevronDown, ChevronUp,
  Clock, ExternalLink, Send, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { COUNTRIES, EMIRATES } from '@/lib/mortgage-utils';
import { buildWhatIfAnalysis } from '@/lib/case/stage1-engine';
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
  income_fields: Array<{ income_type: string; amount: number; percent_considered: number; recurrence: string }>;
  liability_fields: Array<{ liability_type: string; amount: number; credit_card_limit: number; recurrence: string; closed_before_application: boolean }>;
  confidence: { personal: number; property: number; income: number; liabilities: number };
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
  bankResults: CaseBankResult[];
  liabilityFields: CaseLiabilityField[];
}

interface NotesPanelProps {
  applicantId?: string;
  onExtract: (result: ExtractionResult) => void;
  whatIfContext: WhatIfContext;
}

function ruleBasedExtract(notes: string): ExtractionResult {
  const text = notes.toLowerCase();
  const result: ExtractionResult = {
    client_name: null, segment: null, residency: null, nationality: null,
    dob: null, employment_type: null, property_value: null, loan_amount: null,
    ltv: null, emirate: null, transaction_type: null, property_type: null,
    purpose: null, salary_transfer: null, income_fields: [], liability_fields: [],
    confidence: { personal: 0, property: 0, income: 0, liabilities: 0 }, unclear: [],
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

  for (const country of COUNTRIES) {
    if (text.includes(country.toLowerCase())) { result.nationality = country; result.confidence.personal += 0.4; break; }
  }

  if (text.includes('uae national') || text.includes('emirati')) { result.residency = 'uae_national'; result.segment = 'resident_salaried'; result.confidence.personal += 0.3; }
  else if (text.includes('non-resident') || text.includes('non resident') || text.includes('overseas')) { result.residency = 'non_resident'; result.segment = 'non_resident'; result.confidence.personal += 0.3; }
  else if (text.includes('resident expat') || text.includes('works in uae') || text.includes('lives in dubai')) { result.residency = 'resident_expat'; result.segment = 'resident_salaried'; result.confidence.personal += 0.2; }

  if (text.includes('self employed') || text.includes('self-employed') || text.includes('business owner')) { result.employment_type = 'self_employed'; result.segment = 'self_employed'; result.confidence.personal += 0.3; }
  else if (text.includes('salaried') || text.includes('works at') || text.includes('employed at')) { result.employment_type = 'salaried'; if (!result.segment) result.segment = 'resident_salaried'; result.confidence.personal += 0.2; }

  if (text.includes('salary transfer') || text.includes('stl')) result.salary_transfer = true;
  else if (text.includes('no salary transfer') || text.includes('non-stl')) result.salary_transfer = false;

  for (const em of EMIRATES) {
    if (text.includes(em.label.toLowerCase())) { result.emirate = em.value; result.confidence.property += 0.2; break; }
  }

  const propMatch = notes.match(/(?:property|apartment|villa|flat)\s+(?:value|worth|for|at)?\s*(?:aed\s*)?([\d.,]+[km]?)/i) || notes.match(/([\d.,]+[km]?)\s*(?:aed)?\s*(?:property|apartment|villa|flat)/i);
  if (propMatch) { const val = parseAmount(propMatch[propMatch.length - 1]); if (val && val > 100000) { result.property_value = val; result.confidence.property += 0.4; } }

  const ltvMatch = notes.match(/(\d{2,3})\s*%?\s*ltv/i) || notes.match(/ltv\s*(?:of|:)?\s*(\d{2,3})/i);
  if (ltvMatch) { result.ltv = parseInt(ltvMatch[1]); result.confidence.property += 0.3; }

  const loanMatch = notes.match(/loan\s*(?:amount|of|:)?\s*(?:aed\s*)?([\d.,]+[km]?)/i) || notes.match(/(?:finance|mortgage)\s+(?:of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i);
  if (loanMatch) { const val = parseAmount(loanMatch[loanMatch.length - 1]); if (val && val > 50000) { result.loan_amount = val; result.confidence.property += 0.3; } }

  if (result.property_value && result.ltv && !result.loan_amount) result.loan_amount = Math.round(result.property_value * result.ltv / 100);
  if (result.property_value && result.loan_amount && !result.ltv) result.ltv = Math.round((result.loan_amount / result.property_value) * 100);

  if (text.includes('resale')) result.transaction_type = 'resale';
  else if (text.includes('off-plan') || text.includes('off plan')) result.transaction_type = 'off_plan';
  else if (text.includes('handover')) result.transaction_type = 'handover';
  else if (text.includes('buyout')) result.transaction_type = 'buyout';
  else if (text.includes('equity release')) result.transaction_type = 'equity';

  if (text.includes('apartment') || text.includes('flat')) result.property_type = 'Apartment';
  else if (text.includes('villa')) result.property_type = 'Villa';
  else if (text.includes('townhouse')) result.property_type = 'Townhouse';

  if (text.includes('investment') || text.includes('to rent')) result.purpose = 'Investment';
  else if (text.includes('self use') || text.includes('own use')) result.purpose = 'Self Use';
  else if (text.includes('first home') || text.includes('first time')) result.purpose = 'First Home';
  else if (text.includes('second home')) result.purpose = 'Second Home';

  const incomeMap = [
    { type: 'Basic Salary', pattern: /basic\s+salary\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i },
    { type: 'Basic Salary', pattern: /salary\s+(?:is\s+|of\s+|aed\s+)?([\d.,]+[km]?)/i },
    { type: 'Basic Salary', pattern: /earns?\s+(?:aed\s*)?([\d.,]+[km]?)/i },
    { type: 'Housing Allowance', pattern: /housing\s+allowance\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i },
    { type: 'Transport Allowance', pattern: /transport\s+allowance\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i },
    { type: 'Bonus Fixed', pattern: /(?:fixed\s+)?bonus\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i },
    { type: 'Commission Variable', pattern: /commission\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i },
    { type: 'Rental Income 1', pattern: /rental\s+income\s+(?:is\s+|of\s+)?(?:aed\s*)?([\d.,]+[km]?)/i },
  ];
  const addedTypes = new Set<string>();
  for (const { type, pattern } of incomeMap) {
    if (addedTypes.has(type)) continue;
    const m = notes.match(pattern);
    if (m) { const val = parseAmount(m[m.length - 1]); if (val && val > 0) { result.income_fields.push({ income_type: type, amount: val, percent_considered: 100, recurrence: 'monthly' }); result.confidence.income = Math.min(result.confidence.income + 0.3, 1); addedTypes.add(type); } }
  }

  const plMatch = notes.match(/personal\s+loan\s+(?:emi|instalment)?\s+(?:of\s+|is\s+)?(?:aed\s*)?([\d.,]+[km]?)/i);
  if (plMatch) { const val = parseAmount(plMatch[plMatch.length - 1]); if (val) { result.liability_fields.push({ liability_type: 'Personal Loan 1 EMI', amount: val, credit_card_limit: 0, recurrence: 'monthly', closed_before_application: false }); result.confidence.liabilities = Math.min(result.confidence.liabilities + 0.4, 1); } }

  const carMatch = notes.match(/(?:car|auto)\s+loan\s+(?:emi|instalment)?\s+(?:of\s+|is\s+)?(?:aed\s*)?([\d.,]+[km]?)/i);
  if (carMatch) { const val = parseAmount(carMatch[carMatch.length - 1]); if (val) { result.liability_fields.push({ liability_type: 'Auto Loan 1 EMI', amount: val, credit_card_limit: 0, recurrence: 'monthly', closed_before_application: false }); result.confidence.liabilities = Math.min(result.confidence.liabilities + 0.3, 1); } }

  const ccMatches = [...notes.matchAll(/credit\s+card\s+(?:limit\s+)?(?:of\s+|is\s+)?(?:aed\s*)?([\d.,]+[km]?)/gi)];
  ccMatches.slice(0, 3).forEach((m, i) => { const val = parseAmount(m[1]); if (val) { result.liability_fields.push({ liability_type: `Credit Card ${i + 1} Limit`, amount: 0, credit_card_limit: val, recurrence: 'monthly', closed_before_application: false }); result.confidence.liabilities = Math.min(result.confidence.liabilities + 0.3, 1); } });

  result.confidence.personal = Math.min(result.confidence.personal, 1);
  result.confidence.property = Math.min(result.confidence.property, 1);
  return result;
}

function ConfBar({ label, score }: { label: string; score: number }) {
  const color = score >= 0.7 ? 'bg-green-500' : score >= 0.4 ? 'bg-amber-500' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round(score * 100)}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground w-8 text-right">{Math.round(score * 100)}%</span>
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
  const [savedNotes, setSavedNotes] = useState<ClientNote[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractionResult | null>(null);
  const [extractMode, setExtractMode] = useState<'rule' | 'ai'>('rule');
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open && applicantId) loadHistory(); }, [open, applicantId]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  useEffect(() => {
    if (tab === 'whatif' && chatMessages.length === 0 && whatIfContext.bankResults.length > 0) {
      const analysis = buildWhatIfAnalysis(whatIfContext.bankResults, whatIfContext.totalIncome, whatIfContext.totalLiabilities, whatIfContext.liabilityFields);
      setChatMessages([{ role: 'assistant', text: analysis || '✅ All banks eligible. Ask me anything about this case.' }]);
    }
  }, [tab]);

  async function loadHistory() {
    if (!applicantId) return;
    setLoadingHistory(true);
    const { data } = await supabase.from('client_notes' as any).select('id, note_text, created_at, session_label').eq('applicant_id', applicantId).order('created_at', { ascending: false });
    setSavedNotes((data ?? []) as ClientNote[]);
    setLoadingHistory(false);
  }

  async function saveNote(text: string) {
    if (!user || !applicantId || !text.trim()) return;
    const { error } = await supabase.from('client_notes' as any).insert({ applicant_id: applicantId, note_text: text.trim(), created_by: user.id, session_label: sessionLabel.trim() || null });
    if (error) { toast.error('Note could not be saved'); return; }
    toast.success('Note saved'); setSessionLabel(''); loadHistory();
  }

  async function deleteNote(id: string) {
    await supabase.from('client_notes' as any).delete().eq('id', id);
    setSavedNotes(prev => prev.filter(n => n.id !== id));
  }

  function handleRuleExtract() {
    if (!draft.trim()) return;
    setExtracting(true);
    try { setExtracted(ruleBasedExtract(draft)); } finally { setExtracting(false); }
  }

  async function handleAiExtract() {
    if (!draft.trim()) return;
    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke('swift-service', { body: { mode: 'extract', payload: { notes: draft } } });
      if (error) throw error;
      if (data?.extracted) { setExtracted(data.extracted); toast.success('AI extraction complete'); }
    } catch { toast.error('AI extraction failed — switching to rule-based'); setExtracted(ruleBasedExtract(draft)); }
    finally { setExtracting(false); }
  }

  function handleApplyExtraction() {
    if (!extracted) return;
    onExtract(extracted); saveNote(draft); setDraft(''); setExtracted(null); toast.success('Fields applied to form');
  }

  async function handleChatSend() {
    if (!chatInput.trim() || chatLoading) return;
    const question = chatInput.trim(); setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: question }]);
    setChatLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('swift-service', {
        body: { mode: 'whatif', payload: { question, caseContext: { totalIncome: whatIfContext.totalIncome, totalLiabilities: whatIfContext.totalLiabilities, loanAmount: whatIfContext.loanAmount, stressRate: whatIfContext.stressRate, tenorMonths: whatIfContext.tenorMonths, currentDbr: whatIfContext.currentDbr, eligibleBanks: whatIfContext.eligibleBanks, ineligibleBanks: whatIfContext.ineligibleBanks, whatIfAnalysis: buildWhatIfAnalysis(whatIfContext.bankResults, whatIfContext.totalIncome, whatIfContext.totalLiabilities, whatIfContext.liabilityFields) } } },
      });
      if (error) throw error;
      setChatMessages(prev => [...prev, { role: 'assistant', text: data?.answer ?? 'No response.' }]);
    } catch { setChatMessages(prev => [...prev, { role: 'assistant', text: '⚠️ Could not reach AI.' }]); }
    finally { setChatLoading(false); }
  }

  function handlePopOut() {
    // Reuse existing window if still open — push latest draft to it
    if (popoutRef.current && !popoutRef.current.closed) {
      popoutRef.current.postMessage({ type: 'MAVERICK_DRAFT', text: draft }, '*');
      popoutRef.current.focus();
      return;
    }

    const w = window.open('', 'maverick-notes', 'width=500,height=720,resizable=yes');
    if (!w) { toast.error('Pop-up blocked — allow pop-ups for this site'); return; }
    popoutRef.current = w;

    const escapedDraft = draft.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    w.document.write('<!DOCTYPE html><html><head><title>Maverick — Client Notes</title>'
      + '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;padding:16px;background:#f9f9f7;color:#1a1a18;height:100vh;display:flex;flex-direction:column;gap:10px}'
      + 'h3{font-size:15px;font-weight:600}.hint{font-size:11px;color:#888;line-height:1.5}'
      + 'textarea{flex:1;width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:13px;resize:none;line-height:1.6;font-family:inherit}'
      + 'textarea:focus{outline:none;border-color:#1a1a18}.row{display:flex;gap:8px}'
      + 'button{flex:1;padding:10px;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500}'
      + '.btn-send{background:#1a1a18;color:#fff}.btn-clear{background:#e8e6e0;color:#444}'
      + '.status{font-size:11px;color:#888;text-align:center;min-height:16px}</style></head><body>'
      + '<h3>Client Notes — Maverick</h3>'
      + '<p class="hint">Type or paste notes. <strong>Send to Maverick</strong> pushes to the form. <strong>Ctrl+Enter</strong> to send quickly.</p>'
      + '<textarea id="n" placeholder="e.g. Indian national, ADNOC, salary 32k, housing 8k, personal loan EMI 4500, CC limit 50k, 2.2M villa Dubai, resale, 80% LTV...">' + escapedDraft + '</textarea>'
      + '<div class="row"><button class="btn-clear" onclick="clearNotes()">Clear</button><button class="btn-send" onclick="sendNotes()">Send to Maverick</button></div>'
      + '<div class="status" id="st"></div>'
      + '<script>'
      + 'var ta=document.getElementById("n"),st=document.getElementById("st");'
      + 'function showStatus(msg){st.textContent=msg;setTimeout(function(){st.textContent=""},2000);}'
      + 'window.addEventListener("message",function(e){'
      + '  if(e.data&&e.data.type==="MAVERICK_DRAFT"){'
      + '    var incoming=e.data.text||"",current=ta.value||"";'
      + '    if(current&&current!==incoming&&!current.includes(incoming.trim())){'
      + '      ta.value=current.trim()+"\n\n"+incoming.trim();'
      + '    } else { ta.value=incoming; }'
      + '    showStatus("Synced from Maverick");'
      + '  }'
      + '});'
      + 'function sendNotes(){var t=ta.value.trim();if(!t){showStatus("Nothing to send");return;}window.opener.postMessage({type:"MAVERICK_NOTES",text:t},"*");showStatus("Sent to Maverick ✓");}'
      + 'function clearNotes(){if(confirm("Clear all notes?")){ta.value="";showStatus("Cleared");}}'
      + 'ta.addEventListener("keydown",function(e){if(e.ctrlKey&&e.key==="Enter")sendNotes();});'
      + '</script></body></html>');
    w.document.close();
  }

  useEffect(() => {
    function handleMessage(e: MessageEvent) { if (e.data?.type === 'MAVERICK_NOTES') { setDraft(e.data.text); setOpen(true); setTab('notes'); setExtracted(null); } }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="fixed bottom-6 right-6 z-50 shadow-lg gap-2 bg-background" onClick={() => setOpen(true)}>
        <MessageSquare className="h-4 w-4" />
        Client notes
        {savedNotes.length > 0 && <Badge className="h-4 px-1.5 text-[10px] bg-accent text-accent-foreground">{savedNotes.length}</Badge>}
      </Button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[460px] shadow-2xl">
      <Card className="border-2 border-primary/20">
        <CardHeader className="py-2.5 px-4 flex flex-row items-center justify-between space-y-0 border-b">
          <CardTitle className="text-sm font-semibold text-primary flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Client notes
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" title="Pop out to second screen" onClick={handlePopOut}>
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setMinimised(!minimised)}>
              {minimised ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setOpen(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>

        {!minimised && (
          <CardContent className="px-4 pb-4 pt-3 space-y-3">
            <div className="flex gap-1 border-b pb-2">
              {(['notes', 'whatif', 'history'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'}`}>
                  {t === 'notes' ? 'Notes' : t === 'whatif' ? 'What-If' : `History (${savedNotes.length})`}
                </button>
              ))}
            </div>

            {tab === 'notes' && (
              <div className="space-y-2">
                <input className="w-full text-xs border border-input rounded-md px-3 py-1.5 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder="Session label — e.g. Initial call, Follow-up 1" value={sessionLabel} onChange={e => setSessionLabel(e.target.value)} />
                <Textarea className="text-xs min-h-[120px] resize-none" placeholder={`e.g. "Indian national, ADNOC, salary 32k, housing 8k, personal loan EMI 4500, CC limit 50k, 2.2M villa Dubai, resale, 80% LTV..."`} value={draft} onChange={e => { setDraft(e.target.value); setExtracted(null); }} />
                {!applicantId && draft.trim() && <p className="text-[10px] text-amber-600">Note will be saved after the qualification is first saved.</p>}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Extract via:</span>
                  <button onClick={() => setExtractMode('rule')} className={`text-[10px] px-2 py-0.5 rounded ${extractMode === 'rule' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground border border-border'}`}>Rule-based (free)</button>
                  <button onClick={() => setExtractMode('ai')} className={`text-[10px] px-2 py-0.5 rounded flex items-center gap-1 ${extractMode === 'ai' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground border border-border'}`}><Sparkles className="h-2.5 w-2.5" />AI (smarter)</button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs" disabled={!draft.trim() || !applicantId} onClick={() => saveNote(draft)}>Save only</Button>
                  <Button size="sm" className="flex-1 gap-1.5 text-xs bg-accent text-accent-foreground hover:bg-accent/90" disabled={!draft.trim() || extracting} onClick={extractMode === 'ai' ? handleAiExtract : handleRuleExtract}>
                    <Sparkles className="h-3.5 w-3.5" />{extracting ? 'Extracting…' : 'Extract to form'}
                  </Button>
                </div>

                {extracted && (
                  <div className="border border-border rounded-lg p-3 space-y-2 bg-secondary/40">
                    <p className="text-xs font-medium text-primary">Extracted — review before applying</p>
                    <div className="space-y-1">
                      <ConfBar label="Personal" score={extracted.confidence.personal} />
                      <ConfBar label="Property" score={extracted.confidence.property} />
                      <ConfBar label="Income" score={extracted.confidence.income} />
                      <ConfBar label="Liabilities" score={extracted.confidence.liabilities} />
                    </div>
                    <div className="text-[10px] text-muted-foreground space-y-0.5">
                      {extracted.client_name && <div><CheckCircle2 className="inline h-3 w-3 text-green-500 mr-1" />Name: {extracted.client_name}</div>}
                      {extracted.nationality && <div><CheckCircle2 className="inline h-3 w-3 text-green-500 mr-1" />Nationality: {extracted.nationality}</div>}
                      {extracted.segment && <div><CheckCircle2 className="inline h-3 w-3 text-green-500 mr-1" />Segment: {extracted.segment}</div>}
                      {extracted.property_value && <div><CheckCircle2 className="inline h-3 w-3 text-green-500 mr-1" />Property: AED {extracted.property_value.toLocaleString()}</div>}
                      {extracted.loan_amount && <div><CheckCircle2 className="inline h-3 w-3 text-green-500 mr-1" />Loan: AED {extracted.loan_amount.toLocaleString()}</div>}
                      {extracted.income_fields.map((f, i) => <div key={i}><CheckCircle2 className="inline h-3 w-3 text-green-500 mr-1" />{f.income_type}: AED {f.amount.toLocaleString()}</div>)}
                      {extracted.liability_fields.map((f, i) => <div key={i}><CheckCircle2 className="inline h-3 w-3 text-green-500 mr-1" />{f.liability_type}: AED {(f.amount || f.credit_card_limit).toLocaleString()}</div>)}
                      {extracted.unclear.length > 0 && <div className="mt-1"><AlertCircle className="inline h-3 w-3 text-amber-500 mr-1" />Unclear: {extracted.unclear.join(', ')}</div>}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => setExtracted(null)}>Discard</Button>
                      <Button size="sm" className="flex-1 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={handleApplyExtraction}>Apply to form</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'whatif' && (
              <div className="space-y-2">
                <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-primary text-primary-foreground ml-8' : 'bg-secondary text-foreground mr-8'}`}>{msg.text}</div>
                  ))}
                  {chatLoading && <div className="bg-secondary rounded-lg px-3 py-2 text-xs text-muted-foreground mr-8 animate-pulse">Thinking…</div>}
                  <div ref={chatEndRef} />
                </div>
                <div className="text-[10px] text-muted-foreground bg-secondary/40 rounded-md px-2 py-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>Income: <strong>AED {whatIfContext.totalIncome.toLocaleString()}</strong></span>
                  <span>Liabilities: <strong>AED {whatIfContext.totalLiabilities.toLocaleString()}</strong></span>
                  <span>Loan: <strong>AED {whatIfContext.loanAmount.toLocaleString()}</strong></span>
                  <span>DBR: <strong>{whatIfContext.currentDbr.toFixed(1)}%</strong></span>
                </div>
                <div className="flex gap-2">
                  <input className="flex-1 text-xs border border-input rounded-md px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder="e.g. What if salary increases by 5,000?" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }} disabled={chatLoading} />
                  <Button size="sm" className="px-3" disabled={!chatInput.trim() || chatLoading} onClick={handleChatSend}><Send className="h-3.5 w-3.5" /></Button>
                </div>
                <p className="text-[10px] text-muted-foreground">AI has live access to this case — ask anything about eligibility or scenarios.</p>
              </div>
            )}

            {tab === 'history' && (
              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {loadingHistory && <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>}
                {!loadingHistory && savedNotes.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No notes saved yet.</p>}
                {savedNotes.map(note => (
                  <div key={note.id} className="border border-border rounded-lg p-3 space-y-1.5 bg-secondary/40">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Clock className="h-3 w-3" />{format(new Date(note.created_at), 'dd MMM yyyy, HH:mm')}</div>
                      <div className="flex items-center gap-1">
                        {note.session_label && <Badge variant="outline" className="text-[10px] h-4 px-1.5">{note.session_label}</Badge>}
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive" onClick={() => deleteNote(note.id)}><X className="h-3 w-3" /></Button>
                      </div>
                    </div>
                    <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap line-clamp-4">{note.note_text}</p>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-accent" onClick={() => { setDraft(note.note_text); setTab('notes'); setExtracted(null); }}><Sparkles className="h-3 w-3 mr-1" />Re-extract</Button>
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
