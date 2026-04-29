import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Plus, Minus, Trash2, CreditCard, Banknote, UserPlus, User, X, ScanBarcode, Printer, CheckCircle, Store, ArrowRightLeft, RotateCcw } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { Product, Customer, SalesRecord, CartItem, ExchangeRecord, ExchangeLineItem } from '../../types';
import { parseBusinessDate } from '../../utils/dateTime';
import { fmtCurrency } from '../../utils/formatters';
import { CUR } from '../../constants';
import AlertPopup from '../shared/AlertPopup';
import { round2, allocateDiscountByUnits, getEffectiveLineTotal } from './posUtils';

type DiscountMode = 'amount' | 'percentage';
type ExchangeSettlementMethod = 'Cash' | 'Card' | 'PayHere' | 'Online Transfer' | 'MintPay' | 'Cash+Card';

const POS: React.FC = () => {
  const { products, customers, cart, salesHistory, exchangeHistory, addToCart, removeFromCart, updateCartItemDiscount, updateCartQuantity, completeSale, completeExchange, clearCart, addCustomer, adjustStock, currentBranch, currentUser, settings } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  // Keep a ref in sync with barcodeInput so the submit handler always reads
  // the latest value even if React state hasn't flushed yet (fast scanners).
  const barcodeValueRef = useRef('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Billing States
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [billDiscountMode, setBillDiscountMode] = useState<DiscountMode>('amount');
  const [billDiscountValue, setBillDiscountValue] = useState<number>(0);
  const [itemDiscountModes, setItemDiscountModes] = useState<Record<string, DiscountMode>>({});
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '' });
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'Cash' | 'Card' | 'COD' | 'PayHere' | 'Online Transfer' | 'MintPay' | 'Cash+Card'>('Cash');
  const [splitCashAmount, setSplitCashAmount] = useState<number>(0);
  const [splitCardAmount, setSplitCardAmount] = useState<number>(0);

  // Customer search in checkout
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);

  // Alert popup state (replaces window.alert)
  const [alertPopup, setAlertPopup] = useState<{ message: string; type: 'error' | 'warning' } | null>(null);

  // Invoice Modal
  const [lastSale, setLastSale] = useState<SalesRecord | null>(null);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);

  // Exchange State
  const [isExchangeMode, setIsExchangeMode] = useState(false);
  const [exchangeSaleSearch, setExchangeSaleSearch] = useState('');
  const [selectedExchangeSale, setSelectedExchangeSale] = useState<SalesRecord | null>(null);
  const [returnedItems, setReturnedItems] = useState<ExchangeLineItem[]>([]);
  const [exchangeNewItems, setExchangeNewItems] = useState<ExchangeLineItem[]>([]);
  const [exchangeDescription, setExchangeDescription] = useState('');
  const [exchangeNewProductSearch, setExchangeNewProductSearch] = useState('');
  const [lastExchange, setLastExchange] = useState<ExchangeRecord | null>(null);
  const [isExchangeInvoiceOpen, setIsExchangeInvoiceOpen] = useState(false);
  const [noSaleReturnItems, setNoSaleReturnItems] = useState<ExchangeLineItem[]>([]); // manual stock return without sale
  const [noSaleProductSearch, setNoSaleProductSearch] = useState('');
  const [exchangeBillDiscountMode, setExchangeBillDiscountMode] = useState<DiscountMode>('amount');
  const [exchangeBillDiscountValue, setExchangeBillDiscountValue] = useState<number>(0);
  const [exchangeRefundMethod, setExchangeRefundMethod] = useState<ExchangeSettlementMethod>('Cash');

  // Scan mode — overlay that listens for scanner input
  const [isScanMode, setIsScanMode] = useState(false);
  const [scanModeBuffer, setScanModeBuffer] = useState('');
  const scanModeBufferRef = useRef('');
  const scanModeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const customerSearchRef = useRef<HTMLInputElement>(null);

  // --- Global barcode scanner listener ---
  // USB barcode scanners (like PM-BSD234) act as keyboard HID devices: they
  // "type" characters extremely fast (< 30ms between keystrokes) and finish
  // with Enter. React controlled inputs often DROP characters at scanner speed
  // because React can't re-render fast enough. This listener captures rapid
  // keystrokes globally (even when the barcode input has focus), buffers them,
  // and processes the complete barcode when Enter arrives — completely bypassing
  // React's controlled input for scanner input.
  const scanBufferRef = useRef('');
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanLastKeyTimeRef = useRef(0);
  const scanCooldownRef = useRef(0); // timestamp of last successful scan — used to ignore duplicates

  useEffect(() => {
    const SCAN_CHAR_INTERVAL = 100; // max ms between chars to treat as scanner input
    const SCAN_MIN_LENGTH = 3;     // minimum chars to treat as a barcode scan
    const SCAN_COOLDOWN = 1500;    // ms to ignore duplicate scans after a successful one

    const processBarcodeValue = (val: string) => {
      // Cooldown: ignore if we just processed a scan recently
      const now = Date.now();
      if (now - scanCooldownRef.current < SCAN_COOLDOWN) {
        console.log('[BARCODE SCANNER] Ignoring duplicate scan (cooldown active):', val);
        return;
      }

      console.log('[BARCODE SCANNER] Processing barcode value:', val);
      const exact = products.find(p =>
        p.sku.toLowerCase() === val.toLowerCase() ||
        (p.barcode && p.barcode.toLowerCase() === val.toLowerCase()) ||
        (p.barcode2 && p.barcode2.toLowerCase() === val.toLowerCase())
      );
      console.log('[BARCODE SCANNER] Product lookup result:', exact ? `Found: ${exact.name} (SKU: ${exact.sku}, barcode: ${exact.barcode}, barcode2: ${exact.barcode2})` : 'NOT FOUND');
      if (exact) {
        const branchStock = exact.branchStock[currentBranch.id] || 0;
        console.log('[BARCODE SCANNER] Branch stock:', branchStock);
        if (branchStock > 0) {
          const result = addToCart(exact);
          console.log('[BARCODE SCANNER] addToCart result:', result);
          if (result !== 'ok') {
            setAlertPopup({ message: result, type: 'error' });
          }
        } else {
          setAlertPopup({ message: 'Product out of stock in this branch', type: 'error' });
        }
      } else {
        // Log all products' barcodes for debugging
        console.log('[BARCODE SCANNER] Available products barcode list:');
        products.forEach(p => {
          if (p.barcode || p.barcode2) {
            console.log(`  - ${p.name}: sku="${p.sku}", barcode="${p.barcode}", barcode2="${p.barcode2}"`);
          }
        });
        setAlertPopup({ message: `No product found matching "${val}"`, type: 'error' });
      }
      // Mark cooldown timestamp so duplicate scans are ignored
      scanCooldownRef.current = Date.now();
      setBarcodeInput('');
      barcodeValueRef.current = '';
      setTimeout(() => barcodeInputRef.current?.focus(), 30);
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Skip if scan mode overlay is open — its own listener handles everything
      if (isScanMode) return;

      // Skip if a text input is focused (don't intercept typing in search, etc.)
      const activeElement = document.activeElement as HTMLElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.contentEditable === 'true')) {
        return;
      }

      const now = Date.now();
      const timeSinceLastKey = now - scanLastKeyTimeRef.current;

      // --- Enter key: process scan buffer if we have one ---
      if (e.key === 'Enter') {
        if (scanBufferRef.current.length >= SCAN_MIN_LENGTH) {
          e.preventDefault();
          e.stopPropagation();
          const scannedValue = scanBufferRef.current;
          scanBufferRef.current = '';
          scanLastKeyTimeRef.current = 0;
          if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
          console.log('[BARCODE SCANNER] Global listener — Enter received, buffer:', scannedValue);
          processBarcodeValue(scannedValue.trim());
        }
        return;
      }

      // Only buffer printable single characters (not Shift, Ctrl, Alt, etc.)
      if (e.key.length !== 1) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      // Determine if this keystroke is "scanner speed" (very fast after previous key)
      const isScannerSpeed = scanBufferRef.current.length > 0 && timeSinceLastKey < SCAN_CHAR_INTERVAL;
      const isFirstChar = scanBufferRef.current.length === 0;

      if (isFirstChar) {
        scanBufferRef.current = e.key;
        scanLastKeyTimeRef.current = now;
        if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
        scanTimerRef.current = setTimeout(() => {
          scanBufferRef.current = '';
          scanLastKeyTimeRef.current = 0;
        }, SCAN_CHAR_INTERVAL);
        return;
      }

      if (isScannerSpeed) {
        e.preventDefault();
        e.stopPropagation();
        scanBufferRef.current += e.key;
        scanLastKeyTimeRef.current = now;
        console.log('[BARCODE SCANNER] Global listener — buffering fast char, buffer now:', scanBufferRef.current);

        if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
        scanTimerRef.current = setTimeout(() => {
          if (scanBufferRef.current.length >= SCAN_MIN_LENGTH) {
            console.log('[BARCODE SCANNER] Global listener — timeout, processing buffer:', scanBufferRef.current);
            processBarcodeValue(scanBufferRef.current.trim());
          }
          scanBufferRef.current = '';
          scanLastKeyTimeRef.current = 0;
        }, SCAN_CHAR_INTERVAL * 2);
      } else {
        scanBufferRef.current = '';
        scanLastKeyTimeRef.current = 0;
        if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, currentBranch, isScanMode]);

  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  // --- Scan Mode: dedicated listener that captures ALL keystrokes when scan overlay is open ---
  useEffect(() => {
    if (!isScanMode) return;
    scanModeBufferRef.current = '';
    setScanModeBuffer('');
    console.log('[SCAN MODE] Overlay opened — listening for ALL keystrokes');

    const handleScanModeKey = (e: KeyboardEvent) => {
      console.log('[SCAN MODE] Key event:', e.key, '| type:', e.type, '| code:', e.code, '| buffer so far:', scanModeBufferRef.current);

      // Escape — close scan mode
      if (e.key === 'Escape') {
        e.preventDefault();
        console.log('[SCAN MODE] Escape pressed, closing overlay');
        setIsScanMode(false);
        return;
      }

      // Enter — process whatever is in the buffer
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const val = scanModeBufferRef.current.trim();
        console.log('[SCAN MODE] Enter pressed — buffer:', val);
        if (val.length >= 1) {
          console.log('[SCAN MODE] Looking up barcode:', val);
          const exact = products.find(p =>
            p.sku.toLowerCase() === val.toLowerCase() ||
            (p.barcode && p.barcode.toLowerCase() === val.toLowerCase()) ||
            (p.barcode2 && p.barcode2.toLowerCase() === val.toLowerCase())
          );
          console.log('[SCAN MODE] Product match:', exact ? `${exact.name} (SKU: ${exact.sku})` : 'NOT FOUND');
          if (exact) {
            const branchStock = exact.branchStock[currentBranch.id] || 0;
            console.log('[SCAN MODE] Branch stock:', branchStock);
            if (branchStock > 0) {
              const result = addToCart(exact);
              console.log('[SCAN MODE] addToCart result:', result);
              if (result !== 'ok') {
                setAlertPopup({ message: result, type: 'error' });
              }
            } else {
              setAlertPopup({ message: 'Product out of stock in this branch', type: 'error' });
            }
          } else {
            console.log('[SCAN MODE] Products with barcodes:');
            products.forEach(p => {
              if (p.barcode || p.barcode2) {
                console.log(`  - ${p.name}: sku="${p.sku}", barcode="${p.barcode}", barcode2="${p.barcode2}"`);
              }
            });
            setAlertPopup({ message: `No product found matching "${val}"`, type: 'error' });
          }
          setBarcodeInput('');
          barcodeValueRef.current = '';
          setIsScanMode(false);
          setTimeout(() => barcodeInputRef.current?.focus(), 30);
        }
        scanModeBufferRef.current = '';
        setScanModeBuffer('');
        return;
      }

      // Buffer printable characters
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        scanModeBufferRef.current += e.key;
        setScanModeBuffer(scanModeBufferRef.current);
        console.log('[SCAN MODE] Buffered char, buffer now:', scanModeBufferRef.current);

        // Auto-process timeout if scanner doesn't send Enter
        if (scanModeTimerRef.current) clearTimeout(scanModeTimerRef.current);
        scanModeTimerRef.current = setTimeout(() => {
          const v = scanModeBufferRef.current.trim();
          console.log('[SCAN MODE] Timeout — auto-processing buffer:', v);
          if (v.length >= 3) {
            const exact = products.find(p =>
              p.sku.toLowerCase() === v.toLowerCase() ||
              (p.barcode && p.barcode.toLowerCase() === v.toLowerCase()) ||
              (p.barcode2 && p.barcode2.toLowerCase() === v.toLowerCase())
            );
            console.log('[SCAN MODE] Timeout product match:', exact ? `${exact.name}` : 'NOT FOUND');
            if (exact) {
              const branchStock = exact.branchStock[currentBranch.id] || 0;
              if (branchStock > 0) {
                const result = addToCart(exact);
                if (result !== 'ok') {
                  setAlertPopup({ message: result, type: 'error' });
                }
              } else {
                setAlertPopup({ message: 'Product out of stock in this branch', type: 'error' });
              }
            } else {
              setAlertPopup({ message: `No product found matching "${v}"`, type: 'error' });
            }
            setBarcodeInput('');
            barcodeValueRef.current = '';
            setIsScanMode(false);
            setTimeout(() => barcodeInputRef.current?.focus(), 30);
          }
          scanModeBufferRef.current = '';
          setScanModeBuffer('');
        }, 500);
      }
    };

    window.addEventListener('keydown', handleScanModeKey, true);
    return () => {
      window.removeEventListener('keydown', handleScanModeKey, true);
      if (scanModeTimerRef.current) clearTimeout(scanModeTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScanMode, products, currentBranch]);

  const categories = ['All', ...Array.from(new Set(products.map(p => p.category)))];

  // 1. Dynamic filtering by name AND SKU (search input only — barcode uses dropdown)
  const filteredProducts = useMemo(() => {
    const filtered = products.filter(p => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = !term
        || p.name.toLowerCase().includes(term)
        || p.sku.toLowerCase().includes(term)
        || (p.size && p.size.toLowerCase().includes(term))
        || (p.color && p.color.toLowerCase().includes(term));
      const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
    
    // Sort: in-stock items first, out-of-stock items at the bottom
    return filtered.sort((a, b) => {
      const aStock = a.branchStock[currentBranch.id] || 0;
      const bStock = b.branchStock[currentBranch.id] || 0;
      
      // Both have stock or both out of stock: keep original order
      if ((aStock > 0) === (bStock > 0)) return 0;
      // a has stock, b doesn't: a comes first
      if (aStock > 0) return -1;
      // b has stock, a doesn't: b comes first
      return 1;
    });
  }, [products, searchTerm, selectedCategory, currentBranch])

  // 1b. Dynamic SKU filtering for barcode input
  const skuSuggestions = useMemo(() => {
    if (!barcodeInput.trim()) return [];
    return products.filter(p =>
      p.sku.toLowerCase().includes(barcodeInput.trim().toLowerCase()) ||
      p.name.toLowerCase().includes(barcodeInput.trim().toLowerCase()) ||
      (p.size && p.size.toLowerCase().includes(barcodeInput.trim().toLowerCase())) ||
      (p.color && p.color.toLowerCase().includes(barcodeInput.trim().toLowerCase())) ||
      (p.barcode && p.barcode.toLowerCase().includes(barcodeInput.trim().toLowerCase())) ||
      (p.barcode2 && p.barcode2.toLowerCase().includes(barcodeInput.trim().toLowerCase()))
    ).slice(0, 5);
  }, [products, barcodeInput]);

  // Auto-add when an exact barcode/SKU match is found while typing (handles
  // scanners that don't send Enter and makes scanning feel instant).
  useEffect(() => {
    const val = barcodeInput.trim();
    if (!val) return;
    // Cooldown: skip if a scan was just processed
    if (Date.now() - scanCooldownRef.current < 1500) return;
    const exact = products.find(p =>
      p.sku.toLowerCase() === val.toLowerCase() ||
      (p.barcode && p.barcode.toLowerCase() === val.toLowerCase()) ||
      (p.barcode2 && p.barcode2.toLowerCase() === val.toLowerCase())
    );
    if (!exact) return;
    const branchStock = exact.branchStock[currentBranch.id] || 0;
    if (branchStock > 0) {
      handleAddToCart(exact);
      scanCooldownRef.current = Date.now();
      setBarcodeInput('');
      barcodeValueRef.current = '';
      setTimeout(() => barcodeInputRef.current?.focus(), 50);
    } else {
      setAlertPopup({ message: 'Product out of stock in this branch', type: 'error' });
      scanCooldownRef.current = Date.now();
      setBarcodeInput('');
      barcodeValueRef.current = '';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcodeInput]);

  // 10. Customer search filtering
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const term = customerSearch.toLowerCase();
    return customers.filter(c =>
      c.name.toLowerCase().includes(term) ||
      c.phone.includes(term) ||
      c.email.toLowerCase().includes(term)
    );
  }, [customers, customerSearch]);

  // Billing Calculations — 4. Remove tax
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const itemDiscountsTotal = cart.reduce((sum, item) => sum + ((item.discount || 0) * item.quantity), 0);
  const subtotalAfterItemDiscounts = Math.max(0, subtotal - itemDiscountsTotal);
  const additionalDiscountAmount = billDiscountMode === 'percentage'
    ? (subtotalAfterItemDiscounts * billDiscountValue) / 100
    : billDiscountValue;
  const totalDiscount = itemDiscountsTotal + additionalDiscountAmount;
  const total = Math.max(0, subtotal - totalDiscount);
  const splitEnteredTotal = splitCashAmount + splitCardAmount;
  const splitRemaining = total - splitEnteredTotal;

  useEffect(() => {
    if (selectedPaymentMethod !== 'Cash+Card') {
      setSplitCashAmount(0);
      setSplitCardAmount(0);
    }
  }, [selectedPaymentMethod]);

  // 7. Calculate cost baseline for discount warnings
  const totalCost = cart.reduce((sum, item) => sum + (item.costPrice * item.quantity), 0);

  // Helper: add to cart with popup alert
  const handleAddToCart = (product: Product) => {
    const result = addToCart(product);
    if (result !== 'ok') {
      setAlertPopup({ message: result, type: 'error' });
    }
  };

  // 1b. Handle barcode submit — exact match first, then top suggestion
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Read from ref for latest value — React state may lag behind fast scanners.
    const val = (barcodeValueRef.current || barcodeInput).trim();
    if (!val) return;
    // Try exact SKU or barcode match first (for real barcode scanners)
    const exact = products.find(p =>
      p.sku.toLowerCase() === val.toLowerCase() ||
      (p.barcode && p.barcode.toLowerCase() === val.toLowerCase()) ||
      (p.barcode2 && p.barcode2.toLowerCase() === val.toLowerCase())
    );
    const product = exact || skuSuggestions[0];
    if (product) {
      const branchStock = product.branchStock[currentBranch.id] || 0;
      if (branchStock > 0) {
        handleAddToCart(product);
        setBarcodeInput('');
        barcodeValueRef.current = '';
        setTimeout(() => barcodeInputRef.current?.focus(), 50);
      } else {
        setAlertPopup({ message: 'Product out of stock in this branch', type: 'error' });
        setBarcodeInput('');
        barcodeValueRef.current = '';
      }
    } else {
      setAlertPopup({ message: `No product found matching "${val}"`, type: 'error' });
      setBarcodeInput('');
      barcodeValueRef.current = '';
    }
  };

  // 1b. Select SKU suggestion
  const handleSkuSelect = (product: Product) => {
    const branchStock = product.branchStock[currentBranch.id] || 0;
    if (branchStock > 0) {
      handleAddToCart(product);
    } else {
      setAlertPopup({ message: 'Product out of stock in this branch', type: 'error' });
    }
    setBarcodeInput('');
  };

  // 2. Handle ENTER on search to add top result to cart
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && filteredProducts.length > 0) {
      e.preventDefault();
      const topProduct = filteredProducts[0];
      const stock = topProduct.branchStock[currentBranch.id] || 0;
      if (stock > 0) {
        handleAddToCart(topProduct);
        setSearchTerm('');
      } else {
        setAlertPopup({ message: `"${topProduct.name}" is out of stock`, type: 'error' });
      }
    }
  };

  // 7. Discount validation
  const handleBillDiscountChange = (inputValue: number, mode: DiscountMode = billDiscountMode) => {
    const sanitizedInput = Math.max(0, Number.isFinite(inputValue) ? inputValue : 0);
    const rawDiscountAsAmount = mode === 'percentage'
      ? (subtotalAfterItemDiscounts * sanitizedInput) / 100
      : sanitizedInput;
    const maxAdditionalDiscount = Math.max(0, subtotalAfterItemDiscounts);
    const discountAsAmount = Math.min(rawDiscountAsAmount, maxAdditionalDiscount);
    const totalDiscountWithNew = itemDiscountsTotal + discountAsAmount;
    const discountedTotal = Math.max(0, subtotal - totalDiscountWithNew);
    const normalizedValue = mode === 'percentage'
      ? (subtotalAfterItemDiscounts > 0 ? (discountAsAmount / subtotalAfterItemDiscounts) * 100 : 0)
      : discountAsAmount;

    if (discountedTotal < totalCost) {
      setAlertPopup({
        message: `Warning: discounted bill total (${fmtCurrency(discountedTotal)}) is below total cost (${fmtCurrency(totalCost)}).`,
        type: 'warning'
      });
    }

    setBillDiscountValue(normalizedValue);
  };

  const handleBillDiscountModeChange = (mode: DiscountMode) => {
    if (mode === billDiscountMode) return;
    const currentAmount = billDiscountMode === 'percentage'
      ? (subtotalAfterItemDiscounts * billDiscountValue) / 100
      : billDiscountValue;

    setBillDiscountMode(mode);
    setBillDiscountValue(mode === 'percentage'
      ? (subtotalAfterItemDiscounts > 0 ? (currentAmount / subtotalAfterItemDiscounts) * 100 : 0)
      : currentAmount
    );
  };

  const handleItemDiscountChange = (productId: string, inputValue: number, mode: DiscountMode) => {
    const item = cart.find(i => i.id === productId);
    if (!item) return;

    const sanitizedInput = Math.max(0, Number.isFinite(inputValue) ? inputValue : 0);
    const rawDiscountPerUnit = mode === 'percentage'
      ? (item.price * sanitizedInput) / 100
      : sanitizedInput;
    const discountPerUnit = Math.min(rawDiscountPerUnit, item.price);
    const discountedUnitPrice = Math.max(0, item.price - discountPerUnit);
    const normalizedDiscountPerUnit = Math.max(0, discountPerUnit);

    if (discountedUnitPrice < item.costPrice) {
      setAlertPopup({
        message: `Warning: ${item.name} discounted price (${fmtCurrency(discountedUnitPrice)}) is below cost price (${fmtCurrency(item.costPrice)}).`,
        type: 'warning'
      });
    }

    updateCartItemDiscount(productId, normalizedDiscountPerUnit);
  };

  const handleCheckout = () => {
    if (cart.length === 0) return;

    if (selectedPaymentMethod === 'Cash+Card') {
      if (splitCashAmount < 0 || splitCardAmount < 0) {
        setAlertPopup({ message: 'Cash and card amounts must be zero or more.', type: 'warning' });
        return;
      }
      if (Math.abs((splitCashAmount + splitCardAmount) - total) > 0.01) {
        setAlertPopup({
          message: `Cash + Card must equal the bill total (${fmtCurrency(total)}).`,
          type: 'warning'
        });
        return;
      }
    }

    const sale = completeSale(
      selectedPaymentMethod,
      totalDiscount,
      selectedCustomer?.id,
      selectedPaymentMethod === 'Cash+Card'
        ? { cashAmount: splitCashAmount, cardAmount: splitCardAmount }
        : undefined
    );
    setLastSale(sale);
    setIsInvoiceOpen(false);
    setSelectedCustomer(null);
    setBillDiscountMode('amount');
    setBillDiscountValue(0);
    setItemDiscountModes({});
    setSelectedPaymentMethod('Cash');
    setSplitCashAmount(0);
    setSplitCardAmount(0);
    setCustomerSearch('');

    if (hasThermalPrinterConfigured) {
      void printReceiptForSale(sale).then(printed => {
        if (printed) {
          setTimeout(() => setIsInvoiceOpen(false), 300);
        } else {
          setIsInvoiceOpen(true);
        }
      });
    } else {
      setIsInvoiceOpen(true);
    }
  };

  const handleCreateCustomer = () => {
    if (newCustomer.name && newCustomer.phone) {
      const customer: Customer = {
        id: Math.random().toString(36).substr(2, 9),
        ...newCustomer,
        loyaltyPoints: 0,
        totalSpent: 0
      };
      addCustomer(customer);
      setSelectedCustomer(customer);
      setIsCustomerModalOpen(false);
      setNewCustomer({ name: '', phone: '', email: '' });
      setCustomerSearch('');
    }
  };

  // 10. Select customer from search dropdown
  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch('');
    setIsCustomerDropdownOpen(false);
  };

  const getMountLaviniaDefaultPrinter = () => {
    const normalizedName = (currentBranch?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalizedName === 'mountlavinia' ? 'XP - Q80B' : '';
  };

  const getThermalPrinterName = () => {
    const configured = (currentBranch?.thermalPrinterName || settings?.thermalPrinterName || '').trim();
    return configured || getMountLaviniaDefaultPrinter();
  };
  const hasThermalPrinterConfigured = Boolean(getThermalPrinterName());

  const printReceiptForSale = async (sale: SalesRecord) => {
    const isElectron = !!(window as any).electronAPI?.printReceipt;
    const fmtRs = (n: number) => `Rs. ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const discountPercent = sale.subtotal > 0 ? ((sale.discount / sale.subtotal) * 100).toFixed(2) : '0.00';
    const totalSavings = sale.items.reduce((s, i) => s + (i.discount || 0) * i.quantity, 0) + sale.discount;

    let logoUrl = window.location.origin + '/logo.png';
    if (isElectron && (window as any).electronAPI?.getLogoBase64) {
      const b64 = await (window as any).electronAPI.getLogoBase64();
      if (b64) logoUrl = b64;
    }

    const sd = parseBusinessDate(sale.date);
    const metaDate = `${String(sd.getDate()).padStart(2, '0')}/${String(sd.getMonth() + 1).padStart(2, '0')}/${sd.getFullYear()} ${sd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;

    const now = new Date();
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const footerDate = `${now.getFullYear()}.${MONTHS[now.getMonth()]}.${String(now.getDate()).padStart(2, '0')} AD ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;

    const barcodeStr = sale.invoiceNumber.replace(/\D/g, '').slice(-4).padStart(4, '0');
    let barsHtml = '<div style="display:flex;align-items:flex-end;justify-content:center;gap:0;">';
    barsHtml += '<div style="width:3px;height:50px;background:#000;"></div><div style="width:1px;height:50px;background:#fff;"></div><div style="width:2px;height:50px;background:#000;"></div><div style="width:1px;height:50px;background:#fff;"></div>';
    for (let bi = 0; bi < 32; bi++) {
      const d = parseInt(barcodeStr[bi % barcodeStr.length]) || (bi % 5);
      barsHtml += `<div style="width:${(d % 3) + 1}px;height:${bi % 3 === 0 ? 50 : 48}px;background:#000;"></div>`;
      barsHtml += `<div style="width:${(d % 2) + 1}px;height:${bi % 3 === 0 ? 50 : 48}px;background:#fff;"></div>`;
    }
    barsHtml += '<div style="width:2px;height:50px;background:#000;"></div><div style="width:1px;height:50px;background:#fff;"></div><div style="width:3px;height:50px;background:#000;"></div></div>';

    const itemsHtml = sale.items.map(item => {
      const discountedTotal = (item.price - (item.discount || 0)) * item.quantity;
      const variantLine = [item.size, item.color].filter(Boolean).join(' / ');
      return `<tr>
        <td style="padding:7px 0;font-size:13px;border-bottom:1px dotted #bbb;vertical-align:top;line-height:1.4;"><strong>${item.name}</strong>${variantLine ? `<br><span style="font-size:11px;color:#555;">${variantLine}</span>` : ''}</td>
        <td style="padding:7px 3px;text-align:center;font-size:13px;border-bottom:1px dotted #bbb;vertical-align:top;">${item.quantity}</td>
        <td style="padding:7px 3px;text-align:right;font-size:13px;border-bottom:1px dotted #bbb;vertical-align:top;">${item.price.toFixed(2)}</td>
        <td style="padding:7px 0;text-align:right;font-size:13px;border-bottom:1px dotted #bbb;vertical-align:top;">${discountedTotal.toFixed(2)}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html><head>
<title>Receipt ${sale.invoiceNumber}</title>
<meta charset="utf-8"/>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:Arial,Helvetica,sans-serif; width:70mm; margin:0 auto; padding:0; background:#fff; color:#000; font-size:12px; }
  .wrap { width:100%; padding:2mm 1.5mm 8mm 1.5mm; }
.meta { display:flex; justify-content:space-between; font-size:10px; color:#555; margin-bottom:4px; }
.logo-wrap { text-align:center; margin:2px 0 4px; }
.logo-wrap img { width:52mm; max-width:100%; height:auto; display:block; margin:0 auto; }
.store-info { text-align:center; font-size:11.5px; line-height:1.6; margin-bottom:8px; }
.cashier { font-size:13px; margin-bottom:4px; }
table.items { width:100%; border-collapse:collapse; }
  table.items thead th { font-size:11px; font-weight:700; padding:4px 0; border-top:2px solid #000; border-bottom:2px solid #000; }
  .th-item { text-align:left; width:45%; }
  .th-qty { text-align:center; width:8%; }
  .th-price { text-align:right; width:23%; }
  .th-total { text-align:right; width:22%; }
table.totals { width:100%; border-collapse:collapse; }
  table.totals td { font-size:12px; padding:3px 0; }
table.totals .lbl { text-align:right; padding-right:8px; }
table.totals .val { text-align:right; white-space:nowrap; }
  .grand td { font-size:14px; font-weight:900; padding:4px 0; }
.divider { border-top:2px solid #000; margin:5px 0; }
.divider-dot { border-top:1px dotted #999; margin:5px 0; }
  .tender { font-size:12px; padding:2px 0; }
  .disc-total { text-align:center; font-weight:700; font-size:13px; padding:5px 0; }
  .footer-note { text-align:center; font-size:10px; color:#111; line-height:1.5; margin:5px 0; }
.footer-box { background:#1c1c1c; color:#fff; text-align:center; font-size:15px; font-weight:700; padding:8px 4px; margin:8px 0 5px; }
.barcode-wrap { text-align:center; margin-top:6px; }
  .barcode-num { font-size:11px; letter-spacing:2px; margin-top:4px; font-family:'Courier New',monospace; }
.credit { text-align:center; font-size:10px; color:#444; margin-top:7px; line-height:1.6; }
  @media print { body { margin:0 auto; padding:0; } .wrap { padding:2mm 1.5mm 7mm 1.5mm; } @page { size:70mm auto; margin:0; } }
</style>
</head><body>
<div class="wrap">
<div class="meta">
  <span>${metaDate}</span>
  <span>Sales Receipt ${sale.invoiceNumber}</span>
</div>

<div class="logo-wrap"><img src="${logoUrl}" alt="Hoard Lavish"/></div>

<div class="store-info">
  Veediya bandara road, Ethulkotte<br>
  Tel : 074 177 4321<br>
  Web : www.hoardlavish.com
</div>

<div class="cashier">Cashier : ${currentUser?.name || 'Admin'}</div>

<table class="items">
  <thead>
    <tr>
      <th class="th-item">Item</th>
      <th class="th-qty">Qty</th>
      <th class="th-price">Org Price<br>Rs.</th>
      <th class="th-total">Total<br>Rs.</th>
    </tr>
  </thead>
  <tbody>${itemsHtml}</tbody>
</table>

<div class="divider"></div>

<table class="totals">
  <tr><td class="lbl">Sub Total</td><td class="val">${fmtRs(sale.subtotal)}</td></tr>
  <tr><td class="lbl">${discountPercent} % Disc</td><td class="val">${fmtRs(sale.discount)}</td></tr>
</table>

<div class="divider"></div>

<table class="totals">
  <tr class="grand"><td class="lbl">RECEIPT TOTAL</td><td class="val">${fmtRs(sale.totalAmount)}</td></tr>
</table>

<div class="divider"></div>

<div class="tender">Amount Tendered: ${fmtRs(sale.totalAmount)}</div>
${sale.paymentMethod === 'Cash+Card'
  ? `<div class="tender">Cash: ${fmtRs(sale.cashAmount || 0)}</div><div class="tender">Card: ${fmtRs(sale.cardAmount || 0)}</div>`
  : `<div class="tender">${sale.paymentMethod}: ${fmtRs(sale.totalAmount)}</div>`}

<div class="divider-dot"></div>

<div class="disc-total">Total Sales Discounts: ${fmtRs(totalSavings)}</div>

<div class="divider-dot"></div>

<div class="footer-note">
  For any exchange please produce the bill the<br>
  garment within original tag intact within 07days<br>
  NO EXCHANGE OR RETURN ACCEPTED FOR<br>
  ITEM SOLD IN OFFERS AND SALE
</div>

<div class="footer-box">*** Thank You, Come Again***</div>

<div class="barcode-wrap">
  ${barsHtml}
  <div class="barcode-num">${barcodeStr}</div>
</div>

<div class="credit">
  Hoard Lavish Pvt Ltd<br>
  ${footerDate}
</div>
</div>

${isElectron ? '' : '<script>window.onload=function(){window.print();};<\/script>'}
</body></html>`;

    if (isElectron) {
      const printerName = getThermalPrinterName();
      const printResult = await (window as any).electronAPI.printReceipt(html, printerName, { pageWidthMm: 70 });
      return Boolean(printResult?.success);
    }

    const printWindow = window.open('', '_blank', 'width=400,height=700');
    if (!printWindow) return false;
    printWindow.document.write(html);
    printWindow.document.close();
    return true;
  };

  const printReceiptForExchange = async (exchange: ExchangeRecord) => {
    const isElectron = !!(window as any).electronAPI?.printReceipt;
    const fmtRs = (n: number) => `Rs. ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const discountPercent = exchange.returnedTotal > 0 ? ((exchange.exchangeBillDiscount || 0) / exchange.returnedTotal * 100).toFixed(2) : '0.00';

    let logoUrl = window.location.origin + '/logo.png';
    if (isElectron && (window as any).electronAPI?.getLogoBase64) {
      const b64 = await (window as any).electronAPI.getLogoBase64();
      if (b64) logoUrl = b64;
    }

    const sd = parseBusinessDate(exchange.date);
    const metaDate = `${String(sd.getDate()).padStart(2, '0')}/${String(sd.getMonth() + 1).padStart(2, '0')}/${sd.getFullYear()} ${sd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;

    const now = new Date();
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const footerDate = `${now.getFullYear()}.${MONTHS[now.getMonth()]}.${String(now.getDate()).padStart(2, '0')} AD ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;

    const barcodeStr = exchange.exchangeNumber.replace(/\D/g, '').slice(-4).padStart(4, '0');
    let barsHtml = '<div style="display:flex;align-items:flex-end;justify-content:center;gap:0;">';
    barsHtml += '<div style="width:3px;height:50px;background:#000;"></div><div style="width:1px;height:50px;background:#fff;"></div><div style="width:2px;height:50px;background:#000;"></div><div style="width:1px;height:50px;background:#fff;"></div>';
    for (let bi = 0; bi < 32; bi++) {
      const d = parseInt(barcodeStr[bi % barcodeStr.length]) || (bi % 5);
      barsHtml += `<div style="width:${(d % 3) + 1}px;height:${bi % 3 === 0 ? 50 : 48}px;background:#000;"></div>`;
      barsHtml += `<div style="width:${(d % 2) + 1}px;height:${bi % 3 === 0 ? 50 : 48}px;background:#fff;"></div>`;
    }
    barsHtml += '<div style="width:2px;height:50px;background:#000;"></div><div style="width:1px;height:50px;background:#fff;"></div><div style="width:3px;height:50px;background:#000;"></div></div>';

    const returnedItemsHtml = exchange.returnedItems.map(item => {
      const variantLine = [item.size, item.color].filter(Boolean).join(' / ');
      return `<tr>
        <td style="padding:7px 0;font-size:13px;border-bottom:1px dotted #bbb;vertical-align:top;line-height:1.4;"><strong>${item.name}</strong>${variantLine ? `<br><span style="font-size:11px;color:#555;">${variantLine}</span>` : ''}</td>
        <td style="padding:7px 3px;text-align:center;font-size:13px;border-bottom:1px dotted #bbb;vertical-align:top;">${item.quantity}</td>
        <td style="padding:7px 3px;text-align:right;font-size:13px;border-bottom:1px dotted #bbb;vertical-align:top;">${item.effectiveUnitPrice?.toFixed(2) ?? item.price.toFixed(2)}</td>
        <td style="padding:7px 0;text-align:right;font-size:13px;border-bottom:1px dotted #bbb;vertical-align:top;">${fmtRs(item.lineEffectiveTotal ?? ((item.effectiveUnitPrice ?? item.price) * item.quantity))}</td>
      </tr>`;
    }).join('');

    const newItemsHtml = exchange.newItems.map(item => {
      const variantLine = [item.size, item.color].filter(Boolean).join(' / ');
      return `<tr>
        <td style="padding:7px 0;font-size:13px;border-bottom:1px dotted #bbb;vertical-align:top;line-height:1.4;"><strong>${item.name}</strong>${variantLine ? `<br><span style="font-size:11px;color:#555;">${variantLine}</span>` : ''}</td>
        <td style="padding:7px 3px;text-align:center;font-size:13px;border-bottom:1px dotted #bbb;vertical-align:top;">${item.quantity}</td>
        <td style="padding:7px 3px;text-align:right;font-size:13px;border-bottom:1px dotted #bbb;vertical-align:top;">${item.effectiveUnitPrice?.toFixed(2) ?? item.price.toFixed(2)}</td>
        <td style="padding:7px 0;text-align:right;font-size:13px;border-bottom:1px dotted #bbb;vertical-align:top;">${fmtRs(item.lineEffectiveTotal ?? ((item.effectiveUnitPrice ?? item.price) * item.quantity))}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html><head>
<title>Exchange ${exchange.exchangeNumber}</title>
<meta charset="utf-8"/>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:Arial,Helvetica,sans-serif; width:70mm; margin:0 auto; padding:0; background:#fff; color:#000; font-size:12px; }
  .wrap { width:100%; padding:2mm 1.5mm 8mm 1.5mm; }
.meta { display:flex; justify-content:space-between; font-size:10px; color:#555; margin-bottom:4px; }
.logo-wrap { text-align:center; margin:2px 0 4px; }
.logo-wrap img { width:52mm; max-width:100%; height:auto; display:block; margin:0 auto; }
.store-info { text-align:center; font-size:11.5px; line-height:1.6; margin-bottom:8px; }
.cashier { font-size:13px; margin-bottom:4px; }
table.items { width:100%; border-collapse:collapse; }
  table.items thead th { font-size:11px; font-weight:700; padding:4px 0; border-top:2px solid #000; border-bottom:2px solid #000; }
  .th-item { text-align:left; width:45%; }
  .th-qty { text-align:center; width:8%; }
  .th-price { text-align:right; width:23%; }
  .th-total { text-align:right; width:22%; }
table.totals { width:100%; border-collapse:collapse; }
  table.totals td { font-size:12px; padding:3px 0; }
table.totals .lbl { text-align:right; padding-right:8px; }
table.totals .val { text-align:right; white-space:nowrap; }
  .grand td { font-size:14px; font-weight:900; padding:4px 0; }
.divider { border-top:2px solid #000; margin:5px 0; }
.divider-dot { border-top:1px dotted #999; margin:5px 0; }
  .tender { font-size:12px; padding:2px 0; }
  .disc-total { text-align:center; font-weight:700; font-size:13px; padding:5px 0; }
  .footer-note { text-align:center; font-size:10px; color:#111; line-height:1.5; margin:5px 0; }
.footer-box { background:#1c1c1c; color:#fff; text-align:center; font-size:15px; font-weight:700; padding:8px 4px; margin:8px 0 5px; }
.barcode-wrap { text-align:center; margin-top:6px; }
  .barcode-num { font-size:11px; letter-spacing:2px; margin-top:4px; font-family:'Courier New',monospace; }
.credit { text-align:center; font-size:10px; color:#444; margin-top:7px; line-height:1.6; }
  @media print { body { margin:0 auto; padding:0; } .wrap { padding:2mm 1.5mm 7mm 1.5mm; } @page { size:70mm auto; margin:0; } }
</style>
</head><body>
<div class="wrap">
<div class="meta">
  <span>${metaDate}</span>
  <span>Exchange Receipt ${exchange.exchangeNumber}</span>
</div>

<div class="logo-wrap"><img src="${logoUrl}" alt="Hoard Lavish"/></div>

<div class="store-info">
  Veediya bandara road, Ethulkotte<br>
  Tel : 074 177 4321<br>
  Web : www.hoardlavish.com
</div>

<div class="cashier">Cashier : ${currentUser?.name || 'Admin'}</div>

<div class="divider"></div>

<div class="tender">Original Invoice: ${exchange.originalInvoiceNumber || 'N/A'}</div>
<div class="tender">Branch: ${exchange.branchName}</div>
<div class="tender">Payment / Settlement: ${exchange.paymentMethod}${exchange.refundMethod ? ` | Refund: ${exchange.refundMethod}` : ''}</div>

${exchange.returnedItems.length > 0 ? `
<table class="items">
  <thead>
    <tr>
      <th class="th-item">Returned Item</th>
      <th class="th-qty">Qty</th>
      <th class="th-price">Price<br>Rs.</th>
      <th class="th-total">Total<br>Rs.</th>
    </tr>
  </thead>
  <tbody>${returnedItemsHtml}</tbody>
</table>
<div class="tender" style="text-align:right;font-weight:700;color:#b91c1c;">Returned Total: -${fmtRs(exchange.returnedTotal)}</div>
<div class="divider"></div>
` : ''}

${exchange.newItems.length > 0 ? `
<table class="items">
  <thead>
    <tr>
      <th class="th-item">New Item</th>
      <th class="th-qty">Qty</th>
      <th class="th-price">Price<br>Rs.</th>
      <th class="th-total">Total<br>Rs.</th>
    </tr>
  </thead>
  <tbody>${newItemsHtml}</tbody>
</table>
<div class="tender" style="text-align:right;font-weight:700;color:#166534;">New Items Total: ${fmtRs(exchange.newTotal)}</div>
<div class="divider"></div>
` : ''}

<table class="totals">
  <tr><td class="lbl">Returned Value</td><td class="val">-${fmtRs(exchange.returnedTotal)}</td></tr>
  <tr><td class="lbl">New Items Value</td><td class="val">${fmtRs(exchange.newTotal)}</td></tr>
  ${exchange.exchangeBillDiscount ? `<tr><td class="lbl">Exchange Bill Discount</td><td class="val">-${fmtRs(exchange.exchangeBillDiscount)}</td></tr>` : ''}
</table>

<div class="divider"></div>

<table class="totals">
  <tr class="grand"><td class="lbl">EXCHANGE TOTAL</td><td class="val">${fmtRs(Math.abs(exchange.difference))}</td></tr>
</table>

<div class="tender">${exchange.difference >= 0 ? 'Customer Pays' : 'Customer Credit'}: ${fmtRs(Math.abs(exchange.difference))}</div>
${exchange.settlementType ? `<div class="tender">Settlement: ${exchange.settlementType}</div>` : ''}

<div class="divider-dot"></div>

<div class="disc-total">Exchange Discount: ${fmtRs(exchange.exchangeBillDiscount || 0)} (${discountPercent} %)</div>

<div class="divider-dot"></div>

<div class="footer-note">
  For any exchange please produce the bill the<br>
  garment within original tag intact within 07days<br>
  NO EXCHANGE OR RETURN ACCEPTED FOR<br>
  ITEM SOLD IN OFFERS AND SALE
</div>

<div class="footer-box">*** Thank You, Come Again***</div>

<div class="barcode-wrap">
  ${barsHtml}
  <div class="barcode-num">${barcodeStr}</div>
</div>

<div class="credit">
  Hoard Lavish Pvt Ltd<br>
  ${footerDate}
</div>
</div>

${isElectron ? '' : '<script>window.onload=function(){window.print();};<\/script>'}
</body></html>`;

    if (isElectron) {
      const printerName = getThermalPrinterName();
      const printResult = await (window as any).electronAPI.printReceipt(html, printerName, { pageWidthMm: 70 });
      return Boolean(printResult?.success);
    }

    const printWindow = window.open('', '_blank', 'width=400,height=700');
    if (!printWindow) return false;
    printWindow.document.write(html);
    printWindow.document.close();
    return true;
  };

  const handlePrint = async () => {
    if (!lastSale) return;

    const printed = await printReceiptForSale(lastSale);
    if (printed) {
      setTimeout(() => setIsInvoiceOpen(false), 300);
    }
  };

  // === Exchange Helpers ===

  const filteredExchangeSales = useMemo(() => {
    if (!exchangeSaleSearch.trim()) return salesHistory.slice(0, 10);
    const term = exchangeSaleSearch.toLowerCase();
    return salesHistory.filter(s =>
      s.invoiceNumber.toLowerCase().includes(term) ||
      (s.customerName && s.customerName.toLowerCase().includes(term))
    ).slice(0, 10);
  }, [salesHistory, exchangeSaleSearch]);

  const linkedReturnedQtyByLine = useMemo(() => {
    const map = new Map<string, number>();
    if (!selectedExchangeSale) return map;

    exchangeHistory
      .filter(ex => ex.originalSaleId === selectedExchangeSale.id)
      .forEach(ex => {
        ex.returnedItems.forEach(it => {
          if (typeof it.sourceSaleItemIndex !== 'number') return;
          const lineKey = `${selectedExchangeSale.id}:${it.sourceSaleItemIndex}`;
          map.set(lineKey, (map.get(lineKey) || 0) + Math.max(0, it.quantity));
        });
      });

    return map;
  }, [exchangeHistory, selectedExchangeSale]);

  const selectedExchangeSalePricedLines = useMemo(() => {
    if (!selectedExchangeSale) return [] as Array<{ item: CartItem; lineIndex: number; lineKey: string; unitItemDiscount: number; unitBillDiscountShare: number; effectiveUnitPrice: number; alreadyReturned: number; availableQuantity: number; }>;

    const totalUnits = selectedExchangeSale.items.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
    const itemDiscountTotal = selectedExchangeSale.items.reduce((sum, item) => sum + (Math.max(0, item.discount || 0) * item.quantity), 0);
    const rawBillOnlyDiscount = Math.max(0, selectedExchangeSale.discount - itemDiscountTotal);
    const subtotalAfterItemDiscounts = selectedExchangeSale.items.reduce((sum, item) => {
      const unitItemDiscount = Math.max(0, item.discount || 0);
      return sum + Math.max(0, item.price - unitItemDiscount) * item.quantity;
    }, 0);
    const billOnlyDiscount = Math.min(rawBillOnlyDiscount, Math.max(0, subtotalAfterItemDiscounts));

    const perUnitBillShares = allocateDiscountByUnits(billOnlyDiscount, totalUnits);
    let cursor = 0;

    return selectedExchangeSale.items.map((item, idx) => {
      const unitItemDiscount = Math.max(0, item.discount || 0);
      const lineUnitShares = perUnitBillShares.slice(cursor, cursor + item.quantity);
      cursor += item.quantity;
      const unitBillDiscountShare = lineUnitShares.length > 0
        ? round2(lineUnitShares.reduce((sum, v) => sum + v, 0) / lineUnitShares.length)
        : 0;
      const effectiveUnitPrice = round2(Math.max(0, item.price - unitItemDiscount - unitBillDiscountShare));

      return {
        item,
        lineIndex: idx,
        lineKey: `${selectedExchangeSale.id}:${idx}`,
        unitItemDiscount,
        unitBillDiscountShare,
        effectiveUnitPrice,
        alreadyReturned: linkedReturnedQtyByLine.get(`${selectedExchangeSale.id}:${idx}`) || 0,
        availableQuantity: Math.max(0, item.quantity - (linkedReturnedQtyByLine.get(`${selectedExchangeSale.id}:${idx}`) || 0)),
      };
    });
  }, [linkedReturnedQtyByLine, selectedExchangeSale]);

  const exchangeNewProductResults = useMemo(() => {
    if (!exchangeNewProductSearch.trim()) return [];
    const term = exchangeNewProductSearch.toLowerCase();
    return products.filter(p =>
      (p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)) &&
      (p.branchStock[currentBranch.id] || 0) > 0
    ).slice(0, 8);
  }, [products, exchangeNewProductSearch, currentBranch]);

  const noSaleProductResults = useMemo(() => {
    if (!noSaleProductSearch.trim()) return [];
    const term = noSaleProductSearch.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)
    ).slice(0, 8);
  }, [products, noSaleProductSearch]);

  const handleSelectReturnItem = (line: { item: CartItem; lineIndex: number; lineKey: string; unitItemDiscount: number; unitBillDiscountShare: number; effectiveUnitPrice: number; alreadyReturned: number; availableQuantity: number; }) => {
    const existing = returnedItems.find(r => r.sourceLineKey === line.lineKey);
    if (existing) return;
    if (line.availableQuantity <= 0) {
      setAlertPopup({ message: 'All quantities from this sale line have already been returned in previous exchanges.', type: 'warning' });
      return;
    }

    setReturnedItems(prev => [
      ...prev,
      {
        ...line.item,
        quantity: 1,
        sourceType: 'linked-sale',
        sourceSaleId: selectedExchangeSale?.id,
        sourceInvoiceNumber: selectedExchangeSale?.invoiceNumber,
        sourceSaleItemIndex: line.lineIndex,
        sourceLineKey: line.lineKey,
        originalQuantity: line.availableQuantity,
        unitItemDiscount: line.unitItemDiscount,
        unitBillDiscountShare: line.unitBillDiscountShare,
        effectiveUnitPrice: line.effectiveUnitPrice,
        lineEffectiveTotal: getEffectiveLineTotal({
          ...line.item,
          unitItemDiscount: line.unitItemDiscount,
          unitBillDiscountShare: line.unitBillDiscountShare,
          effectiveUnitPrice: line.effectiveUnitPrice,
        }, 1),
      }
    ]);
  };

  const handleAddExchangeNewItem = (product: Product) => {
    const existing = exchangeNewItems.find(r => r.id === product.id);
    if (existing) {
      setExchangeNewItems(prev => prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setExchangeNewItems(prev => [...prev, {
        ...product,
        quantity: 1,
        sourceType: 'new-exchange-item',
        unitItemDiscount: 0,
      }]);
    }
    setExchangeNewProductSearch('');
  };

  const handleAddNoSaleReturnItem = (product: Product) => {
    const existing = noSaleReturnItems.find(r => r.id === product.id);
    if (existing) return;
    setNoSaleReturnItems(prev => [...prev, {
      ...product,
      quantity: 1,
      sourceType: 'no-sale-return',
      manualReturnUnitPrice: product.price,
      effectiveUnitPrice: product.price,
      lineEffectiveTotal: round2(product.price),
    }]);
    setNoSaleProductSearch('');
  };

  const exchangeNewSubtotal = exchangeNewItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  const exchangeNewItemDiscountTotal = exchangeNewItems.reduce((sum, i) => sum + (Math.max(0, i.unitItemDiscount || 0) * i.quantity), 0);
  const exchangeNewSubtotalAfterItemDiscounts = Math.max(0, exchangeNewSubtotal - exchangeNewItemDiscountTotal);
  const exchangeNewBillDiscountRaw = exchangeBillDiscountMode === 'percentage'
    ? (exchangeNewSubtotalAfterItemDiscounts * exchangeBillDiscountValue) / 100
    : exchangeBillDiscountValue;
  const exchangeNewBillDiscount = Math.min(Math.max(0, exchangeNewBillDiscountRaw), exchangeNewSubtotalAfterItemDiscounts);
  const exchangeNewBillUnitShare = allocateDiscountByUnits(exchangeNewBillDiscount, exchangeNewItems.reduce((sum, i) => sum + i.quantity, 0));

  let exchangeBillCursor = 0;
  const exchangeNewItemsPriced = exchangeNewItems.map(item => {
    const lineShares = exchangeNewBillUnitShare.slice(exchangeBillCursor, exchangeBillCursor + item.quantity);
    exchangeBillCursor += item.quantity;
    const unitBillDiscountShare = lineShares.length > 0
      ? round2(lineShares.reduce((sum, v) => sum + v, 0) / lineShares.length)
      : 0;
    const effectiveUnitPrice = round2(Math.max(0, item.price - Math.max(0, item.unitItemDiscount || 0) - unitBillDiscountShare));
    return {
      ...item,
      unitBillDiscountShare,
      effectiveUnitPrice,
      lineEffectiveTotal: round2(effectiveUnitPrice * item.quantity),
    };
  });

  const returnedTotal = returnedItems.reduce((sum, i) => sum + getEffectiveLineTotal(i, i.quantity), 0)
    + noSaleReturnItems.reduce((sum, i) => sum + getEffectiveLineTotal(i, i.quantity), 0);
  const newItemsTotal = exchangeNewItemsPriced.reduce((sum, i) => sum + (i.lineEffectiveTotal || getEffectiveLineTotal(i, i.quantity)), 0);
  const exchangeDifference = newItemsTotal - returnedTotal;

  const handleCompleteExchange = () => {
    const allReturned = [
      ...returnedItems.map(i => ({ ...i, lineEffectiveTotal: getEffectiveLineTotal(i, i.quantity) })),
      ...noSaleReturnItems.map(i => ({
        ...i,
        effectiveUnitPrice: Math.max(0, i.manualReturnUnitPrice ?? 0),
        lineEffectiveTotal: getEffectiveLineTotal(i, i.quantity)
      })),
    ];
    if (allReturned.length === 0 && exchangeNewItems.length === 0) return;

    const invalidNoSaleReturn = noSaleReturnItems.some(i => !Number.isFinite(i.manualReturnUnitPrice) || (i.manualReturnUnitPrice ?? 0) <= 0);
    if (invalidNoSaleReturn) {
      setAlertPopup({ message: 'Manual return price is required for no-sale return items.', type: 'warning' });
      return;
    }

    try {
      const exchange = completeExchange({
        originalSaleId: selectedExchangeSale?.id,
        originalInvoiceNumber: selectedExchangeSale?.invoiceNumber,
        returnedItems: allReturned,
        newItems: exchangeNewItemsPriced,
        returnedTotal,
        newTotal: newItemsTotal,
        difference: exchangeDifference,
        paymentMethod: selectedPaymentMethod,
        refundMethod: exchangeDifference < 0 ? exchangeRefundMethod : undefined,
        settlementType: exchangeDifference > 0 ? 'CUSTOMER_PAYS' : exchangeDifference < 0 ? 'STORE_REFUND' : 'EVEN',
        exchangeBillDiscount: exchangeNewBillDiscount,
        customerId: selectedExchangeSale?.customerId,
        customerName: selectedExchangeSale?.customerName,
        description: exchangeDescription || 'Product Exchange',
      });

      setLastExchange(exchange);
      setIsExchangeInvoiceOpen(true);
      resetExchangeState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Exchange could not be completed.';
      setAlertPopup({ message: msg, type: 'warning' });
    }
  };

  const handlePrintExchangeInvoice = async (exchange: ExchangeRecord) => {
    return printReceiptForExchange(exchange);
  };

  const resetExchangeState = () => {
    setSelectedExchangeSale(null);
    setReturnedItems([]);
    setExchangeNewItems([]);
    setExchangeDescription('');
    setExchangeNewProductSearch('');
    setNoSaleReturnItems([]);
    setNoSaleProductSearch('');
    setExchangeSaleSearch('');
    setExchangeBillDiscountMode('amount');
    setExchangeBillDiscountValue(0);
    setExchangeRefundMethod('Cash');
  };

  return (
    <div className="flex h-full bg-slate-50 overflow-hidden relative">
      {/* Product Grid Area */}
      <div className="flex-1 flex flex-col overflow-hidden transition-all duration-300">
        {/* Header / Search */}
        <div className="p-6 bg-white border-b border-slate-200">
          <div className="flex justify-between items-start mb-4">
            <div className="flex flex-col md:flex-row gap-4 items-center flex-1">
              {/* Barcode / SKU Input with dynamic suggestions */}
              <div className="relative w-full md:w-64">
                <form onSubmit={handleBarcodeSubmit}>
                  <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    placeholder="Scan Barcode / SKU"
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-slate-50 font-mono"
                    value={barcodeInput}
                    onChange={(e) => {
                      barcodeValueRef.current = e.target.value;
                      setBarcodeInput(e.target.value);
                    }}
                    onFocus={() => { }}
                    onBlur={() => setTimeout(() => { }, 200)}
                  />
                </form>
                {/* 1. Dynamic SKU suggestions dropdown */}
                {barcodeInput && skuSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-30 overflow-hidden">
                    {skuSuggestions.map(p => {
                      const stock = p.branchStock[currentBranch.id] || 0;
                      const variantText = [p.size ? `Size: ${p.size}` : '', p.color ? `Color: ${p.color}` : ''].filter(Boolean).join(' • ');
                      return (
                        <button
                          key={p.id}
                          onMouseDown={() => handleSkuSelect(p)}
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 transition-colors text-left"
                        >
                          <div>
                            <div>
                              <span className="font-mono text-xs text-amber-600 font-bold">{p.sku}</span>
                              <span className="text-sm text-slate-700 ml-2">{p.name}</span>
                            </div>
                            {variantText && (
                              <p className="text-[11px] text-slate-500 mt-0.5">{variantText}</p>
                            )}
                          </div>
                          <span className={`text-xs font-bold ${stock > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {stock > 0 ? `${stock} in stock` : 'Out of stock'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Scan button */}
              <button
                type="button"
                onClick={() => setIsScanMode(true)}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition-colors whitespace-nowrap shadow-sm"
              >
                <ScanBarcode size={18} />
                Scan
              </button>

              {/* 2. Search input with ENTER to add */}
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search products... (Enter to add)"
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                />
                {/* Show hint about top match */}
                {searchTerm && filteredProducts.length > 0 && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                    ↵ {filteredProducts[0].name}
                  </div>
                )}
              </div>
            </div>
            <div className="ml-4 flex items-center gap-2">
              <button
                onClick={() => {
                  setSelectedPaymentMethod('Cash');
                  setIsExchangeMode(!isExchangeMode);
                  if (isExchangeMode) resetExchangeState();
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${isExchangeMode ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'}`}
              >
                <ArrowRightLeft size={14} /> Exchange
              </button>
              <div className="flex items-center gap-2 bg-slate-100 text-slate-600 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap">
                <Store size={14} />
                {currentBranch.name}
              </div>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors
                  ${selectedCategory === cat
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredProducts.map(product => {
              const stock = product.branchStock[currentBranch.id] || 0;
              const variantText = [product.size ? `Size: ${product.size}` : '', product.color ? `Color: ${product.color}` : ''].filter(Boolean).join(' • ');
              return (
                <div
                  key={product.id}
                  onClick={() => stock > 0 && handleAddToCart(product)}
                  className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm transition-all group relative
                    ${stock > 0
                      ? 'hover:shadow-md cursor-pointer hover:border-amber-400'
                      : 'opacity-60 cursor-not-allowed grayscale'}`}
                >
                  {stock === 0 && (
                    <span className="absolute top-2 right-2 text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Out of Stock</span>
                  )}
                  <h3 className="font-semibold text-slate-800 text-sm mb-1 truncate">{product.name}</h3>
                  <p className="text-xs text-slate-500 mb-2 font-mono">{product.sku}</p>
                  {variantText && (
                    <p className="text-[11px] text-slate-500 mb-2 line-clamp-1">{variantText}</p>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900">{fmtCurrency(product.price)}</span>
                    {/* 3. Improved stock UI */}
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${stock > 10 ? 'bg-emerald-500' : stock > 5 ? 'bg-amber-500' : stock > 0 ? 'bg-red-500 animate-pulse' : 'bg-slate-300'}`}></div>
                      <span className={`text-xs font-bold ${stock > 10 ? 'text-emerald-600' : stock > 5 ? 'text-amber-600' : stock > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                        {stock > 0 ? `${stock} left` : 'None'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Cart Sidebar */}
      <div className="w-96 bg-white border-l border-slate-200 flex flex-col shadow-2xl z-20">

        {/* 8 & 10. Customer Section with search */}
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          {selectedCustomer ? (
            <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-amber-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold">
                  {selectedCustomer.name.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-900">{selectedCustomer.name}</p>
                  <p className="text-xs text-slate-500">Pts: {selectedCustomer.loyaltyPoints} • {selectedCustomer.phone}</p>
                </div>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="text-slate-400 hover:text-red-500">
                <X size={18} />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                {/* 10. Customer search input with dynamic filtering */}
                <div className="relative flex-1">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    ref={customerSearchRef}
                    type="text"
                    placeholder="Search customer by name or phone..."
                    className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setIsCustomerDropdownOpen(true);
                    }}
                    onFocus={() => setIsCustomerDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setIsCustomerDropdownOpen(false), 200)}
                  />
                  {/* Dynamic customer dropdown */}
                  {isCustomerDropdownOpen && customerSearch && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-30 max-h-48 overflow-y-auto">
                      {filteredCustomers.length > 0 ? (
                        filteredCustomers.map(c => (
                          <button
                            key={c.id}
                            onMouseDown={() => handleSelectCustomer(c)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left"
                          >
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">
                              {c.name.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-800">{c.name}</p>
                              <p className="text-xs text-slate-400">{c.phone}</p>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-4 text-center text-sm text-slate-400">No customers found</div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setIsCustomerModalOpen(true)}
                  className="bg-slate-900 text-white p-2 rounded-lg hover:bg-slate-800 transition-colors"
                  title="Add New Customer"
                >
                  <UserPlus size={20} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Cart Items — 5. + and - controls */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                <ScanBarcode className="w-8 h-8 opacity-40" />
              </div>
              <p>Scan items or select from grid</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.id} className="flex gap-3 items-start p-3 bg-white rounded-lg border border-slate-100 shadow-sm">
                <div className="w-10 h-10 bg-slate-100 rounded-md flex-shrink-0 flex items-center justify-center">
                  <span className="text-sm font-bold text-slate-400">{item.name.charAt(0)}</span>
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h4 className="font-medium text-slate-900 text-sm line-clamp-1">{item.name}</h4>
                      {(item.size || item.color) && (
                        <div className="flex gap-2 mt-1">
                          {item.size && (
                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">Size: {item.size}</span>
                          )}
                          {item.color && (
                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">Color: {item.color}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <p className="text-slate-900 font-bold text-sm ml-2">{fmtCurrency(item.price * item.quantity - (item.discount || 0) * item.quantity)}</p>
                  </div>

                  {/* Product Discount */}
                  <div className="flex items-center gap-2 mt-2">
                    <label className="text-xs text-slate-500 font-medium">Discount/unit:</label>
                    <select
                      value={itemDiscountModes[item.id] || 'amount'}
                      onChange={(e) => setItemDiscountModes(prev => ({ ...prev, [item.id]: e.target.value as DiscountMode }))}
                      className="px-2 py-1 text-xs border border-slate-200 rounded outline-none focus:ring-1 focus:ring-slate-400 bg-white"
                    >
                      <option value="amount">{CUR}</option>
                      <option value="percentage">%</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={(itemDiscountModes[item.id] || 'amount') === 'percentage'
                        ? (item.price > 0 ? ((item.discount || 0) / item.price) * 100 : 0)
                        : (item.discount || 0)
                      }
                      onChange={(e) => handleItemDiscountChange(item.id, Number(e.target.value), itemDiscountModes[item.id] || 'amount')}
                      className="w-20 px-2 py-1 text-xs border border-slate-200 rounded outline-none focus:ring-1 focus:ring-slate-400"
                      placeholder={(itemDiscountModes[item.id] || 'amount') === 'percentage' ? '0.00%' : '0.00'}
                    />
                    {(item.discount || 0) > 0 && (
                      <span className="text-xs text-emerald-600 font-medium">
                        -{fmtCurrency((item.discount || 0) * item.quantity)} total
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    {/* 5. Clear controls: - to reduce, + to add, trash to remove entirely */}
                    <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                      <button
                        onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                        className="p-1.5 hover:bg-white rounded-md transition-colors"
                        title="Remove one"
                      >
                        <Minus size={12} className="text-slate-600" />
                      </button>
                      <span className="text-xs font-bold w-8 text-center">{item.quantity}</span>
                      <button
                        onClick={() => handleAddToCart(item)}
                        className="p-1.5 hover:bg-white rounded-md transition-colors"
                        title="Add one more"
                      >
                        <Plus size={12} className="text-slate-600" />
                      </button>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                      title="Remove item"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer / Calculations — 4. No tax */}
        <div className="p-5 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-slate-500 text-sm">
              <span>Subtotal</span>
              <span>{fmtCurrency(subtotal)}</span>
            </div>

            {/* Item discounts */}
            {itemDiscountsTotal > 0 && (
              <div className="flex justify-between text-emerald-600 text-sm">
                <span>Product Discounts</span>
                <span>-{fmtCurrency(itemDiscountsTotal)}</span>
              </div>
            )}

            {/* 7. Additional Discount with profit validation */}
            <div className="flex justify-between items-center text-slate-500 text-sm">
              <span>Additional Discount</span>
              <div className="flex items-center gap-1">
                <select
                  value={billDiscountMode}
                  onChange={(e) => handleBillDiscountModeChange(e.target.value as DiscountMode)}
                  className="px-2 py-1 text-xs border border-slate-200 rounded outline-none focus:ring-1 focus:ring-slate-400 bg-white"
                >
                  <option value="amount">{CUR}</option>
                  <option value="percentage">%</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-20 text-right border-b border-slate-200 focus:border-amber-500 outline-none text-slate-700"
                  value={billDiscountValue}
                  onChange={(e) => handleBillDiscountChange(Number(e.target.value))}
                />
              </div>
            </div>

            {additionalDiscountAmount > 0 && (
              <div className="flex justify-between text-emerald-600 text-sm">
                <span>Bill Discount ({billDiscountMode === 'percentage' ? `${billDiscountValue.toFixed(2)}%` : CUR})</span>
                <span>-{fmtCurrency(additionalDiscountAmount)}</span>
              </div>
            )}

            {/* Total discounts */}
            {totalDiscount > 0 && (
              <div className="flex justify-between text-slate-700 text-sm font-medium">
                <span>Total Discount</span>
                <span>-{fmtCurrency(totalDiscount)}</span>
              </div>
            )}
          </div>

          <div className="flex justify-between mb-6 items-end pt-2 border-t border-dashed border-slate-200">
            <span className="text-slate-900 font-bold text-lg">Total</span>
            <span className="text-3xl font-bold text-slate-900">{fmtCurrency(total)}</span>
          </div>

          {/* Payment Method Dropdown */}
          <div className="mb-3">
            <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Payment Method</label>
            <select
              value={selectedPaymentMethod}
              onChange={e => setSelectedPaymentMethod(e.target.value as any)}
              className="w-full p-3 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 bg-white text-slate-700 font-medium"
            >
              <option value="Cash">💵 Cash</option>
              <option value="Card">💳 Card</option>
              <option value="COD">📦 COD (Cash on Delivery)</option>
              <option value="Cash+Card">💵+💳 Cash+Card</option>
              <option value="PayHere">📱 PayHere</option>
              <option value="Online Transfer">🌐 Online Transfer</option>
              <option value="MintPay">💰 MintPay</option>
            </select>
          </div>

          {selectedPaymentMethod === 'Cash+Card' && (
            <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 space-y-2">
              <p className="text-xs font-bold text-amber-700 uppercase">Split Payment</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-600">Cash Amount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={splitCashAmount}
                    onChange={(e) => setSplitCashAmount(Math.max(0, Number(e.target.value) || 0))}
                    className="mt-1 w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600">Card Amount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={splitCardAmount}
                    onChange={(e) => setSplitCardAmount(Math.max(0, Number(e.target.value) || 0))}
                    className="mt-1 w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                  />
                </div>
              </div>
              <div className={`text-xs font-medium ${Math.abs(splitRemaining) <= 0.01 ? 'text-emerald-600' : 'text-amber-700'}`}>
                {Math.abs(splitRemaining) <= 0.01
                  ? 'Split total matches bill total'
                  : `Remaining to match total: ${fmtCurrency(Math.abs(splitRemaining))}`}
              </div>
            </div>
          )}

          <button
            onClick={handleCheckout}
            disabled={cart.length === 0 || (selectedPaymentMethod === 'Cash+Card' && Math.abs(splitRemaining) > 0.01)}
            className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 shadow-lg disabled:opacity-50 transition-colors"
          >
            <CreditCard size={18} /> Complete Sale
          </button>
        </div>
      </div>

      {/* 9. Add Customer Modal — email optional */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">New Customer</h3>
              <button onClick={() => setIsCustomerModalOpen(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Name <span className="text-red-400">*</span></label>
                <input type="text" className="w-full mt-1 p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-500" placeholder="Customer name" value={newCustomer.name} onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Phone <span className="text-red-400">*</span></label>
                <input type="text" className="w-full mt-1 p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-500" placeholder="Phone number" value={newCustomer.phone} onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Email</label>
                <input type="email" className="w-full mt-1 p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-500" placeholder="(optional)" value={newCustomer.email} onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })} />
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button onClick={handleCreateCustomer} className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                Save Customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      {isInvoiceOpen && lastSale && (
        <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="text-green-400" size={24} />
                  <h2 className="text-xl font-bold">Payment Successful</h2>
                </div>
                <p className="text-slate-400 text-sm mt-1">Invoice #{lastSale.invoiceNumber}</p>
              </div>
              <button onClick={() => setIsInvoiceOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 bg-slate-50 print:bg-white" id="invoice-preview">
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">HOARD LAVISH</h1>
                <p className="text-slate-500 text-sm mt-1">Luxury Fashion Retail</p>
                <p className="text-slate-400 text-xs mt-1">{parseBusinessDate(lastSale.date).toLocaleString()}</p>
                <p className="text-slate-400 text-xs mt-1 font-bold">{lastSale.branchName}</p>
              </div>

              {lastSale.customerName && (
                <div className="mb-6 pb-6 border-b border-dashed border-slate-200">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Customer</p>
                  <p className="font-bold text-slate-900">{lastSale.customerName}</p>
                </div>
              )}

              <div className="space-y-3 mb-6">
                {lastSale.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <div className="flex gap-2 flex-1">
                      <span className="font-bold text-slate-700">{item.quantity}x</span>
                      <div className="flex-1">
                        <span className="text-slate-600">{item.name}</span>
                        {(item.size || item.color) && (
                          <div className="flex gap-1 mt-0.5">
                            {item.size && <span className="text-xs text-slate-400">Size: {item.size}</span>}
                            {item.size && item.color && <span className="text-xs text-slate-400">•</span>}
                            {item.color && <span className="text-xs text-slate-400">Color: {item.color}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="font-medium text-slate-900 ml-2">{fmtCurrency(item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 pt-4 space-y-2">
                <div className="flex justify-between text-sm text-slate-500">
                  <span>Subtotal</span>
                  <span>{fmtCurrency(lastSale.subtotal)}</span>
                </div>
                {lastSale.discount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600">
                    <span>Discount</span>
                    <span>-{fmtCurrency(lastSale.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold text-slate-900 pt-2 border-t border-slate-200 mt-2">
                  <span>Total</span>
                  <span>{fmtCurrency(lastSale.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>Payment Method</span>
                  <span>{lastSale.paymentMethod}</span>
                </div>
                {lastSale.paymentMethod === 'Cash+Card' && (
                  <>
                    <div className="flex justify-between text-xs text-slate-400 mt-1">
                      <span>Cash Portion</span>
                      <span>{fmtCurrency(lastSale.cashAmount || 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400 mt-1">
                      <span>Card Portion</span>
                      <span>{fmtCurrency(lastSale.cardAmount || 0)}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-8 text-center">
                <ScanBarcode className="w-full h-12 text-slate-200" />
                <p className="text-[10px] text-slate-400 mt-2">Thank you for shopping with us.</p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-white">
              <button
                onClick={handlePrint}
                className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-3 rounded-xl hover:bg-slate-800 transition-colors font-medium"
              >
                <Printer size={18} /> Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scan Mode Overlay */}
      {isScanMode && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsScanMode(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4 animate-pulse">
                <ScanBarcode size={32} className="text-amber-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Ready to Scan</h3>
              <p className="text-sm text-slate-500 mb-4">Point your barcode scanner at the product barcode now.<br/>The product will be added to checkout automatically.</p>
              <div className="min-h-[48px] bg-slate-50 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center px-4 py-3 font-mono text-lg">
                {scanModeBuffer ? (
                  <span className="text-slate-800 font-bold">{scanModeBuffer}</span>
                ) : (
                  <span className="text-slate-400 text-sm">Waiting for scanner input...</span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-3">Press <kbd className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200 text-slate-500 font-mono">Esc</kbd> or click outside to cancel</p>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-center">
              <button
                onClick={() => setIsScanMode(false)}
                className="px-6 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Custom Alert Popup (replaces window.alert) */}
      {alertPopup && (
        <AlertPopup
          message={alertPopup.message}
          type={alertPopup.type}
          onClose={() => setAlertPopup(null)}
        />
      )}

      {/* Exchange Mode Panel */}
      {isExchangeMode && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-amber-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-full text-amber-600"><ArrowRightLeft size={20} /></div>
                <div>
                  <h3 className="font-bold text-slate-800">Product Exchange</h3>
                  <p className="text-xs text-slate-500">Return old products and issue new ones</p>
                </div>
              </div>
              <button onClick={() => { setIsExchangeMode(false); resetExchangeState(); }} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Step 1: Select Previous Sale (Optional) */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <RotateCcw size={14} className="text-amber-500" />
                  Step 1: Select Original Sale <span className="text-xs font-normal text-slate-400">(optional)</span>
                </h4>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    placeholder="Search by invoice # or customer name..."
                    className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                    value={exchangeSaleSearch}
                    onChange={e => setExchangeSaleSearch(e.target.value)}
                  />
                </div>

                {/* Sale suggestions */}
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {filteredExchangeSales.map(sale => (
                    <button
                      key={sale.id}
                      onClick={() => { setSelectedExchangeSale(sale); setReturnedItems([]); }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-sm transition-colors ${selectedExchangeSale?.id === sale.id ? 'bg-amber-100 border border-amber-300' : 'hover:bg-white border border-transparent'}`}
                    >
                      <div>
                        <span className="font-mono text-xs text-amber-600 font-bold">{sale.invoiceNumber}</span>
                        <span className="text-slate-600 ml-2">{sale.customerName || 'Walk-in'}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-800">{fmtCurrency(sale.totalAmount)}</span>
                        <span className="text-[10px] text-slate-400 ml-2">{parseBusinessDate(sale.date).toLocaleDateString()}</span>
                      </div>
                    </button>
                  ))}
                </div>

                {selectedExchangeSale && (
                  <div className="mt-3 p-3 bg-white rounded-lg border border-amber-200">
                    <p className="text-xs font-bold text-slate-500 uppercase mb-2">Select items to return from {selectedExchangeSale.invoiceNumber}</p>
                    <div className="space-y-1">
                      {selectedExchangeSalePricedLines.map((line) => {
                        const { item, lineKey, lineIndex, effectiveUnitPrice, unitItemDiscount, unitBillDiscountShare, availableQuantity, alreadyReturned } = line;
                        const isSelected = returnedItems.some(r => r.sourceLineKey === lineKey);
                        const selectedRow = returnedItems.find(r => r.sourceLineKey === lineKey);
                        return (
                          <div key={lineKey} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={!isSelected && availableQuantity <= 0}
                                onChange={() => isSelected ? setReturnedItems(prev => prev.filter(r => r.sourceLineKey !== lineKey)) : handleSelectReturnItem(line)}
                                className="w-4 h-4 rounded border-slate-300 accent-amber-500"
                              />
                              <div>
                                <p className="text-sm font-medium text-slate-800">{item.name}</p>
                                {(item.size || item.color) && (
                                  <p className="text-xs text-slate-400 mt-0.5">
                                    {[item.size ? `Size: ${item.size}` : '', item.color ? `Color: ${item.color}` : ''].filter(Boolean).join(' • ')}
                                  </p>
                                )}
                                <p className="text-xs text-slate-400">SKU: {item.sku || '-'} • Line #{lineIndex + 1}</p>
                                <p className="text-xs text-slate-400">List: {fmtCurrency(item.price)} | Disc: -{fmtCurrency(unitItemDiscount + unitBillDiscountShare)} | Return Value: {fmtCurrency(effectiveUnitPrice)} each</p>
                                <p className={`text-xs mt-0.5 ${availableQuantity > 0 ? 'text-slate-400' : 'text-red-500'}`}>Sold: {item.quantity} • Already Returned: {alreadyReturned} • Available: {availableQuantity}</p>
                              </div>
                            </div>
                            {isSelected && (
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-slate-500">Qty:</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={availableQuantity}
                                  value={selectedRow?.quantity || 1}
                                  onChange={e => setReturnedItems(prev => prev.map(r => {
                                    if (r.sourceLineKey !== lineKey) return r;
                                    const quantity = Math.min(availableQuantity, Math.max(1, Number(e.target.value)));
                                    return { ...r, quantity, lineEffectiveTotal: getEffectiveLineTotal(r, quantity) };
                                  }))}
                                  className="w-14 p-1 border border-slate-200 rounded text-xs text-center"
                                />
                                <span className="text-xs text-slate-400">/ {availableQuantity}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* No-Sale Return (add back stock) */}
              {!selectedExchangeSale && (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                    <RotateCcw size={14} className="text-blue-500" />
                    Return Items Without Sale <span className="text-xs font-normal text-slate-400">(adds stock back)</span>
                  </h4>
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="text"
                      placeholder="Search product to return..."
                      className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                      value={noSaleProductSearch}
                      onChange={e => setNoSaleProductSearch(e.target.value)}
                    />
                    {noSaleProductResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-30 max-h-36 overflow-y-auto">
                        {noSaleProductResults.map(p => (
                          <button key={p.id} onMouseDown={() => handleAddNoSaleReturnItem(p)} className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 transition-colors text-left text-sm">
                            <div>
                              <span className="text-slate-700">{p.name}</span>
                              <span className="text-xs text-slate-400 ml-2">{p.sku || '-'}</span>
                              {(p.size || p.color) && (
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  {[p.size ? `Size: ${p.size}` : '', p.color ? `Color: ${p.color}` : ''].filter(Boolean).join(' • ')}
                                </p>
                              )}
                            </div>
                            <span className="text-xs text-slate-500">{fmtCurrency(p.price)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {noSaleReturnItems.length > 0 && (
                    <div className="space-y-1 mt-2">
                      {noSaleReturnItems.map(item => (
                        <div key={item.id} className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100">
                          <div>
                            <p className="text-sm font-medium text-slate-800">{item.name}</p>
                            {(item.size || item.color) && (
                              <p className="text-xs text-slate-400 mt-0.5">
                                {[item.size ? `Size: ${item.size}` : '', item.color ? `Color: ${item.color}` : ''].filter(Boolean).join(' • ')}
                              </p>
                            )}
                            <p className="text-xs text-slate-400">Manual Return Price (unit): {fmtCurrency(item.manualReturnUnitPrice ?? 0)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={e => setNoSaleReturnItems(prev => prev.map(i => i.id === item.id ? {
                                ...i,
                                quantity: Math.max(1, Number(e.target.value)),
                                lineEffectiveTotal: getEffectiveLineTotal(i, Math.max(1, Number(e.target.value)))
                              } : i))}
                              className="w-14 p-1 border border-slate-200 rounded text-xs text-center"
                            />
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={item.manualReturnUnitPrice ?? 0}
                              onChange={e => setNoSaleReturnItems(prev => prev.map(i => i.id === item.id ? {
                                ...i,
                                manualReturnUnitPrice: Math.max(0, Number(e.target.value)),
                                effectiveUnitPrice: Math.max(0, Number(e.target.value)),
                                lineEffectiveTotal: round2(Math.max(0, Number(e.target.value)) * i.quantity),
                              } : i))}
                              className="w-28 p-1 border border-slate-200 rounded text-xs text-right"
                              placeholder="Return Price"
                              title="Manual return unit price"
                            />
                            <span className="text-xs font-semibold text-red-600 w-24 text-right">-{fmtCurrency(getEffectiveLineTotal(item, item.quantity))}</span>
                            <button onClick={() => setNoSaleReturnItems(prev => prev.filter(i => i.id !== item.id))} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Select New Product */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <Plus size={14} className="text-emerald-500" />
                  Step 2: Add New Products
                </h4>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    placeholder="Search new product to exchange..."
                    className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    value={exchangeNewProductSearch}
                    onChange={e => setExchangeNewProductSearch(e.target.value)}
                  />
                  {exchangeNewProductResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-30 max-h-40 overflow-y-auto">
                      {exchangeNewProductResults.map(p => (
                        <button key={p.id} onMouseDown={() => handleAddExchangeNewItem(p)} className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 transition-colors text-left text-sm">
                          <div>
                            <span className="text-slate-700">{p.name}</span>
                            <span className="text-xs text-slate-400 ml-2">{p.sku}</span>
                            {(p.size || p.color) && (
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {[p.size ? `Size: ${p.size}` : '', p.color ? `Color: ${p.color}` : ''].filter(Boolean).join(' • ')}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-slate-800">{fmtCurrency(p.price)}</span>
                            <span className="text-xs text-emerald-600 ml-2">{p.branchStock[currentBranch.id] || 0} in stock</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {exchangeNewItems.length > 0 && (
                  <div className="space-y-1">
                    {exchangeNewItemsPriced.map(item => (
                      <div key={item.id} className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{item.name}</p>
                          {(item.size || item.color) && (
                            <p className="text-xs text-slate-400 mt-0.5">
                              {[item.size ? `Size: ${item.size}` : '', item.color ? `Color: ${item.color}` : ''].filter(Boolean).join(' • ')}
                            </p>
                          )}
                          <p className="text-xs text-slate-400">List: {fmtCurrency(item.price)} | Item Disc: -{fmtCurrency(item.unitItemDiscount || 0)} | Bill Share: -{fmtCurrency(item.unitBillDiscountShare || 0)} | Effective: {fmtCurrency(item.effectiveUnitPrice || item.price)} each</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center bg-slate-100 rounded p-0.5">
                            <button onClick={() => setExchangeNewItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i))} className="p-1 hover:bg-white rounded"><Minus size={10} /></button>
                            <span className="text-xs font-bold w-6 text-center">{item.quantity}</span>
                            <button onClick={() => setExchangeNewItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i))} className="p-1 hover:bg-white rounded"><Plus size={10} /></button>
                          </div>
                          <input
                            type="number"
                            min={0}
                            max={item.price}
                            step="0.01"
                            value={item.unitItemDiscount || 0}
                            onChange={e => setExchangeNewItems(prev => prev.map(i => i.id === item.id ? { ...i, unitItemDiscount: Math.min(i.price, Math.max(0, Number(e.target.value))) } : i))}
                            className="w-24 p-1 border border-slate-200 rounded text-xs text-right"
                            title="Per-unit item discount"
                          />
                          <span className="text-sm font-bold text-slate-800 w-24 text-right">{fmtCurrency(item.lineEffectiveTotal || 0)}</span>
                          <button onClick={() => setExchangeNewItems(prev => prev.filter(i => i.id !== item.id))} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Exchange Note / Reason</label>
                <input
                  type="text"
                  placeholder="e.g. Wrong size, customer preference..."
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-300"
                  value={exchangeDescription}
                  onChange={e => setExchangeDescription(e.target.value)}
                />
              </div>

              {/* Exchange Summary */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h4 className="text-sm font-bold text-slate-700 mb-3">Exchange Summary</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                  <select
                    value={exchangeBillDiscountMode}
                    onChange={e => setExchangeBillDiscountMode(e.target.value as DiscountMode)}
                    className="p-2 border border-slate-200 rounded-lg text-xs"
                  >
                    <option value="amount">Exchange Bill Discount (Amount)</option>
                    <option value="percentage">Exchange Bill Discount (%)</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={exchangeBillDiscountValue}
                    onChange={e => setExchangeBillDiscountValue(Math.max(0, Number(e.target.value)))}
                    className="p-2 border border-slate-200 rounded-lg text-xs text-right"
                    placeholder="Discount"
                  />
                  <div className="text-xs text-slate-500 flex items-center justify-end">
                    Applied: -{fmtCurrency(exchangeNewBillDiscount)}
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-slate-500">
                    <span>Returned Items Value</span>
                    <span className="text-red-600 font-medium">- {fmtCurrency(returnedTotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>New Items Value</span>
                    <span className="text-emerald-600 font-medium">{fmtCurrency(newItemsTotal)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                    <span className="font-bold text-slate-900">{exchangeDifference >= 0 ? 'Customer Pays' : 'Customer Credit/Refund'}</span>
                    <span className={`text-xl font-bold ${exchangeDifference >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {fmtCurrency(Math.abs(exchangeDifference))}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer with action buttons */}
            <div className="p-5 border-t border-slate-100 bg-slate-50">
              <div className="mb-3">
                <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Payment Method</label>
                <select
                  value={selectedPaymentMethod}
                  onChange={e => setSelectedPaymentMethod(e.target.value as any)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 bg-white text-slate-700 text-sm font-medium"
                >
                  <option value="Cash">💵 Cash</option>
                  <option value="Card">💳 Card</option>
                  <option value="PayHere">📱 PayHere</option>
                  <option value="Online Transfer">🌐 Online Transfer</option>
                  <option value="MintPay">💰 MintPay</option>
                </select>
              </div>
              {exchangeDifference < 0 && (
                <div className="mb-3">
                  <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Refund Method</label>
                  <select
                    value={exchangeRefundMethod}
                    onChange={e => setExchangeRefundMethod(e.target.value as ExchangeSettlementMethod)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-red-500 bg-white text-slate-700 text-sm font-medium"
                  >
                    <option value="Cash">💵 Cash</option>
                    <option value="Card">💳 Card</option>
                    <option value="PayHere">📱 PayHere</option>
                    <option value="Online Transfer">🌐 Online Transfer</option>
                    <option value="MintPay">💰 MintPay</option>
                  </select>
                </div>
              )}
              <div className="flex justify-between items-center">
                <button onClick={() => { setIsExchangeMode(false); resetExchangeState(); }} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm">Cancel</button>
                <button
                  onClick={handleCompleteExchange}
                  disabled={(returnedItems.length === 0 && noSaleReturnItems.length === 0) && exchangeNewItems.length === 0}
                  className="flex items-center gap-2 px-5 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-40 transition-colors"
                >
                  <CreditCard size={16} /> Complete Exchange
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Exchange Invoice Modal */}
      {isExchangeInvoiceOpen && lastExchange && (
        <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 bg-amber-500 text-white flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="text-amber-100" size={24} />
                  <h2 className="text-xl font-bold">Exchange Completed</h2>
                </div>
                <p className="text-amber-100 text-sm mt-1">{lastExchange.exchangeNumber}</p>
              </div>
              <button onClick={() => setIsExchangeInvoiceOpen(false)} className="text-amber-200 hover:text-white"><X size={24} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">HOARD LAVISH</h1>
                <p className="text-slate-500 text-sm mt-1">Product Exchange</p>
                <p className="text-slate-400 text-xs mt-1">{parseBusinessDate(lastExchange.date).toLocaleString()}</p>
                <p className="text-slate-400 text-xs font-bold">{lastExchange.branchName}</p>
                {lastExchange.originalInvoiceNumber && (
                  <p className="text-xs text-amber-600 mt-1">Original: {lastExchange.originalInvoiceNumber}</p>
                )}
              </div>

              {lastExchange.returnedItems.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-bold text-red-500 uppercase mb-2">Returned Items</p>
                  {lastExchange.returnedItems.map((item, idx) => (
                    <div key={idx} className="text-sm py-1">
                      <div className="flex justify-between">
                        <span className="text-slate-600">{item.quantity}x {item.name}</span>
                        <span className="text-red-500">-{fmtCurrency(item.lineEffectiveTotal ?? ((item.effectiveUnitPrice ?? item.price) * item.quantity))}</span>
                      </div>
                      {(item.size || item.color) && (
                        <div className="flex gap-1 mt-0.5 ml-0">
                          {item.size && <span className="text-xs text-slate-400">Size: {item.size}</span>}
                          {item.size && item.color && <span className="text-xs text-slate-400">•</span>}
                          {item.color && <span className="text-xs text-slate-400">Color: {item.color}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {lastExchange.newItems.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-bold text-emerald-500 uppercase mb-2">New Items</p>
                  {lastExchange.newItems.map((item, idx) => (
                    <div key={idx} className="text-sm py-1">
                      <div className="flex justify-between">
                        <span className="text-slate-600">{item.quantity}x {item.name}</span>
                        <span className="text-emerald-600">{fmtCurrency(item.lineEffectiveTotal ?? ((item.effectiveUnitPrice ?? item.price) * item.quantity))}</span>
                      </div>
                      {(item.size || item.color) && (
                        <div className="flex gap-1 mt-0.5 ml-0">
                          {item.size && <span className="text-xs text-slate-400">Size: {item.size}</span>}
                          {item.size && item.color && <span className="text-xs text-slate-400">•</span>}
                          {item.color && <span className="text-xs text-slate-400">Color: {item.color}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-slate-200 pt-4 space-y-2">
                <div className="flex justify-between text-sm text-slate-500">
                  <span>Returned Value</span>
                  <span>-{fmtCurrency(lastExchange.returnedTotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-slate-500">
                  <span>New Items Value</span>
                  <span>{fmtCurrency(lastExchange.newTotal)}</span>
                </div>
                {lastExchange.exchangeBillDiscount ? (
                  <div className="flex justify-between text-sm text-slate-500">
                    <span>Exchange Bill Discount</span>
                    <span>-{fmtCurrency(lastExchange.exchangeBillDiscount)}</span>
                  </div>
                ) : null}
                <div className={`flex justify-between text-lg font-bold pt-2 border-t border-slate-200 mt-2 ${lastExchange.difference >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  <span>{lastExchange.difference >= 0 ? 'Customer Pays' : 'Customer Credit'}</span>
                  <span>{fmtCurrency(Math.abs(lastExchange.difference))}</span>
                </div>
                {lastExchange.refundMethod ? (
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Refund Method</span>
                    <span>{lastExchange.refundMethod}</span>
                  </div>
                ) : null}
              </div>

              {lastExchange.description && (
                <div className="mt-4 p-3 bg-amber-50 rounded-lg text-xs text-amber-700">
                  <strong>Note:</strong> {lastExchange.description}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-white">
              <button
                onClick={() => {
                  handlePrintExchangeInvoice(lastExchange);
                  setTimeout(() => setIsExchangeInvoiceOpen(false), 500);
                }}
                className="w-full flex items-center justify-center gap-2 bg-amber-500 text-white py-3 rounded-xl hover:bg-amber-600 transition-colors font-medium"
              >
                <Printer size={18} /> Print Exchange Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default POS;
