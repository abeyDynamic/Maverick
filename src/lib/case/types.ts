/**
 * Unified Case object — the main working entity for a mortgage qualification.
 * All engines read from and write to this structure.
 */

/**
 * Qualification segment — determines question set, engine routing, and product filtering.
 */
export type QualSegment = 'resident_salaried' | 'self_employed' | 'non_resident';

export function deriveSegment(residencyStatus: string, employmentType: string): QualSegment {
  if (residencyStatus === 'non_resident') return 'non_resident';
  if (employmentType === 'self_employed') return 'self_employed';
  return 'resident_salaried';
}

export type SEIncomeRoute =
  | 'audited_revenue'       // Full doc — audited financials, revenue × profit margin × ownership %
  | 'vat_revenue'           // Full doc — VAT returns revenue × ownership %
  | 'full_doc_cto'          // Full doc — company turnover, bank applies margin × ownership %
  | 'low_doc_personal_dab'  // Low doc — personal DAB (lower of DAB/MCTO used)
  | 'low_doc_personal_mcto' // Low doc — personal MCTO (lower of DAB/MCTO used)
  | 'low_doc_company_dab'   // Low doc — company DAB (Mashreq: 100% only; CBD: ownership % applied)
  | 'low_doc_company_mcto'  // Low doc — company MCTO (same constraints as company DAB)
  | '';

export interface SelfEmployedInfo {
  docType: 'full_doc' | 'low_doc' | '';
  incomeRoute: SEIncomeRoute;              // Replaces incomeBasis — specific route
  businessName: string;
  lengthOfBusinessMonths: number | null;   // months — LOB
  ownershipSharePercent: number | null;    // % ownership — drives income calculation and bank routing
  incomeBasis: string;                     // kept for backward compat
}

export interface NonResidentInfo {
  countryOfResidence: string;
  incomeSourceCountry: string;
  dabRequired: boolean;                     // Debt Acknowledgement required
  employmentTypeNR: string;                 // salaried or self_employed for NR sub-routing
}

export const EMPTY_SE_INFO: SelfEmployedInfo = {
  docType: '', incomeRoute: '', businessName: '', lengthOfBusinessMonths: null,
  ownershipSharePercent: null, incomeBasis: '',
};

export const EMPTY_NR_INFO: NonResidentInfo = {
  countryOfResidence: '', incomeSourceCountry: '', dabRequired: false, employmentTypeNR: 'salaried',
};

export interface CaseApplicant {
  id?: string;
  fullName: string;
  residencyStatus: string;       // 'uae_national' | 'resident_expat' | 'non_resident'
  nationality: string;
  dateOfBirth: Date | null;
  employmentType: string;        // 'salaried' | 'self_employed'
  segment: QualSegment;
  selfEmployedInfo?: SelfEmployedInfo;
  nonResidentInfo?: NonResidentInfo;
}

export interface CaseProperty {
  propertyValue: number;
  loanAmount: number;
  ltv: number;
  emirate: string;
  isDIFC: boolean;
  isAlAin: boolean;
  transactionType: string;
  salaryTransfer: boolean;
  propertyType: string;
  purpose: string;
  loanTypePreference: string;    // 'best' | 'conventional' | 'islamic'
  preferredTenorMonths: number;
  nominalRate: number;
  stressRate: number;
}

export interface CaseIncomeField {
  incomeType: string;
  amount: number;
  percentConsidered: number;
  recurrence: string;            // 'monthly' | 'quarterly' | 'bi-annually' | 'annually'
}

export interface CaseLiabilityField {
  liabilityType: string;
  amount: number;
  creditCardLimit: number;
  recurrence: string;
  closedBeforeApplication: boolean;
  liabilityLetterObtained: boolean;
}

export interface CaseCoBorrower {
  name: string;
  relationship: string;
  employmentType: string;
  dateOfBirth: Date | null;
  residencyStatus: string;
  incomeFields: CaseIncomeField[];
  liabilityFields: CaseLiabilityField[];
  selectedIncomeTypes: string[];
  selectedLiabilityTypes: string[];
}

export interface CaseBank {
  id: string;
  bankName: string;
  baseStressRate: number | null;
  minSalary: number;
  dbrLimit: number;
  maxTenorMonths: number | null;
  minLoanAmount: number | null;
  maxLoanAmount: number | null;
}

export interface CaseBankResult {
  bank: CaseBank;
  stressRate: number;
  stressEMI: number;
  dbr: number;
  dbrLimit: number;
  minSalaryMet: boolean;
  dbrMet: boolean;
  loanInRange: boolean;          // B18: loan inside bank's [min, max] window
  effectiveTenor: number;        // B17: tenor actually used for this bank's EMI (clamped by maxTenorMonths)
  eligible: boolean;             // Stage 1 eligible (DBR + min salary + loan range)
}

export interface QualificationCase {
  applicant: CaseApplicant;
  property: CaseProperty;
  incomeFields: CaseIncomeField[];
  liabilityFields: CaseLiabilityField[];
  coBorrowers: CaseCoBorrower[];
}

/**
 * Maps a raw Supabase bank row to CaseBank.
 */
export function toBankFromRow(row: any): CaseBank {
  return {
    id: row.id,
    bankName: row.bank_name,
    baseStressRate: row.base_stress_rate,
    minSalary: row.min_salary,
    dbrLimit: row.dbr_limit,
    maxTenorMonths: row.max_tenor_months,
    minLoanAmount: row.min_loan_amount,
    maxLoanAmount: row.max_loan_amount,
  };
}
