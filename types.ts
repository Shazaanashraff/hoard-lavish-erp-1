export interface Branch {
  id: string;
  name: string;
  address: string;
  phone: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  brand: string;
  price: number;
  costPrice: number;
  stock: number; // Total stock across all branches
  branchStock: Record<string, number>; // Stock per branch
  minStockLevel: number;
  sku: string;
  description: string;
  imageUrl?: string;
  color?: string;
  size?: string;
}

export interface CartItem extends Product {
  quantity: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  loyaltyPoints: number;
  totalSpent: number;
}

export interface SalesRecord {
  id: string;
  invoiceNumber: string;
  date: string; // ISO string
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  totalAmount: number;
  totalCost: number;
  paymentMethod: 'Cash' | 'Card' | 'Digital';
  customerId?: string;
  customerName?: string;
  branchId: string;
  branchName: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  branchId: string;
  branchName: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  reason: string; // e.g., "Sale", "Restock", "Damage", "Theft"
  date: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
}

export interface SupplierTransaction {
  id: string;
  supplierId: string;
  supplierName: string;
  date: string;
  amount: number;
  type: 'PAYMENT' | 'REFUND';
  reference: string; // e.g., Invoice #
  notes: string;
}

export interface DamagedGood {
  id: string;
  productId: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  quantity: number;
  unitPrice: number;
  totalLoss: number;
  reason: string;
  date: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string; // e.g. Rent, Utilities, Salary
  date: string;
  branchId: string;
  branchName: string;
}

export type Role = 'ADMIN' | 'MANAGER' | 'CASHIER';

export interface User {
  id: string;
  name: string;
  role: Role;
  pin: string; // Simple PIN for login simulation
  branchId?: string; // If assigned to specific branch
}

export interface AppSettings {
  storeName: string;
  currencySymbol: string;
  taxRate: number;
  enableLowStockAlerts: boolean;
}

export type ViewState = 'DASHBOARD' | 'POS' | 'INVENTORY' | 'CUSTOMERS' | 'HISTORY' | 'BRANCHES' | 'SUPPLIERS' | 'ACCOUNTING' | 'SETTINGS';
