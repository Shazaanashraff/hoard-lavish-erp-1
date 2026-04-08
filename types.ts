export interface Branch {
  id: string;
  name: string;
  address: string;
  phone: string;
  thermalPrinterName?: string;
  barcodePrinterName?: string;
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
  barcode?: string;
  barcode2?: string;
}

export interface CartItem extends Product {
  quantity: number;
  discount?: number;
}

export interface ExchangeLineItem extends CartItem {
  sourceType?: 'linked-sale' | 'no-sale-return' | 'new-exchange-item';
  sourceSaleId?: string;
  sourceInvoiceNumber?: string;
  sourceSaleItemIndex?: number;
  sourceLineKey?: string;
  originalQuantity?: number;
  manualReturnUnitPrice?: number;
  unitItemDiscount?: number;
  unitBillDiscountShare?: number;
  effectiveUnitPrice?: number;
  lineEffectiveTotal?: number;
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
  paymentMethod: 'Cash' | 'Card' | 'COD' | 'PayHere' | 'Online Transfer' | 'MintPay' | 'Cash+Card';
  cashAmount?: number;
  cardAmount?: number;
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
  type: 'IN' | 'OUT' | 'ADJUSTMENT' | 'TRANSFER';
  quantity: number;
  reason: string; // e.g., "Sale", "Restock", "Damage", "Theft", "Transfer"
  date: string;
}

export interface StockTransferItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
}

export interface StockTransfer {
  id: string;
  transferNumber: string;
  date: string;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  items: StockTransferItem[];
  totalItems: number;
  totalValue: number;
  status: 'COMPLETED';
  notes: string;
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
  affectsAccounting?: boolean; // if false, it's just a note and won't reduce profits
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
  paymentMethod: 'Cash' | 'Card' | 'COD' | 'PayHere' | 'Online Transfer' | 'MintPay' | 'Cash+Card';
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
  thermalPrinterName?: string; // Name of the thermal printer for silent printing
  barcodePrinterName?: string; // Name of the barcode label printer (e.g. XP-T451B)
}

export interface ExchangeRecord {
  id: string;
  exchangeNumber: string;
  date: string;
  originalSaleId?: string;
  originalInvoiceNumber?: string;
  returnedItems: ExchangeLineItem[];
  newItems: ExchangeLineItem[];
  returnedTotal: number;
  newTotal: number;
  difference: number; // positive = customer pays more, negative = store refunds/credit
  paymentMethod: 'Cash' | 'Card' | 'COD' | 'PayHere' | 'Online Transfer' | 'MintPay' | 'Cash+Card';
  refundMethod?: 'Cash' | 'Card' | 'COD' | 'PayHere' | 'Online Transfer' | 'MintPay' | 'Cash+Card';
  settlementType?: 'CUSTOMER_PAYS' | 'STORE_REFUND' | 'EVEN';
  exchangeBillDiscount?: number;
  customerId?: string;
  customerName?: string;
  branchId: string;
  branchName: string;
  description: string;
}

export type OfflineOperationType =
  | 'ADD_BRANCH'
  | 'UPDATE_BRANCH'
  | 'ADD_PRODUCT'
  | 'UPDATE_PRODUCT'
  | 'DELETE_PRODUCT'
  | 'ADD_CUSTOMER'
  | 'UPDATE_CUSTOMER'
  | 'DELETE_CUSTOMER'
  | 'COMPLETE_SALE'
  | 'UPDATE_SALE'
  | 'DELETE_SALE'
  | 'COMPLETE_EXCHANGE'
  | 'ADJUST_STOCK'
  | 'TRANSFER_STOCK'
  | 'ADD_CATEGORY'
  | 'REMOVE_CATEGORY'
  | 'ADD_BRAND'
  | 'REMOVE_BRAND'
  | 'ADD_SUPPLIER'
  | 'UPDATE_SUPPLIER'
  | 'DELETE_SUPPLIER'
  | 'RECORD_SUPPLIER_EXPENSE'
  | 'ADD_SUPPLIER_TRANSACTION'
  | 'UPDATE_SUPPLIER_TRANSACTION'
  | 'DELETE_SUPPLIER_TRANSACTION'
  | 'ADD_EXPENSE'
  | 'DELETE_EXPENSE'
  | 'ADD_DAMAGED_GOOD'
  | 'DELETE_DAMAGED_GOOD'
  | 'ADD_USER'
  | 'UPDATE_USER'
  | 'DELETE_USER'
  | 'UPDATE_SETTINGS';

export type OfflineOperationStatus = 'PENDING' | 'SYNCING' | 'FAILED';

export interface OfflineQueueItem {
  id: string;
  operation: OfflineOperationType;
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
  status: OfflineOperationStatus;
  errorMessage?: string;
}

export interface OfflinePopupState {
  id: string;
  title: string;
  message: string;
  operation: OfflineOperationType;
  variant: 'queued' | 'synced';
}

export type ViewState = 'DASHBOARD' | 'POS' | 'INVENTORY' | 'CUSTOMERS' | 'HISTORY' | 'BRANCHES' | 'SUPPLIERS' | 'ACCOUNTING' | 'SETTINGS' | 'OFFLINE';
