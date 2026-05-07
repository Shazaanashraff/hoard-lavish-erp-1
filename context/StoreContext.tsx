import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Product, CartItem, SalesRecord, ViewState, Customer, StockMovement, Branch, Supplier, SupplierTransaction, Expense, User, AppSettings, DamagedGood, StockTransfer, StockTransferItem, ExchangeRecord, OfflineQueueItem, OfflinePopupState, OfflineOperationType } from '../types';
import { INITIAL_CATEGORIES, INITIAL_BRANDS, INITIAL_BRANCHES, INITIAL_USERS, INITIAL_SETTINGS } from '../constants';
import * as db from '../services/supabaseService';
import { supabase } from '../services/supabaseClient';
import { calculateCartTotals } from '../utils/cart';
import { generateInvoiceNumber, generateTransferNumber } from '../utils/generators';
import { isLikelyConnectivityIssue, extractDbErrorMessage, DbLikeError } from '../utils/errors';
import { isUuid, makeUuid } from '../utils/ids';

interface StoreContextType {
  products: Product[];
  customers: Customer[];
  cart: CartItem[];
  salesHistory: SalesRecord[];
  stockHistory: StockMovement[];
  stockTransfers: StockTransfer[];
  exchangeHistory: ExchangeRecord[];
  categories: string[];
  brands: string[];
  branches: Branch[];
  suppliers: Supplier[];
  supplierTransactions: SupplierTransaction[];
  expenses: Expense[];
  damagedGoods: DamagedGood[];
  users: User[];
  settings: AppSettings;
  currentBranch: Branch;
  currentUser: User | null;
  currentView: ViewState;
  isLoading: boolean;
  dbError: string | null;
  offlineQueue: OfflineQueueItem[];
  offlinePopup: OfflinePopupState | null;

  // Actions
  setBranch: (branchId: string) => void;
  addBranch: (branch: Omit<Branch, 'id'> & { id?: string }) => void;
  updateBranch: (id: string, updates: Partial<Branch>) => void;

  addProduct: (product: Product) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string, mode?: 'BLOCK_IF_LINKED' | 'KEEP_SALES_SNAPSHOT' | 'DELETE_LINKED_SALES') => Promise<boolean>;
  getProductSalesUsage: (id: string) => Promise<number>;

  addCustomer: (customer: Customer) => void;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;

  addToCart: (product: Product) => string;
  removeFromCart: (productId: string) => void;
  updateCartItemDiscount: (productId: string, discount: number) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;

  completeSale: (
    paymentMethod: SalesRecord['paymentMethod'],
    discount: number,
    customerId?: string,
    paymentBreakdown?: { cashAmount?: number; cardAmount?: number }
  ) => SalesRecord;
  updateSale: (saleId: string, updatedItems: CartItem[], discount: number, customerId?: string) => SalesRecord;
  deleteSale: (saleId: string) => void;
  completeExchange: (exchange: Omit<ExchangeRecord, 'id' | 'exchangeNumber' | 'date' | 'branchId' | 'branchName'>) => ExchangeRecord;
  adjustStock: (productId: string, quantity: number, type: 'IN' | 'OUT' | 'ADJUSTMENT', reason: string) => void;
  transferStock: (toBranchId: string, items: StockTransferItem[], notes: string) => StockTransfer;
  deleteTransfer: (transferId: string) => void;
  refreshTransfers: () => Promise<void>;

  addCategory: (category: string) => void;
  removeCategory: (category: string) => void;
  addBrand: (brand: string) => void;
  removeBrand: (brand: string) => void;

  addSupplier: (supplier: Supplier) => void;
  updateSupplier: (id: string, updates: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => void;
  recordSupplierExpense: (transaction: SupplierTransaction, stockAdjustments: Array<{ productId: string; quantity: number; reason: string }>) => void;
  addSupplierTransaction: (transaction: SupplierTransaction) => void;
  updateSupplierTransaction: (id: string, updates: Partial<SupplierTransaction>) => void;
  deleteSupplierTransaction: (id: string) => void;

  addExpense: (expense: Expense) => void;
  deleteExpense: (id: string) => void;

  addDamagedGood: (record: DamagedGood) => void;
  deleteDamagedGood: (id: string) => void;

  addUser: (user: User) => void;
  updateUser: (id: string, updates: Partial<User>) => void;
  deleteUser: (id: string) => void;

  updateSettings: (settings: Partial<AppSettings>) => void;

  exportData: () => string;
  importData: (jsonData: string) => boolean;

  syncData: () => Promise<{ success: boolean; productCount?: number; error?: string }>;
  syncOfflineQueue: () => Promise<void>;
  retryOfflineItem: (id: string) => Promise<boolean>;
  removeOfflineItem: (id: string) => void;
  dismissOfflinePopup: () => void;
  dismissDbError: () => void;
  lastSyncTime: Date | null;
  isCloudConnected: boolean;
  realtimeStatus: 'CONNECTING' | 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR' | null;

  login: (user: User) => void;
  logout: () => void;
  setView: (view: ViewState) => void;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

// Helper: check if Supabase is configured
const isSupabaseConfigured = (): boolean => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return !!(url && key && url !== 'YOUR_SUPABASE_URL' && key !== 'YOUR_SUPABASE_ANON_KEY');
};

const OFFLINE_QUEUE_STORAGE_KEY = 'hoard_offline_queue_v1';

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [branches, setBranches] = useState<Branch[]>(INITIAL_BRANCHES);
  const [currentBranch, setCurrentBranch] = useState<Branch>(INITIAL_BRANCHES[0]);

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [salesHistory, setSalesHistory] = useState<SalesRecord[]>([]);
  const [stockHistory, setStockHistory] = useState<StockMovement[]>([]);
  const [stockTransfers, setStockTransfers] = useState<StockTransfer[]>([]);
  const [exchangeHistory, setExchangeHistory] = useState<ExchangeRecord[]>([]);
  const [categories, setCategories] = useState<string[]>(INITIAL_CATEGORIES);
  const [brands, setBrands] = useState<string[]>(INITIAL_BRANDS);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierTransactions, setSupplierTransactions] = useState<SupplierTransaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [damagedGoods, setDamagedGoods] = useState<DamagedGood[]>([]);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);

  const [currentView, setCurrentView] = useState<ViewState>('DASHBOARD');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isCloudConnected, setIsCloudConnected] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<'CONNECTING' | 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR' | null>(null);
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueItem[]>([]);
  const [offlinePopup, setOfflinePopup] = useState<OfflinePopupState | null>(null);
  const [isSyncingOfflineQueue, setIsSyncingOfflineQueue] = useState(false);

  const useSupabase = isSupabaseConfigured();

  const operationLabel = useCallback((operation: OfflineOperationType): string => {
    switch (operation) {
      case 'ADD_BRANCH': return 'Add Branch';
      case 'UPDATE_BRANCH': return 'Update Branch';
      case 'ADD_PRODUCT': return 'Add Product';
      case 'UPDATE_PRODUCT': return 'Update Product';
      case 'DELETE_PRODUCT': return 'Delete Product';
      case 'ADD_CUSTOMER': return 'Add Customer';
      case 'UPDATE_CUSTOMER': return 'Update Customer';
      case 'DELETE_CUSTOMER': return 'Delete Customer';
      case 'COMPLETE_SALE': return 'Complete Sale';
      case 'UPDATE_SALE': return 'Update Sale';
      case 'DELETE_SALE': return 'Delete Sale';
      case 'COMPLETE_EXCHANGE': return 'Complete Exchange';
      case 'ADJUST_STOCK': return 'Adjust Stock';
      case 'TRANSFER_STOCK': return 'Transfer Stock';
      case 'ADD_CATEGORY': return 'Add Category';
      case 'REMOVE_CATEGORY': return 'Remove Category';
      case 'ADD_BRAND': return 'Add Brand';
      case 'REMOVE_BRAND': return 'Remove Brand';
      case 'ADD_SUPPLIER': return 'Add Supplier';
      case 'UPDATE_SUPPLIER': return 'Update Supplier';
      case 'DELETE_SUPPLIER': return 'Delete Supplier';
      case 'RECORD_SUPPLIER_EXPENSE': return 'Record Supplier Expense';
      case 'ADD_SUPPLIER_TRANSACTION': return 'Add Supplier Transaction';
      case 'UPDATE_SUPPLIER_TRANSACTION': return 'Update Supplier Transaction';
      case 'DELETE_SUPPLIER_TRANSACTION': return 'Delete Supplier Transaction';
      case 'ADD_EXPENSE': return 'Add Expense';
      case 'DELETE_EXPENSE': return 'Delete Expense';
      case 'ADD_DAMAGED_GOOD': return 'Add Damaged Good';
      case 'DELETE_DAMAGED_GOOD': return 'Delete Damaged Good';
      case 'ADD_USER': return 'Add User';
      case 'UPDATE_USER': return 'Update User';
      case 'DELETE_USER': return 'Delete User';
      case 'UPDATE_SETTINGS': return 'Update Settings';
      default: return operation;
    }
  }, []);

  const enqueueOfflineOperation = useCallback((operation: OfflineOperationType, payload: Record<string, unknown>, reason?: string) => {
    const item: OfflineQueueItem = {
      id: `${operation}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      operation,
      payload,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: 'PENDING',
      errorMessage: reason,
    };
    setOfflineQueue(prev => [item, ...prev]);
    setOfflinePopup({
      id: item.id,
      operation,
      title: 'Saved Offline',
      message: `${operationLabel(operation)} was saved locally and queued for sync.`,
      variant: 'queued',
    });
  }, [operationLabel]);

  const isQueueableError = useCallback((err: unknown): boolean => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    if (isLikelyConnectivityIssue(err)) return true;
    if (err && typeof err === 'object') {
      const dbErr = err as DbLikeError;
      const code = (dbErr.code || '').toUpperCase();
      if (code === 'PGRST301' || code === 'PGRST302' || code === '57014') return true;
    }
    return false;
  }, []);

  const runOfflineOperation = useCallback(async (item: OfflineQueueItem) => {
    const p = item.payload;
    switch (item.operation) {
      case 'ADD_BRANCH':
        await db.insertBranch(p.branch as Omit<Branch, 'id'> & { id?: string });
        await db.initializeBranchStock(p.branchId as string, p.productIds as string[]);
        return;
      case 'UPDATE_BRANCH':
        await db.updateBranch(p.id as string, p.updates as Partial<Branch>);
        return;
      case 'ADD_PRODUCT':
        await db.insertProduct(p.product as Product, p.branches as Branch[]);
        return;
      case 'UPDATE_PRODUCT':
        await db.updateProduct(p.id as string, p.updates as Partial<Product>);
        return;
      case 'DELETE_PRODUCT':
        await db.deleteProduct(p.id as string, p.mode as 'BLOCK_IF_LINKED' | 'KEEP_SALES_SNAPSHOT' | 'DELETE_LINKED_SALES');
        return;
      case 'ADD_CUSTOMER':
        await db.insertCustomer(p.customer as Customer);
        return;
      case 'UPDATE_CUSTOMER':
        await db.updateCustomer(p.id as string, p.updates as Partial<Customer>);
        return;
      case 'DELETE_CUSTOMER':
        await db.deleteCustomer(p.id as string);
        return;
      case 'COMPLETE_SALE':
      case 'UPDATE_SALE':
        await db.completeSaleRPC(p.sale as SalesRecord);
        return;
      case 'DELETE_SALE':
        await db.voidSaleRPC(p.saleId as string);
        return;
      case 'COMPLETE_EXCHANGE': {
        const stockRows = p.stockRows as Array<{ productId: string; branchId: string; quantity: number }>;
        const stockMovements = p.stockMovements as StockMovement[];
        for (const row of stockRows) {
          await db.upsertBranchStock(row.productId, row.branchId, row.quantity);
        }
        for (const movement of stockMovements) {
          await db.insertStockMovement(movement);
        }
        if (p.customerUpdate) {
          const cu = p.customerUpdate as { id: string; updates: Partial<Customer> };
          await db.updateCustomer(cu.id, cu.updates);
        }
        await db.insertExchange(p.exchange as ExchangeRecord);
        return;
      }
      case 'ADJUST_STOCK':
        await db.upsertBranchStock(p.productId as string, p.branchId as string, p.quantity as number);
        await db.insertStockMovement(p.movement as StockMovement);
        return;
      case 'TRANSFER_STOCK': {
        const stockRows = p.stockRows as Array<{ productId: string; branchId: string; quantity: number }>;
        const stockMovements = p.stockMovements as StockMovement[];
        for (const row of stockRows) {
          await db.upsertBranchStock(row.productId, row.branchId, row.quantity);
        }
        for (const movement of stockMovements) {
          await db.insertStockMovement(movement);
        }
        await db.insertStockTransfer(p.transfer as StockTransfer);
        return;
      }
      case 'ADD_CATEGORY':
        await db.insertCategory(p.category as string);
        return;
      case 'REMOVE_CATEGORY':
        await db.deleteCategory(p.category as string);
        return;
      case 'ADD_BRAND':
        await db.insertBrand(p.brand as string);
        return;
      case 'REMOVE_BRAND':
        await db.deleteBrand(p.brand as string);
        return;
      case 'ADD_SUPPLIER':
        await db.insertSupplier(p.supplier as Supplier);
        return;
      case 'UPDATE_SUPPLIER':
        await db.updateSupplier(p.id as string, p.updates as Partial<Supplier>);
        return;
      case 'DELETE_SUPPLIER':
        await db.deleteSupplier(p.id as string);
        return;
      case 'RECORD_SUPPLIER_EXPENSE': {
        await db.insertSupplierTransaction(p.transaction as SupplierTransaction);

        const stockRows = p.stockRows as Array<{ productId: string; branchId: string; quantity: number }>;
        const stockMovements = p.stockMovements as StockMovement[];
        for (const row of stockRows) {
          await db.upsertBranchStock(row.productId, row.branchId, row.quantity);
        }
        for (const movement of stockMovements) {
          await db.insertStockMovement(movement);
        }
        return;
      }
      case 'ADD_SUPPLIER_TRANSACTION':
        await db.insertSupplierTransaction(p.transaction as SupplierTransaction);
        return;
      case 'UPDATE_SUPPLIER_TRANSACTION':
        await db.updateSupplierTransaction(p.id as string, p.updates as Partial<SupplierTransaction>);
        return;
      case 'DELETE_SUPPLIER_TRANSACTION':
        await db.deleteSupplierTransaction(p.id as string);
        return;
      case 'ADD_EXPENSE':
        await db.insertExpense(p.expense as Expense);
        return;
      case 'DELETE_EXPENSE':
        await db.deleteExpense(p.id as string);
        return;
      case 'ADD_DAMAGED_GOOD':
        await db.insertDamagedGood(p.record as DamagedGood);
        if (p.stockRow) {
          const row = p.stockRow as { productId: string; branchId: string; quantity: number };
          await db.upsertBranchStock(row.productId, row.branchId, row.quantity);
        }
        if (p.stockMovement) {
          await db.insertStockMovement(p.stockMovement as StockMovement);
        }
        return;
      case 'DELETE_DAMAGED_GOOD':
        if (p.shouldDeleteRemote !== false) {
          await db.deleteDamagedGood(p.id as string);
        }
        if (p.stockRow) {
          const row = p.stockRow as { productId: string; branchId: string; quantity: number };
          await db.upsertBranchStock(row.productId, row.branchId, row.quantity);
        }
        if (p.stockMovement) {
          await db.insertStockMovement(p.stockMovement as StockMovement);
        }
        return;
      case 'ADD_USER':
        await db.insertUser(p.user as User);
        return;
      case 'UPDATE_USER':
        await db.updateUser(p.id as string, p.updates as Partial<User>);
        return;
      case 'DELETE_USER':
        await db.deleteUser(p.id as string);
        return;
      case 'UPDATE_SETTINGS':
        await db.updateSettings(p.updates as Partial<AppSettings>);
        return;
      default:
        return;
    }
  }, []);

  const executeWithOfflineQueue = useCallback(async (
    operation: OfflineOperationType,
    payload: Record<string, unknown>,
    fn: () => Promise<unknown>,
    options?: { fallback?: string; operationType?: 'checkout' | 'general'; forceQueueOnError?: boolean; onNonQueueableError?: (error: unknown) => void }
  ): Promise<boolean> => {
    if (!useSupabase) return true;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      enqueueOfflineOperation(operation, payload, 'No internet connection.');
      return false;
    }

    try {
      await fn();
      return true;
    } catch (err: unknown) {
      if (isQueueableError(err) || options?.forceQueueOnError) {
        enqueueOfflineOperation(operation, payload, extractDbErrorMessage(err, options?.fallback, options?.operationType || 'general'));
        return false;
      }
      // Call error handler for non-queueable errors (like RLS/permission failures)
      if (options?.onNonQueueableError) {
        options.onNonQueueableError(err);
      }
      console.error('Supabase operation failed:', err);
      setDbError(extractDbErrorMessage(err, options?.fallback, options?.operationType || 'general'));
      return false;
    }
  }, [enqueueOfflineOperation, isQueueableError, useSupabase]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setOfflineQueue(parsed.filter((item): item is OfflineQueueItem => !!item && typeof item === 'object' && !!item.id && !!item.operation));
      }
    } catch (err) {
      console.error('Failed to load offline queue', err);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(offlineQueue));
    } catch (err) {
      console.error('Failed to persist offline queue', err);
    }
  }, [offlineQueue]);

  // ---- Data loading ----
  useEffect(() => {
    if (!useSupabase) {
      // Fall back to localStorage
      const saved = localStorage.getItem('hoard_data_v2');
      if (saved) {
        try {
          const data = JSON.parse(saved);
          if (data.branches) setBranches(data.branches);
          if (data.salesHistory) setSalesHistory(data.salesHistory);
          if (data.customers) setCustomers(data.customers);
          if (data.products) setProducts(data.products);
          if (data.categories) setCategories(data.categories);
          if (data.brands) setBrands(data.brands);
          if (data.stockHistory) setStockHistory(data.stockHistory);
          if (data.stockTransfers) setStockTransfers(data.stockTransfers);
          if (data.exchangeHistory) setExchangeHistory(data.exchangeHistory);
          if (data.suppliers) setSuppliers(data.suppliers);
          if (data.supplierTransactions) setSupplierTransactions(data.supplierTransactions);
          if (data.expenses) setExpenses(data.expenses);
          if (data.users) setUsers(data.users);
          if (data.settings) setSettings(data.settings);
          if (data.damagedGoods) setDamagedGoods(data.damagedGoods);
        } catch (e) {
          console.error("Failed to load saved data", e);
        }
      }
      setIsLoading(false);
      setHasLoaded(true);
      return;
    }

    // Load from Supabase
    const loadAll = async () => {
      setIsLoading(true);
      try {
        const [
          branchesData,
          productsData,
          customersData,
          salesData,
          stockData,
          suppliersData,
          supplierTxnData,
          expensesData,
          usersData,
          settingsData,
          categoriesData,
          brandsData,
          damagedGoodsData,
          exchangesData,
        ] = await Promise.all([
          db.fetchBranches(),
          db.fetchProductsWithStock(),
          db.fetchCustomers(),
          db.fetchSales(),
          db.fetchStockMovements(),
          db.fetchSuppliers(),
          db.fetchSupplierTransactions(),
          db.fetchExpenses(),
          db.fetchUsers(),
          db.fetchSettings(),
          db.fetchCategories(),
          db.fetchBrands(),
          db.fetchDamagedGoods(),
          db.fetchExchanges().catch(() => []),
        ]);

        // Load stock transfers separately (table may not exist yet)
        let stockTransfersData: StockTransfer[] = [];
        try {
          stockTransfersData = await db.fetchStockTransfers();
        } catch (_) {
          // Table may not exist yet — ignore
        }
        // Fallback: if Supabase returned nothing, try localStorage
        if (stockTransfersData.length === 0) {
          try {
            const savedTransfers = localStorage.getItem('hoard_stock_transfers');
            if (savedTransfers) {
              stockTransfersData = JSON.parse(savedTransfers);
            }
          } catch (_) { /* ignore parse errors */ }
        }

        let exchangeData: ExchangeRecord[] = exchangesData;
        if (exchangeData.length === 0) {
          try {
            const savedExchanges = localStorage.getItem('hoard_exchange_history');
            if (savedExchanges) {
              exchangeData = JSON.parse(savedExchanges);
            }
          } catch (_) { /* ignore parse errors */ }
        }

        setBranches(branchesData);
        setProducts(productsData);
        setCustomers(customersData);
        setSalesHistory(salesData);
        setStockHistory(stockData);
        setSuppliers(suppliersData);
        setSupplierTransactions(supplierTxnData);
        setExpenses(expensesData);
        setUsers(usersData);
        setSettings(settingsData);
        setCategories(categoriesData);
        setBrands(brandsData);
        setDamagedGoods(damagedGoodsData);
        setStockTransfers(stockTransfersData);
        setExchangeHistory(exchangeData);
        if (branchesData.length > 0) setCurrentBranch(branchesData[0]);
        setIsCloudConnected(true);
        setLastSyncTime(new Date());
      } catch (err: unknown) {
        console.error('Failed to load data from Supabase', err);
        setDbError(extractDbErrorMessage(err, 'Failed to load data', 'general'));
        setIsCloudConnected(false);
      } finally {
        setIsLoading(false);
        setHasLoaded(true);
      }
    };
    loadAll();
  }, [useSupabase]);

  // ---- Supabase Realtime subscriptions for cross-device sync ----
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshFromSupabase = useCallback(async (): Promise<{ success: boolean; productCount?: number; error?: string }> => {
    if (!useSupabase) return { success: false, error: 'Cloud database not configured. Using local storage only.' };
    try {
      const [
        productsData,
        customersData,
        salesData,
        stockData,
        suppliersData,
        supplierTxnData,
        expensesData,
        categoriesData,
        brandsData,
        damagedGoodsData,
        exchangesData,
      ] = await Promise.all([
        db.fetchProductsWithStock(),
        db.fetchCustomers(),
        db.fetchSales(),
        db.fetchStockMovements(),
        db.fetchSuppliers(),
        db.fetchSupplierTransactions(),
        db.fetchExpenses(),
        db.fetchCategories(),
        db.fetchBrands(),
        db.fetchDamagedGoods(),
        db.fetchExchanges().catch(() => []),
      ]);

      let stockTransfersData: StockTransfer[] = [];
      try {
        stockTransfersData = await db.fetchStockTransfers();
      } catch (_) { /* table may not exist */ }

      setProducts(productsData);
      setCustomers(customersData);
      setSalesHistory(salesData);
      setStockHistory(stockData);
      setSuppliers(suppliersData);
      setSupplierTransactions(supplierTxnData);
      setExpenses(expensesData);
      setCategories(categoriesData);
      setBrands(brandsData);
      setDamagedGoods(damagedGoodsData);
      setExchangeHistory(exchangesData);
      setStockTransfers(stockTransfersData);
      setLastSyncTime(new Date());
      setIsCloudConnected(true);
      return { success: true, productCount: productsData.length };
    } catch (err: unknown) {
      console.error('Failed to refresh data from Supabase', err);
      const errorMsg = extractDbErrorMessage(err, 'Failed to sync with cloud database', 'general');
      setDbError(errorMsg);
      setIsCloudConnected(false);
      return { success: false, error: errorMsg };
    }
  }, [useSupabase]);

  // Debounced refresh to avoid flooding on rapid changes
  const debouncedRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    refreshTimeoutRef.current = setTimeout(() => {
      refreshFromSupabase();
    }, 1000);
  }, [refreshFromSupabase]);

  // Keep stable refs so the realtime effect doesn't re-run on every render
  const debouncedRefreshRef = useRef(debouncedRefresh);
  useEffect(() => { debouncedRefreshRef.current = debouncedRefresh; }, [debouncedRefresh]);

  useEffect(() => {
    if (!useSupabase || !hasLoaded) return;

    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let channelRef: ReturnType<typeof supabase.channel> | null = null;
    let retryCount = 0;
    let unmounted = false;

    const subscribe = () => {
      if (channelRef) supabase.removeChannel(channelRef);

      const onEvent = () => debouncedRefreshRef.current();
      const channel = supabase
        .channel(`db-sync-${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, onEvent)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'product_branch_stock' }, onEvent)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, onEvent)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, onEvent)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_items' }, onEvent)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'exchanges' }, onEvent)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'exchange_items' }, onEvent)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements' }, onEvent)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_transfers' }, onEvent)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, onEvent)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'brands' }, onEvent)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, onEvent)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_transactions' }, onEvent)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, onEvent)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'damaged_goods' }, onEvent)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'branches' }, onEvent)
        .subscribe((status) => {
          console.log('Realtime subscription status:', status);
          if (unmounted) return;
          setRealtimeStatus(status as 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR');
          if (status === 'SUBSCRIBED') {
            retryCount = 0;
          }
          if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
            retryCount++;
            const delay = Math.min(5000 * retryCount, 30000);
            console.log(`Realtime: retrying in ${delay / 1000}s (attempt ${retryCount})...`);
            retryTimeout = setTimeout(() => {
              if (!unmounted) {
                setRealtimeStatus('CONNECTING');
                subscribe();
              }
            }, delay);
          }
        });
      channelRef = channel;
    };

    setRealtimeStatus('CONNECTING');
    subscribe();

    // Also set up periodic polling as fallback (every 30 seconds)
    const pollInterval = setInterval(() => {
      debouncedRefreshRef.current();
    }, 30000);
    pollingRef.current = pollInterval;

    return () => {
      unmounted = true;
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (retryTimeout) clearTimeout(retryTimeout);
      if (channelRef) supabase.removeChannel(channelRef);
      setRealtimeStatus('CLOSED');
    };
  }, [useSupabase, hasLoaded]);

  // ---- localStorage fallback persistence ----
  useEffect(() => {
    if (!hasLoaded) return; // Don't save until initial data has been loaded
    if (useSupabase) {
      // Even with Supabase, persist stockTransfers & exchangeHistory to localStorage as fallback
      // (their tables may not exist yet if migrations weren't applied)
      localStorage.setItem('hoard_stock_transfers', JSON.stringify(stockTransfers));
      localStorage.setItem('hoard_exchange_history', JSON.stringify(exchangeHistory));
      return;
    }
    const data = {
      branches, salesHistory, customers, products, categories, brands,
      stockHistory, stockTransfers, exchangeHistory, suppliers, supplierTransactions, expenses, users, settings, damagedGoods
    };
    localStorage.setItem('hoard_data_v2', JSON.stringify(data));
  }, [hasLoaded, useSupabase, branches, salesHistory, customers, products, categories, brands, stockHistory, stockTransfers, exchangeHistory, suppliers, supplierTransactions, expenses, users, settings, damagedGoods]);

  // ============================================================
  // BRANCH ACTIONS
  // ============================================================
  const setBranch = (branchId: string) => {
    const branch = branches.find(b => b.id === branchId);
    if (branch) {
      setCurrentBranch(branch);
      clearCart();
    }
  };

  const addBranch = (branchInput: Omit<Branch, 'id'> & { id?: string }) => {
    if (!useSupabase) {
      const localBranch: Branch = {
        ...branchInput,
        id: isUuid(branchInput.id || '') ? (branchInput.id as string) : makeUuid(),
      };
      setBranches(prev => [...prev, localBranch]);
      setProducts(prev => prev.map(p => ({
        ...p,
        branchStock: { ...p.branchStock, [localBranch.id]: 0 }
      })));
      return;
    }

    void (async () => {
      const localBranch: Branch = {
        ...branchInput,
        id: isUuid(branchInput.id || '') ? (branchInput.id as string) : makeUuid(),
      };
      const branchForSave: Omit<Branch, 'id'> & { id?: string } = { ...branchInput, id: localBranch.id };
      setBranches(prev => [...prev, localBranch]);
      setProducts(prev => prev.map(p => ({
        ...p,
        branchStock: { ...p.branchStock, [localBranch.id]: 0 }
      })));

      const ok = await executeWithOfflineQueue(
        'ADD_BRANCH',
        { branch: branchForSave, branchId: localBranch.id, productIds: products.map(p => p.id) },
        async () => {
          const savedBranch = await db.insertBranch(branchForSave);
          setBranches(prev => prev.map(b => b.id === localBranch.id ? savedBranch : b));
          await db.initializeBranchStock(savedBranch.id, products.map(p => p.id));
        },
        { fallback: 'Failed to add branch' }
      );

      if (!ok) return;
    })();
  };

  const updateBranch = (id: string, updates: Partial<Branch>) => {
    setBranches(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
    if (currentBranch.id === id) {
      setCurrentBranch(prev => ({ ...prev, ...updates }));
    }
    void executeWithOfflineQueue(
      'UPDATE_BRANCH',
      { id, updates },
      () => db.updateBranch(id, updates),
      { fallback: 'Failed to update branch' }
    );
  };

  // ============================================================
  // PRODUCT ACTIONS
  // ============================================================
  const addProduct = (product: Product) => {
    const branchStock = { ...product.branchStock };
    branches.forEach(b => {
      if (branchStock[b.id] === undefined) branchStock[b.id] = 0;
    });
    const totalStock = Object.values(branchStock).reduce((a, b) => a + b, 0);
    const fullProduct = { ...product, id: isUuid(product.id) ? product.id : makeUuid(), branchStock, stock: totalStock };

    if (!useSupabase) {
      setProducts(prev => [...prev, fullProduct]);
      return;
    }

    void (async () => {
      const ok = await executeWithOfflineQueue(
        'ADD_PRODUCT',
        { product: fullProduct, branches },
        async () => {
          const savedProduct = await db.insertProduct(fullProduct, branches);
          setProducts(prev => prev.map(p => p.id === fullProduct.id ? savedProduct : p));
        },
        { fallback: 'Failed to add product' }
      );
      if (ok) return;
      setProducts(prev => [...prev, fullProduct]);
    })();
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    const existing = products.find(p => p.id === id);
    setProducts(prev => prev.map(p => {
      if (p.id === id) {
        const updated = { ...p, ...updates };
        if (updates.branchStock) {
          updated.stock = Object.values(updated.branchStock).reduce((a: number, b: number) => a + b, 0);
        }
        return updated;
      }
      return p;
    }));
    void executeWithOfflineQueue(
      'UPDATE_PRODUCT',
      { id, updates },
      () => db.updateProduct(id, updates),
      { fallback: 'Failed to update product' }
    );

    // Log edit event so it appears in dashboard activity feed
    if (existing) {
      const today = new Date();
      const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const editLog: StockMovement = {
        id: makeUuid(),
        productId: id,
        productName: existing.name,
        branchId: currentBranch.id,
        branchName: currentBranch.name,
        type: 'ADJUSTMENT',
        quantity: 0,
        reason: `Product edited: ${existing.name}`,
        date: `${localDate}T00:00:00.000Z`
      };
      setStockHistory(prev => [editLog, ...prev]);
    }
  };

  const getProductSalesUsage = async (id: string): Promise<number> => {
    if (!useSupabase) return 0;
    try {
      return await db.getProductLinkedSalesCount(id);
    } catch (err: unknown) {
      console.error('Failed to check product sales usage:', err);
      setDbError(extractDbErrorMessage(err, 'Failed to check product sales usage'));
      return 0;
    }
  };

  const deleteProduct = async (id: string, mode: 'BLOCK_IF_LINKED' | 'KEEP_SALES_SNAPSHOT' | 'DELETE_LINKED_SALES' = 'BLOCK_IF_LINKED'): Promise<boolean> => {
    if (!useSupabase) {
      setProducts(prev => prev.filter(p => p.id !== id));
      return true;
    }

    try {
      const ok = await executeWithOfflineQueue(
        'DELETE_PRODUCT',
        { id, mode },
        () => db.deleteProduct(id, mode),
        { fallback: 'Failed to delete product' }
      );
      if (!ok) {
        setProducts(prev => prev.filter(p => p.id !== id));
        return true;
      }
      const syncResult = await refreshFromSupabase();
      if (!syncResult.success) {
        setProducts(prev => prev.filter(p => p.id !== id));
      }
      return true;
    } catch (err: unknown) {
      console.error('Failed to delete product:', err);
      setDbError(extractDbErrorMessage(err, 'Failed to delete product'));
      return false;
    }
  };

  // ============================================================
  // CUSTOMER ACTIONS
  // ============================================================
  const addCustomer = (customer: Customer) => {
    const tempId = isUuid(customer.id) ? customer.id : makeUuid();
    const normalizedCustomer = { ...customer, id: tempId };
    setCustomers(prev => [...prev, normalizedCustomer]);
    void executeWithOfflineQueue(
      'ADD_CUSTOMER',
      { customer: normalizedCustomer },
      async () => {
        const savedCustomer = await db.insertCustomer(normalizedCustomer);
        setCustomers(prev => prev.map(c => c.id === tempId ? savedCustomer : c));
      },
      { fallback: 'Failed to add customer' }
    );
  };

  const updateCustomer = (id: string, updates: Partial<Customer>) => {
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    void executeWithOfflineQueue(
      'UPDATE_CUSTOMER',
      { id, updates },
      () => db.updateCustomer(id, updates),
      { fallback: 'Failed to update customer' }
    );
  };

  const deleteCustomer = (id: string) => {
    setCustomers(prev => prev.filter(c => c.id !== id));
    void executeWithOfflineQueue(
      'DELETE_CUSTOMER',
      { id },
      () => db.deleteCustomer(id),
      { fallback: 'Failed to delete customer' }
    );
  };

  // ============================================================
  // CART ACTIONS
  // ============================================================
  const addToCart = (product: Product): string => {
    const currentStock = product.branchStock[currentBranch.id] || 0;
    const cartItem = cart.find(item => item.id === product.id);
    const currentQty = cartItem ? cartItem.quantity : 0;

    if (currentQty + 1 > currentStock) {
      return `Insufficient stock in ${currentBranch.name}. Available: ${currentStock}`;
    }

    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1, discount: 0 }];
    });
    return 'ok';
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  const updateCartItemDiscount = (productId: string, discount: number) => {
    setCart(prev => prev.map(item => 
      item.id === productId ? { ...item, discount: Math.max(0, discount) } : item
    ));
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const currentStock = product.branchStock[currentBranch.id] || 0;
    if (quantity > currentStock) {
      return; // Don't update if exceeds stock
    }
    
    setCart(prev => prev.map(item => 
      item.id === productId ? { ...item, quantity } : item
    ));
  };

  const clearCart = () => setCart([]);

  // ============================================================
  // SALE COMPLETION
  // ============================================================
  const completeSale = (
    paymentMethod: SalesRecord['paymentMethod'],
    discount: number,
    customerId?: string,
    paymentBreakdown?: { cashAmount?: number; cardAmount?: number }
  ): SalesRecord => {
    const { subtotal, tax, total, totalCost, discount: effDiscount } = calculateCartTotals(cart, discount, 0);

    const customer = customers.find(c => c.id === customerId);

    // Use local date only (without time) to match expense date format
    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const newSale: SalesRecord = {
      id: Math.random().toString(36).substr(2, 9),
      invoiceNumber: generateInvoiceNumber(),
      date: `${localDate}T${String(today.getHours()).padStart(2,'0')}:${String(today.getMinutes()).padStart(2,'0')}:${String(today.getSeconds()).padStart(2,'0')}.000`,
      items: [...cart],
      subtotal,
      discount: effDiscount,
      tax,
      totalAmount: total,
      totalCost,
      paymentMethod,
      cashAmount: paymentMethod === 'Cash+Card' ? Math.max(0, paymentBreakdown?.cashAmount ?? 0) : undefined,
      cardAmount: paymentMethod === 'Cash+Card' ? Math.max(0, paymentBreakdown?.cardAmount ?? 0) : undefined,
      customerId,
      customerName: customer ? customer.name : undefined,
      branchId: currentBranch.id,
      branchName: currentBranch.name
    };

    // Deduct stock and log movements (optimistic local update)
    const newStockLogs: StockMovement[] = [];
    const newProducts = products.map(p => {
      const cartItem = cart.find(c => c.id === p.id);
      if (cartItem) {
        newStockLogs.push({
          id: Math.random().toString(36).substr(2, 9),
          productId: p.id,
          productName: p.name,
          branchId: currentBranch.id,
          branchName: currentBranch.name,
          type: 'OUT',
          quantity: cartItem.quantity,
          reason: `Sale #${newSale.invoiceNumber}`,
          date: `${localDate}T00:00:00.000Z`
        });

        const currentBranchStock = p.branchStock[currentBranch.id] || 0;
        const newBranchStock = Math.max(0, currentBranchStock - cartItem.quantity);
        const updatedBranchStock = { ...p.branchStock, [currentBranch.id]: newBranchStock };
        const newTotalStock = Object.values(updatedBranchStock).reduce((a: number, b: number) => a + b, 0);

        return { ...p, branchStock: updatedBranchStock, stock: newTotalStock };
      }
      return p;
    });

    if (customer) {
      setCustomers(prev => prev.map(c =>
        c.id === customerId
          ? { ...c, totalSpent: c.totalSpent + total, loyaltyPoints: c.loyaltyPoints + Math.floor(total / 10) }
          : c
      ));
    }

    setStockHistory(prev => [...newStockLogs, ...prev]);
    setProducts(newProducts);
    setSalesHistory(prev => [newSale, ...prev]);
    clearCart();

    // Persist to Supabase (the RPC handles everything atomically)
    void executeWithOfflineQueue(
      'COMPLETE_SALE',
      { sale: newSale },
      () => db.completeSaleRPC(newSale),
      { fallback: 'Checkout failed', operationType: 'checkout' }
    );

    return newSale;
  };

  // ============================================================
  // UPDATE SALE (for editing recent sales within 10 minutes)
  // ============================================================
  const updateSale = (saleId: string, updatedItems: CartItem[], discount: number, customerId?: string): SalesRecord => {
    const originalSale = salesHistory.find(s => s.id === saleId);
    if (!originalSale) {
      throw new Error('Sale not found');
    }

    const customer = customers.find(c => c.id === customerId);
    const { subtotal, tax, total, totalCost, discount: effDiscount } = calculateCartTotals(updatedItems, discount, 0);

    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const updatedSale: SalesRecord = {
      ...originalSale,
      items: [...updatedItems],
      subtotal,
      discount: effDiscount,
      tax,
      totalAmount: total,
      totalCost,
      customerId,
      customerName: customer ? customer.name : undefined,
      date: `${localDate}T${String(today.getHours()).padStart(2,'0')}:${String(today.getMinutes()).padStart(2,'0')}:${String(today.getSeconds()).padStart(2,'0')}.000`,
    };

    // Calculate stock adjustments
    const stockAdjustments = new Map<string, number>(); // productId -> net quantity change

    // Original items: these need to be returned to stock (positive adjustment)
    originalSale.items.forEach(item => {
      const current = stockAdjustments.get(item.id) || 0;
      stockAdjustments.set(item.id, current + item.quantity);
    });

    // Updated items: these need to be removed from stock (negative adjustment)
    updatedItems.forEach(item => {
      const current = stockAdjustments.get(item.id) || 0;
      stockAdjustments.set(item.id, current - item.quantity);
    });

    // Apply stock adjustments
    const newStockLogs: StockMovement[] = [];
    const newProducts = products.map(p => {
      const adjustment = stockAdjustments.get(p.id);
      if (adjustment !== undefined && adjustment !== 0) {
        const currentBranchStock = p.branchStock[currentBranch.id] || 0;
        const newBranchStock = Math.max(0, currentBranchStock + adjustment);
        const updatedBranchStock = { ...p.branchStock, [currentBranch.id]: newBranchStock };
        const newTotalStock = Object.values(updatedBranchStock).reduce((a: number, b: number) => a + b, 0);

        newStockLogs.push({
          id: Math.random().toString(36).substr(2, 9),
          productId: p.id,
          productName: p.name,
          branchId: currentBranch.id,
          branchName: currentBranch.name,
          type: adjustment > 0 ? 'IN' : 'OUT',
          quantity: Math.abs(adjustment),
          reason: `Sale Edit #${updatedSale.invoiceNumber}`,
          date: `${localDate}T00:00:00.000Z`
        });

        return { ...p, branchStock: updatedBranchStock, stock: newTotalStock };
      }
      return p;
    });

    // Update customer loyalty if changed
    if (originalSale.customerId !== customerId) {
      // Remove points from old customer
      if (originalSale.customerId) {
        setCustomers(prev => prev.map(c =>
          c.id === originalSale.customerId
            ? { ...c, totalSpent: Math.max(0, c.totalSpent - originalSale.totalAmount), loyaltyPoints: Math.max(0, c.loyaltyPoints - Math.floor(originalSale.totalAmount / 10)) }
            : c
        ));
      }
      // Add points to new customer
      if (customerId) {
        setCustomers(prev => prev.map(c =>
          c.id === customerId
            ? { ...c, totalSpent: c.totalSpent + total, loyaltyPoints: c.loyaltyPoints + Math.floor(total / 10) }
            : c
        ));
      }
    } else if (customerId) {
      // Same customer, adjust the difference
      const difference = total - originalSale.totalAmount;
      setCustomers(prev => prev.map(c =>
        c.id === customerId
          ? { ...c, totalSpent: c.totalSpent + difference, loyaltyPoints: c.loyaltyPoints + Math.floor(difference / 10) }
          : c
      ));
    }

    setStockHistory(prev => [...newStockLogs, ...prev]);
    setProducts(newProducts);
    setSalesHistory(prev => prev.map(s => s.id === saleId ? updatedSale : s));

    // Persist to Supabase
    void executeWithOfflineQueue(
      'UPDATE_SALE',
      { sale: updatedSale },
      () => db.completeSaleRPC(updatedSale),
      { fallback: 'Checkout update failed', operationType: 'checkout' }
    ); // Reuse the same RPC (it will update if exists)

    return updatedSale;
  };

  const deleteSale = (saleId: string): void => {
    const sale = salesHistory.find(s => s.id === saleId);
    if (!sale) return;

    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Restore stock for every item in the deleted sale
    const newStockLogs: StockMovement[] = [];
    const newProducts = products.map(p => {
      const soldItem = sale.items.find(i => i.id === p.id);
      if (soldItem) {
        const currentBranchStock = p.branchStock[sale.branchId] || 0;
        const newBranchStock = currentBranchStock + soldItem.quantity;
        const updatedBranchStock = { ...p.branchStock, [sale.branchId]: newBranchStock };
        const newTotalStock = Object.values(updatedBranchStock).reduce((a: number, b: number) => a + b, 0);
        newStockLogs.push({
          id: Math.random().toString(36).substr(2, 9),
          productId: p.id,
          productName: p.name,
          branchId: sale.branchId,
          branchName: sale.branchName,
          type: 'IN',
          quantity: soldItem.quantity,
          reason: `Sale Voided #${sale.invoiceNumber}`,
          date: `${localDate}T${String(today.getHours()).padStart(2,'0')}:${String(today.getMinutes()).padStart(2,'0')}:${String(today.getSeconds()).padStart(2,'0')}.000`
        });
        return { ...p, branchStock: updatedBranchStock, stock: newTotalStock };
      }
      return p;
    });

    // Reverse customer loyalty points
    if (sale.customerId) {
      setCustomers(prev => prev.map(c =>
        c.id === sale.customerId
          ? { ...c, totalSpent: Math.max(0, c.totalSpent - sale.totalAmount), loyaltyPoints: Math.max(0, c.loyaltyPoints - Math.floor(sale.totalAmount / 10)) }
          : c
      ));
    }

    setStockHistory(prev => [...newStockLogs, ...prev]);
    setProducts(newProducts);
    setSalesHistory(prev => prev.filter(s => s.id !== saleId));

    if (useSupabase) {
      void executeWithOfflineQueue(
        'DELETE_SALE',
        { saleId },
        async () => {
          await db.voidSaleRPC(saleId);
          await refreshFromSupabase();
        },
        { fallback: 'Failed to void sale' }
      );
    }
  };

  // ============================================================
  // EXCHANGE
  // ============================================================
  const completeExchange = (exchangeData: Omit<ExchangeRecord, 'id' | 'exchangeNumber' | 'date' | 'branchId' | 'branchName'> & { voidSaleId?: string }): ExchangeRecord => {
    const exchangeNumber = `EX-${Date.now().toString(36).toUpperCase()}`;
    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Guard: prevent over-return against original sale lines across previous exchanges.
    if (exchangeData.originalSaleId) {
      const originalSale = salesHistory.find(s => s.id === exchangeData.originalSaleId);
      if (!originalSale) {
        throw new Error('Original sale could not be found for this exchange.');
      }

      const requestedByLine = new Map<number, number>();
      exchangeData.returnedItems.forEach(item => {
        if (typeof item.sourceSaleItemIndex !== 'number') return;
        requestedByLine.set(item.sourceSaleItemIndex, (requestedByLine.get(item.sourceSaleItemIndex) || 0) + Math.max(0, item.quantity));
      });

      const previouslyReturnedByLine = new Map<number, number>();
      exchangeHistory
        .filter(ex => ex.originalSaleId === exchangeData.originalSaleId)
        .forEach(ex => {
          ex.returnedItems.forEach(item => {
            if (typeof item.sourceSaleItemIndex !== 'number') return;
            previouslyReturnedByLine.set(item.sourceSaleItemIndex, (previouslyReturnedByLine.get(item.sourceSaleItemIndex) || 0) + Math.max(0, item.quantity));
          });
        });

      for (const [lineIndex, requestedQty] of requestedByLine.entries()) {
        const saleLine = originalSale.items[lineIndex];
        if (!saleLine) {
          throw new Error(`Invalid return line reference detected for sale ${originalSale.invoiceNumber}.`);
        }
        const alreadyReturned = previouslyReturnedByLine.get(lineIndex) || 0;
        const available = Math.max(0, saleLine.quantity - alreadyReturned);
        if (requestedQty > available) {
          throw new Error(`Return quantity exceeds available quantity for ${saleLine.name}. Available: ${available}, Requested: ${requestedQty}.`);
        }
      }
    }

    const exchange: ExchangeRecord = {
      ...exchangeData,
      id: Math.random().toString(36).substr(2, 9),
      exchangeNumber,
      date: `${localDate}T00:00:00.000Z`,
      branchId: currentBranch.id,
      branchName: currentBranch.name,
    };
    // Remove voidSaleId from exchange (it's only used for control logic, not persisted)
    delete (exchange as any).voidSaleId;

    // Restock returned items
    const newStockLogs: StockMovement[] = [];
    let updatedProducts = [...products];

    exchange.returnedItems.forEach(item => {
      updatedProducts = updatedProducts.map(p => {
        if (p.id !== item.id) return p;
        const curStock = p.branchStock[currentBranch.id] || 0;
        const newStock = curStock + item.quantity;
        const updatedBS = { ...p.branchStock, [currentBranch.id]: newStock };
        const totalStock = Object.values(updatedBS).reduce((a: number, b: number) => a + b, 0);
        return { ...p, branchStock: updatedBS, stock: totalStock };
      });
      newStockLogs.push({
        id: Math.random().toString(36).substr(2, 9),
        productId: item.id,
        productName: item.name,
        branchId: currentBranch.id,
        branchName: currentBranch.name,
        type: 'IN',
        quantity: item.quantity,
        reason: `Exchange Return (${exchangeNumber})${item.size || item.color ? ` [${[item.size ? `Size:${item.size}` : '', item.color ? `Color:${item.color}` : ''].filter(Boolean).join(', ')}]` : ''}`,
        date: `${localDate}T00:00:00.000Z`,
      });
    });

    // Deduct new items stock
    exchange.newItems.forEach(item => {
      updatedProducts = updatedProducts.map(p => {
        if (p.id !== item.id) return p;
        const curStock = p.branchStock[currentBranch.id] || 0;
        const newStock = Math.max(0, curStock - item.quantity);
        const updatedBS = { ...p.branchStock, [currentBranch.id]: newStock };
        const totalStock = Object.values(updatedBS).reduce((a: number, b: number) => a + b, 0);
        return { ...p, branchStock: updatedBS, stock: totalStock };
      });
      newStockLogs.push({
        id: Math.random().toString(36).substr(2, 9),
        productId: item.id,
        productName: item.name,
        branchId: currentBranch.id,
        branchName: currentBranch.name,
        type: 'OUT',
        quantity: item.quantity,
        reason: `Exchange Issue (${exchangeNumber})${item.size || item.color ? ` [${[item.size ? `Size:${item.size}` : '', item.color ? `Color:${item.color}` : ''].filter(Boolean).join(', ')}]` : ''}`,
        date: `${localDate}T00:00:00.000Z`,
      });
    });

    // Loyalty/Spend adjustments: reverse returned value, add new value.
    if (exchange.customerId) {
      const returnedValue = Math.max(0, exchange.returnedTotal);
      const newValue = Math.max(0, exchange.newTotal);
      const loyaltyDelta = Math.floor(newValue / 10) - Math.floor(returnedValue / 10);
      const spentDelta = newValue - returnedValue;

      setCustomers(prev => prev.map(c => {
        if (c.id !== exchange.customerId) return c;
        return {
          ...c,
          totalSpent: Math.max(0, c.totalSpent + spentDelta),
          loyaltyPoints: Math.max(0, c.loyaltyPoints + loyaltyDelta),
        };
      }));
    }

    setProducts(updatedProducts);
    setStockHistory(prev => [...newStockLogs, ...prev]);
    setExchangeHistory(prev => [exchange, ...prev]);

    const allItems = [...exchange.returnedItems, ...exchange.newItems];
    const stockRows = allItems
      .map(item => {
        const product = updatedProducts.find(p => p.id === item.id);
        if (!product) return null;
        return {
          productId: item.id,
          branchId: currentBranch.id,
          quantity: product.branchStock[currentBranch.id] || 0,
        };
      })
      .filter((row): row is { productId: string; branchId: string; quantity: number } => !!row);

    const customerUpdate = exchange.customerId
      ? (() => {
        const customer = customers.find(c => c.id === exchange.customerId);
        if (!customer) return null;
        const returnedValue = Math.max(0, exchange.returnedTotal);
        const newValue = Math.max(0, exchange.newTotal);
        const loyaltyDelta = Math.floor(newValue / 10) - Math.floor(returnedValue / 10);
        const spentDelta = newValue - returnedValue;
        return {
          id: customer.id,
          updates: {
            totalSpent: Math.max(0, customer.totalSpent + spentDelta),
            loyaltyPoints: Math.max(0, customer.loyaltyPoints + loyaltyDelta),
          },
        };
      })()
      : null;

    // Persist stock changes to Supabase
    void executeWithOfflineQueue('COMPLETE_EXCHANGE', {
      exchange,
      stockRows,
      stockMovements: newStockLogs,
      customerUpdate,
    }, async () => {
      // Update branch stock for all affected products
      for (const item of allItems) {
        const product = updatedProducts.find(p => p.id === item.id);
        if (!product) continue;
        await db.upsertBranchStock(item.id, currentBranch.id, product.branchStock[currentBranch.id] || 0);
      }
      // Persist stock movement logs
      for (const log of newStockLogs) {
        await db.insertStockMovement(log);
      }

      if (exchange.customerId) {
        const customer = customers.find(c => c.id === exchange.customerId);
        if (customer) {
          const returnedValue = Math.max(0, exchange.returnedTotal);
          const newValue = Math.max(0, exchange.newTotal);
          const loyaltyDelta = Math.floor(newValue / 10) - Math.floor(returnedValue / 10);
          const spentDelta = newValue - returnedValue;
          await db.updateCustomer(customer.id, {
            totalSpent: Math.max(0, customer.totalSpent + spentDelta),
            loyaltyPoints: Math.max(0, customer.loyaltyPoints + loyaltyDelta),
          });
        }
      }

      await db.insertExchange(exchange);
    }, { fallback: 'Failed to save exchange' });

    return exchange;
  };

  // ============================================================
  // STOCK ADJUSTMENT
  // ============================================================
  const adjustStock = (productId: string, quantity: number, type: 'IN' | 'OUT' | 'ADJUSTMENT', reason: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const currentBranchStock = product.branchStock[currentBranch.id] || 0;
    let newBranchStock = currentBranchStock;

    if (type === 'IN') newBranchStock += quantity;
    if (type === 'OUT') newBranchStock -= quantity;
    if (type === 'ADJUSTMENT') newBranchStock = quantity;

    newBranchStock = Math.max(0, newBranchStock);

    const logQty = type === 'ADJUSTMENT' ? Math.abs(newBranchStock - currentBranchStock) : quantity;

    const updatedBranchStock = { ...product.branchStock, [currentBranch.id]: newBranchStock };
    const newTotalStock = Object.values(updatedBranchStock).reduce((a: number, b: number) => a + b, 0);

    setProducts(prev => prev.map(p => p.id === productId ? {
      ...p,
      branchStock: updatedBranchStock,
      stock: newTotalStock
    } : p));

    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const movement: StockMovement = {
      id: Math.random().toString(36).substr(2, 9),
      productId,
      productName: product.name,
      branchId: currentBranch.id,
      branchName: currentBranch.name,
      type,
      quantity: logQty,
      reason: `${reason} (${currentBranch.name})`,
      date: `${localDate}T00:00:00.000Z`
    };

    setStockHistory(prev => [movement, ...prev]);

    void executeWithOfflineQueue(
      'ADJUST_STOCK',
      { productId, branchId: currentBranch.id, quantity: newBranchStock, movement },
      async () => {
        await db.upsertBranchStock(productId, currentBranch.id, newBranchStock);
        await db.insertStockMovement(movement);
      },
      { fallback: 'Failed to adjust stock' }
    );
  };

  // ============================================================
  // STOCK TRANSFER (between branches)
  // ============================================================
  const transferStock = (toBranchId: string, items: StockTransferItem[], notes: string): StockTransfer => {
    const toBranch = branches.find(b => b.id === toBranchId);
    if (!toBranch) throw new Error('Destination branch not found');

    const transferNumber = generateTransferNumber();
    const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
    const totalValue = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const transfer: StockTransfer = {
      id: Math.random().toString(36).substr(2, 9),
      transferNumber,
      date: `${localDate}T00:00:00.000Z`,
      fromBranchId: currentBranch.id,
      fromBranchName: currentBranch.name,
      toBranchId,
      toBranchName: toBranch.name,
      items,
      totalItems,
      totalValue,
      status: 'COMPLETED',
      notes,
    };

    // Save original state for rollback on permission errors
    const originalProducts = products;
    const originalStockHistory = stockHistory;
    const originalStockTransfers = stockTransfers;

    // Update product stock: deduct from source, add to destination
    const newStockLogs: StockMovement[] = [];
    const newProducts = products.map(p => {
      const transferItem = items.find(i => i.productId === p.id);
      if (!transferItem) return p;

      const fromStock = Math.max(0, (p.branchStock[currentBranch.id] || 0) - transferItem.quantity);
      const toStock = (p.branchStock[toBranchId] || 0) + transferItem.quantity;
      const updatedBranchStock = { ...p.branchStock, [currentBranch.id]: fromStock, [toBranchId]: toStock };
      const newTotalStock = Object.values(updatedBranchStock).reduce((a: number, b: number) => a + b, 0);

      // Log OUT from source branch
      newStockLogs.push({
        id: Math.random().toString(36).substr(2, 9),
        productId: p.id,
        productName: p.name,
        branchId: currentBranch.id,
        branchName: currentBranch.name,
        type: 'OUT',
        quantity: transferItem.quantity,
        reason: `Transfer OUT → ${toBranch.name} (${transferNumber})`,
        date: `${localDate}T00:00:00.000Z`,
      });

      // Log IN to destination branch
      newStockLogs.push({
        id: Math.random().toString(36).substr(2, 9),
        productId: p.id,
        productName: p.name,
        branchId: toBranchId,
        branchName: toBranch.name,
        type: 'IN',
        quantity: transferItem.quantity,
        reason: `Transfer IN ← ${currentBranch.name} (${transferNumber})`,
        date: `${localDate}T00:00:00.000Z`,
      });

      return { ...p, branchStock: updatedBranchStock, stock: newTotalStock };
    });

    setProducts(newProducts);
    setStockHistory(prev => [...newStockLogs, ...prev]);
    setStockTransfers(prev => [transfer, ...prev]);

    // Persist to Supabase with error handling and rollback on permission errors
    if (useSupabase) {
      const stockRows = items.flatMap(item => {
        const product = newProducts.find(p => p.id === item.productId);
        if (!product) return [];
        return [
          { productId: item.productId, branchId: currentBranch.id, quantity: product.branchStock[currentBranch.id] || 0 },
          { productId: item.productId, branchId: toBranchId, quantity: product.branchStock[toBranchId] || 0 },
        ];
      });

      void executeWithOfflineQueue('TRANSFER_STOCK', {
        transfer,
        stockRows,
        stockMovements: newStockLogs,
      }, async () => {
        try {
          for (const item of items) {
            const product = newProducts.find(p => p.id === item.productId);
            if (!product) continue;
            await db.upsertBranchStock(item.productId, currentBranch.id, product.branchStock[currentBranch.id] || 0);
            await db.upsertBranchStock(item.productId, toBranchId, product.branchStock[toBranchId] || 0);
          }
          for (const log of newStockLogs) {
            await db.insertStockMovement(log);
          }
          await db.insertStockTransfer(transfer);
        } catch (err) {
          // Re-throw so dbCall catches it and sets dbError
          console.error('Transfer persistence failed:', err);
          throw new Error(`Failed to save transfer ${transfer.transferNumber} to database. The transfer was created locally but not synced. Click refresh to retry.`);
        }
      }, { 
        fallback: `Transfer ${transfer.transferNumber} saved locally but failed to sync with database`,
        onNonQueueableError: () => {
          // Rollback stock changes on permission/RLS errors
          setProducts(originalProducts);
          setStockHistory(originalStockHistory);
          setStockTransfers(originalStockTransfers);
        }
      });
    }

    return transfer;
  };

  const deleteTransfer = (transferId: string) => {
    const transfer = stockTransfers.find(t => t.id === transferId);
    if (!transfer) return;

    // Revert stock changes
    const newProducts = products.map(p => {
      const transferItem = transfer.items.find(i => i.productId === p.id);
      if (!transferItem) return p;

      // Reverse the transfer: add back to from_branch, remove from to_branch
      const revertedFromStock = (p.branchStock[transfer.fromBranchId] || 0) + transferItem.quantity;
      const revertedToStock = Math.max(0, (p.branchStock[transfer.toBranchId] || 0) - transferItem.quantity);
      const updatedBranchStock = { ...p.branchStock, [transfer.fromBranchId]: revertedFromStock, [transfer.toBranchId]: revertedToStock };
      const newTotalStock = Object.values(updatedBranchStock).reduce((a: number, b: number) => a + b, 0);

      return { ...p, branchStock: updatedBranchStock, stock: newTotalStock };
    });

    // Remove transfer and related stock movements
    const newTransfers = stockTransfers.filter(t => t.id !== transferId);
    const newHistory = stockHistory.filter(h => !h.reason?.includes(transfer.transferNumber));

    setProducts(newProducts);
    setStockTransfers(newTransfers);
    setStockHistory(newHistory);

    // Persist deletion to Supabase
    if (useSupabase) {
      void executeWithOfflineQueue('DELETE_TRANSFER', { transferId, transferNumber: transfer.transferNumber }, async () => {
        // Update branch stock for all items
        for (const item of transfer.items) {
          const product = newProducts.find(p => p.id === item.productId);
          if (!product) continue;
          await db.upsertBranchStock(item.productId, transfer.fromBranchId, product.branchStock[transfer.fromBranchId] || 0);
          await db.upsertBranchStock(item.productId, transfer.toBranchId, product.branchStock[transfer.toBranchId] || 0);
        }
        // Delete stock movements related to this transfer
        for (const movement of stockHistory) {
          if (movement.reason?.includes(transfer.transferNumber)) {
            // Note: There's no deleteStockMovement function, so we'll just log it
            // In a production system, you'd want to soft-delete or have a removal mechanism
            console.log('Stock movement to be removed:', movement.id);
          }
        }
      }, { fallback: `Failed to delete transfer ${transfer.transferNumber}` });
    }
  };

  // ============================================================
  // CATEGORY / BRAND ACTIONS
  // ============================================================
  const addCategory = (category: string) => {
    if (!categories.includes(category)) setCategories([...categories, category]);
    void executeWithOfflineQueue('ADD_CATEGORY', { category }, () => db.insertCategory(category), { fallback: 'Failed to add category' });
  };
  const removeCategory = (category: string) => {
    setCategories(categories.filter(c => c !== category));
    void executeWithOfflineQueue('REMOVE_CATEGORY', { category }, () => db.deleteCategory(category), { fallback: 'Failed to remove category' });
  };
  const addBrand = (brand: string) => {
    if (!brands.includes(brand)) setBrands([...brands, brand]);
    void executeWithOfflineQueue('ADD_BRAND', { brand }, () => db.insertBrand(brand), { fallback: 'Failed to add brand' });
  };
  const removeBrand = (brand: string) => {
    setBrands(brands.filter(b => b !== brand));
    void executeWithOfflineQueue('REMOVE_BRAND', { brand }, () => db.deleteBrand(brand), { fallback: 'Failed to remove brand' });
  };

  // ============================================================
  // SUPPLIER ACTIONS
  // ============================================================
  const addSupplier = (supplier: Supplier) => {
    setSuppliers(prev => [...prev, supplier]);
    void executeWithOfflineQueue('ADD_SUPPLIER', { supplier }, () => db.insertSupplier(supplier), { fallback: 'Failed to add supplier' });
  };

  const updateSupplier = (id: string, updates: Partial<Supplier>) => {
    setSuppliers(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    void executeWithOfflineQueue('UPDATE_SUPPLIER', { id, updates }, () => db.updateSupplier(id, updates), { fallback: 'Failed to update supplier' });
  };

  const deleteSupplier = (id: string) => {
    setSuppliers(prev => prev.filter(s => s.id !== id));
    void executeWithOfflineQueue('DELETE_SUPPLIER', { id }, () => db.deleteSupplier(id), { fallback: 'Failed to delete supplier' });
  };

  const recordSupplierExpense = (
    transaction: SupplierTransaction,
    stockAdjustments: Array<{ productId: string; quantity: number; reason: string }>
  ) => {
    setSupplierTransactions(prev => [transaction, ...prev]);

    const aggregatedAdjustments = stockAdjustments.reduce<Record<string, { quantity: number; reason: string }>>((acc, item) => {
      if (!item.productId || item.quantity <= 0) return acc;
      const existing = acc[item.productId];
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        acc[item.productId] = { quantity: item.quantity, reason: item.reason };
      }
      return acc;
    }, {});

    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const stockRows: Array<{ productId: string; branchId: string; quantity: number }> = [];
    const stockMovements: StockMovement[] = [];

    setProducts(prev => prev.map(product => {
      const adjustment = aggregatedAdjustments[product.id];
      if (!adjustment) return product;

      const currentBranchStock = product.branchStock[currentBranch.id] || 0;
      const nextBranchStock = Math.max(0, currentBranchStock + adjustment.quantity);
      const updatedBranchStock = { ...product.branchStock, [currentBranch.id]: nextBranchStock };
      const nextTotalStock = Object.values(updatedBranchStock).reduce((a: number, b: number) => a + b, 0);

      stockRows.push({ productId: product.id, branchId: currentBranch.id, quantity: nextBranchStock });
      stockMovements.push({
        id: Math.random().toString(36).substr(2, 9),
        productId: product.id,
        productName: product.name,
        branchId: currentBranch.id,
        branchName: currentBranch.name,
        type: 'IN',
        quantity: adjustment.quantity,
        reason: `${adjustment.reason} (${currentBranch.name})`,
        date: `${localDate}T00:00:00.000Z`
      });

      return {
        ...product,
        branchStock: updatedBranchStock,
        stock: nextTotalStock,
      };
    }));

    if (stockMovements.length > 0) {
      setStockHistory(prev => [...stockMovements, ...prev]);
    }

    void executeWithOfflineQueue(
      'RECORD_SUPPLIER_EXPENSE',
      { transaction, stockRows, stockMovements },
      async () => {
        await db.insertSupplierTransaction(transaction);
        for (const row of stockRows) {
          await db.upsertBranchStock(row.productId, row.branchId, row.quantity);
        }
        for (const movement of stockMovements) {
          await db.insertStockMovement(movement);
        }
      },
      { fallback: 'Failed to record supplier expense', forceQueueOnError: true }
    );
  };

  const addSupplierTransaction = (transaction: SupplierTransaction) => {
    setSupplierTransactions(prev => [transaction, ...prev]);
    void executeWithOfflineQueue('ADD_SUPPLIER_TRANSACTION', { transaction }, () => db.insertSupplierTransaction(transaction), { fallback: 'Failed to add supplier transaction' });
  };

  const updateSupplierTransaction = (id: string, updates: Partial<SupplierTransaction>) => {
    setSupplierTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));

    // Some local/optimistic records can have temporary non-UUID ids.
    // Skip remote update for those to avoid PostgreSQL UUID format errors.
    if (!isUuid(id)) return;

    void executeWithOfflineQueue('UPDATE_SUPPLIER_TRANSACTION', { id, updates }, () => db.updateSupplierTransaction(id, updates), { fallback: 'Failed to update supplier transaction' });
  };

  const deleteSupplierTransaction = (id: string) => {
    setSupplierTransactions(prev => prev.filter(t => t.id !== id));

    // Some local/optimistic records can have temporary non-UUID ids.
    // Skip remote delete for those to avoid PostgreSQL UUID format errors.
    if (!isUuid(id)) return;

    void executeWithOfflineQueue('DELETE_SUPPLIER_TRANSACTION', { id }, () => db.deleteSupplierTransaction(id), { fallback: 'Failed to delete supplier transaction' });
  };

  // ============================================================
  // EXPENSE ACTIONS
  // ============================================================
  const addExpense = (expense: Expense) => {
    const tempId = isUuid(expense.id || '') ? expense.id : makeUuid();
    const optimisticExpense: Expense = { ...expense, id: tempId };
    setExpenses(prev => [optimisticExpense, ...prev]);

    void executeWithOfflineQueue(
      'ADD_EXPENSE',
      { expense: optimisticExpense },
      async () => {
        const inserted = await db.insertExpense(optimisticExpense);
        setExpenses(prev => prev.map(e => (e.id === tempId ? inserted : e)));
      },
      { fallback: 'Failed to add expense' }
    );
  };

  const deleteExpense = (id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id));

    // Some local/optimistic records can have temporary non-UUID ids.
    // Skip remote delete for those to avoid PostgreSQL UUID format errors.
    if (!isUuid(id)) return;

    void executeWithOfflineQueue('DELETE_EXPENSE', { id }, () => db.deleteExpense(id), { fallback: 'Failed to delete expense' });
  };

  // ============================================================
  // DAMAGED GOODS ACTIONS
  // ============================================================
  const addDamagedGood = (record: DamagedGood) => {
    const normalizedRecord: DamagedGood = {
      ...record,
      id: isUuid(record.id) ? record.id : makeUuid(),
      branchId: record.branchId || currentBranch.id,
      branchName: record.branchName || currentBranch.name,
    };
    const normalizedQty = Math.max(0, record.quantity || 0);
    const product = products.find(p => p.id === normalizedRecord.productId);
    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const targetBranchId = normalizedRecord.branchId || currentBranch.id;
    const targetBranchName = normalizedRecord.branchName || currentBranch.name;

    let stockRow: { productId: string; branchId: string; quantity: number } | null = null;
    let stockMovement: StockMovement | null = null;

    if (product && normalizedQty > 0) {
      const currentBranchStock = product.branchStock[targetBranchId] || 0;
      // When recording damaged goods we should REDUCE the available stock
      const nextBranchStock = Math.max(0, currentBranchStock - normalizedQty);
      const updatedBranchStock = { ...product.branchStock, [targetBranchId]: nextBranchStock };
      const nextTotalStock = Object.values(updatedBranchStock).reduce((a: number, b: number) => a + b, 0);

      setProducts(prev => prev.map(p => p.id === product.id ? {
        ...p,
        branchStock: updatedBranchStock,
        stock: nextTotalStock,
      } : p));

      stockRow = { productId: product.id, branchId: targetBranchId, quantity: nextBranchStock };
      stockMovement = {
        id: Math.random().toString(36).substr(2, 9),
        productId: product.id,
        productName: product.name,
        branchId: targetBranchId,
        branchName: targetBranchName,
        type: 'OUT',
        quantity: normalizedQty,
        reason: `Damaged goods recorded (${targetBranchName})`,
        date: `${localDate}T00:00:00.000Z`
      };
      setStockHistory(prev => [stockMovement as StockMovement, ...prev]);
    }

    setDamagedGoods(prev => [normalizedRecord, ...prev]);
    void executeWithOfflineQueue(
      'ADD_DAMAGED_GOOD',
      { record: normalizedRecord, stockRow, stockMovement },
      async () => {
        await db.insertDamagedGood(normalizedRecord);
        if (stockRow) {
          await db.upsertBranchStock(stockRow.productId, stockRow.branchId, stockRow.quantity);
        }
        if (stockMovement) {
          await db.insertStockMovement(stockMovement);
        }
      },
      { fallback: 'Failed to add damaged good' }
    );
  };
  const deleteDamagedGood = (id: string) => {
    const record = damagedGoods.find(d => d.id === id);
    const product = record ? products.find(p => p.id === record.productId) : undefined;
    const normalizedQty = Math.max(0, record?.quantity || 0);
    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const targetBranchId = record?.branchId || currentBranch.id;
    const targetBranchName = record?.branchName || currentBranch.name;
    const shouldDeleteRemote = isUuid(id);

    let stockRow: { productId: string; branchId: string; quantity: number } | null = null;
    let stockMovement: StockMovement | null = null;

    if (product && normalizedQty > 0) {
      const currentBranchStock = product.branchStock[targetBranchId] || 0;
      // Deleting a damaged-good record should RESTORE the stock
      const nextBranchStock = currentBranchStock + normalizedQty;
      const updatedBranchStock = { ...product.branchStock, [targetBranchId]: nextBranchStock };
      const nextTotalStock = Object.values(updatedBranchStock).reduce((a: number, b: number) => a + b, 0);

      setProducts(prev => prev.map(p => p.id === product.id ? {
        ...p,
        branchStock: updatedBranchStock,
        stock: nextTotalStock,
      } : p));

      stockRow = { productId: product.id, branchId: targetBranchId, quantity: nextBranchStock };
      stockMovement = {
        id: Math.random().toString(36).substr(2, 9),
        productId: product.id,
        productName: product.name,
        branchId: targetBranchId,
        branchName: targetBranchName,
        type: 'IN',
        quantity: normalizedQty,
        reason: `Damaged goods deleted (${targetBranchName})`,
        date: `${localDate}T00:00:00.000Z`
      };
      setStockHistory(prev => [stockMovement as StockMovement, ...prev]);
    }

    setDamagedGoods(prev => prev.filter(d => d.id !== id));
    void executeWithOfflineQueue(
      'DELETE_DAMAGED_GOOD',
      { id, stockRow, stockMovement, shouldDeleteRemote },
      async () => {
        if (shouldDeleteRemote) {
          await db.deleteDamagedGood(id);
        }
        if (stockRow) {
          await db.upsertBranchStock(stockRow.productId, stockRow.branchId, stockRow.quantity);
        }
        if (stockMovement) {
          await db.insertStockMovement(stockMovement);
        }
      },
      { fallback: 'Failed to delete damaged good' }
    );
  };

  // ============================================================
  // USER ACTIONS
  // ============================================================
  const addUser = (user: User) => {
    setUsers(prev => [...prev, user]);
    void executeWithOfflineQueue('ADD_USER', { user }, () => db.insertUser(user), { fallback: 'Failed to add user' });
  };
  const updateUser = (id: string, updates: Partial<User>) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
    void executeWithOfflineQueue('UPDATE_USER', { id, updates }, () => db.updateUser(id, updates), { fallback: 'Failed to update user' });
  };
  const deleteUser = (id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
    void executeWithOfflineQueue('DELETE_USER', { id }, () => db.deleteUser(id), { fallback: 'Failed to delete user' });
  };

  // ============================================================
  // SETTINGS ACTIONS
  // ============================================================
  const updateSettings = (updates: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
    void executeWithOfflineQueue('UPDATE_SETTINGS', { updates }, () => db.updateSettings(updates), { fallback: 'Failed to update settings' });
  };

  // ============================================================
  // IMPORT / EXPORT
  // ============================================================
  const exportData = () => {
    const data = {
      branches, salesHistory, customers, products, categories, brands,
      stockHistory, stockTransfers, suppliers, supplierTransactions, expenses, users, settings
    };
    return JSON.stringify(data, null, 2);
  };

  const importData = (jsonData: string): boolean => {
    try {
      const data = JSON.parse(jsonData);
      if (data.products && Array.isArray(data.products)) {
        if (data.branches) setBranches(data.branches);
        if (data.salesHistory) setSalesHistory(data.salesHistory);
        if (data.customers) setCustomers(data.customers);
        if (data.products) setProducts(data.products);
        if (data.categories) setCategories(data.categories);
        if (data.brands) setBrands(data.brands);
        if (data.stockHistory) setStockHistory(data.stockHistory);
        if (data.suppliers) setSuppliers(data.suppliers);
        if (data.supplierTransactions) setSupplierTransactions(data.supplierTransactions);
        if (data.expenses) setExpenses(data.expenses);
        if (data.users) setUsers(data.users);
        if (data.settings) setSettings(data.settings);
        return true;
      }
      return false;
    } catch (e) {
      console.error("Import failed", e);
      return false;
    }
  };

  const removeOfflineItem = (id: string) => {
    setOfflineQueue(prev => prev.filter(item => item.id !== id));
  };

  const retryOfflineItem = async (id: string): Promise<boolean> => {
    const item = offlineQueue.find(entry => entry.id === id);
    if (!item || !useSupabase) return false;

    setOfflineQueue(prev => prev.map(entry => entry.id === id ? { ...entry, status: 'SYNCING' } : entry));
    try {
      await runOfflineOperation(item);
      setOfflineQueue(prev => prev.filter(entry => entry.id !== id));
      setOfflinePopup({
        id,
        operation: item.operation,
        title: 'Synced',
        message: `${operationLabel(item.operation)} synced successfully.`,
        variant: 'synced',
      });
      setLastSyncTime(new Date());
      return true;
    } catch (err) {
      const message = extractDbErrorMessage(err, 'Sync failed');
      setOfflineQueue(prev => prev.map(entry => entry.id === id ? {
        ...entry,
        status: 'FAILED',
        retryCount: entry.retryCount + 1,
        errorMessage: message,
      } : entry));
      return false;
    }
  };

  const syncOfflineQueue = async (): Promise<void> => {
    if (!useSupabase || isSyncingOfflineQueue) return;
    setIsSyncingOfflineQueue(true);
    try {
      const pending = [...offlineQueue]
        .filter(item => item.status === 'PENDING' || item.status === 'FAILED')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      let allSucceeded = true;

      for (const item of pending) {
        // eslint-disable-next-line no-await-in-loop
        const result = await retryOfflineItem(item.id);
        allSucceeded = allSucceeded && result;
      }

      if (allSucceeded && pending.length > 0) {
        await refreshFromSupabase();
      }
    } finally {
      setIsSyncingOfflineQueue(false);
    }
  };

  const dismissOfflinePopup = () => setOfflinePopup(null);

  useEffect(() => {
    if (!useSupabase) return;
    if (isSyncingOfflineQueue) return;
    if (offlineQueue.length === 0) return;
    if (!isCloudConnected) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    void syncOfflineQueue();
  }, [useSupabase, isSyncingOfflineQueue, offlineQueue.length, isCloudConnected]);

  const syncData = async (): Promise<{ success: boolean; productCount?: number; error?: string }> => {
    return await refreshFromSupabase();
  };

  const dismissDbError = () => setDbError(null);

  // Manually refresh transfers from Supabase
  const refreshTransfers = async () => {
    if (!useSupabase) return;
    try {
      setIsLoading(true);
      const transfers = await db.fetchStockTransfers();
      setStockTransfers(transfers);
      dismissDbError();
    } catch (err: unknown) {
      console.error('Failed to refresh transfers:', err);
      setDbError(extractDbErrorMessage(err, 'Failed to refresh transfer history'));
    } finally {
      setIsLoading(false);
    }
  };

  const setView = (view: ViewState) => setCurrentView(view);

  const login = (user: User) => {
    setCurrentUser(user);
    // Set user's branch if they have one assigned
    if (user.branchId) {
      const userBranch = branches.find(b => b.id === user.branchId);
      if (userBranch) setCurrentBranch(userBranch);
    }
  };

  const logout = () => {
    setCurrentUser(null);
    setCurrentView('DASHBOARD');
    clearCart();
  };

  return (
    <StoreContext.Provider value={{
      products, customers, cart, salesHistory, stockHistory, stockTransfers, exchangeHistory, categories, brands, branches, suppliers, supplierTransactions, expenses, damagedGoods, users, settings,
      currentBranch, currentUser, currentView, isLoading, dbError, offlineQueue, offlinePopup, lastSyncTime, isCloudConnected, realtimeStatus,
      setBranch, addBranch, updateBranch,
      addProduct, updateProduct, deleteProduct, getProductSalesUsage,
      addCustomer, updateCustomer, deleteCustomer,
      addToCart, removeFromCart, updateCartItemDiscount, updateCartQuantity, clearCart,
      completeSale, updateSale, deleteSale, completeExchange, adjustStock, transferStock, deleteTransfer, refreshTransfers,
      addCategory, removeCategory, addBrand, removeBrand,
      addSupplier, updateSupplier, deleteSupplier, recordSupplierExpense, addSupplierTransaction, updateSupplierTransaction, deleteSupplierTransaction,
      addExpense, deleteExpense,
      addDamagedGood, deleteDamagedGood,
      addUser, updateUser, deleteUser,
      updateSettings, exportData, importData,
      syncData, syncOfflineQueue, retryOfflineItem, removeOfflineItem, dismissOfflinePopup, dismissDbError,
      login, logout, setView
    }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
};
