/**
 * Unified Case object — the main working entity for a mortgage qualification.
 * All engines read from and write to this structure.
 */

export interface CaseApplicant {
  id?: string;
  fullName: string;
  residencyStatus: string;       // 'uae_national' | 'resident_expat' | 'non_resident'
  nationality: string;
  dateOfBirth: Date | null;
  employmentType: string;        // 'salaried' | 'self_employed'
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
  maxTenorMonths: number;
  minLoanAmount: number;
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
  eligible: boolean;             // Stage 1 eligible
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
