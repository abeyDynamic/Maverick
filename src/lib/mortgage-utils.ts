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

export const INCOME_TYPES = [
  'Basic Salary', 'Housing Allowance', 'Transport Allowance', 'Air Ticket Allowance',
  'Educational Allowance', 'Travel Allowance', 'Bonus Fixed', 'Bonus Variable',
  'Commission Variable', 'Rental Income 1', 'Rental Income 2', 'Other Income'
];

export const INCOME_DEFAULTS: Record<string, number> = {
  'Basic Salary': 100, 'Housing Allowance': 100, 'Transport Allowance': 100,
  'Air Ticket Allowance': 100, 'Educational Allowance': 100, 'Travel Allowance': 100,
  'Bonus Fixed': 0, 'Bonus Variable': 0, 'Commission Variable': 0,
  'Rental Income 1': 0, 'Rental Income 2': 0, 'Other Income': 0
};

export const LIABILITY_TYPES = [
  'Personal Loan 1 EMI', 'Personal Loan 2 EMI', 'Auto Loan 1 EMI', 'Auto Loan 2 EMI',
  'Credit Card 1 Limit', 'Credit Card 2 Limit', 'Credit Card 3 Limit',
  'Home Loan Existing EMI 1', 'Home Loan Existing EMI 2', 'Employer Loan EMI',
  'Overdraft Limit', 'Credit Line Limit'
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

export function calculateMaxTenor(dob: Date | null, employmentType: string): number {
  if (!dob) return 300;
  const capAge = employmentType === 'self_employed' ? 70 : 65;
  const now = new Date();
  const ageMs = now.getTime() - dob.getTime();
  const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365.25);
  const remainingYears = capAge - ageYears;
  const remainingMonths = Math.floor(remainingYears * 12) - 3;
  return Math.min(300, Math.max(0, remainingMonths));
}
