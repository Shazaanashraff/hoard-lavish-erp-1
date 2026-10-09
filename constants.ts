import { Product, Customer, Branch, Supplier, Expense, User, AppSettings } from './types';

export const INITIAL_CATEGORIES = ['Clothing', 'Accessories', 'Footwear', 'Bags', 'Jewelry'];
export const INITIAL_BRANDS = ['Hoard Lavish', 'Gucci', 'Prada', 'Hermes', 'Rolex', 'Generic'];
export const EXPENSE_CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Marketing', 'Maintenance', 'Software', 'Food', 'Transport', 'Other'];
export const CUR = 'LKR';

export const INITIAL_BRANCHES: Branch[] = [
  {
    id: 'b0000000-0000-0000-0000-000000000001',
    name: 'Ethul Kotte',
    address: 'veediya bandara mw , ethul kotte ',
    phone: '0741774321',
    thermalPrinterName: 'POSPrinter POS80',
    barcodePrinterName: 'Xprinter XP-T451B',
  },
  {
    id: 'b0000000-0000-0000-0000-000000000002',
    name: 'Mount Lavinia',
    address: '273 GALLE RD MOUNT LAVINIA',
    phone: '0741774321',
    thermalPrinterName: 'POS-80 (copy 1)',
    barcodePrinterName: 'Xprinter XP-T451B',
  },
];

// Bcrypt hashes of the demo PINs (1234 / 0000 / 1111) — this bootstrap list is
// only used local-first, when Supabase isn't configured at all (see
// isSupabaseConfigured() in context/StoreContext.tsx). Never plaintext, same
// as everything sourced from the database.
export const INITIAL_USERS: User[] = [
  { id: 'u1', name: 'Admin User', role: 'ADMIN', pinHash: '$2b$10$q5D2hzmhXkNB7nfZYERc7uQUEXi8.c1rdYuNHhyYJmQMXvfe5/4Qu' },
  { id: 'u2', name: 'John Cashier', role: 'CASHIER', pinHash: '$2b$10$xHkgqmFwwTtn4M9JzsciYui2.lbyrnBUICaLZeNAA2X77zYhYoEla', branchId: 'b0000000-0000-0000-0000-000000000001' },
  { id: 'u3', name: 'Sarah Manager', role: 'MANAGER', pinHash: '$2b$10$1ZIgu35cFE2iaD5l6rn6MeYq7x3nVT2t3LG69IW5yRbUhkKaeW9kC', branchId: 'b0000000-0000-0000-0000-000000000002' }
];

export const INITIAL_SETTINGS: AppSettings = {
  storeName: 'Hoard Lavish',
  currencySymbol: '$',
  taxRate: 0.08,
  enableLowStockAlerts: true,
  thermalPrinterName: '',
  barcodePrinterName: '',
  smsEnabled: false,
  smsSenderId: '',
  smsDailyLimit: 500,
};


const getTodayDateString = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}T00:00:00.000Z`;
};
