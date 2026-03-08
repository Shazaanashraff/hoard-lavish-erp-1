import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Plus, Minus, Trash2, CreditCard, Banknote, UserPlus, User, X, ScanBarcode, Printer, CheckCircle, Store, AlertTriangle, ArrowRightLeft, RotateCcw } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { Product, Customer, SalesRecord, CartItem, ExchangeRecord } from '../types';

const CUR = 'LKR';
const fmtCurrency = (n: number) => `${CUR} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// --- Alert Popup Component ---
const AlertPopup: React.FC<{ message: string; type?: 'error' | 'warning'; onClose: () => void }> = ({ message, type = 'error', onClose }) => (
  <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
    <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
      <div className={`p-4 flex items-center gap-3 ${type === 'error' ? 'bg-red-50' : 'bg-amber-50'}`}>
        <div className={`p-2 rounded-full ${type === 'error' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
          <AlertTriangle size={20} />
        </div>
        <div className="flex-1">
          <h4 className={`font-bold text-sm ${type === 'error' ? 'text-red-800' : 'text-amber-800'}`}>
            {type === 'error' ? 'Stock Limit Reached' : 'Warning'}
          </h4>
          <p className="text-sm text-slate-600 mt-0.5">{message}</p>
        </div>
      </div>
      <div className="p-3 flex justify-end bg-white border-t border-slate-100">
        <button
          onClick={onClose}
          className={`px-5 py-2 rounded-lg text-white text-sm font-medium transition-colors ${type === 'error' ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'
            }`}
        >
          OK
        </button>
      </div>
    </div>
  </div>
);

const POS: React.FC = () => {
  const { products, customers, cart, salesHistory, addToCart, removeFromCart, updateCartItemDiscount, updateCartQuantity, completeSale, completeExchange, clearCart, addCustomer, adjustStock, currentBranch, currentUser, settings } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Billing States
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '' });
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'Cash' | 'Card' | 'PayHere' | 'Online Transfer' | 'MintPay'>('Cash');

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
  const [returnedItems, setReturnedItems] = useState<CartItem[]>([]);
  const [exchangeNewItems, setExchangeNewItems] = useState<CartItem[]>([]);
  const [exchangeDescription, setExchangeDescription] = useState('');
  const [exchangeNewProductSearch, setExchangeNewProductSearch] = useState('');
  const [lastExchange, setLastExchange] = useState<ExchangeRecord | null>(null);
  const [isExchangeInvoiceOpen, setIsExchangeInvoiceOpen] = useState(false);
  const [noSaleReturnItems, setNoSaleReturnItems] = useState<CartItem[]>([]); // manual stock return without sale
  const [noSaleProductSearch, setNoSaleProductSearch] = useState('');

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const customerSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  const categories = ['All', ...Array.from(new Set(products.map(p => p.category)))];

  // 1. Dynamic filtering by name AND SKU (search input only — barcode uses dropdown)
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = !term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term);
      const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  // 1b. Dynamic SKU filtering for barcode input
  const skuSuggestions = useMemo(() => {
    if (!barcodeInput.trim()) return [];
    return products.filter(p =>
      p.sku.toLowerCase().includes(barcodeInput.toLowerCase()) ||
      p.name.toLowerCase().includes(barcodeInput.toLowerCase()) ||
      (p.barcode && p.barcode.toLowerCase().includes(barcodeInput.toLowerCase())) ||
      (p.barcode2 && p.barcode2.toLowerCase().includes(barcodeInput.toLowerCase()))
    ).slice(0, 5);
  }, [products, barcodeInput]);

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
  const totalDiscount = itemDiscountsTotal + discountAmount;
  const total = Math.max(0, subtotal - totalDiscount);

  // 7. Calculate profit for discount validation
  const totalCost = cart.reduce((sum, item) => sum + (item.costPrice * item.quantity), 0);
  const maxProfit = subtotal - totalCost;

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
    // Try exact SKU or barcode match first (for real barcode scanners)
    const exact = products.find(p =>
      p.sku.toLowerCase() === barcodeInput.toLowerCase() ||
      (p.barcode && p.barcode.toLowerCase() === barcodeInput.toLowerCase()) ||
      (p.barcode2 && p.barcode2.toLowerCase() === barcodeInput.toLowerCase())
    );
    const product = exact || skuSuggestions[0];
    if (product) {
      const branchStock = product.branchStock[currentBranch.id] || 0;
      if (branchStock > 0) {
        handleAddToCart(product);
        setBarcodeInput('');
      } else {
        setAlertPopup({ message: 'Product out of stock in this branch', type: 'error' });
      }
    } else {
      setAlertPopup({ message: `No product found matching "${barcodeInput}"`, type: 'error' });
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
  const handleDiscountChange = (val: number) => {
    const totalDiscountWithNew = itemDiscountsTotal + val;
    if (totalDiscountWithNew > maxProfit && maxProfit > 0) {
      setAlertPopup({
        message: `Total discount (${fmtCurrency(totalDiscountWithNew)}) cannot exceed the profit margin (${fmtCurrency(maxProfit)}). Maximum allowed: ${fmtCurrency(maxProfit - itemDiscountsTotal)}.`,
        type: 'warning'
      });
      setDiscountAmount(Math.max(0, maxProfit - itemDiscountsTotal));
    } else {
      setDiscountAmount(val);
    }
  };

  const handleItemDiscountChange = (productId: string, discount: number) => {
    const item = cart.find(i => i.id === productId);
    if (!item) return;

    const itemProfit = (item.price - item.costPrice) * item.quantity;
    const otherItemsDiscounts = cart.reduce((sum, i) => i.id !== productId ? sum + ((i.discount || 0) * i.quantity) : sum, 0);
    const maxItemDiscount = itemProfit;

    if (discount * item.quantity > maxItemDiscount) {
      setAlertPopup({
        message: `Discount for ${item.name} cannot exceed its profit margin. Max: ${fmtCurrency(maxItemDiscount / item.quantity)} per unit.`,
        type: 'warning'
      });
      updateCartItemDiscount(productId, Math.max(0, maxItemDiscount / item.quantity));
    } else {
      updateCartItemDiscount(productId, discount);
    }
  };

  const handleCheckout = () => {
    if (cart.length === 0) return;
    const sale = completeSale(selectedPaymentMethod, totalDiscount, selectedCustomer?.id);
    setLastSale(sale);
    setIsInvoiceOpen(true);
    setSelectedCustomer(null);
    setDiscountAmount(0);
    setCustomerSearch('');
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

  const handlePrint = async () => {
    if (!lastSale) return;

    // Build the receipt HTML (same content, but no auto-print script when using Electron)
    const isElectron = !!(window as any).electronAPI?.printReceipt;

    const sale = lastSale;
    const fmtRs = (n: number) => `Rs. ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const discountPercent = sale.subtotal > 0 ? ((sale.discount / sale.subtotal) * 100).toFixed(2) : '0.00';
    const totalSavings = sale.items.reduce((s, i) => s + (i.discount || 0) * i.quantity, 0) + sale.discount;

    // In Electron the print window is a data: URL so relative/origin paths don't resolve.
    // Read the logo via IPC so it's embedded as a base64 data URI.
    let logoUrl = window.location.origin + '/logo.png';
    if (isElectron && (window as any).electronAPI?.getLogoBase64) {
      const b64 = await (window as any).electronAPI.getLogoBase64();
      if (b64) logoUrl = b64;
    }

    // Meta line date: "27/02/2026 4:17 PM"
    const sd = new Date(sale.date);
    const metaDate = `${String(sd.getDate()).padStart(2, '0')}/${String(sd.getMonth() + 1).padStart(2, '0')}/${sd.getFullYear()} ${sd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;

    // Footer date: "2026.February.27 AD 04:17 PM"
    const now = new Date();
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const footerDate = `${now.getFullYear()}.${MONTHS[now.getMonth()]}.${String(now.getDate()).padStart(2, '0')} AD ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;

    // Barcode
    const barcodeStr = sale.invoiceNumber.replace(/\D/g, '').slice(-4).padStart(4, '0');
    let barsHtml = '<div style="display:flex;align-items:flex-end;justify-content:center;gap:0;">';
    barsHtml += '<div style="width:3px;height:50px;background:#000;"></div><div style="width:1px;height:50px;background:#fff;"></div><div style="width:2px;height:50px;background:#000;"></div><div style="width:1px;height:50px;background:#fff;"></div>';
    for (let bi = 0; bi < 32; bi++) {
      const d = parseInt(barcodeStr[bi % barcodeStr.length]) || (bi % 5);
      barsHtml += `<div style="width:${(d % 3) + 1}px;height:${bi % 3 === 0 ? 50 : 48}px;background:#000;"></div>`;
      barsHtml += `<div style="width:${(d % 2) + 1}px;height:${bi % 3 === 0 ? 50 : 48}px;background:#fff;"></div>`;
    }
    barsHtml += '<div style="width:2px;height:50px;background:#000;"></div><div style="width:1px;height:50px;background:#fff;"></div><div style="width:3px;height:50px;background:#000;"></div></div>';

    // Item rows - bold item name, variant below, then qty/price columns
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
body { font-family:Arial,Helvetica,sans-serif; width:80mm; margin:0; padding:0; background:#fff; color:#000; font-size:13px; }
.wrap { width:80mm; padding:3mm 3mm 10mm 3mm; }
.meta { display:flex; justify-content:space-between; font-size:10px; color:#555; margin-bottom:4px; }
.logo-wrap { text-align:center; margin:2px 0 4px; }
.logo-wrap img { width:52mm; max-width:100%; height:auto; display:block; margin:0 auto; }
.store-info { text-align:center; font-size:11.5px; line-height:1.6; margin-bottom:8px; }
.cashier { font-size:13px; margin-bottom:4px; }
table.items { width:100%; border-collapse:collapse; }
table.items thead th { font-size:12px; font-weight:700; padding:5px 0; border-top:2px solid #000; border-bottom:2px solid #000; }
.th-item { text-align:left; width:43%; }
.th-qty { text-align:center; width:9%; }
.th-price { text-align:right; width:24%; }
.th-total { text-align:right; width:24%; }
table.totals { width:100%; border-collapse:collapse; }
table.totals td { font-size:13px; padding:3px 0; }
table.totals .lbl { text-align:right; padding-right:8px; }
table.totals .val { text-align:right; white-space:nowrap; }
.grand td { font-size:15px; font-weight:900; padding:5px 0; }
.divider { border-top:2px solid #000; margin:5px 0; }
.divider-dot { border-top:1px dotted #999; margin:5px 0; }
.tender { font-size:13px; padding:2px 0; }
.disc-total { text-align:center; font-weight:700; font-size:14px; padding:5px 0; }
.footer-note { text-align:center; font-size:11px; color:#111; line-height:1.6; margin:5px 0; }
.footer-box { background:#1c1c1c; color:#fff; text-align:center; font-size:15px; font-weight:700; padding:8px 4px; margin:8px 0 5px; }
.barcode-wrap { text-align:center; margin-top:6px; }
.barcode-num { font-size:12px; letter-spacing:3px; margin-top:4px; font-family:'Courier New',monospace; }
.credit { text-align:center; font-size:10px; color:#444; margin-top:7px; line-height:1.6; }
@media print { body { margin:0; padding:0; } .wrap { padding:2mm 3mm 8mm 3mm; } @page { size:80mm auto; margin:0; } }
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
<div class="tender">Change Given: Rs.0.00</div>
<div class="tender">Cash: Rs.0.00</div>

<div class="divider-dot"></div>

<div class="disc-total">Total Sales Discounts: ${fmtRs(totalSavings)}</div>

<div class="divider-dot"></div>

<div class="footer-note">
  For any exchange please produce the bill the<br>
  garment within orginal tagintact within 07days<br>
  NO EXCHANGE OR RETURN ACCEPETED FOR<br>
  ITEM SOLD IN OFFERS AND SALE
</div>

<div class="footer-box">*** Thank You, Come Again***</div>

<div class="barcode-wrap">
  ${barsHtml}
  <div class="barcode-num">${barcodeStr}</div>
</div>

<div class="credit">
  ware By Snow Soft(pvt)Ltd .(0114341530)<br>
  ${footerDate}
</div>
</div>

${isElectron ? '' : '<script>window.onload=function(){window.print();};<\/script>'}
</body></html>`;

    if (isElectron) {
      // Silent print directly to the configured thermal printer — no dialog
      const printerName = settings?.thermalPrinterName || '';
      await (window as any).electronAPI.printReceipt(html, printerName, { pageWidthMm: 80 });
      setTimeout(() => setIsInvoiceOpen(false), 300);
    } else {
      // Fallback for non-Electron environments
      const printWindow = window.open('', '_blank', 'width=400,height=700');
      if (!printWindow) return;
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => setIsInvoiceOpen(false), 800);
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

  const handleSelectReturnItem = (item: CartItem) => {
    const existing = returnedItems.find(r => r.id === item.id);
    if (existing) return;
    setReturnedItems(prev => [...prev, { ...item, quantity: 1 }]);
  };

  const handleAddExchangeNewItem = (product: Product) => {
    const existing = exchangeNewItems.find(r => r.id === product.id);
    if (existing) {
      setExchangeNewItems(prev => prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setExchangeNewItems(prev => [...prev, { ...product, quantity: 1 }]);
    }
    setExchangeNewProductSearch('');
  };

  const handleAddNoSaleReturnItem = (product: Product) => {
    const existing = noSaleReturnItems.find(r => r.id === product.id);
    if (existing) return;
    setNoSaleReturnItems(prev => [...prev, { ...product, quantity: 1 }]);
    setNoSaleProductSearch('');
  };

  const returnedTotal = returnedItems.reduce((sum, i) => sum + i.price * i.quantity, 0)
    + noSaleReturnItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const newItemsTotal = exchangeNewItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const exchangeDifference = newItemsTotal - returnedTotal;

  const handleCompleteExchange = () => {
    const allReturned = [...returnedItems, ...noSaleReturnItems];
    if (allReturned.length === 0 && exchangeNewItems.length === 0) return;

    const exchange = completeExchange({
      originalSaleId: selectedExchangeSale?.id,
      originalInvoiceNumber: selectedExchangeSale?.invoiceNumber,
      returnedItems: allReturned,
      newItems: exchangeNewItems,
      returnedTotal,
      newTotal: newItemsTotal,
      difference: exchangeDifference,
      paymentMethod: selectedPaymentMethod,
      customerId: selectedExchangeSale?.customerId,
      customerName: selectedExchangeSale?.customerName,
      description: exchangeDescription || 'Product Exchange',
    });

    setLastExchange(exchange);
    setIsExchangeInvoiceOpen(true);
    resetExchangeState();
  };

  const handlePrintExchangeInvoice = async (exchange: ExchangeRecord) => {
    const isElectron = !!(window as any).electronAPI?.printReceipt;
    const fmtC = (n: number) => `LKR ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const html = `<!DOCTYPE html><html><head><title>Exchange ${exchange.exchangeNumber}</title>
<style>*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif}body{padding:32px;color:#1e293b;max-width:500px;margin:0 auto}
.header{text-align:center;margin-bottom:24px;border-bottom:2px dashed #e2e8f0;padding-bottom:16px}
.title{font-size:20px;font-weight:700}.subtitle{font-size:12px;color:#64748b;margin-top:4px}
.ex-num{font-family:monospace;font-size:12px;color:#64748b;margin-top:4px}
.badge{display:inline-block;padding:4px 12px;background:#fef3c7;color:#92400e;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;margin-top:8px}
.section{margin-bottom:16px}.section-title{font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:#94a3b8;margin-bottom:8px}
table{width:100%;border-collapse:collapse;margin-bottom:4px}th{background:#f1f5f9;color:#64748b;font-size:10px;text-transform:uppercase;padding:6px 10px;text-align:left}
th:last-child,th:nth-child(2),th:nth-child(3){text-align:right}td{padding:6px 10px;font-size:12px;border-bottom:1px solid #f1f5f9}td:last-child,td:nth-child(2),td:nth-child(3){text-align:right}
.totals{max-width:220px;margin-left:auto;margin-top:12px;border-top:2px solid #e2e8f0;padding-top:8px}
.row{display:flex;justify-content:space-between;font-size:12px;color:#64748b;padding:3px 0}
.grand{font-weight:700;font-size:16px;color:#0f172a;border-top:2px solid #0f172a;padding-top:8px;margin-top:4px}
.grand.refund{color:#dc2626}.grand.charge{color:#166534}
.footer{text-align:center;margin-top:24px;padding-top:12px;border-top:1px dashed #e2e8f0;font-size:10px;color:#94a3b8}
@media print{body{padding:16px}}
</style></head><body>
<div class="header"><div class="title">HOARD LAVISH</div><div class="subtitle">Product Exchange</div>
<div class="ex-num">${exchange.exchangeNumber}</div>
<div class="badge">Exchange</div>
<div style="font-size:11px;color:#94a3b8;margin-top:8px">${new Date(exchange.date).toLocaleString()}</div>
${exchange.originalInvoiceNumber ? `<div style="font-size:11px;color:#64748b;margin-top:4px">Original Sale: ${exchange.originalInvoiceNumber}</div>` : ''}
${exchange.customerName ? `<div style="font-size:12px;color:#475569;margin-top:4px">Customer: ${exchange.customerName}</div>` : ''}
<div style="font-size:11px;color:#64748b;margin-top:4px">${exchange.branchName}</div>
</div>
${exchange.returnedItems.length > 0 ? `<div class="section"><div class="section-title">Returned Items</div>
<table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>
${exchange.returnedItems.map(i => `<tr><td>${i.name}${i.size || i.color ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px">${[i.size ? `Size: ${i.size}` : '', i.color ? `Color: ${i.color}` : ''].filter(Boolean).join(' • ')}</div>` : ''}</td><td style="text-align:right">${i.quantity}</td><td style="text-align:right">${fmtC(i.price)}</td><td style="text-align:right">${fmtC(i.price * i.quantity)}</td></tr>`).join('')}
</tbody></table>
<div class="row" style="justify-content:flex-end;font-weight:600;color:#dc2626">Return Credit: -${fmtC(exchange.returnedTotal)}</div></div>` : ''}
${exchange.newItems.length > 0 ? `<div class="section"><div class="section-title">New Items</div>
<table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>
${exchange.newItems.map(i => `<tr><td>${i.name}${i.size || i.color ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px">${[i.size ? `Size: ${i.size}` : '', i.color ? `Color: ${i.color}` : ''].filter(Boolean).join(' • ')}</div>` : ''}</td><td style="text-align:right">${i.quantity}</td><td style="text-align:right">${fmtC(i.price)}</td><td style="text-align:right">${fmtC(i.price * i.quantity)}</td></tr>`).join('')}
</tbody></table>
<div class="row" style="justify-content:flex-end;font-weight:600;color:#166534">New Total: ${fmtC(exchange.newTotal)}</div></div>` : ''}
<div class="totals">
<div class="row"><span>Returned Value</span><span>-${fmtC(exchange.returnedTotal)}</span></div>
<div class="row"><span>New Items Value</span><span>${fmtC(exchange.newTotal)}</span></div>
<div class="grand ${exchange.difference < 0 ? 'refund' : 'charge'}"><span>${exchange.difference >= 0 ? 'Customer Pays' : 'Customer Credit'}</span><span>${fmtC(Math.abs(exchange.difference))}</span></div>
<div class="row" style="margin-top:4px"><span>Payment</span><span>${exchange.paymentMethod}</span></div>
</div>
${exchange.description ? `<div style="margin-top:16px;padding:8px 12px;background:#f8fafc;border-radius:6px;font-size:11px;color:#64748b"><strong>Note:</strong> ${exchange.description}</div>` : ''}
<div class="footer">Thank you — Hoard Lavish ERP</div>
${isElectron ? '' : '<script>window.onload=function(){window.print();}<\/script>'}</body></html>`;
    if (isElectron) {
      const printerName = settings?.thermalPrinterName || '';
      await (window as any).electronAPI.printReceipt(html, printerName);
    } else {
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;
      printWindow.document.write(html);
      printWindow.document.close();
    }
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
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onFocus={() => { }}
                    onBlur={() => setTimeout(() => { }, 200)}
                  />
                </form>
                {/* 1. Dynamic SKU suggestions dropdown */}
                {barcodeInput && skuSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-30 overflow-hidden">
                    {skuSuggestions.map(p => {
                      const stock = p.branchStock[currentBranch.id] || 0;
                      return (
                        <button
                          key={p.id}
                          onMouseDown={() => handleSkuSelect(p)}
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 transition-colors text-left"
                        >
                          <div>
                            <span className="font-mono text-xs text-amber-600 font-bold">{p.sku}</span>
                            <span className="text-sm text-slate-700 ml-2">{p.name}</span>
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
                onClick={() => { setIsExchangeMode(!isExchangeMode); if (isExchangeMode) resetExchangeState(); }}
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
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.discount || 0}
                      onChange={(e) => handleItemDiscountChange(item.id, Number(e.target.value))}
                      className="w-20 px-2 py-1 text-xs border border-slate-200 rounded outline-none focus:ring-1 focus:ring-slate-400"
                      placeholder="0.00"
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
                <span className="text-slate-400">- {CUR}</span>
                <input
                  type="number"
                  min="0"
                  className="w-20 text-right border-b border-slate-200 focus:border-amber-500 outline-none text-slate-700"
                  value={discountAmount}
                  onChange={(e) => handleDiscountChange(Number(e.target.value))}
                />
              </div>
            </div>

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
              <option value="PayHere">📱 PayHere</option>
              <option value="Online Transfer">🌐 Online Transfer</option>
              <option value="MintPay">💰 MintPay</option>
            </select>
          </div>

          <button
            onClick={handleCheckout}
            disabled={cart.length === 0}
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
                <p className="text-slate-400 text-xs mt-1">{new Date(lastSale.date).toLocaleString()}</p>
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
                        <span className="text-[10px] text-slate-400 ml-2">{new Date(sale.date).toLocaleDateString()}</span>
                      </div>
                    </button>
                  ))}
                </div>

                {selectedExchangeSale && (
                  <div className="mt-3 p-3 bg-white rounded-lg border border-amber-200">
                    <p className="text-xs font-bold text-slate-500 uppercase mb-2">Select items to return from {selectedExchangeSale.invoiceNumber}</p>
                    <div className="space-y-1">
                      {selectedExchangeSale.items.map((item, idx) => {
                        const isSelected = returnedItems.some(r => r.id === item.id);
                        return (
                          <div key={idx} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => isSelected ? setReturnedItems(prev => prev.filter(r => r.id !== item.id)) : handleSelectReturnItem(item)}
                                className="w-4 h-4 rounded border-slate-300 accent-amber-500"
                              />
                              <div>
                                <p className="text-sm font-medium text-slate-800">{item.name}</p>
                                {(item.size || item.color) && (
                                  <p className="text-xs text-slate-400 mt-0.5">
                                    {[item.size ? `Size: ${item.size}` : '', item.color ? `Color: ${item.color}` : ''].filter(Boolean).join(' • ')}
                                  </p>
                                )}
                                <p className="text-xs text-slate-400">{fmtCurrency(item.price)} each</p>
                              </div>
                            </div>
                            {isSelected && (
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-slate-500">Qty:</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={item.quantity}
                                  value={returnedItems.find(r => r.id === item.id)?.quantity || 1}
                                  onChange={e => setReturnedItems(prev => prev.map(r => r.id === item.id ? { ...r, quantity: Math.min(item.quantity, Math.max(1, Number(e.target.value))) } : r))}
                                  className="w-14 p-1 border border-slate-200 rounded text-xs text-center"
                                />
                                <span className="text-xs text-slate-400">/ {item.quantity}</span>
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
                            <span className="text-slate-700">{p.name}</span>
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
                            <p className="text-xs text-slate-400">{fmtCurrency(item.price)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={e => setNoSaleReturnItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: Math.max(1, Number(e.target.value)) } : i))}
                              className="w-14 p-1 border border-slate-200 rounded text-xs text-center"
                            />
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
                    {exchangeNewItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{item.name}</p>
                          {(item.size || item.color) && (
                            <p className="text-xs text-slate-400 mt-0.5">
                              {[item.size ? `Size: ${item.size}` : '', item.color ? `Color: ${item.color}` : ''].filter(Boolean).join(' • ')}
                            </p>
                          )}
                          <p className="text-xs text-slate-400">{fmtCurrency(item.price)} each</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center bg-slate-100 rounded p-0.5">
                            <button onClick={() => setExchangeNewItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i))} className="p-1 hover:bg-white rounded"><Minus size={10} /></button>
                            <span className="text-xs font-bold w-6 text-center">{item.quantity}</span>
                            <button onClick={() => setExchangeNewItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i))} className="p-1 hover:bg-white rounded"><Plus size={10} /></button>
                          </div>
                          <span className="text-sm font-bold text-slate-800 w-24 text-right">{fmtCurrency(item.price * item.quantity)}</span>
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
                <p className="text-slate-400 text-xs mt-1">{new Date(lastExchange.date).toLocaleString()}</p>
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
                        <span className="text-red-500">-{fmtCurrency(item.price * item.quantity)}</span>
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
                        <span className="text-emerald-600">{fmtCurrency(item.price * item.quantity)}</span>
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
                <div className={`flex justify-between text-lg font-bold pt-2 border-t border-slate-200 mt-2 ${lastExchange.difference >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  <span>{lastExchange.difference >= 0 ? 'Customer Pays' : 'Customer Credit'}</span>
                  <span>{fmtCurrency(Math.abs(lastExchange.difference))}</span>
                </div>
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
