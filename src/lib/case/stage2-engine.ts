/**
 * Stage 2 Engine — bank policy checks and final eligibility gating.
 */

import {
  runPolicyChecks,
  getStage2Summary,
  type PolicyTerm,
  type PolicyCheckResult,
  type Stage2Summary,
} from '@/lib/policy-checks';
import type { CaseBankResult } from './types';

export {
  runPolicyChecks,
  getStage2Summary,
};

export type {
  PolicyTerm,
  PolicyCheckResult,
  Stage2Summary,
} from '@/lib/policy-checks';

export interface Stage2EvaluationContext {
  totalIncome: number;
  loanAmount: number;
  nationality: string;
  emirate: string;
  employmentType: string;
  segment?: import('./types').QualSegment;
}

export interface Stage2BankDebugRow {
  bankId: string;
  bankName: string;
  stage1MinSalarySource: string;
  stage1MinSalaryValue: number | null;
  stage2MinSalarySource: string | null;
  stage2MinSalaryRawValue: string | null;
  stage2MinSalaryParsedValue: number | null;
  dbrLimitSource: string;
  dbrLimitValue: number | null;
  minLoanSource: string;
  minLoanValue: number | null;
  maxLoanSource: string;
  maxLoanValue: number | null;
  stage1Outcome: 'pass' | 'fail';
  stage2Outcome: 'pass' | 'fail' | 'review';
  productEligibilityIncluded: boolean;
  productEligibilityReason: string;
}

export interface Stage2BankEvaluation {
  bankId: string;
  bankName: string;
  checks: PolicyCheckResult[];
  summary: Stage2Summary;
  finalEligible: boolean;
  productEligible: boolean;
  productEligibilityReason: string;
  debug: Stage2BankDebugRow;
}

export function getStage2PolicyFilters(residencyStatus: string, employmentType: string) {
  return {
    policySegment: residencyStatus === 'non_resident' ? 'Non-Resident' : 'Resident',
    policyEmployment: employmentType === 'self_employed'
      ? 'Self Employed'
      : residencyStatus === 'non_resident'
        ? 'Mixed'
        : 'Salaried',
  };
}

function getStage2Outcome(summary: Stage2Summary): 'pass' | 'fail' | 'review' {
  if (summary.criticalFail) return 'fail';
  if (summary.criticalPass && summary.passed === summary.total) return 'pass';
  return 'review';
}

function getProductEligibilityReason(stage1Eligible: boolean, summary: Stage2Summary): string {
  if (!stage1Eligible) return 'Excluded — Stage 1 failed';
  if (summary.criticalFail) return 'Excluded — Stage 2 critical check failed';
  if (!summary.criticalPass) return 'Excluded — Stage 2 critical checks require review';
  if (summary.passed < summary.total) return 'Included — critical rules passed, but non-critical Stage 2 checks still need review';
  return 'Included — Stage 1 and Stage 2 checks passed';
}

function buildDebugRow(
  bankResult: CaseBankResult,
  checks: PolicyCheckResult[],
  summary: Stage2Summary,
  productEligible: boolean,
  productEligibilityReason: string,
): Stage2BankDebugRow {
  const minSalaryCheck = checks.find(check => check.name === 'Min Salary');

  return {
    bankId: bankResult.bank.id,
    bankName: bankResult.bank.bankName,
    stage1MinSalarySource: 'banks.min_salary',
    stage1MinSalaryValue: bankResult.bank.minSalary ?? null,
    stage2MinSalarySource: minSalaryCheck?.debug?.attribute ?? null,
    stage2MinSalaryRawValue: minSalaryCheck?.debug?.rawValue ?? null,
    stage2MinSalaryParsedValue: minSalaryCheck?.debug?.parsedNumeric ?? null,
    dbrLimitSource: 'banks.dbr_limit',
    dbrLimitValue: bankResult.dbrLimit ?? null,
    minLoanSource: 'banks.min_loan_amount',
    minLoanValue: bankResult.bank.minLoanAmount ?? null,
    maxLoanSource: 'banks.max_loan_amount',
    maxLoanValue: bankResult.bank.maxLoanAmount ?? null,
    stage1Outcome: bankResult.eligible ? 'pass' : 'fail',
    stage2Outcome: getStage2Outcome(summary),
    productEligibilityIncluded: productEligible,
    productEligibilityReason,
  };
}

export function evaluateStage2ForBanks(
  bankResults: CaseBankResult[],
  policyTerms: PolicyTerm[],
  context: Stage2EvaluationContext,
): Record<string, Stage2BankEvaluation> {
  const termsByBank = policyTerms.reduce<Record<string, PolicyTerm[]>>((acc, term) => {
    if (!acc[term.bank]) acc[term.bank] = [];
    acc[term.bank].push(term);
    return acc;
  }, {});

  return bankResults.reduce<Record<string, Stage2BankEvaluation>>((acc, bankResult) => {
    const checks = runPolicyChecks({
      terms: termsByBank[bankResult.bank.bankName] ?? [],
      structuredRules: {
        minSalary: bankResult.bank.minSalary ?? null,
        minLoanAmount: bankResult.bank.minLoanAmount ?? null,
        maxLoanAmount: bankResult.bank.maxLoanAmount ?? null,
        dbrLimit: bankResult.bank.dbrLimit ?? null,
      },
      totalIncome: context.totalIncome,
      loanAmount: context.loanAmount,
      nationality: context.nationality,
      emirate: context.emirate,
      employmentType: context.employmentType,
      bankName: bankResult.bank.bankName,
    });

    const summary = getStage2Summary(checks);
    const finalEligible = bankResult.eligible && summary.criticalPass;
    const productEligibilityReason = getProductEligibilityReason(bankResult.eligible, summary);

    acc[bankResult.bank.id] = {
      bankId: bankResult.bank.id,
      bankName: bankResult.bank.bankName,
      checks,
      summary,
      finalEligible,
      productEligible: finalEligible,
      productEligibilityReason,
      debug: buildDebugRow(bankResult, checks, summary, finalEligible, productEligibilityReason),
    };

    return acc;
  }, {});
}
