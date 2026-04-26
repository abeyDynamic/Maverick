/**
 * Snapshot Save Service — persists a qualification case to Supabase.
 * Handles applicant create/update, property, income, liabilities,
 * co-borrowers, and the qualification_results snapshot.
 */

import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/mortgage-utils';
import type { CaseBankResult } from './stage1-engine';
import type { Stage2BankEvaluation } from './stage2-engine';
import type { ProductData } from '@/components/results/CostBreakdownSection';
import type { QualNote } from '@/components/results/BankEligibilityTable';
import type {
  CaseApplicant,
  CaseProperty,
  CaseIncomeField,
  CaseLiabilityField,
  CaseCoBorrower,
} from './types';

interface SaveParams {
  userId: string;
  editApplicantId?: string;
  applicant: CaseApplicant;
  property: CaseProperty;
  incomeFields: CaseIncomeField[];
  liabilityFields: CaseLiabilityField[];
  coBorrowers: CaseCoBorrower[];
  bankResults: CaseBankResult[];
  stage2ByBank: Record<string, Stage2BankEvaluation>;
  finalEligibleBankIds: string[];
  productsByBank: Record<string, ProductData>;
  qualNotes: QualNote[];
  effectiveTenor: number;
}

function buildSavedBankResults(
  bankResults: CaseBankResult[],
  productsByBank: Record<string, ProductData>,
  qualNotes: QualNote[],
  stage2ByBank: Record<string, Stage2BankEvaluation>,
) {
  return bankResults.map(r => {
    const product = productsByBank[r.bank.id];
    const noteCount = qualNotes.filter(n => n.bank_id === r.bank.id).length;
    const stage2 = stage2ByBank[r.bank.id];
    const finalEligible = stage2?.finalEligible ?? r.eligible;

    return {
      bank_name: r.bank.bankName,
      stress_rate: r.stressRate,
      monthly_emi: Math.round(r.stressEMI),
      dbr_percent: Math.round(r.dbr * 10) / 10,
      dbr_limit: r.dbrLimit,
      min_salary_met: r.minSalaryMet,
      stage1_eligible: r.eligible,
      stage2_passed: stage2?.summary.passed ?? null,
      stage2_total: stage2?.summary.total ?? null,
      stage2_critical_fail: stage2?.summary.criticalFail ?? null,
      stage2_critical_pass: stage2?.summary.criticalPass ?? null,
      eligible: finalEligible,
      product_rate: product?.rate != null ? Math.round((product.rate as number) * 10000) / 100 : null,
      fixed_period: product?.fixed_period ?? null,
      qualification_notes_count: noteCount,
    };
  });
}

function buildSavedCostComparison(
  bankResults: CaseBankResult[],
  productsByBank: Record<string, ProductData>,
  loanAmount: number,
  propertyValue: number,
  nominalRate: number,
  effectiveTenor: number,
  emirate: string,
  finalEligibleBankIds: string[],
) {
  const approvedSet = new Set(finalEligibleBankIds);
  const approved = bankResults.filter(r => approvedSet.has(r.bank.id));
  if (approved.length === 0 || !loanAmount) return [];

  const isDubai = emirate === 'dubai';
  const isDubaiAbuSharjah = ['dubai', 'abu_dhabi', 'sharjah'].includes(emirate);
  const defaultValFee = isDubaiAbuSharjah ? 2500 : 3000;

  const calcEMI = (loan: number, annualRate: number, months: number) => {
    if (!loan || !annualRate || !months) return 0;
    const r = annualRate / 12;
    if (r === 0) return loan / months;
    return (loan * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  };

  const entries = approved.map(r => {
    const product = productsByBank[r.bank.id];
    const usedRate = product?.rate ?? nominalRate / 100;
    const lifeInsRate = product?.life_ins_monthly_percent ?? 0.00018;
    const propInsRate = product?.prop_ins_annual_percent ?? 0.00035;
    const rawProcFee = product?.processing_fee_percent;
    const processingFeePercent = (rawProcFee != null && rawProcFee >= 0 && rawProcFee <= 10) ? rawProcFee : 1;
    const fixedMonths = product?.comparison_fixed_months ?? product?.fixed_period_months ?? 24;
    const valFee = product?.valuation_fee ?? defaultValFee;

    const emi = Math.round(calcEMI(loanAmount, usedRate, effectiveTenor));
    const lifeIns = Math.round(loanAmount * lifeInsRate);
    const propIns = Math.round((propertyValue * propInsRate) / 12);
    const totalMonthly = emi + lifeIns + propIns;
    const fixedPeriodTotal = totalMonthly * fixedMonths;

    const dldFee = isDubai ? Math.round(propertyValue * 0.04 + 580) : 0;
    const mortgageReg = Math.round(loanAmount * 0.0025 + 290);
    const transferCentre = 4200;
    const processingFeeAED = Math.round(loanAmount * processingFeePercent / 100);
    const upfrontCosts = dldFee + mortgageReg + transferCentre + processingFeeAED + valFee;
    const grandTotal = fixedPeriodTotal + upfrontCosts;

    return {
      bank_name: r.bank.bankName,
      nominal_rate: Math.round(usedRate * 10000) / 100,
      monthly_emi: emi,
      life_ins: lifeIns,
      prop_ins: propIns,
      total_monthly: totalMonthly,
      fixed_period_total: fixedPeriodTotal,
      upfront_costs: upfrontCosts,
      grand_total: grandTotal,
      rank: 0,
    };
  });

  entries.sort((a, b) => a.fixed_period_total - b.fixed_period_total);
  entries.forEach((e, i) => { e.rank = i; });
  return entries;
}

export async function saveQualificationSnapshot(params: SaveParams): Promise<string> {
  const {
    userId, editApplicantId, applicant, property, incomeFields, liabilityFields,
    coBorrowers, bankResults, stage2ByBank, finalEligibleBankIds, productsByBank, qualNotes, effectiveTenor,
  } = params;

  const savedBankResults = buildSavedBankResults(bankResults, productsByBank, qualNotes, stage2ByBank);
  const savedCostComparison = buildSavedCostComparison(
    bankResults, productsByBank, property.loanAmount, property.propertyValue,
    property.nominalRate, effectiveTenor, property.emirate, finalEligibleBankIds
  );
  const representativeDbr = savedBankResults.length > 0 ? savedBankResults[0].dbr_percent : null;

  let appId: string;

  if (editApplicantId) {
    appId = editApplicantId;
    await supabase.from('applicants').update({
      full_name: applicant.fullName || null,
      residency_status: applicant.residencyStatus,
      nationality: applicant.nationality,
      date_of_birth: applicant.dateOfBirth ? format(applicant.dateOfBirth, 'yyyy-MM-dd') : null,
      employment_type: applicant.employmentType || null,
    } as any).eq('id', appId);

    await Promise.all([
      supabase.from('property_details').delete().eq('applicant_id', appId),
      supabase.from('income_fields').delete().eq('applicant_id', appId),
      supabase.from('liability_fields').delete().eq('applicant_id', appId),
      supabase.from('co_borrowers').delete().eq('applicant_id', appId),
    ]);
  } else {
    const { data: created, error } = await supabase
      .from('applicants')
      .insert({
        user_id: userId,
        full_name: applicant.fullName || null,
        residency_status: applicant.residencyStatus,
        nationality: applicant.nationality,
        date_of_birth: applicant.dateOfBirth ? format(applicant.dateOfBirth, 'yyyy-MM-dd') : null,
        employment_type: applicant.employmentType || null,
      } as any)
      .select('id')
      .single();

    if (error || !created) throw error || new Error('Failed to create applicant');
    appId = created.id;
  }

  await supabase.from('qualification_results')
  .delete()
  .eq('applicant_id', appId);

await supabase.from('qualification_results').insert({
  applicant_id: appId,
  loan_amount: property.loanAmount || null,
  dbr_percent: representativeDbr,
  bank_results: savedBankResults,
  cost_comparison: savedCostComparison,
} as any);

  const { error: propInsertError } = await supabase.from('property_details').insert({
    applicant_id: appId,
    property_value: property.propertyValue || null,
    loan_amount: property.loanAmount || null,
    ltv: property.ltv || null,
    emirate: property.emirate,
    is_difc: property.isDIFC,
    is_al_ain: property.isAlAin,
    transaction_type: property.transactionType,
    salary_transfer: typeof property.salaryTransfer === 'string'
      ? property.salaryTransfer === 'stl'
      : property.salaryTransfer ?? null,
    property_type: property.propertyType || null,
    purpose: property.purpose || null,
    loan_type_preference: property.loanTypePreference,
    preferred_tenor_months: effectiveTenor,
    nominal_rate: property.nominalRate,
    stress_rate: property.stressRate,
  });
  if (propInsertError) console.error('Property insert error:', propInsertError);

  if (incomeFields.length > 0) {
    const { error: incError } = await supabase.from('income_fields').insert(
      incomeFields.map(f => ({
        applicant_id: appId,
        income_type: f.incomeType,
        amount: f.amount,
        percent_considered: f.percentConsidered,
        recurrence: f.recurrence,
        owner_type: 'main',
      }))
    );
    if (incError) console.error('Income insert error:', incError);
  }

  if (liabilityFields.length > 0) {
    const { error: liabError } = await supabase.from('liability_fields').insert(
      liabilityFields.map(f => ({
        applicant_id: appId,
        liability_type: f.liabilityType,
        amount: f.amount,
        credit_card_limit: f.creditCardLimit || null,
        recurrence: f.recurrence,
        closed_before_application: f.closedBeforeApplication,
        liability_letter_obtained: f.liabilityLetterObtained,
        owner_type: 'main',
      }))
    );
    if (liabError) console.error('Liability insert error:', liabError);
  }

  for (let i = 0; i < coBorrowers.length; i++) {
    const cb = coBorrowers[i];
    await supabase.from('co_borrowers').insert({
      applicant_id: appId,
      index: i,
      name: cb.name,
      relationship: cb.relationship,
      employment_type: cb.employmentType,
      date_of_birth: cb.dateOfBirth ? format(cb.dateOfBirth, 'yyyy-MM-dd') : null,
      residency_status: cb.residencyStatus,
    });
    if (cb.incomeFields.length > 0) {
      await supabase.from('income_fields').insert(
        cb.incomeFields.map(f => ({
          applicant_id: appId,
          income_type: f.incomeType,
          amount: f.amount,
          percent_considered: f.percentConsidered,
          recurrence: f.recurrence,
          owner_type: 'co_borrower',
          co_borrower_index: i,
        }))
      );
    }
    if (cb.liabilityFields.length > 0) {
      await supabase.from('liability_fields').insert(
        cb.liabilityFields.map(f => ({
          applicant_id: appId,
          liability_type: f.liabilityType,
          amount: f.amount,
          credit_card_limit: f.creditCardLimit || null,
          recurrence: f.recurrence,
          closed_before_application: f.closedBeforeApplication,
          liability_letter_obtained: f.liabilityLetterObtained,
          owner_type: 'co_borrower',
          co_borrower_index: i,
        }))
      );
    }
  }

  return appId;
}
