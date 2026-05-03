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
        const safeMessage = typeof message === 'string' ? message : '';
        const safeAvailableBanks = Array.isArray(availableBanks) ? availableBanks : [];
        const safeCaseFacts: any = caseFacts ?? {};
        const parsed = parsePolicyFitIntent(safeMessage, safeAvailableBanks);

        const segment = normalizePolicySegment(safeCaseFacts.segment);
        const employmentType = normalizePolicyEmployment(safeCaseFacts.employmentType);

        let query = (supabase as any)
          .from('policy_search_view')
          .select('*')
          .in('policy_category', [
            'eligibility',
            'income_liability',
            'transaction',
            'property',
            'document',
            'tat_validity',
            'fee',
            'note',
          ])
          .limit(1000);

        if (parsed.selectedBanks.length > 0) {
          query = query.in('bank', parsed.selectedBanks);
        }
        if (segment) {
          query = query.eq('segment', segment);
        }
        if (employmentType) {
          query = query.or(
            `employment_type.eq.${employmentType},employment_type.eq.Mixed,employment_type.is.null`
          );
        }

        const { data, error: qErr } = await query;
        if (qErr) throw qErr;
        const filtered = (data ?? []) as PolicySearchRow[];

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

function safeLower(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function normalizePolicySegment(segment?: unknown): string | undefined {
  const value = safeLower(segment);
  if (!value) return undefined;
  if (value.includes('non')) return 'Non-Resident';
  if (value.includes('resident')) return 'Resident';
  return undefined;
}

function normalizePolicyEmployment(employmentType?: unknown): string | undefined {
  const value = safeLower(employmentType);
  if (!value) return undefined;
  if (value.includes('self')) return 'Self Employed';
  if (value.includes('salary') || value.includes('salaried')) return 'Salaried';
  if (value.includes('mixed')) return 'Mixed';
  return undefined;
}
