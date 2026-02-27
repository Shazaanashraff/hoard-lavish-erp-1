import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Product, CartItem, SalesRecord, ViewState, Customer, StockMovement, Branch, Supplier, SupplierTransaction, Expense, User, AppSettings, DamagedGood, StockTransfer, StockTransferItem, ExchangeRecord } from '../types';
import { INITIAL_PRODUCTS, INITIAL_CUSTOMERS, INITIAL_CATEGORIES, INITIAL_BRANDS, INITIAL_BRANCHES, INITIAL_SUPPLIERS, INITIAL_EXPENSES, INITIAL_USERS, INITIAL_SETTINGS } from '../constants';
import * as db from '../services/supabaseService';
import { calculateCartTotals } from '../utils/cart';
import { generateInvoiceNumber, generateTransferNumber } from '../utils/generators';

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

  // Actions
  setBranch: (branchId: string) => void;
  addBranch: (branch: Branch) => void;
  updateBranch: (id: string, updates: Partial<Branch>) => void;

  addProduct: (product: Product) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;

  addCustomer: (customer: Customer) => void;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;

  addToCart: (product: Product) => string;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;

  completeSale: (paymentMethod: SalesRecord['paymentMethod'], discount: number, customerId?: string) => SalesRecord;
  completeExchange: (exchange: Omit<ExchangeRecord, 'id' | 'exchangeNumber' | 'date' | 'branchId' | 'branchName'>) => ExchangeRecord;
  adjustStock: (productId: string, quantity: number, type: 'IN' | 'OUT' | 'ADJUSTMENT', reason: string) => void;
  transferStock: (toBranchId: string, items: StockTransferItem[], notes: string) => StockTransfer;

  addCategory: (category: string) => void;
  removeCategory: (category: string) => void;
  addBrand: (brand: string) => void;
  removeBrand: (brand: string) => void;

  addSupplier: (supplier: Supplier) => void;
  updateSupplier: (id: string, updates: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => void;
  addSupplierTransaction: (transaction: SupplierTransaction) => void;

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

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [branches, setBranches] = useState<Branch[]>(INITIAL_BRANCHES);
  const [currentBranch, setCurrentBranch] = useState<Branch>(INITIAL_BRANCHES[0]);

  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [salesHistory, setSalesHistory] = useState<SalesRecord[]>([]);
  const [stockHistory, setStockHistory] = useState<StockMovement[]>([]);
  const [stockTransfers, setStockTransfers] = useState<StockTransfer[]>([]);
  const [exchangeHistory, setExchangeHistory] = useState<ExchangeRecord[]>([]);
  const [categories, setCategories] = useState<string[]>(INITIAL_CATEGORIES);
  const [brands, setBrands] = useState<string[]>(INITIAL_BRANDS);
  const [suppliers, setSuppliers] = useState<Supplier[]>(INITIAL_SUPPLIERS);
  const [supplierTransactions, setSupplierTransactions] = useState<SupplierTransaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>(INITIAL_EXPENSES);
  const [damagedGoods, setDamagedGoods] = useState<DamagedGood[]>([]);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);

  const [currentView, setCurrentView] = useState<ViewState>('DASHBOARD');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const useSupabase = isSupabaseConfigured();

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
      setDbError(null);
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

        // Load exchange history from localStorage (no Supabase table yet)
        let exchangeData: ExchangeRecord[] = [];
        try {
          const savedExchanges = localStorage.getItem('hoard_exchange_history');
          if (savedExchanges) {
            exchangeData = JSON.parse(savedExchanges);
          }
        } catch (_) { /* ignore parse errors */ }

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
      } catch (err: unknown) {
        console.error('Failed to load data from Supabase', err);
        setDbError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
        setHasLoaded(true);
      }
    };
    loadAll();
  }, [useSupabase]);

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

  // ---- Helper for async DB calls with error handling ----
  const dbCall = useCallback(async (fn: () => Promise<void>) => {
    if (!useSupabase) return;
    try {
      await fn();
    } catch (err: unknown) {
      console.error('Supabase operation failed:', err);
      setDbError(err instanceof Error ? err.message : 'Database operation failed');
    }
  }, [useSupabase]);

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

  const addBranch = (branch: Branch) => {
    setBranches(prev => [...prev, branch]);
    setProducts(prev => prev.map(p => ({
      ...p,
      branchStock: { ...p.branchStock, [branch.id]: 0 }
    })));
    dbCall(async () => {
      await db.insertBranch(branch);
      await db.initializeBranchStock(branch.id, products.map(p => p.id));
    });
  };

  const updateBranch = (id: string, updates: Partial<Branch>) => {
    setBranches(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
    if (currentBranch.id === id) {
      setCurrentBranch(prev => ({ ...prev, ...updates }));
    }
    dbCall(() => db.updateBranch(id, updates));
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
    const fullProduct = { ...product, branchStock, stock: totalStock };
    setProducts(prev => [...prev, fullProduct]);
    dbCall(() => db.insertProduct(fullProduct, branches));
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
    dbCall(() => db.updateProduct(id, updates));

    // Log edit event so it appears in dashboard activity feed
    if (existing) {
      const editLog: StockMovement = {
        id: Math.random().toString(36).substr(2, 9),
        productId: id,
        productName: existing.name,
        branchId: currentBranch.id,
        branchName: currentBranch.name,
        type: 'ADJUSTMENT',
        quantity: 0,
        reason: `Product edited: ${existing.name}`,
        date: new Date().toISOString()
      };
      setStockHistory(prev => [editLog, ...prev]);
    }
  };

  const deleteProduct = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    dbCall(() => db.deleteProduct(id));
  };

  // ============================================================
  // CUSTOMER ACTIONS
  // ============================================================
  const addCustomer = (customer: Customer) => {
    setCustomers(prev => [...prev, customer]);
    dbCall(async () => {
      await db.insertCustomer(customer);
    });
  };

  const updateCustomer = (id: string, updates: Partial<Customer>) => {
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    dbCall(() => db.updateCustomer(id, updates));
  };

  const deleteCustomer = (id: string) => {
    setCustomers(prev => prev.filter(c => c.id !== id));
    dbCall(() => db.deleteCustomer(id));
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
      return [...prev, { ...product, quantity: 1 }];
    });
    return 'ok';
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  const clearCart = () => setCart([]);

  // ============================================================
  // SALE COMPLETION
  // ============================================================
  const completeSale = (paymentMethod: SalesRecord['paymentMethod'], discount: number, customerId?: string): SalesRecord => {
    const { subtotal, tax, total, totalCost, discount: effDiscount } = calculateCartTotals(cart, discount, 0);

    const customer = customers.find(c => c.id === customerId);

    const newSale: SalesRecord = {
      id: Math.random().toString(36).substr(2, 9),
      invoiceNumber: generateInvoiceNumber(),
      date: new Date().toISOString(),
      items: [...cart],
      subtotal,
      discount: effDiscount,
      tax,
      totalAmount: total,
      totalCost,
      paymentMethod,
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
          date: new Date().toISOString()
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
    dbCall(() => db.completeSaleRPC(newSale));

    return newSale;
  };

  // ============================================================
  // EXCHANGE
  // ============================================================
  const completeExchange = (exchangeData: Omit<ExchangeRecord, 'id' | 'exchangeNumber' | 'date' | 'branchId' | 'branchName'>): ExchangeRecord => {
    const exchangeNumber = `EX-${Date.now().toString(36).toUpperCase()}`;
    const exchange: ExchangeRecord = {
      ...exchangeData,
      id: Math.random().toString(36).substr(2, 9),
      exchangeNumber,
      date: new Date().toISOString(),
      branchId: currentBranch.id,
      branchName: currentBranch.name,
    };

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
        reason: `Exchange Return (${exchangeNumber})`,
        date: new Date().toISOString(),
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
        reason: `Exchange Issue (${exchangeNumber})`,
        date: new Date().toISOString(),
      });
    });

    setProducts(updatedProducts);
    setStockHistory(prev => [...newStockLogs, ...prev]);
    setExchangeHistory(prev => [exchange, ...prev]);

    // Persist stock changes to Supabase
    dbCall(async () => {
      // Update branch stock for all affected products
      const allItems = [...exchange.returnedItems, ...exchange.newItems];
      for (const item of allItems) {
        const product = updatedProducts.find(p => p.id === item.id);
        if (!product) continue;
        await db.upsertBranchStock(item.id, currentBranch.id, product.branchStock[currentBranch.id] || 0);
      }
      // Persist stock movement logs
      for (const log of newStockLogs) {
        await db.insertStockMovement(log);
      }
    });

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

    const movement: StockMovement = {
      id: Math.random().toString(36).substr(2, 9),
      productId,
      productName: product.name,
      branchId: currentBranch.id,
      branchName: currentBranch.name,
      type,
      quantity: logQty,
      reason: `${reason} (${currentBranch.name})`,
      date: new Date().toISOString()
    };

    setStockHistory(prev => [movement, ...prev]);

    dbCall(async () => {
      await db.upsertBranchStock(productId, currentBranch.id, newBranchStock);
      await db.insertStockMovement(movement);
    });
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

    const transfer: StockTransfer = {
      id: Math.random().toString(36).substr(2, 9),
      transferNumber,
      date: new Date().toISOString(),
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
        type: 'TRANSFER',
        quantity: transferItem.quantity,
        reason: `Transfer OUT → ${toBranch.name} (${transferNumber})`,
        date: new Date().toISOString(),
      });

      // Log IN to destination branch
      newStockLogs.push({
        id: Math.random().toString(36).substr(2, 9),
        productId: p.id,
        productName: p.name,
        branchId: toBranchId,
        branchName: toBranch.name,
        type: 'TRANSFER',
        quantity: transferItem.quantity,
        reason: `Transfer IN ← ${currentBranch.name} (${transferNumber})`,
        date: new Date().toISOString(),
      });

      return { ...p, branchStock: updatedBranchStock, stock: newTotalStock };
    });

    setProducts(newProducts);
    setStockHistory(prev => [...newStockLogs, ...prev]);
    setStockTransfers(prev => [transfer, ...prev]);

    // Persist to Supabase
    dbCall(async () => {
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
    });

    return transfer;
  };

  // ============================================================
  // CATEGORY / BRAND ACTIONS
  // ============================================================
  const addCategory = (category: string) => {
    if (!categories.includes(category)) setCategories([...categories, category]);
    dbCall(() => db.insertCategory(category));
  };
  const removeCategory = (category: string) => {
    setCategories(categories.filter(c => c !== category));
    dbCall(() => db.deleteCategory(category));
  };
  const addBrand = (brand: string) => {
    if (!brands.includes(brand)) setBrands([...brands, brand]);
    dbCall(() => db.insertBrand(brand));
  };
  const removeBrand = (brand: string) => {
    setBrands(brands.filter(b => b !== brand));
    dbCall(() => db.deleteBrand(brand));
  };

  // ============================================================
  // SUPPLIER ACTIONS
  // ============================================================
  const addSupplier = (supplier: Supplier) => {
    setSuppliers(prev => [...prev, supplier]);
    dbCall(() => db.insertSupplier(supplier));
  };

  const updateSupplier = (id: string, updates: Partial<Supplier>) => {
    setSuppliers(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    dbCall(() => db.updateSupplier(id, updates));
  };

  const deleteSupplier = (id: string) => {
    setSuppliers(prev => prev.filter(s => s.id !== id));
    dbCall(() => db.deleteSupplier(id));
  };

  const addSupplierTransaction = (transaction: SupplierTransaction) => {
    setSupplierTransactions(prev => [transaction, ...prev]);
    dbCall(() => db.insertSupplierTransaction(transaction));
  };

  // ============================================================
  // EXPENSE ACTIONS
  // ============================================================
  const addExpense = (expense: Expense) => {
    setExpenses(prev => [expense, ...prev]);
    dbCall(() => db.insertExpense(expense));
  };

  const deleteExpense = (id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
    dbCall(() => db.deleteExpense(id));
  };

  // ============================================================
  // DAMAGED GOODS ACTIONS
  // ============================================================
  const addDamagedGood = (record: DamagedGood) => {
    setDamagedGoods(prev => [record, ...prev]);
    dbCall(() => db.insertDamagedGood(record));
  };
  const deleteDamagedGood = (id: string) => {
    setDamagedGoods(prev => prev.filter(d => d.id !== id));
    dbCall(() => db.deleteDamagedGood(id));
  };

  // ============================================================
  // USER ACTIONS
  // ============================================================
  const addUser = (user: User) => {
    setUsers(prev => [...prev, user]);
    dbCall(() => db.insertUser(user));
  };
  const updateUser = (id: string, updates: Partial<User>) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
    dbCall(() => db.updateUser(id, updates));
  };
  const deleteUser = (id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
    dbCall(() => db.deleteUser(id));
  };

  // ============================================================
  // SETTINGS ACTIONS
  // ============================================================
  const updateSettings = (updates: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
    dbCall(() => db.updateSettings(updates));
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
      currentBranch, currentUser, currentView, isLoading, dbError,
      setBranch, addBranch, updateBranch,
      addProduct, updateProduct, deleteProduct,
      addCustomer, updateCustomer, deleteCustomer,
      addToCart, removeFromCart, clearCart,
      completeSale, completeExchange, adjustStock, transferStock,
      addCategory, removeCategory, addBrand, removeBrand,
      addSupplier, updateSupplier, deleteSupplier, addSupplierTransaction,
      addExpense, deleteExpense,
      addDamagedGood, deleteDamagedGood,
      addUser, updateUser, deleteUser,
      updateSettings, exportData, importData,
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
