import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parsePolicyFitIntent } from '@/lib/policies/policyFitIntentParser';
import { buildPolicyFitReport } from '@/lib/policies/policy-fit-engine';
import type {
  PolicyFitCaseFacts,
  PolicyFitReport,
  PolicySearchRow,
} from '@/lib/policies/policyFitTypes';

const RELEVANT_CATEGORIES = new Set([
  'eligibility', 'income_liability', 'transaction', 'property',
  'document', 'tat_validity', 'fee', 'note',
]);

interface UsePolicyFitChatOptions {
  caseFacts: PolicyFitCaseFacts;
  availableBanks?: string[];
}

export function usePolicyFitChat({ caseFacts, availableBanks = [] }: UsePolicyFitChatOptions) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runPolicyFitChat = useCallback(
    async (message: string): Promise<{ report: PolicyFitReport; aiSummary?: string }> => {
      setLoading(true);
      setError(null);
      try {
        const parsed = parsePolicyFitIntent(message, availableBanks);

        // Fetch policy_search_view (paged to overcome 1000 row default cap)
        const PAGE = 1000;
        let from = 0;
        const all: PolicySearchRow[] = [];
        // base query — filter server-side by segment + employment + bank when possible
        const segNorm = normalizePolicySegment(caseFacts.segment);
        const empNorm = normalizePolicyEmployment(caseFacts.employmentType);

        // Use 'in' filter for selected banks; otherwise no bank filter
        // eslint-disable-next-line no-constant-condition
        while (true) {
          let q = (supabase as any).from('policy_search_view').select('*').range(from, from + PAGE - 1);
          if (segNorm) q = q.or(`segment.ilike.%${segNorm}%,segment.is.null`);
          if (empNorm) q = q.or(`employment_type.ilike.%${empNorm}%,employment_type.is.null`);
          if (parsed.selectedBanks.length > 0) {
            q = q.in('bank', parsed.selectedBanks);
          }
          const { data, error: qErr } = await q;
          if (qErr) throw qErr;
          const batch = (data ?? []) as PolicySearchRow[];
          all.push(...batch);
          if (batch.length < PAGE) break;
          from += PAGE;
        }

        // Filter to relevant categories client-side
        const filtered = all.filter(r => !r.policy_category || RELEVANT_CATEGORIES.has(String(r.policy_category).toLowerCase()));

        const report = buildPolicyFitReport({
          caseFacts,
          policyRows: filtered,
          intent: parsed.intent,
          selectedBanks: parsed.selectedBanks.length > 0 ? parsed.selectedBanks : undefined,
        });

        // Optional AI summary — degrade gracefully on any failure
        let aiSummary: string | undefined;
        try {
          // Send a slimmed-down report to keep payload small
          const slim = {
            intent: report.intent,
            caseSummary: report.caseSummary,
            overallSummary: report.overallSummary,
            rankings: {
              highestIncomeRecognition: report.rankings.highestIncomeRecognition.map(slimBank),
              highestEligibility: report.rankings.highestEligibility.map(slimBank),
              highestLtv: report.rankings.highestLtv.map(slimBank),
              lowestManualReviewRisk: report.rankings.lowestManualReviewRisk.map(slimBank),
            },
            bankReports: report.bankReports.map(slimBank),
          };
          const { data, error: aiErr } = await supabase.functions.invoke('maverick-ai', {
            body: { mode: 'policy_fit_summary', payload: { question: message, report: slim } },
          });
          if (!aiErr && data?.answer) aiSummary = data.answer as string;
        } catch (e) {
          console.warn('Policy Fit AI summary unavailable:', e);
        }

        return { report, aiSummary };
      } catch (e: any) {
        const msg = e?.message ?? 'Policy fit failed';
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [caseFacts, availableBanks],
  );

  return { runPolicyFitChat, loading, error };
}

function slimBank(b: any) {
  return {
    bank: b.bank,
    productVariant: b.productVariant,
    fitStatus: b.fitStatus,
    incomeRecognitionScore: b.incomeRecognitionScore,
    eligibilityScore: b.eligibilityScore,
    ltvScore: b.ltvScore,
    manualReviewRiskScore: b.manualReviewRiskScore,
    summary: b.summary,
    adviserActions: b.adviserActions,
    failedCount: b.failedChecks?.length ?? 0,
    missingCount: b.missingInputs?.length ?? 0,
    manualCount: b.manualReviewItems?.length ?? 0,
    topFailures: (b.failedChecks ?? []).slice(0, 3).map((c: any) => ({ attr: c.canonicalAttribute, reason: c.reason })),
    topMissing: (b.missingInputs ?? []).slice(0, 3).map((c: any) => ({ attr: c.canonicalAttribute, reason: c.reason })),
  };
}

function normalizePolicySegment(segment?: string): string | undefined {
  if (!segment) return undefined;
  const value = segment.toLowerCase();
  if (value.includes('non')) return 'Non-Resident';
  if (value.includes('resident')) return 'Resident';
  return undefined;
}

function normalizePolicyEmployment(employmentType?: string): string | undefined {
  if (!employmentType) return undefined;
  const value = employmentType.toLowerCase();
  if (value.includes('self')) return 'Self Employed';
  if (value.includes('salary') || value.includes('salaried')) return 'Salaried';
  if (value.includes('mixed')) return 'Mixed';
  return undefined;
}
