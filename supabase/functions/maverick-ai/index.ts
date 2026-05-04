// Maverick AI edge function — strict closed-book qualification intelligence layer.
// Modes: extract | qualification_adviser_chat | whatif | policy_fit_summary

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

// ─── System prompts ──────────────────────────────────────────────────────────

const ADVISER_CHAT_SYSTEM_PROMPT = `You are Maverick's adviser-side qualification intelligence layer.

You are not a general mortgage chatbot.

You are not allowed to rely on external knowledge, public sources, Central Bank assumptions, regulatory memory, or general UAE mortgage market knowledge.

You may only use:
- structured case facts supplied in the request,
- deterministic qualification outputs supplied by Maverick,
- policy rows supplied from policy_search_view,
- adviser notes supplied in the request,
- extracted facts supplied in the request.

If a claim is not supported by those inputs, say that Maverick does not have enough internal policy evidence to confirm it.

Do not cite or reference Central Bank, UAE regulations, public guidelines, or generic bank policies unless that exact information is present in the provided Maverick policy context.

Do not guarantee approval.
Do not say a bank is eligible unless the deterministic Maverick engine says so or the policy context clearly supports the limited statement.
Do not say all banks are eligible unless the supplied bank results prove it.

For self-employed cases:
- Separate income evidence from qualifying income.
- Do not treat DAB, CTO, turnover, audited profit, or own-company salary as qualifying income unless Maverick policy context provides a route/formula.
- Do not assume low-doc supports the requested LTV.
- If the requested LTV is 70% and low-doc policy rows suggest 60%–65% or do not confirm 70%, flag LTV cap risk.
- Explain what is confirmed, what is assumed, and what needs adviser confirmation.

When answering, use this structure:
1. Direct answer based only on Maverick data
2. What Maverick data supports this
3. What is missing or uncertain
4. Adviser follow-up questions
5. Recommended next action

If policy evidence is missing, say:
"Maverick does not yet have enough structured policy evidence to confirm this route. The adviser should verify the relevant policy row or update the policy database."

Forbidden phrases unless explicitly supported by provided Maverick data:
- Central Bank guidelines
- UAE Central Bank
- UAE regulation
- approved
- all banks eligible
- all major banks
- guaranteed
- qualifies across all banks
- low-doc mortgages are limited to X
- banks can offer low-doc financing
- submit to preferred bank

The AI must remain inside Maverick's data boundary.`;

const POLICY_FIT_SUMMARY_SYSTEM_PROMPT = `You are Maverick's Policy Fit summariser. Explain the deterministic Policy Fit report supplied in the payload. Do not invent rules. Do not reference Central Bank, UAE regulations, or any external sources. Only describe what the supplied report and policy rows show. Never override the deterministic fit status.`;

// ─── Forbidden phrase guard ──────────────────────────────────────────────────

const FORBIDDEN_PATTERNS: RegExp[] = [
  /\bcentral bank\b/i,
  /\buae regulation/i,
  /\buae central bank\b/i,
  /\bby uae regulation\b/i,
  /\ball banks eligible\b/i,
  /\ball major banks\b/i,
  /\bguaranteed\b/i,
  /\bqualifies across all banks\b/i,
  /\bpublic guidelines\b/i,
];

function containsForbidden(text: string, hasPolicyContext: boolean, hasBankResults: boolean): string | null {
  for (const re of FORBIDDEN_PATTERNS) {
    if (re.test(text)) {
      // Allow "approved" / "eligible" only when bank results back it up
      return re.source;
    }
  }
  // "approved" is only forbidden when bank results don't exist
  if (!hasBankResults && /\b(approved|all banks eligible)\b/i.test(text)) {
    return 'approved/all banks eligible';
  }
  return null;
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) {
      return json({ error: 'LOVABLE_API_KEY not configured' }, 500);
    }

    const { mode, payload } = await req.json();

    if (mode === 'qualification_adviser_chat' || mode === 'whatif') {
      return await handleAdviserChat(payload, mode === 'whatif');
    }
    if (mode === 'policy_fit_summary') {
      return await handlePolicyFitSummary(payload);
    }
    if (mode === 'extract') {
      return await handleExtract(payload);
    }
    return json({ error: `Unknown mode: ${mode}` }, 400);
  } catch (e) {
    console.error('maverick-ai error:', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});

// ─── Adviser chat (What-If) ──────────────────────────────────────────────────

async function handleAdviserChat(payload: any, legacy: boolean) {
  const message: string = payload?.message ?? payload?.question ?? '';
  const caseContext = payload?.caseContext ?? {};
  const policyContext = Array.isArray(caseContext.policyContext) ? caseContext.policyContext : [];
  const bankResults = caseContext?.qualificationResults?.bankResults ?? [];
  const hasPolicyContext = policyContext.length > 0;
  const hasBankResults = Array.isArray(bankResults) && bankResults.length > 0;

  // If no policy context AND user is asking a policy question, refuse with structured message
  if (!hasPolicyContext && looksLikePolicyQuestion(message)) {
    return json({
      answer:
        'No Maverick policy context was retrieved for this question. I can review the DBR numbers, but I cannot confirm bank policy fit without policy evidence. Please verify the relevant policy row in the policy database or rephrase the question.',
    });
  }

  const userPrompt = buildAdviserUserPrompt(message, caseContext, legacy);

  const aiText = await callGateway({
    model: 'google/gemini-2.5-flash',
    system: ADVISER_CHAT_SYSTEM_PROMPT,
    user: userPrompt,
  });

  // Validate output for forbidden phrases
  const violation = containsForbidden(aiText, hasPolicyContext, hasBankResults);
  if (violation) {
    console.warn('Maverick AI guard triggered:', violation);
    // One retry with stricter reminder
    const retryText = await callGateway({
      model: 'google/gemini-2.5-flash',
      system: ADVISER_CHAT_SYSTEM_PROMPT,
      user:
        userPrompt +
        '\n\nIMPORTANT: Your previous draft used a forbidden phrase. Do NOT mention Central Bank, UAE regulations, "approved", "all banks eligible", or any external/generic source. Only use the Maverick data above. Rewrite strictly.',
    });
    const retryViolation = containsForbidden(retryText, hasPolicyContext, hasBankResults);
    if (retryViolation) {
      return json({
        answer:
          '⚠️ This answer attempted to use information outside Maverick\'s data boundary. Please rerun with more Maverick policy context, or rephrase the question to focus on the case facts and bank results that are loaded.',
      });
    }
    return json({ answer: retryText });
  }

  return json({ answer: aiText });
}

function looksLikePolicyQuestion(message: string): boolean {
  const m = (message || '').toLowerCase();
  return /(policy|eligib|approve|qualif|bank|low.?doc|ltv|tenor|salary|income recogni|rule|criteria|requirement|document)/i.test(
    m,
  );
}

function buildAdviserUserPrompt(message: string, ctx: any, legacy: boolean): string {
  const parts: string[] = [];
  parts.push(`ADVISER QUESTION:\n${message}`);

  if (ctx.caseFacts) {
    parts.push(`\nCASE FACTS (structured, from qualification page):\n${safeJson(ctx.caseFacts)}`);
  }
  if (ctx.qualificationResults) {
    parts.push(`\nDETERMINISTIC QUALIFICATION RESULTS (from Maverick engine):\n${safeJson(ctx.qualificationResults)}`);
  }
  if (ctx.whatIfAnalysis) {
    parts.push(`\nMAVERICK WHAT-IF ANALYSIS (deterministic):\n${ctx.whatIfAnalysis}`);
  }
  if (ctx.liabilityFields) {
    parts.push(`\nLIABILITY FIELDS:\n${safeJson(ctx.liabilityFields)}`);
  }
  if (ctx.notes) {
    parts.push(`\nADVISER NOTES (raw):\n${ctx.notes}`);
  }
  if (Array.isArray(ctx.policyContext) && ctx.policyContext.length > 0) {
    parts.push(
      `\nMAVERICK POLICY CONTEXT (from policy_search_view — the ONLY policy evidence you may cite):\n${safeJson(
        ctx.policyContext,
      )}`,
    );
    if (ctx.policyContextSummary) parts.push(`\nPolicy context summary: ${ctx.policyContextSummary}`);
  } else {
    parts.push(
      `\nMAVERICK POLICY CONTEXT: (none retrieved) — Do NOT cite any bank policy. Only answer based on deterministic numbers above, or say evidence is missing.`,
    );
  }

  parts.push(
    `\nReply using the required 5-part structure (Direct answer / Maverick data supporting / Missing or uncertain / Adviser follow-up questions / Recommended next action). Stay strictly inside Maverick's data boundary.`,
  );
  return parts.join('\n');
}

// ─── Policy Fit summary ──────────────────────────────────────────────────────

async function handlePolicyFitSummary(payload: any) {
  const question: string = payload?.question ?? '';
  const report = payload?.report ?? {};
  const userPrompt = `QUESTION: ${question}\n\nDETERMINISTIC POLICY FIT REPORT (the only data you may use):\n${safeJson(
    report,
  )}\n\nSummarise clearly. Do not override the deterministic fit status. Do not reference external sources.`;

  const aiText = await callGateway({
    model: 'google/gemini-2.5-flash',
    system: POLICY_FIT_SUMMARY_SYSTEM_PROMPT,
    user: userPrompt,
  });
  const violation = containsForbidden(aiText, true, true);
  if (violation) {
    return json({
      answer:
        '⚠️ The summary attempted to reference information outside Maverick\'s data boundary. Please review the deterministic report directly.',
    });
  }
  return json({ answer: aiText });
}

// ─── Extract (note parsing — kept minimal, deterministic on client) ──────────

async function handleExtract(payload: any) {
  // Deterministic regex extraction is performed on the client in NotesPanel.
  // Return empty so the client falls back to its local parser.
  return json({ extraction: null, note: 'Use client-side deterministic extraction.' });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function callGateway({
  model,
  system,
  user,
}: {
  model: string;
  system: string;
  user: string;
}): Promise<string> {
  const resp = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (resp.status === 429) throw new Error('Rate limit exceeded — please try again in a moment.');
  if (resp.status === 402) throw new Error('Lovable AI credits exhausted — please add funds in Settings → Workspace → Usage.');
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`AI gateway error (${resp.status}): ${t}`);
  }
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2).slice(0, 16000);
  } catch {
    return String(v);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
