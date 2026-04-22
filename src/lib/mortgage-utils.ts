export const COUNTRIES = [
  'Afghanistan','Albania','Algeria','Andorra','Angola','Argentina','Armenia','Australia','Austria',
  'Azerbaijan','Bahrain','Bangladesh','Belarus','Belgium','Bolivia','Bosnia and Herzegovina','Brazil',
  'Brunei','Bulgaria','Cambodia','Cameroon','Canada','Chad','Chile','China','Colombia','Comoros',
  'Congo','Costa Rica','Croatia','Cuba','Cyprus','Czech Republic','Denmark','Djibouti','Dominican Republic',
  'Ecuador','Egypt','El Salvador','Eritrea','Estonia','Ethiopia','Fiji','Finland','France',
  'Gabon','Georgia','Germany','Ghana','Greece','Guatemala','Guinea','Haiti','Honduras','Hungary',
  'Iceland','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy','Jamaica','Japan',
  'Jordan','Kazakhstan','Kenya','Kuwait','Kyrgyzstan','Laos','Latvia','Lebanon','Libya',
  'Lithuania','Luxembourg','Madagascar','Malaysia','Maldives','Mali','Malta','Mauritania','Mauritius',
  'Mexico','Moldova','Monaco','Mongolia','Montenegro','Morocco','Mozambique','Myanmar','Namibia',
  'Nepal','Netherlands','New Zealand','Nicaragua','Niger','Nigeria','North Macedonia','Norway',
  'Oman','Pakistan','Palestine','Panama','Papua New Guinea','Paraguay','Peru','Philippines','Poland',
  'Portugal','Qatar','Romania','Russia','Rwanda','Saudi Arabia','Senegal','Serbia','Sierra Leone',
  'Singapore','Slovakia','Slovenia','Somalia','South Africa','South Korea','Spain','Sri Lanka',
  'Sudan','Sweden','Switzerland','Syria','Taiwan','Tajikistan','Tanzania','Thailand','Togo',
  'Trinidad and Tobago','Tunisia','Turkey','Turkmenistan','Uganda','Ukraine','United Arab Emirates',
  'United Kingdom','United States','Uruguay','Uzbekistan','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe'
];

// Salaried income types
export const SALARIED_INCOME_TYPES = [
  'Basic Salary', 'Housing Allowance', 'Transport Allowance', 'Air Ticket Allowance',
  'Educational Allowance', 'Travel Allowance', 'Bonus Fixed', 'Bonus Variable',
  'Commission Variable', 'Rental Income 1', 'Rental Income 2', 'Other Income'
];

// SE full doc income types — qualifying income = amount × ownership %
export const SE_FULL_DOC_INCOME_TYPES = [
  'SE Audited Revenue',  // revenue × profit margin from audits × ownership %
  'SE VAT Revenue',      // VAT return revenue × ownership %
  'SE Full Doc CTO',     // company turnover — bank applies their margin × ownership %
  'Rental Income 1',     // rental always full doc — agreement + title deed required
  'Rental Income 2',
];

// SE low doc income types — personal accounts (lower of DAB/MCTO is qualifying income)
export const SE_LOW_DOC_PERSONAL_TYPES = [
  'SE Personal DAB',     // daily average balance — personal current/savings account
  'SE Personal MCTO',    // monthly credit turnover — personal account
  // Note: lower of DAB and MCTO is used as qualifying income
  // Note: rental income NOT included in low doc — already in personal account balances
];

// SE low doc income types — company accounts
// Mashreq: 100% ownership required | CBD: ownership % applied to derive client share
export const SE_LOW_DOC_COMPANY_TYPES = [
  'SE Company DAB',      // daily average balance — company account
  'SE Company MCTO',     // monthly credit turnover — company account
  // Note: lower of DAB and MCTO is used as qualifying income
];

// All income types combined (for backward compat)
export const INCOME_TYPES = [
  ...SALARIED_INCOME_TYPES,
  ...SE_FULL_DOC_INCOME_TYPES.filter(t => !SALARIED_INCOME_TYPES.includes(t)),
  ...SE_LOW_DOC_PERSONAL_TYPES,
  ...SE_LOW_DOC_COMPANY_TYPES,
];

export const INCOME_DEFAULTS: Record<string, number> = {
  'Basic Salary': 100, 'Housing Allowance': 100, 'Transport Allowance': 100,
  'Air Ticket Allowance': 100, 'Educational Allowance': 100, 'Travel Allowance': 100,
  'Bonus Fixed': 0, 'Bonus Variable': 0, 'Commission Variable': 0,
  'Rental Income 1': 0, 'Rental Income 2': 0, 'Other Income': 0,
  'SE Audited Revenue': 100, 'SE VAT Revenue': 100, 'SE Full Doc CTO': 100,
  'SE Personal DAB': 100, 'SE Personal MCTO': 100,
  'SE Company DAB': 100, 'SE Company MCTO': 100,
};

// STL options — three-way
export type STLPreference = 'stl' | 'nstl' | 'both';
export const STL_OPTIONS: { value: STLPreference; label: string }[] = [
  { value: 'both', label: 'Both (STL + NSTL)' },
  { value: 'stl', label: 'Salary Transfer (STL)' },
  { value: 'nstl', label: 'No Salary Transfer (NSTL)' },
];

// LOB warning thresholds
export function getLOBWarning(lobMonths: number | null): { level: 'none' | 'warning' | 'critical'; message: string } {
  if (lobMonths === null) return { level: 'none', message: '' };
  if (lobMonths < 24) return {
    level: 'critical',
    message: 'Under 2 years LOB — RAK Bank only. All other banks require minimum 2 years trading history.'
  };
  if (lobMonths < 36) return {
    level: 'warning',
    message: 'Under 3 years LOB — full doc options limited. Most banks require 3 years trading history.'
  };
  return { level: 'none', message: '' };
}

// Extended tenor — banks that allow age 70 without conditions
export const BANKS_AGE_70_NO_CONDITIONS = ['ADIB', 'Mashreq'];
export const BANKS_AGE_70_WITH_CONDITIONS = ['DIB']; // conditions apply per case
// All other banks: age 70 possible with employer letter (no retirement age or retirement at 70)

export function calculateExtendedTenor(dob: Date | null, employmentType: string): number {
  if (!dob) return 300;
  const ageMonths = getAgeFromDob(dob)?.totalMonths ?? 0;
  return Math.min(300, Math.max(0, 70 * 12 - ageMonths - 3));
}

export const LIABILITY_TYPES = [
  'Personal Loan 1 EMI', 'Personal Loan 2 EMI', 'Auto Loan 1 EMI', 'Auto Loan 2 EMI',
  'Credit Card 1 Limit', 'Credit Card 2 Limit', 'Credit Card 3 Limit',
  'Home Loan Existing EMI 1', 'Home Loan Existing EMI 2', 'Employer Loan EMI',
  'Overdraft Limit', 'Credit Line Limit'
];

export const TRANSACTION_TYPES = [
  { value: 'resale', label: 'Resale' },
  { value: 'handover', label: 'Handover' },
  { value: 'handover_resale', label: 'Handover Resale' },
  { value: 'buyout', label: 'Buyout' },
  { value: 'buyout_equity', label: 'Buyout + Equity Release' },
  { value: 'equity', label: 'Pure Equity Release' },
  { value: 'off_plan', label: 'Off-Plan' },
  { value: 'construction_financing', label: 'Construction Financing' },
  { value: 'plot_financing', label: 'Plot Financing' },
  { value: 'building_financing', label: 'Building Financing' },
  { value: 'lrd_rental', label: 'Lease Rental Discounting (Rental Income Only)' },
  { value: 'lrd_rental_business', label: 'Lease Rental Discounting (Rental + Business Income)' },
  { value: 'bb_equity_business', label: 'Business Banking Equity Release (Business Income)' },
  { value: 'bb_equity_rental', label: 'Business Banking Equity Release (Rental Income)' },
  { value: 'bb_equity_both', label: 'Business Banking Equity Release (Both)' },
];

export const PROPERTY_TYPES = [
  'Apartment', 'Villa', 'Townhouse', 'Office Space', 'Warehouse',
  'Building (Commercial)', 'Building (Residential)', 'Other'
];

export const PURPOSES = ['Self Use', 'First Home', 'Second Home', 'Investment'];

export const LOAN_TYPE_PREFERENCES = [
  { value: 'best', label: 'Best (Any Product)' },
  { value: 'conventional', label: 'Conventional Only' },
  { value: 'islamic', label: 'Islamic Only' },
];

export const EMIRATES = [
  { value: 'dubai', label: 'Dubai' },
  { value: 'abu_dhabi', label: 'Abu Dhabi' },
  { value: 'sharjah', label: 'Sharjah' },
  { value: 'ajman', label: 'Ajman' },
  { value: 'umm_al_quwain', label: 'Umm Al Quwain' },
  { value: 'ras_al_khaimah', label: 'Ras Al Khaimah' },
  { value: 'fujairah', label: 'Fujairah' },
];

export function isLimitType(type: string) {
  return type.toLowerCase().includes('limit') || type.toLowerCase().includes('credit card');
}

export function normalizeToMonthly(amount: number, recurrence: string): number {
  switch (recurrence) {
    case 'quarterly': return amount / 3;
    case 'bi-annually': return amount / 6;
    case 'annually': return amount / 12;
    default: return amount;
  }
}

export function calculateStressEMI(loanAmount: number, stressRate: number, tenorMonths: number): number {
  if (!loanAmount || !stressRate || !tenorMonths) return 0;
  const r = stressRate / 100 / 12;
  if (r === 0) return loanAmount / tenorMonths;
  return (loanAmount * r * Math.pow(1 + r, tenorMonths)) / (Math.pow(1 + r, tenorMonths) - 1);
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(n);
}

/** Returns age as { years, months (total complete months) } */
export function getAgeFromDob(dob: Date | null): { years: number; totalMonths: number } | null {
  if (!dob) return null;
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  let months = now.getMonth() - dob.getMonth();
  if (months < 0) { years--; months += 12; }
  if (now.getDate() < dob.getDate()) {
    months--;
    if (months < 0) { years--; months += 12; }
  }
  return { years, totalMonths: years * 12 + months };
}

/** salaried = (65×12) - ageInMonths - 3, capped at 300; self-employed = (70×12) - ageInMonths - 3, capped at 300 */
export function getTenorEligibility(ageInMonths: number) {
  return {
    salaried: Math.min(Math.max(0, 65 * 12 - ageInMonths - 3), 300),
    selfEmployed: Math.min(Math.max(0, 70 * 12 - ageInMonths - 3), 300),
  };
}

export function calculateMaxTenor(dob: Date | null, employmentType: string): number {
  const age = getAgeFromDob(dob);
  if (age === null) return 300;
  const elig = getTenorEligibility(age.totalMonths);
  const max = employmentType === 'self_employed' ? elig.selfEmployed : elig.salaried;
  return Math.min(300, Math.max(0, max));
}
