// Edge Function: maverick-ai
// Modes: extract (parse adviser notes -> structured JSON), whatif (analysis chat)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-2.5-flash';

async function callAI(messages: any[], model = DEFAULT_MODEL) {
  const res = await fetch(AI_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI gateway ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  // Find the first { ... last }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON found');
  return JSON.parse(raw.slice(start, end + 1));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not set' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode;
    const payload = body?.payload ?? {};

    if (mode === 'extract') {
      const notes: string = String(payload.notes ?? '');
      if (!notes.trim()) {
        return new Response(JSON.stringify({ error: 'notes required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const prompt = `You are an expert UAE mortgage qualification assistant. Extract structured mortgage qualification data from these adviser notes. Return ONLY valid JSON, no explanation.

Notes: """${notes}"""

Return this exact JSON (use null for anything not mentioned):
{
  "client_name": null,
  "segment": "resident_salaried" | "self_employed" | "non_resident" | null,
  "residency": "uae_national" | "resident_expat" | "non_resident" | null,
  "nationality": null,
  "dob": "yyyy-MM-dd" | null,
  "employment_type": "salaried" | "self_employed" | null,
  "employer": null,
  "property_value": null,
  "loan_amount": null,
  "ltv": null,
  "tenor_months": null,
  "emirate": "dubai" | "abu_dhabi" | "sharjah" | "ajman" | "ras_al_khaimah" | "fujairah" | "umm_al_quwain" | null,
  "transaction_type": "resale" | "handover" | "buyout" | "off_plan" | "equity" | null,
  "property_type": "Apartment" | "Villa" | "Townhouse" | null,
  "purpose": "Self Use" | "Investment" | null,
  "salary_transfer": null,
  "income_fields": [],
  "liability_fields": [],

  "tier2": {
    "length_of_service_months": null,
    "length_of_business_months": null,
    "aecb_score": null,
    "salary_credits_count": null,
    "probation_confirmed": null,
    "employer_category": null,
    "visa_status": null,
    "country_of_income": null,
    "foreign_bureau_available": null,
    "foreign_bureau_score": null,
    "currency": null
  },

  "contact": {
    "phone": null,
    "email": null,
    "alternate_phone": null,
    "address": null
  },

  "confidence": { "personal": 0, "property": 0, "income": 0, "liabilities": 0 },
  "unclear": []
}

Rules:
- DOB must be yyyy-MM-dd format. Convert "15 March 1982" to "1982-03-15", "15/03/1982" to "1982-03-15". If only age is mentioned (e.g. "44 years old"), compute approximate DOB as today minus age years, set to mid-year (yyyy-07-01).
- "AECB 720" or "credit score 720" → aecb_score: 720
- "8 years at ADNOC" → length_of_service_months: 96, employer: "ADNOC"
- "trading since 2018" → length_of_business_months: approximate from today
- "salary transferred" or "STL" → salary_transfer: true
- "non-salary transfer" or "NSTL" → salary_transfer: false
- "25 year loan" or "300 months tenor" → tenor_months: 300 (convert years to months)
- "AED" / "dirhams" → currency: "AED" (omit unless explicitly different)
- "USD", "GBP", "EUR" → currency: those codes
- Phone numbers in any UAE format ("+971 50 123 4567", "0501234567", "050-123-4567") → phone in original format
- Email addresses → email field
- "out of probation" or "confirmed" → probation_confirmed: true
- "still in probation" → probation_confirmed: false
- "golden visa" or "investor visa" → visa_status: that text
- For non-residents: "UK income", "lives in UK" → country_of_income: "UK"
- "Indian national" → nationality: "Indian", but country_of_income only if specifically mentioned as foreign income
- All numeric values: "28k" = 28000, "2.2M" = 2200000, "AED 35,000" = 35000`;

      const content = await callAI([{ role: 'user', content: prompt }]);
      const json = extractJson(content);
      return new Response(JSON.stringify(json), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (mode === 'whatif') {
      const question: string = String(payload.question ?? '');
      const context = payload.context ?? {};
      const sys = `You are a UAE mortgage adviser assistant. Use the provided context to answer concisely.`;
      const user = `Context:\n${JSON.stringify(context, null, 2)}\n\nQuestion: ${question}`;
      const content = await callAI([
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ]);
      return new Response(JSON.stringify({ answer: content }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'unknown mode' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
