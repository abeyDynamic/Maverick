// Policy Fit Review — type definitions

export type PolicyFitIntent =
  | 'policy_fit_for_selected_banks'
  | 'policy_fit_all_banks'
  | 'highest_income_recognition'
  | 'highest_eligibility'
  | 'highest_ltv'
  | 'income_policy_comparison'
  | 'document_gap_review'
  | 'manual_review_flags'
  | 'transaction_fit'
  | 'route_suggestion'
  | 'general_policy_question';

export interface PolicyFitCaseFacts {
  segment: string;
  employmentType: string;
  transactionType?: string;
  requestedLoanAmount?: number;
  propertyValue?: number;
  requestedLtv?: number;
  totalIncome?: number;
  totalLiabilities?: number;
  currentDbr?: number;
  stressRate?: number;
  tenorMonths?: number;
  losMonths?: number;
  lobMonths?: number;
  auditAvailable?: boolean | null;
  vatAvailable?: boolean | null;
  dab?: number | null;
  cto?: number | null;
  rentalIncome?: number | null;
  bonusIncome?: number | null;
  commissionIncome?: number | null;
  nationality?: string | null;
  countryOfResidence?: string | null;
  coApplicantStructure?: string | null;
}

export interface PolicySearchRow {
  id: string;
  policy_ref: string;
  bank: string;
  segment: string;
  employment_type: string | null;
  product_variant: string | null;
  raw_attribute: string;
  canonical_attribute: string;
  policy_category: string;
  target_module: string | null;
  value: string | null;
  normalized_value: string | null;
  value_status: string;
  data_status: string;
  attribute_description: string | null;
  cleaning_notes: string | null;
  source_tab: string | null;
}

export interface PolicyFitCheck {
  checkType: string;
  canonicalAttribute: string;
  policyValue: string | null;
  caseValue?: string | number | boolean | null;
  result:
    | 'pass'
    | 'fail'
    | 'missing_input'
    | 'manual_review'
    | 'info_only'
    | 'unclear_policy'
    | 'conditional';
  reason: string;
  policyRef?: string;
  dataStatus?: string;
  valueStatus?: string;
}

export interface BankPolicyFitResult {
  bank: string;
  productVariant?: string | null;
  fitStatus:
    | 'fit'
    | 'conditional_fit'
    | 'not_fit'
    | 'needs_adviser_input'
    | 'manual_review';
  incomeRecognitionScore: number;
  eligibilityScore: number;
  ltvScore: number;
  documentBurdenScore: number;
  manualReviewRiskScore: number;
  matchedPolicyTerms: number;
  passedChecks: PolicyFitCheck[];
  failedChecks: PolicyFitCheck[];
  missingInputs: PolicyFitCheck[];
  manualReviewItems: PolicyFitCheck[];
  documentRequirements: PolicyFitCheck[];
  feeAndTatNotes: PolicyFitCheck[];
  incomeRecognitionNotes: PolicyFitCheck[];
  adviserActions: string[];
  summary: string;
}

export interface PolicyFitReport {
  generatedAt: string;
  intent: PolicyFitIntent;
  selectedBanks?: string[];
  caseSummary: PolicyFitCaseFacts;
  overallSummary: {
    banksReviewed: number;
    fit: number;
    conditionalFit: number;
    notFit: number;
    needsInput: number;
    manualReview: number;
  };
  rankings: {
    highestIncomeRecognition: BankPolicyFitResult[];
    highestEligibility: BankPolicyFitResult[];
    highestLtv: BankPolicyFitResult[];
    lowestManualReviewRisk: BankPolicyFitResult[];
  };
  bankReports: BankPolicyFitResult[];
}
