import { Product, Customer, Branch, Supplier, Expense, User, AppSettings } from './types';

export const INITIAL_CATEGORIES = ['Clothing', 'Accessories', 'Footwear', 'Bags', 'Jewelry'];
export const INITIAL_BRANDS = ['Hoard Lavish', 'Gucci', 'Prada', 'Hermes', 'Rolex', 'Generic'];
export const EXPENSE_CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Marketing', 'Maintenance', 'Software', 'Food', 'Transport', 'Other'];
export const CUR = 'LKR';

export const INITIAL_BRANCHES: Branch[] = [
  {
    id: 'b1',
    name: 'Ethul Kotte',
    address: '123 Fashion Ave, New York, NY',
    phone: '212-555-0199'
  },
  {
    id: 'b2',
    name: 'Mount-Lavinia',
    address: '456 Soho St, New York, NY',
    phone: '212-555-0200',
    thermalPrinterName: 'XP - Q80B'
  }
];

export const INITIAL_USERS: User[] = [
  { id: 'u1', name: 'Admin User', role: 'ADMIN', pin: '1234' },
  { id: 'u2', name: 'John Cashier', role: 'CASHIER', pin: '0000', branchId: 'b1' },
  { id: 'u3', name: 'Sarah Manager', role: 'MANAGER', pin: '1111', branchId: 'b2' }
];

export const INITIAL_SETTINGS: AppSettings = {
  storeName: 'Hoard Lavish',
  currencySymbol: '$',
  taxRate: 0.08,
  enableLowStockAlerts: true,
  thermalPrinterName: '',
  barcodePrinterName: '',
};


const getTodayDateString = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}T00:00:00.000Z`;
};

