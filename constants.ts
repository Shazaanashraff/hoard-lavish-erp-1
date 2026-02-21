import { Product, Customer, Branch, Supplier, Expense, User, AppSettings } from './types';

export const INITIAL_CATEGORIES = ['Clothing', 'Accessories', 'Footwear', 'Bags', 'Jewelry'];
export const INITIAL_BRANDS = ['Hoard Lavish', 'Gucci', 'Prada', 'Hermes', 'Rolex', 'Generic'];
export const EXPENSE_CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Marketing', 'Maintenance', 'Software', 'Other'];
export const CUR = 'LKR';

export const INITIAL_BRANCHES: Branch[] = [
  {
    id: 'b1',
    name: 'Main HQ Store',
    address: '123 Fashion Ave, New York, NY',
    phone: '212-555-0199'
  },
  {
    id: 'b2',
    name: 'Downtown Boutique',
    address: '456 Soho St, New York, NY',
    phone: '212-555-0200'
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
  enableLowStockAlerts: true
};

export const INITIAL_SUPPLIERS: Supplier[] = [
  {
    id: 's1',
    name: 'Global Fabrics Ltd',
    contactPerson: 'Sarah Jenkins',
    phone: '212-555-0900',
    email: 'orders@globalfabrics.com',
    address: '89 Textile District, New York, NY'
  },
  {
    id: 's2',
    name: 'Italian Leather Co.',
    contactPerson: 'Marco Rossi',
    phone: '212-555-0922',
    email: 'marco@italianleather.com',
    address: 'Via Roma 12, Milan, Italy'
  },
  {
    id: 's3',
    name: 'Elite Accessories',
    contactPerson: 'David Chen',
    phone: '212-555-0945',
    email: 'd.chen@eliteacc.com',
    address: '456 Fashion Way, Los Angeles, CA'
  }
];

export const INITIAL_EXPENSES: Expense[] = [
  {
    id: 'e1',
    description: 'Monthly Store Rent',
    amount: 4500,
    category: 'Rent',
    date: new Date().toISOString(),
    branchId: 'b1',
    branchName: 'Main HQ Store'
  },
  {
    id: 'e2',
    description: 'Electricity Bill',
    amount: 320,
    category: 'Utilities',
    date: new Date().toISOString(),
    branchId: 'b1',
    branchName: 'Main HQ Store'
  },
  {
    id: 'e3',
    description: 'Instagram Ad Campaign',
    amount: 500,
    category: 'Marketing',
    date: new Date().toISOString(),
    branchId: 'b2',
    branchName: 'Downtown Boutique'
  }
];

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: '1',
    name: 'Midnight Velvet Gown',
    category: 'Clothing',
    brand: 'Hoard Lavish',
    price: 1250.00,
    costPrice: 600.00,
    stock: 12,
    branchStock: { 'b1': 8, 'b2': 4 },
    minStockLevel: 5,
    sku: 'DRS-001',
    description: 'A luxurious velvet gown in deep midnight blue, perfect for evening galas.'
  },
  {
    id: '2',
    name: 'Italian Leather Loafers',
    category: 'Footwear',
    brand: 'Gucci',
    price: 350.00,
    costPrice: 150.00,
    stock: 25,
    branchStock: { 'b1': 15, 'b2': 10 },
    minStockLevel: 10,
    sku: 'SHO-002',
    description: 'Handcrafted Italian leather loafers with a classic finish.'
  },
  {
    id: '3',
    name: 'Silk Scarf - Hermes Style',
    category: 'Accessories',
    brand: 'Hermes',
    price: 180.00,
    costPrice: 60.00,
    stock: 50,
    branchStock: { 'b1': 30, 'b2': 20 },
    minStockLevel: 15,
    sku: 'ACC-003',
    description: '100% pure silk scarf with intricate floral patterns.'
  },
  {
    id: '4',
    name: 'Cashmere Trench Coat',
    category: 'Clothing',
    brand: 'Burberry',
    price: 890.00,
    costPrice: 400.00,
    stock: 3,
    branchStock: { 'b1': 2, 'b2': 1 },
    minStockLevel: 5,
    sku: 'COT-004',
    description: 'Beige cashmere blend trench coat, suitable for all seasons.'
  },
  {
    id: '5',
    name: 'Gold Plated Cufflinks',
    category: 'Accessories',
    brand: 'Generic',
    price: 120.00,
    costPrice: 40.00,
    stock: 30,
    branchStock: { 'b1': 20, 'b2': 10 },
    minStockLevel: 8,
    sku: 'ACC-005',
    description: 'Minimalist gold plated cufflinks for formal attire.'
  },
  {
    id: '6',
    name: 'Structured Tote Bag',
    category: 'Bags',
    brand: 'Prada',
    price: 450.00,
    costPrice: 180.00,
    stock: 15,
    branchStock: { 'b1': 10, 'b2': 5 },
    minStockLevel: 5,
    sku: 'BAG-006',
    description: 'Durable structured tote with ample space for daily essentials.'
  },
];

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'c1',
    name: 'Alice Vandetta',
    phone: '555-0101',
    email: 'alice@example.com',
    loyaltyPoints: 120,
    totalSpent: 4500
  },
  {
    id: 'c2',
    name: 'Julian Thorne',
    phone: '555-0102',
    email: 'j.thorne@example.com',
    loyaltyPoints: 45,
    totalSpent: 890
  },
  {
    id: 'c3',
    name: 'Miranda Priestly',
    phone: '555-0103',
    email: 'editor@runway.com',
    loyaltyPoints: 9000,
    totalSpent: 150000
  }
];
