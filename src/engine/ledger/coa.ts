// Chart of accounts. Numbers follow the layout in docs/DESIGN.md §10.1. Accounts are added
// as divisions arrive; existing numbers never change meaning (saves depend on them).

export type AccountType = 'asset' | 'contraAsset' | 'liability' | 'equity' | 'revenue' | 'cogs' | 'otherIncome' | 'expense' | 'tax';

/** Where an account appears in the cash flow statement (indirect method). */
export type CashFlowSection = 'cash' | 'operating' | 'investing' | 'financing' | 'income';

/** Income statement grouping for co-op format statements. */
export type IsGroup =
  | 'sales' | 'cogs' | 'serviceIncome' | 'personnel' | 'depreciation' | 'repairs' | 'insurance' | 'utilities'
  | 'badDebt' | 'otherOpex' | 'interest' | 'patronageIncome' | 'otherIncome' | 'tax';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  cf: CashFlowSection;
  isGroup?: IsGroup;
  /** Balance sheet grouping. */
  bsGroup?: 'currentAssets' | 'investments' | 'fixedAssets' | 'currentLiabilities' | 'longTermLiabilities' | 'memberEquity';
}

const a = (id: string, name: string, type: AccountType, cf: CashFlowSection, extra: Partial<Account> = {}): Account => ({ id, name, type, cf, ...extra });

export const ACCOUNTS: Account[] = [
  a('1000', 'Cash', 'asset', 'cash', { bsGroup: 'currentAssets' }),
  a('1100', 'Accounts receivable', 'asset', 'operating', { bsGroup: 'currentAssets' }),
  a('1150', 'Allowance for bad debt', 'contraAsset', 'operating', { bsGroup: 'currentAssets' }),
  a('1160', 'Rebates receivable', 'asset', 'operating', { bsGroup: 'currentAssets' }),
  a('1170', 'Notes receivable', 'asset', 'operating', { bsGroup: 'currentAssets' }),
  a('1200', 'Grain inventory', 'asset', 'operating', { bsGroup: 'currentAssets' }),
  a('1210', 'Agronomy inventory', 'asset', 'operating', { bsGroup: 'currentAssets' }),
  a('1220', 'Feed inventory', 'asset', 'operating', { bsGroup: 'currentAssets' }),
  a('1230', 'Energy inventory', 'asset', 'operating', { bsGroup: 'currentAssets' }),
  a('1240', 'Retail inventory', 'asset', 'operating', { bsGroup: 'currentAssets' }),
  a('1300', 'Prepaid supplier deposits', 'asset', 'operating', { bsGroup: 'currentAssets' }),
  a('1310', 'Margin deposits', 'asset', 'operating', { bsGroup: 'currentAssets' }),
  a('1320', 'Open grain contracts - gains', 'asset', 'operating', { bsGroup: 'currentAssets' }),
  a('1330', 'Prepaid expenses', 'asset', 'operating', { bsGroup: 'currentAssets' }),
  a('1400', 'Investments in other cooperatives', 'asset', 'investing', { bsGroup: 'investments' }),
  a('1500', 'Land', 'asset', 'investing', { bsGroup: 'fixedAssets' }),
  a('1510', 'Buildings & structures', 'asset', 'investing', { bsGroup: 'fixedAssets' }),
  a('1520', 'Machinery & equipment', 'asset', 'investing', { bsGroup: 'fixedAssets' }),
  a('1530', 'Vehicles', 'asset', 'investing', { bsGroup: 'fixedAssets' }),
  a('1540', 'Construction in progress', 'asset', 'investing', { bsGroup: 'fixedAssets' }),
  a('1590', 'Accumulated depreciation', 'contraAsset', 'operating', { bsGroup: 'fixedAssets' }),
  a('2000', 'Seasonal line of credit', 'liability', 'financing', { bsGroup: 'currentLiabilities' }),
  a('2100', 'Accounts payable', 'liability', 'operating', { bsGroup: 'currentLiabilities' }),
  a('2110', 'Grain payables & deferred payment', 'liability', 'operating', { bsGroup: 'currentLiabilities' }),
  a('2120', 'Open grain contracts - losses', 'liability', 'operating', { bsGroup: 'currentLiabilities' }),
  a('2130', 'Customer prepayments', 'liability', 'operating', { bsGroup: 'currentLiabilities' }),
  a('2140', 'Accrued expenses', 'liability', 'operating', { bsGroup: 'currentLiabilities' }),
  a('2150', 'Patronage payable', 'liability', 'financing', { bsGroup: 'currentLiabilities' }),
  a('2160', 'Equity redemptions payable', 'liability', 'financing', { bsGroup: 'currentLiabilities' }),
  a('2170', 'Income tax payable', 'liability', 'operating', { bsGroup: 'currentLiabilities' }),
  a('2200', 'Current portion of term debt', 'liability', 'financing', { bsGroup: 'currentLiabilities' }),
  a('2300', 'Long-term debt', 'liability', 'financing', { bsGroup: 'longTermLiabilities' }),
  a('2310', 'Deferred taxes', 'liability', 'operating', { bsGroup: 'longTermLiabilities' }),
  a('3000', 'Membership stock', 'equity', 'financing', { bsGroup: 'memberEquity' }),
  a('3100', 'Preferred stock', 'equity', 'financing', { bsGroup: 'memberEquity' }),
  a('3200', 'Allocated equity - qualified', 'equity', 'financing', { bsGroup: 'memberEquity' }),
  a('3300', 'Allocated equity - nonqualified', 'equity', 'financing', { bsGroup: 'memberEquity' }),
  a('3400', 'Unallocated retained earnings', 'equity', 'financing', { bsGroup: 'memberEquity' }),
  a('3900', 'Net savings to be distributed', 'equity', 'financing', { bsGroup: 'memberEquity' }),
  // Income statement
  a('4000', 'Sales', 'revenue', 'income', { isGroup: 'sales' }),
  a('5000', 'Cost of goods sold', 'cogs', 'income', { isGroup: 'cogs' }),
  a('6000', 'Service & other operating income', 'revenue', 'income', { isGroup: 'serviceIncome' }),
  a('7000', 'Salaries & wages', 'expense', 'income', { isGroup: 'personnel' }),
  a('7010', 'Benefits & payroll taxes', 'expense', 'income', { isGroup: 'personnel' }),
  a('7100', 'Depreciation', 'expense', 'income', { isGroup: 'depreciation' }),
  a('7200', 'Repairs & maintenance', 'expense', 'income', { isGroup: 'repairs' }),
  a('7300', 'Insurance', 'expense', 'income', { isGroup: 'insurance' }),
  a('7400', 'Utilities', 'expense', 'income', { isGroup: 'utilities' }),
  a('7500', 'Bad debt expense', 'expense', 'income', { isGroup: 'badDebt' }),
  a('7600', 'Professional fees', 'expense', 'income', { isGroup: 'otherOpex' }),
  a('7610', 'Director fees & meetings', 'expense', 'income', { isGroup: 'otherOpex' }),
  a('7620', 'Office & administrative', 'expense', 'income', { isGroup: 'otherOpex' }),
  a('7630', 'Training & safety', 'expense', 'income', { isGroup: 'otherOpex' }),
  a('7640', 'Property taxes', 'expense', 'income', { isGroup: 'otherOpex' }),
  a('7650', 'Rent & leases', 'expense', 'income', { isGroup: 'otherOpex' }),
  a('7660', 'Environmental remediation', 'expense', 'income', { isGroup: 'otherOpex' }),
  a('7670', 'Due diligence & transaction costs', 'expense', 'income', { isGroup: 'otherOpex' }),
  a('8000', 'Interest expense', 'expense', 'income', { isGroup: 'interest' }),
  a('8050', 'Interest income', 'otherIncome', 'income', { isGroup: 'interest' }),
  a('8100', 'Patronage income - regionals', 'otherIncome', 'income', { isGroup: 'patronageIncome' }),
  a('8110', 'Patronage income - lender', 'otherIncome', 'income', { isGroup: 'patronageIncome' }),
  a('8200', 'Other income / gain on sale', 'otherIncome', 'income', { isGroup: 'otherIncome' }),
  a('9000', 'Income tax expense', 'tax', 'income', { isGroup: 'tax' }),
];

export const ACCOUNT_BY_ID: Record<string, Account> = Object.fromEntries(ACCOUNTS.map((x) => [x.id, x]));

export const isIncomeAccount = (id: string): boolean => ACCOUNT_BY_ID[id]?.cf === 'income';

export const key = (account: string, division: string): string => `${account}|${division}`;
export const splitKey = (k: string): [string, string] => {
  const i = k.indexOf('|');
  return [k.slice(0, i), k.slice(i + 1)];
};
