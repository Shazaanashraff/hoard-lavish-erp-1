import React, { useState, useMemo } from 'react';
import { Plus, Edit2, AlertCircle, Trash2, Search, Filter, History, Box, Tag, ArrowUpRight, ArrowDownRight, Save, X, Building2, AlertTriangle, Palette, Ruler, ArrowRightLeft, FileText, Printer, ChevronDown, ChevronUp, Minus, Barcode } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { Product, StockTransferItem, StockTransfer } from '../types';

type InventoryTab = 'ALL' | 'LOW_STOCK' | 'ADJUSTMENTS' | 'CATEGORIES' | 'TRANSFERS';

const CUR = 'LKR';
const fmtCurrency = (n: number) => `${CUR} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Available colors and sizes for variation builder
const AVAILABLE_COLORS = ['Black', 'White', 'Red', 'Blue', 'Green', 'Navy', 'Beige', 'Brown', 'Grey', 'Pink', 'Yellow', 'Purple', 'Orange', 'Maroon', 'Olive', 'Teal', 'Cream'];
const AVAILABLE_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Free Size', '28', '30', '32', '34', '36', '38', '40', '42'];

// --- Confirmation Popup ---
const ConfirmDialog: React.FC<{
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ title, message, onConfirm, onCancel }) => (
  <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onCancel}>
    <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="p-4 flex items-center gap-3 bg-red-50">
        <div className="p-2 rounded-full bg-red-100 text-red-600">
          <AlertTriangle size={20} />
        </div>
        <div className="flex-1">
          <h4 className="font-bold text-sm text-red-800">{title}</h4>
          <p className="text-sm text-slate-600 mt-0.5">{message}</p>
        </div>
      </div>
      <div className="p-3 flex justify-end gap-2 bg-white border-t border-slate-100">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
          Cancel
        </button>
        <button onClick={onConfirm} className="px-5 py-2 rounded-lg text-white text-sm font-medium bg-red-500 hover:bg-red-600 transition-colors">
          Delete
        </button>
      </div>
    </div>
  </div>
);

// Variation row type
interface VariationRow {
  color: string;
  size: string;
  sku: string;
  price: number;
  costPrice: number;
  quantity: number;
  barcode?: string;
  barcode2?: string;
}

const Inventory: React.FC = () => {
  const {
    products, categories, brands, stockHistory, currentBranch, branches,
    addProduct, updateProduct, deleteProduct, adjustStock, transferStock,
    addCategory, removeCategory, addBrand, removeBrand,
    currentUser, stockTransfers
  } = useStore();
  const isCashier = currentUser?.role === 'CASHIER';

  const [activeTab, setActiveTab] = useState<InventoryTab>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');

  // Modal States
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);

  // Variation builder state (for new products)
  const [useVariations, setUseVariations] = useState(false);
  const [variations, setVariations] = useState<VariationRow[]>([]);

  // Stock Adjustment State
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<'IN' | 'OUT' | 'ADJUSTMENT'>('IN');
  const [adjustmentQty, setAdjustmentQty] = useState<number>(0);
  const [adjustmentReason, setAdjustmentReason] = useState('');

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  // Stock Transfer State
  const [transferItems, setTransferItems] = useState<StockTransferItem[]>([]);
  const [transferDestBranch, setTransferDestBranch] = useState<string>('');
  const [transferNotes, setTransferNotes] = useState('');
  const [transferSearchTerm, setTransferSearchTerm] = useState('');
  const [completedTransfer, setCompletedTransfer] = useState<StockTransfer | null>(null);
  const [showTransferHistory, setShowTransferHistory] = useState(true);

  // Custom color state
  const [customColors, setCustomColors] = useState<string[]>([]);
  const [addingColorFor, setAddingColorFor] = useState<string | null>(null);
  const [newColorName, setNewColorName] = useState('');

  // All available colors (built-in + custom)
  const allColors = [...AVAILABLE_COLORS, ...customColors];

  // Filtering
  const filteredProducts = useMemo(() => {
    let result = products;
    if (activeTab === 'LOW_STOCK') {
      result = result.filter(p => (p.branchStock[currentBranch.id] || 0) <= p.minStockLevel);
    }
    if (filterCategory !== 'All') {
      result = result.filter(p => p.category === filterCategory);
    }
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(lower) ||
        p.sku.toLowerCase().includes(lower) ||
        p.brand.toLowerCase().includes(lower) ||
        (p.color || '').toLowerCase().includes(lower) ||
        (p.size || '').toLowerCase().includes(lower)
      );
    }
    return result;
  }, [products, activeTab, filterCategory, searchTerm, currentBranch]);

  // Handlers
  const handleOpenAdd = () => {
    setEditingProduct({
      category: categories[0] || 'Uncategorized',
      brand: brands[0] || 'Generic',
      minStockLevel: 5,
      branchStock: { [currentBranch.id]: 0 }
    });
    setUseVariations(false);
    setVariations([]);
    setAddingColorFor(null);
    setNewColorName('');
    setIsProductModalOpen(true);
  };

  const handleOpenEdit = (product: Product) => {
    setEditingProduct({ ...product });
    setUseVariations(false);
    setVariations([]);
    setAddingColorFor(null);
    setNewColorName('');
    setIsProductModalOpen(true);
  };

  // Add a new blank variation row
  const handleAddVariation = () => {
    setVariations(prev => [...prev, {
      color: AVAILABLE_COLORS[0],
      size: AVAILABLE_SIZES[3], // default M
      sku: '',
      price: Number(editingProduct?.price) || 0,
      costPrice: Number(editingProduct?.costPrice) || 0,
      quantity: 0,
      barcode: '',
      barcode2: ''
    }]);
  };

  const handleUpdateVariation = (idx: number, field: keyof VariationRow, value: string | number) => {
    setVariations(prev => prev.map((v, i) => i === idx ? { ...v, [field]: value } : v));
  };

  const handleRemoveVariation = (idx: number) => {
    setVariations(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSaveProduct = () => {
    if (!editingProduct?.name || !editingProduct?.price) return;

    // If using variations and this is a new product, create multiple products
    if (useVariations && variations.length > 0 && !editingProduct.id) {
      variations.forEach(v => {
        const variantName = `${editingProduct.name} — ${v.color} / ${v.size}`;
        const product: Product = {
          id: Math.random().toString(36).substr(2, 9),
          name: variantName,
          category: editingProduct.category || 'Uncategorized',
          brand: editingProduct.brand || 'Generic',
          price: v.price,
          costPrice: v.costPrice,
          sku: v.sku || `SKU-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
          barcode: v.barcode || '',
          barcode2: v.barcode2 || '',
          description: editingProduct.description || '',
          minStockLevel: Number(editingProduct.minStockLevel) || 5,
          stock: v.quantity,
          branchStock: { [currentBranch.id]: v.quantity },
          color: v.color,
          size: v.size,
        };
        addProduct(product);
      });
    } else {
      // Single product (edit or non-variation add)
      const branchStock = editingProduct.branchStock || {};
      const totalStock = Object.values(branchStock).reduce((sum: number, v) => sum + (Number(v) || 0), 0);
      const productData = {
        ...editingProduct,
        price: Number(editingProduct.price),
        costPrice: Number(editingProduct.costPrice),
        minStockLevel: Number(editingProduct.minStockLevel),
        branchStock,
        stock: totalStock,
      } as Product;

      if (productData.id) {
        updateProduct(productData.id, productData);
      } else {
        addProduct({
          ...productData,
          id: Math.random().toString(36).substr(2, 9),
        });
      }
    }

    setIsProductModalOpen(false);
    setEditingProduct(null);
    setUseVariations(false);
    setVariations([]);
  };

  const handleOpenAdjustment = (product: Product) => {
    setAdjustingProduct(product);
    setAdjustmentType('IN');
    setAdjustmentQty(0);
    setAdjustmentReason('');
    setIsStockModalOpen(true);
  };

  const handleSubmitAdjustment = () => {
    if (adjustingProduct && adjustmentQty > 0) {
      adjustStock(adjustingProduct.id, adjustmentQty, adjustmentType, adjustmentReason || 'Manual Adjustment');
      setIsStockModalOpen(false);
      setAdjustingProduct(null);
    }
  };

  // 5. Delete with confirmation popup
  const handleDeleteRequest = (product: Product) => {
    setDeleteConfirm({ id: product.id, name: product.name });
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirm) {
      deleteProduct(deleteConfirm.id);
      setDeleteConfirm(null);
    }
  };

  // --- Stock Transfer Handlers ---
  const otherBranches = branches.filter(b => b.id !== currentBranch.id);

  const handleAddToTransfer = (product: Product) => {
    const existing = transferItems.find(i => i.productId === product.id);
    if (existing) return;
    setTransferItems(prev => [...prev, {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      quantity: 1,
      unitPrice: product.price,
      costPrice: product.costPrice,
    }]);
  };

  const handleUpdateTransferQty = (productId: string, qty: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const maxQty = product.branchStock[currentBranch.id] || 0;
    const clampedQty = Math.max(1, Math.min(qty, maxQty));
    setTransferItems(prev => prev.map(i => i.productId === productId ? { ...i, quantity: clampedQty } : i));
  };

  const handleRemoveTransferItem = (productId: string) => {
    setTransferItems(prev => prev.filter(i => i.productId !== productId));
  };

  const handleExecuteTransfer = () => {
    if (!transferDestBranch || transferItems.length === 0) return;
    const result = transferStock(transferDestBranch, transferItems, transferNotes);
    setCompletedTransfer(result);
    setTransferItems([]);
    setTransferNotes('');
  };

  const generateTransferPDF = (transfer: StockTransfer) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Stock Transfer ${transfer.transferNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1e293b; max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 3px solid #0f172a; padding-bottom: 20px; }
    .header h1 { font-size: 24px; color: #0f172a; }
    .header .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; }
    .transfer-number { font-size: 18px; font-weight: 700; color: #0f172a; text-align: right; }
    .transfer-date { font-size: 12px; color: #64748b; text-align: right; margin-top: 4px; }
    .branches { display: flex; gap: 40px; margin-bottom: 32px; }
    .branch-box { flex: 1; padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px; }
    .branch-box h3 { font-size: 10px; text-transform: uppercase; font-weight: 700; color: #64748b; margin-bottom: 8px; letter-spacing: 1px; }
    .branch-box p { font-size: 14px; font-weight: 600; color: #0f172a; }
    .arrow { display: flex; align-items: center; justify-content: center; font-size: 24px; color: #64748b; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead th { background: #f8fafc; padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; }
    tbody td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .totals { display: flex; justify-content: flex-end; margin-bottom: 24px; }
    .totals-box { width: 250px; }
    .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
    .totals-row.total { font-weight: 700; font-size: 15px; border-top: 2px solid #0f172a; padding-top: 8px; margin-top: 4px; }
    .notes { padding: 16px; background: #f8fafc; border-radius: 8px; margin-bottom: 32px; }
    .notes h4 { font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; margin-bottom: 6px; }
    .notes p { font-size: 13px; color: #475569; }
    .footer { text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; }
    .status { display: inline-block; background: #dcfce7; color: #166534; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 100px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Stock Transfer Invoice</h1>
      <div class="subtitle">Hoard Lavish ERP — Inter-branch Stock Transfer</div>
    </div>
    <div>
      <div class="transfer-number">${transfer.transferNumber}</div>
      <div class="transfer-date">${new Date(transfer.date).toLocaleString()}</div>
      <div style="text-align:right;margin-top:6px"><span class="status">${transfer.status}</span></div>
    </div>
  </div>

  <div class="branches">
    <div class="branch-box">
      <h3>From (Source)</h3>
      <p>${transfer.fromBranchName}</p>
    </div>
    <div class="arrow">→</div>
    <div class="branch-box">
      <h3>To (Destination)</h3>
      <p>${transfer.toBranchName}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Product</th>
        <th>SKU</th>
        <th class="text-center">Quantity</th>
        <th class="text-right">Unit Price</th>
        <th class="text-right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${transfer.items.map((item, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${item.productName}</td>
        <td style="font-family:monospace;font-size:12px">${item.sku}</td>
        <td class="text-center">${item.quantity}</td>
        <td class="text-right">LKR ${item.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td class="text-right">LKR ${(item.quantity * item.unitPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="totals-row"><span>Total Items:</span><span>${transfer.totalItems}</span></div>
      <div class="totals-row total"><span>Total Value:</span><span>LKR ${transfer.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
    </div>
  </div>

  ${transfer.notes ? `
  <div class="notes">
    <h4>Notes</h4>
    <p>${transfer.notes}</p>
  </div>
  ` : ''}

  <div class="footer">
    Generated by Hoard Lavish ERP — ${new Date().toLocaleString()}
  </div>

  <script>window.onload = () => window.print();</script>
</body>
</html>`;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Available products for transfer (filtered by search)
  const transferableProducts = useMemo(() => {
    let result = products.filter(p => (p.branchStock[currentBranch.id] || 0) > 0);
    if (transferSearchTerm) {
      const lower = transferSearchTerm.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(lower) ||
        p.sku.toLowerCase().includes(lower)
      );
    }
    return result;
  }, [products, currentBranch, transferSearchTerm]);

  // --- Barcode Helpers ---
  const generateBarcode = (): string => {
    const prefix = '200';
    let code = prefix;
    for (let i = 0; i < 9; i++) {
      code += Math.floor(Math.random() * 10).toString();
    }
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return code + checkDigit.toString();
  };

  const handlePrintBarcode = () => {
    if (!editingProduct) return;
    const barcode = editingProduct.barcode || '';
    const name = editingProduct.name || 'Product';
    const price = Number(editingProduct.price) || 0;
    const color = editingProduct.color || '';
    const size = editingProduct.size || '';
    if (!barcode) return;

    // Create a temporary container for printing
    const printContainer = document.createElement('div');
    printContainer.style.position = 'fixed';
    printContainer.style.top = '0';
    printContainer.style.left = '0';
    printContainer.style.width = '100%';
    printContainer.style.height = '100%';
    printContainer.style.zIndex = '-9999';
    printContainer.style.visibility = 'hidden';

    let barsHtml = '<div style="display:flex;align-items:flex-end;justify-content:center;">';
    barsHtml += '<div style="width:2px;height:40px;background:#000;"></div><div style="width:1px;height:40px;background:#fff;"></div><div style="width:1px;height:40px;background:#000;"></div><div style="width:2px;height:40px;background:#fff;"></div>';
    for (let i = 0; i < barcode.length; i++) {
      const d = parseInt(barcode[i]) || 0;
      barsHtml += '<div style="width:' + ((d % 3) + 1) + 'px;height:38px;background:#000;"></div>';
      barsHtml += '<div style="width:' + ((d % 2) + 1) + 'px;height:38px;background:#fff;"></div>';
      barsHtml += '<div style="width:' + (((d + 1) % 3) + 1) + 'px;height:38px;background:#000;"></div>';
      barsHtml += '<div style="width:1px;height:38px;background:#fff;"></div>';
    }
    barsHtml += '<div style="width:1px;height:40px;background:#000;"></div><div style="width:2px;height:40px;background:#fff;"></div><div style="width:2px;height:40px;background:#000;"></div>';
    barsHtml += '</div>';

    const variantParts = [color, size].filter(Boolean).join(' / ');
    
    // Create label content optimized for 40x30mm or 50x30mm sticker
    const labelContent = `
      <style>
        @page { 
          size: 50mm 30mm; 
          margin: 0; 
        }
        * { 
          margin: 0; 
          padding: 0; 
          box-sizing: border-box; 
        }
        body { 
          width: 50mm;
          height: 30mm;
          font-family: Arial, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .label { 
          width: 100%;
          height: 100%;
          padding: 2mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #fff;
        }
        .product-name { 
          font-size: 8pt;
          font-weight: bold;
          text-align: center;
          margin-bottom: 1mm;
          line-height: 1.1;
          max-height: 16pt;
          overflow: hidden;
        }
        .variant { 
          font-size: 6pt;
          text-align: center;
          margin-bottom: 1mm;
          color: #333;
        }
        .price { 
          font-size: 11pt;
          font-weight: bold;
          margin-bottom: 1mm;
        }
        .barcode-visual { 
          margin-bottom: 1mm;
          transform: scale(0.8);
        }
        .barcode-number { 
          font-family: monospace;
          font-size: 7pt;
          letter-spacing: 1px;
        }
      </style>
      <div class="label">
        <div class="product-name">${name}</div>
        ${variantParts ? '<div class="variant">' + variantParts + '</div>' : ''}
        <div class="price">${CUR} ${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div class="barcode-visual">${barsHtml}</div>
        <div class="barcode-number">${barcode}</div>
      </div>
    `;

    printContainer.innerHTML = labelContent;
    document.body.appendChild(printContainer);

    // Use silent print if available (Electron), otherwise use window.print
    setTimeout(() => {
      if (window.electronAPI?.silentPrint) {
        window.electronAPI.silentPrint();
      } else {
        window.print();
      }
      // Remove the container after printing
      setTimeout(() => {
        document.body.removeChild(printContainer);
      }, 1000);
    }, 100);
  };

  // Tab button component
  const TabButton = ({ id, label, icon: Icon }: { id: InventoryTab, label: string, icon: any }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 px-4 py-2 border-b-2 font-medium text-sm transition-colors
        ${activeTab === id
          ? 'border-slate-900 text-slate-900'
          : 'border-transparent text-slate-500 hover:text-slate-700'}`}
    >
      <Icon size={16} />
      {label}
      {id === 'LOW_STOCK' && (
        <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full text-xs">
          {products.filter(p => (p.branchStock[currentBranch.id] || 0) <= p.minStockLevel).length}
        </span>
      )}
    </button>
  );

  return (
    <div className="flex-1 bg-slate-50 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex justify-between items-center mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-slate-900">Inventory Management</h1>
              <span className="bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                <Building2 size={12} /> {currentBranch.name}
              </span>
            </div>
            <p className="text-sm text-slate-500">Manage products and stock levels for this branch.</p>
          </div>
          {!isCashier && (
          <button
            onClick={handleOpenAdd}
            className="bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-800 transition-colors shadow-sm text-sm font-medium"
          >
            <Plus size={16} /> Add Product
          </button>
          )}
        </div>

        <div className="flex gap-4 overflow-x-auto">
          <TabButton id="ALL" label="All Products" icon={Box} />
          <TabButton id="LOW_STOCK" label="Low Stock Alerts" icon={AlertCircle} />
          <TabButton id="ADJUSTMENTS" label="Stock History" icon={History} />
          {!isCashier && <TabButton id="TRANSFERS" label="Stock Transfers" icon={ArrowRightLeft} />}
          {!isCashier && <TabButton id="CATEGORIES" label="Categories & Brands" icon={Tag} />}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* FILTERS */}
        {(activeTab === 'ALL' || activeTab === 'LOW_STOCK') && (
          <div className="flex gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search by name, SKU, brand, color, size..."
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none bg-white text-slate-600"
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
            >
              <option value="All">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}

        {/* PRODUCTS TABLE */}
        {(activeTab === 'ALL' || activeTab === 'LOW_STOCK') && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-medium">
                <tr>
                  <th className="p-4">Product</th>
                  <th className="p-4">SKU / Brand</th>
                  <th className="p-4">Category</th>
                  <th className="p-4 text-center">Variant</th>
                  <th className="p-4 text-right">Cost</th>
                  <th className="p-4 text-right">Price</th>
                  <th className="p-4 text-center">Stock ({currentBranch.name})</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredProducts.map(p => {
                  const branchStock = p.branchStock[currentBranch.id] || 0;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="p-4 flex items-center gap-3">
                        <div>
                          <div className="font-medium text-slate-900">{p.name}</div>
                          {branchStock <= p.minStockLevel && (
                            <span className="text-[10px] text-red-600 font-bold bg-red-50 px-1.5 py-0.5 rounded">Low Stock</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-slate-600">
                        <div className="font-mono text-xs">{p.sku}</div>
                        <div className="text-xs text-slate-400">{p.brand}</div>
                      </td>
                      <td className="p-4 text-slate-600">{p.category}</td>
                      <td className="p-4 text-center">
                        {(p.color || p.size) ? (
                          <div className="flex items-center justify-center gap-1.5">
                            {p.color && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                                <Palette size={10} /> {p.color}
                              </span>
                            )}
                            {p.size && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                                <Ruler size={10} /> {p.size}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="p-4 text-right text-slate-500">{fmtCurrency(p.costPrice)}</td>
                      <td className="p-4 text-right font-medium text-slate-900">{fmtCurrency(p.price)}</td>
                      <td className="p-4 text-center">
                        <div className="flex flex-col items-center">
                          <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${branchStock === 0 ? 'bg-red-100 text-red-700' :
                            branchStock <= p.minStockLevel ? 'bg-amber-100 text-amber-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                            {branchStock}
                          </div>
                          <span className="text-[10px] text-slate-400 mt-1">Total: {p.stock}</span>
                        </div>
                      </td>
                      {/* 1. Always-visible action buttons */}
                      <td className="p-4 text-center">
                        {!isCashier ? (
                        <div className="flex justify-center gap-1">
                          <button
                            onClick={() => handleOpenAdjustment(p)}
                            className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                            title="Adjust Stock"
                          >
                            <History size={16} />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteRequest(p)}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        ) : (
                          <span className="text-xs text-slate-400">View only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {filteredProducts.length > 0 && (() => {
                const totalQty = filteredProducts.reduce((sum, p) => sum + (p.branchStock[currentBranch.id] || 0), 0);
                return (
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                      <td colSpan={6} className="p-4 text-right text-sm font-semibold text-slate-600">
                        Total Quantity
                        {filterCategory !== 'All' && (
                          <span className="ml-1 text-xs font-normal text-slate-400">({filterCategory})</span>
                        )}
                        {searchTerm && (
                          <span className="ml-1 text-xs font-normal text-slate-400">(filtered)</span>
                        )}
                        :
                      </td>
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-blue-100 text-blue-700">
                          {totalQty}
                        </span>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
            {filteredProducts.length === 0 && (
              <div className="p-8 text-center text-slate-400">No products found matching your criteria.</div>
            )}
          </div>
        )}

        {/* STOCK HISTORY TAB — also show TRANSFER type */}
        {activeTab === 'ADJUSTMENTS' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                <tr>
                  <th className="p-4">Date</th>
                  <th className="p-4">Product</th>
                  <th className="p-4">Branch</th>
                  <th className="p-4">Type</th>
                  <th className="p-4 text-right">Quantity</th>
                  <th className="p-4">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stockHistory.filter(h => h.branchId === currentBranch.id).map(log => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="p-4 text-slate-500 whitespace-nowrap">
                      {new Date(log.date).toLocaleString()}
                    </td>
                    <td className="p-4 font-medium text-slate-900">{log.productName}</td>
                    <td className="p-4 text-slate-600 text-xs">{log.branchName}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold
                        ${log.type === 'IN' ? 'bg-green-100 text-green-700' :
                          log.type === 'OUT' ? 'bg-red-100 text-red-700' :
                          log.type === 'TRANSFER' ? 'bg-purple-100 text-purple-700' :
                          'bg-blue-100 text-blue-700'}`}>
                        {log.type === 'IN' && <ArrowDownRight size={12} />}
                        {log.type === 'OUT' && <ArrowUpRight size={12} />}
                        {log.type === 'TRANSFER' && <ArrowRightLeft size={12} />}
                        {log.type}
                      </span>
                    </td>
                    <td className="p-4 text-right font-mono">{log.quantity}</td>
                    <td className="p-4 text-slate-600">{log.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stockHistory.filter(h => h.branchId === currentBranch.id).length === 0 && (
              <div className="p-8 text-center text-slate-400">No stock movement history available for this branch.</div>
            )}
          </div>
        )}

        {/* STOCK TRANSFERS TAB */}
        {activeTab === 'TRANSFERS' && (
          <div className="space-y-6">
            {/* Completed Transfer PDF Preview */}
            {completedTransfer && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 rounded-full text-emerald-600">
                      <ArrowRightLeft size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-emerald-800">Transfer Completed!</h4>
                      <p className="text-sm text-emerald-600">Transfer {completedTransfer.transferNumber} — {completedTransfer.totalItems} items moved to {completedTransfer.toBranchName}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => generateTransferPDF(completedTransfer)}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
                    >
                      <Printer size={14} /> Print / Download PDF
                    </button>
                    <button
                      onClick={() => setCompletedTransfer(null)}
                      className="p-2 text-emerald-400 hover:text-emerald-600 rounded"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* New Transfer Section */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <ArrowRightLeft size={18} className="text-indigo-500" />
                    Create Stock Transfer
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">Select products and quantities to transfer to another branch.</p>
                </div>
                {otherBranches.length > 0 && (
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-bold text-slate-500 uppercase">Transfer To:</label>
                    <select
                      className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      value={transferDestBranch}
                      onChange={e => setTransferDestBranch(e.target.value)}
                    >
                      <option value="">Select Destination...</option>
                      {otherBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {otherBranches.length === 0 ? (
                <div className="p-8 text-center text-slate-400">No other branches available for transfer. Add more branches first.</div>
              ) : (
                <div className="p-5 space-y-4">
                  {/* Product Selector */}
                  <div>
                    <div className="relative max-w-md mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        type="text"
                        placeholder="Search products to add to transfer..."
                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                        value={transferSearchTerm}
                        onChange={e => setTransferSearchTerm(e.target.value)}
                      />
                    </div>

                    {transferSearchTerm && (
                      <div className="bg-slate-50 rounded-lg border border-slate-200 max-h-48 overflow-y-auto mb-4">
                        {transferableProducts.filter(p => !transferItems.some(i => i.productId === p.id)).map(p => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-100 cursor-pointer border-b border-slate-100 last:border-0"
                            onClick={() => { handleAddToTransfer(p); setTransferSearchTerm(''); }}
                          >
                            <div>
                              <span className="font-medium text-sm text-slate-900">{p.name}</span>
                              <span className="ml-2 text-xs text-slate-400 font-mono">{p.sku}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-slate-500">Available: {p.branchStock[currentBranch.id] || 0}</span>
                              <Plus size={14} className="text-indigo-500" />
                            </div>
                          </div>
                        ))}
                        {transferableProducts.filter(p => !transferItems.some(i => i.productId === p.id)).length === 0 && (
                          <div className="p-4 text-center text-slate-400 text-sm">No matching products with available stock.</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Transfer Items Table */}
                  {transferItems.length > 0 ? (
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                          <tr>
                            <th className="p-3">Product</th>
                            <th className="p-3">SKU</th>
                            <th className="p-3 text-center">Available</th>
                            <th className="p-3 text-center">Transfer Qty</th>
                            <th className="p-3 text-right">Unit Price</th>
                            <th className="p-3 text-right">Line Total</th>
                            <th className="p-3 text-center">Remove</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {transferItems.map(item => {
                            const product = products.find(p => p.id === item.productId);
                            const available = product ? (product.branchStock[currentBranch.id] || 0) : 0;
                            return (
                              <tr key={item.productId} className="hover:bg-slate-50">
                                <td className="p-3 font-medium text-slate-900">{item.productName}</td>
                                <td className="p-3 text-slate-500 font-mono text-xs">{item.sku}</td>
                                <td className="p-3 text-center">
                                  <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-medium">{available}</span>
                                </td>
                                <td className="p-3">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() => handleUpdateTransferQty(item.productId, item.quantity - 1)}
                                      className="p-1 hover:bg-slate-200 rounded text-slate-500"
                                      disabled={item.quantity <= 1}
                                    >
                                      <Minus size={14} />
                                    </button>
                                    <input
                                      type="number"
                                      min={1}
                                      max={available}
                                      value={item.quantity}
                                      onChange={e => handleUpdateTransferQty(item.productId, Number(e.target.value))}
                                      className="w-16 text-center border border-slate-200 rounded py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                    />
                                    <button
                                      onClick={() => handleUpdateTransferQty(item.productId, item.quantity + 1)}
                                      className="p-1 hover:bg-slate-200 rounded text-slate-500"
                                      disabled={item.quantity >= available}
                                    >
                                      <Plus size={14} />
                                    </button>
                                  </div>
                                </td>
                                <td className="p-3 text-right text-slate-600">{fmtCurrency(item.unitPrice)}</td>
                                <td className="p-3 text-right font-medium text-slate-900">{fmtCurrency(item.quantity * item.unitPrice)}</td>
                                <td className="p-3 text-center">
                                  <button
                                    onClick={() => handleRemoveTransferItem(item.productId)}
                                    className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      {/* Transfer Summary */}
                      <div className="bg-slate-50 p-4 border-t border-slate-200">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 max-w-md">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Transfer Notes</label>
                            <input
                              type="text"
                              placeholder="e.g. Seasonal restock for Downtown branch"
                              className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                              value={transferNotes}
                              onChange={e => setTransferNotes(e.target.value)}
                            />
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-slate-500 mb-1">
                              <span className="font-bold">{transferItems.reduce((s, i) => s + i.quantity, 0)}</span> items
                            </div>
                            <div className="text-lg font-bold text-slate-900">
                              {fmtCurrency(transferItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0))}
                            </div>
                            <button
                              onClick={handleExecuteTransfer}
                              disabled={!transferDestBranch}
                              className={`mt-3 px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 ml-auto transition-colors ${
                                transferDestBranch
                                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                              }`}
                            >
                              <ArrowRightLeft size={16} /> Execute Transfer
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                      <ArrowRightLeft size={32} className="mx-auto mb-2 text-slate-300" />
                      <p className="text-sm">Search and add products above to start a transfer.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Transfer History */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div
                className="p-5 border-b border-slate-100 flex justify-between items-center cursor-pointer hover:bg-slate-50"
                onClick={() => setShowTransferHistory(!showTransferHistory)}
              >
                <div>
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <History size={18} className="text-slate-500" />
                    Transfer History
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">{stockTransfers.length} transfers recorded</p>
                </div>
                {showTransferHistory ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
              </div>

              {showTransferHistory && (
                <>
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                      <tr>
                        <th className="p-4">Date</th>
                        <th className="p-4">Transfer #</th>
                        <th className="p-4">From</th>
                        <th className="p-4">To</th>
                        <th className="p-4 text-center">Items</th>
                        <th className="p-4 text-right">Value</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stockTransfers
                        .filter(t => t.fromBranchId === currentBranch.id || t.toBranchId === currentBranch.id)
                        .map(t => (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="p-4 text-slate-500 whitespace-nowrap">{new Date(t.date).toLocaleString()}</td>
                          <td className="p-4 font-mono text-xs font-bold text-indigo-600">{t.transferNumber}</td>
                          <td className="p-4 text-slate-700">{t.fromBranchName}</td>
                          <td className="p-4 text-slate-700">{t.toBranchName}</td>
                          <td className="p-4 text-center">
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-medium">{t.totalItems}</span>
                          </td>
                          <td className="p-4 text-right font-medium text-slate-900">{fmtCurrency(t.totalValue)}</td>
                          <td className="p-4 text-center">
                            <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-xs font-bold">{t.status}</span>
                          </td>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => generateTransferPDF(t)}
                              className="p-1.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded transition-colors"
                              title="Print Transfer Invoice"
                            >
                              <FileText size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {stockTransfers.filter(t => t.fromBranchId === currentBranch.id || t.toBranchId === currentBranch.id).length === 0 && (
                    <div className="p-8 text-center text-slate-400">No stock transfers recorded for this branch yet.</div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* CATEGORIES & BRANDS TAB */}
        {activeTab === 'CATEGORIES' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-lg mb-4 text-slate-800">Product Categories</h3>
              <div className="flex gap-2 mb-4">
                <input id="newCat" type="text" placeholder="New Category" className="flex-1 p-2 border border-slate-200 rounded-lg text-sm" />
                <button
                  onClick={() => {
                    const input = document.getElementById('newCat') as HTMLInputElement;
                    if (input.value) { addCategory(input.value); input.value = ''; }
                  }}
                  className="bg-slate-900 text-white px-4 rounded-lg text-sm"
                >Add</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <div key={cat} className="group flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full text-sm text-slate-700">
                    {cat}
                    <button onClick={() => removeCategory(cat)} className="text-slate-400 hover:text-red-500"><X size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-lg mb-4 text-slate-800">Brands</h3>
              <div className="flex gap-2 mb-4">
                <input id="newBrand" type="text" placeholder="New Brand" className="flex-1 p-2 border border-slate-200 rounded-lg text-sm" />
                <button
                  onClick={() => {
                    const input = document.getElementById('newBrand') as HTMLInputElement;
                    if (input.value) { addBrand(input.value); input.value = ''; }
                  }}
                  className="bg-slate-900 text-white px-4 rounded-lg text-sm"
                >Add</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {brands.map(brand => (
                  <div key={brand} className="group flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full text-sm text-slate-700">
                    {brand}
                    <button onClick={() => removeBrand(brand)} className="text-slate-400 hover:text-red-500"><X size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: ADD / EDIT PRODUCT */}
      {isProductModalOpen && editingProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">{editingProduct.id ? 'Edit Product' : 'New Product'}</h3>
              <button onClick={() => { setIsProductModalOpen(false); setUseVariations(false); setVariations([]); }} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {/* Base product fields */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Product Name</label>
                  <input
                    type="text"
                    className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 outline-none"
                    placeholder="e.g. Silk Scarf"
                    value={editingProduct.name || ''}
                    onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Brand</label>
                  <select
                    className="w-full p-2 border border-slate-200 rounded-lg outline-none bg-white"
                    value={editingProduct.brand}
                    onChange={e => setEditingProduct({ ...editingProduct, brand: e.target.value })}
                  >
                    {brands.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Category</label>
                  <select
                    className="w-full p-2 border border-slate-200 rounded-lg outline-none bg-white"
                    value={editingProduct.category}
                    onChange={e => setEditingProduct({ ...editingProduct, category: e.target.value })}
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Min Stock Alert</label>
                  <input
                    type="number"
                    className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                    value={editingProduct.minStockLevel || 5}
                    onChange={e => setEditingProduct({ ...editingProduct, minStockLevel: Number(e.target.value) })}
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
                  <textarea
                    className="w-full p-2 border border-slate-200 rounded-lg outline-none h-16 resize-none"
                    value={editingProduct.description || ''}
                    onChange={e => setEditingProduct({ ...editingProduct, description: e.target.value })}
                  />
                </div>
              </div>

              {/* If editing existing product — show single product fields */}
              {editingProduct.id ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">SKU</label>
                    <input
                      type="text"
                      className="w-full p-2 border border-slate-200 rounded-lg outline-none font-mono"
                      value={editingProduct.sku || ''}
                      onChange={e => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Stock ({currentBranch.name})</label>
                    <input
                      type="number"
                      className="w-full p-2 border border-slate-200 rounded-lg outline-none bg-slate-100 text-slate-500"
                      disabled
                      value={editingProduct.branchStock?.[currentBranch.id] || 0}
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Use 'Adjust Stock' to change inventory.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Color</label>
                    {addingColorFor === 'edit' ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Enter new color name..."
                          className="flex-1 p-2 border border-indigo-300 rounded-lg outline-none text-sm focus:ring-2 focus:ring-indigo-200"
                          value={newColorName}
                          onChange={e => setNewColorName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && newColorName.trim()) {
                              if (!customColors.includes(newColorName.trim())) setCustomColors(prev => [...prev, newColorName.trim()]);
                              setEditingProduct({ ...editingProduct, color: newColorName.trim() });
                              setNewColorName(''); setAddingColorFor(null);
                            }
                          }}
                          autoFocus
                        />
                        <button onClick={() => { if (newColorName.trim()) { if (!customColors.includes(newColorName.trim())) setCustomColors(prev => [...prev, newColorName.trim()]); setEditingProduct({ ...editingProduct, color: newColorName.trim() }); setNewColorName(''); setAddingColorFor(null); } }} className="px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-medium">Add</button>
                        <button onClick={() => { setAddingColorFor(null); setNewColorName(''); }} className="px-3 py-2 text-slate-500 hover:bg-slate-100 rounded-lg text-xs">Cancel</button>
                      </div>
                    ) : (
                      <select
                        className="w-full p-2 border border-slate-200 rounded-lg outline-none bg-white"
                        value={editingProduct.color || ''}
                        onChange={e => { if (e.target.value === '__NEW__') { setAddingColorFor('edit'); setNewColorName(''); } else { setEditingProduct({ ...editingProduct, color: e.target.value }); } }}
                      >
                        <option value="">No Color</option>
                        {allColors.map(c => <option key={c} value={c}>{c}</option>)}
                        <option value="__NEW__">+ Add New Color...</option>
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Size</label>
                    <select
                      className="w-full p-2 border border-slate-200 rounded-lg outline-none bg-white"
                      value={editingProduct.size || ''}
                      onChange={e => setEditingProduct({ ...editingProduct, size: e.target.value })}
                    >
                      <option value="">No Size</option>
                      {AVAILABLE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cost Price ({CUR})</label>
                    <input
                      type="number"
                      className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                      value={editingProduct.costPrice || 0}
                      onChange={e => setEditingProduct({ ...editingProduct, costPrice: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Selling Price ({CUR})</label>
                    <input
                      type="number"
                      className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                      value={editingProduct.price || 0}
                      onChange={e => setEditingProduct({ ...editingProduct, price: Number(e.target.value) })}
                    />
                  </div>
                  {/* Barcode Section */}
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Barcode 1</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                          type="text"
                          placeholder="Enter or generate barcode..."
                          className="w-full pl-10 p-2 border border-slate-200 rounded-lg outline-none font-mono"
                          value={editingProduct.barcode || ''}
                          onChange={e => setEditingProduct({ ...editingProduct, barcode: e.target.value })}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingProduct({ ...editingProduct, barcode: generateBarcode() })}
                        className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors whitespace-nowrap"
                      >
                        Generate
                      </button>
                      <button
                        type="button"
                        onClick={handlePrintBarcode}
                        disabled={!editingProduct.barcode}
                        className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Printer size={14} /> Print Tag
                      </button>
                    </div>
                  </div>
                  {/* Barcode 2 Section */}
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Barcode 2 (Optional)</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                          type="text"
                          placeholder="Enter alternate barcode..."
                          className="w-full pl-10 p-2 border border-slate-200 rounded-lg outline-none font-mono"
                          value={editingProduct.barcode2 || ''}
                          onChange={e => setEditingProduct({ ...editingProduct, barcode2: e.target.value })}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingProduct({ ...editingProduct, barcode2: generateBarcode() })}
                        className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors whitespace-nowrap"
                      >
                        Generate
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* New product: single product fields OR variation builder */}
                  {!useVariations ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">SKU</label>
                          <input
                            type="text"
                            className="w-full p-2 border border-slate-200 rounded-lg outline-none font-mono"
                            value={editingProduct.sku || ''}
                            onChange={e => setEditingProduct({ ...editingProduct, sku: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cost Price ({CUR})</label>
                          <input
                            type="number"
                            className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                            value={editingProduct.costPrice || 0}
                            onChange={e => setEditingProduct({ ...editingProduct, costPrice: Number(e.target.value) })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Selling Price ({CUR})</label>
                          <input
                            type="number"
                            className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                            value={editingProduct.price || 0}
                            onChange={e => setEditingProduct({ ...editingProduct, price: Number(e.target.value) })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Color</label>
                          {addingColorFor === 'new' ? (
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="Enter new color name..."
                                className="flex-1 p-2 border border-indigo-300 rounded-lg outline-none text-sm focus:ring-2 focus:ring-indigo-200"
                                value={newColorName}
                                onChange={e => setNewColorName(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && newColorName.trim()) {
                                    if (!customColors.includes(newColorName.trim())) setCustomColors(prev => [...prev, newColorName.trim()]);
                                    setEditingProduct({ ...editingProduct, color: newColorName.trim() });
                                    setNewColorName(''); setAddingColorFor(null);
                                  }
                                }}
                                autoFocus
                              />
                              <button onClick={() => { if (newColorName.trim()) { if (!customColors.includes(newColorName.trim())) setCustomColors(prev => [...prev, newColorName.trim()]); setEditingProduct({ ...editingProduct, color: newColorName.trim() }); setNewColorName(''); setAddingColorFor(null); } }} className="px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-medium">Add</button>
                              <button onClick={() => { setAddingColorFor(null); setNewColorName(''); }} className="px-3 py-2 text-slate-500 hover:bg-slate-100 rounded-lg text-xs">Cancel</button>
                            </div>
                          ) : (
                            <select
                              className="w-full p-2 border border-slate-200 rounded-lg outline-none bg-white"
                              value={editingProduct.color || ''}
                              onChange={e => { if (e.target.value === '__NEW__') { setAddingColorFor('new'); setNewColorName(''); } else { setEditingProduct({ ...editingProduct, color: e.target.value }); } }}
                            >
                              <option value="">No Color</option>
                              {allColors.map(c => <option key={c} value={c}>{c}</option>)}
                              <option value="__NEW__">+ Add New Color...</option>
                            </select>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Size</label>
                          <select
                            className="w-full p-2 border border-slate-200 rounded-lg outline-none bg-white"
                            value={editingProduct.size || ''}
                            onChange={e => setEditingProduct({ ...editingProduct, size: e.target.value })}
                          >
                            <option value="">No Size</option>
                            {AVAILABLE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Initial Stock ({currentBranch.name})</label>
                          <input
                            type="number"
                            min="0"
                            className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                            value={editingProduct.branchStock?.[currentBranch.id] || 0}
                            onChange={e => setEditingProduct({ ...editingProduct, branchStock: { ...editingProduct.branchStock, [currentBranch.id]: Number(e.target.value) } })}
                          />
                        </div>
                        {/* Barcode Section */}
                        <div className="col-span-2">
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Barcode 1</label>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                              <input
                                type="text"
                                placeholder="Enter or generate barcode..."
                                className="w-full pl-10 p-2 border border-slate-200 rounded-lg outline-none font-mono"
                                value={editingProduct.barcode || ''}
                                onChange={e => setEditingProduct({ ...editingProduct, barcode: e.target.value })}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => setEditingProduct({ ...editingProduct, barcode: generateBarcode() })}
                              className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors whitespace-nowrap"
                            >
                              Generate
                            </button>
                            <button
                              type="button"
                              onClick={handlePrintBarcode}
                              disabled={!editingProduct.barcode}
                              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Printer size={14} /> Print Tag
                            </button>
                          </div>
                        </div>
                        {/* Barcode 2 Section */}
                        <div className="col-span-2">
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Barcode 2 (Optional)</label>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                              <input
                                type="text"
                                placeholder="Enter alternate barcode..."
                                className="w-full pl-10 p-2 border border-slate-200 rounded-lg outline-none font-mono"
                                value={editingProduct.barcode2 || ''}
                                onChange={e => setEditingProduct({ ...editingProduct, barcode2: e.target.value })}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => setEditingProduct({ ...editingProduct, barcode2: generateBarcode() })}
                              className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors whitespace-nowrap"
                            >
                              Generate
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Toggle to switch to variation mode */}
                      <button
                        onClick={() => { setUseVariations(true); handleAddVariation(); }}
                        className="w-full py-2.5 border-2 border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <Plus size={14} /> Add Color/Size Variations (creates multiple unique products)
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Variation Builder */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <Palette size={14} className="text-indigo-500" />
                            Product Variations
                            <span className="text-xs text-slate-400 font-normal">— each variation becomes a unique product</span>
                          </h4>
                          <button
                            onClick={() => { setUseVariations(false); setVariations([]); }}
                            className="text-xs text-slate-400 hover:text-slate-600"
                          >
                            Cancel Variations
                          </button>
                        </div>

                        {/* Header */}
                        <div className="grid grid-cols-1 gap-2 text-xs font-bold text-slate-400 uppercase px-1">
                          <div className="grid grid-cols-12 gap-2">
                            <span className="col-span-2">Color</span>
                            <span className="col-span-2">Size</span>
                            <span className="col-span-2">SKU</span>
                            <span className="col-span-2">Cost ({CUR})</span>
                            <span className="col-span-2">Price ({CUR})</span>
                            <span className="col-span-1">Qty</span>
                            <span className="col-span-1"></span>
                          </div>
                          <div className="grid grid-cols-12 gap-2">
                            <span className="col-span-6">Barcode 1</span>
                            <span className="col-span-6">Barcode 2</span>
                          </div>
                        </div>

                        {variations.map((v, idx) => (
                          <div key={idx} className="space-y-1">
                            <div className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                              {addingColorFor === `var-${idx}` ? (
                                <div className="col-span-2 flex gap-1">
                                  <input
                                    type="text"
                                    placeholder="Color name..."
                                    className="flex-1 p-1.5 border border-indigo-300 rounded text-xs focus:ring-1 focus:ring-indigo-200 outline-none"
                                    value={newColorName}
                                    onChange={e => setNewColorName(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter' && newColorName.trim()) {
                                        if (!customColors.includes(newColorName.trim())) setCustomColors(prev => [...prev, newColorName.trim()]);
                                        handleUpdateVariation(idx, 'color', newColorName.trim());
                                        setNewColorName(''); setAddingColorFor(null);
                                      }
                                    }}
                                    autoFocus
                                  />
                                  <button onClick={() => { if (newColorName.trim()) { if (!customColors.includes(newColorName.trim())) setCustomColors(prev => [...prev, newColorName.trim()]); handleUpdateVariation(idx, 'color', newColorName.trim()); setNewColorName(''); setAddingColorFor(null); } }} className="px-2 py-1 bg-slate-900 text-white rounded text-[10px] font-medium">OK</button>
                                  <button onClick={() => { setAddingColorFor(null); setNewColorName(''); }} className="px-2 py-1 text-slate-400 hover:bg-slate-100 rounded text-[10px]">✕</button>
                                </div>
                              ) : (
                                <select
                                  className="col-span-2 p-1.5 border border-slate-200 rounded text-xs bg-white"
                                  value={v.color}
                                  onChange={e => { if (e.target.value === '__NEW__') { setAddingColorFor(`var-${idx}`); setNewColorName(''); } else { handleUpdateVariation(idx, 'color', e.target.value); } }}
                                >
                                  {allColors.map(c => <option key={c} value={c}>{c}</option>)}
                                  <option value="__NEW__">+ New Color...</option>
                                </select>
                              )}
                              <select
                                className="col-span-2 p-1.5 border border-slate-200 rounded text-xs bg-white"
                                value={v.size}
                                onChange={e => handleUpdateVariation(idx, 'size', e.target.value)}
                              >
                                {AVAILABLE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                              <input
                                type="text"
                                placeholder="SKU"
                                className="col-span-2 p-1.5 border border-slate-200 rounded text-xs font-mono"
                                value={v.sku}
                                onChange={e => handleUpdateVariation(idx, 'sku', e.target.value)}
                              />
                              <input
                                type="number"
                                className="col-span-2 p-1.5 border border-slate-200 rounded text-xs"
                                value={v.costPrice}
                                onChange={e => handleUpdateVariation(idx, 'costPrice', Number(e.target.value))}
                              />
                              <input
                                type="number"
                                className="col-span-2 p-1.5 border border-slate-200 rounded text-xs"
                                value={v.price}
                                onChange={e => handleUpdateVariation(idx, 'price', Number(e.target.value))}
                              />
                              <input
                                type="number"
                                min="0"
                                className="col-span-1 p-1.5 border border-slate-200 rounded text-xs"
                                value={v.quantity}
                                onChange={e => handleUpdateVariation(idx, 'quantity', Number(e.target.value))}
                              />
                              <div className="col-span-1 flex justify-center">
                                <button
                                  onClick={() => handleRemoveVariation(idx)}
                                  className="p-1 text-red-400 hover:text-red-600 rounded"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                            {/* Barcode Row */}
                            <div className="grid grid-cols-12 gap-2 px-2 pb-1">
                              <div className="col-span-6 flex gap-1">
                                <input
                                  type="text"
                                  placeholder="Barcode 1..."
                                  className="flex-1 p-1.5 border border-slate-200 rounded text-xs font-mono"
                                  value={v.barcode || ''}
                                  onChange={e => handleUpdateVariation(idx, 'barcode', e.target.value)}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdateVariation(idx, 'barcode', generateBarcode())}
                                  className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-[10px] font-medium hover:bg-indigo-100"
                                  title="Generate Barcode 1"
                                >
                                  Gen
                                </button>
                              </div>
                              <div className="col-span-6 flex gap-1">
                                <input
                                  type="text"
                                  placeholder="Barcode 2 (optional)..."
                                  className="flex-1 p-1.5 border border-slate-200 rounded text-xs font-mono"
                                  value={v.barcode2 || ''}
                                  onChange={e => handleUpdateVariation(idx, 'barcode2', e.target.value)}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdateVariation(idx, 'barcode2', generateBarcode())}
                                  className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-[10px] font-medium hover:bg-indigo-100"
                                  title="Generate Barcode 2"
                                >
                                  Gen
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}

                        <button
                          onClick={handleAddVariation}
                          className="w-full py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors flex items-center justify-center gap-1"
                        >
                          <Plus size={12} /> Add Another Variation
                        </button>

                        {variations.length > 0 && (
                          <p className="text-xs text-indigo-500 bg-indigo-50 px-3 py-2 rounded-lg">
                            ℹ️ This will create <strong>{variations.length}</strong> unique product{variations.length !== 1 ? 's' : ''}:
                            {variations.slice(0, 3).map((v, i) => (
                              <span key={i} className="ml-1 font-mono">{editingProduct?.name} — {v.color}/{v.size}</span>
                            ))}
                            {variations.length > 3 && <span> + {variations.length - 3} more</span>}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
              <button onClick={() => { setIsProductModalOpen(false); setUseVariations(false); setVariations([]); }} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg">Cancel</button>
              <button onClick={handleSaveProduct} className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800">
                {useVariations && variations.length > 0 ? `Create ${variations.length} Product${variations.length !== 1 ? 's' : ''}` : 'Save Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: STOCK ADJUSTMENT */}
      {isStockModalOpen && adjustingProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">Adjust Stock</h3>
              <button onClick={() => setIsStockModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-500 uppercase font-bold mb-1">Product</p>
                <p className="font-bold text-slate-900">{adjustingProduct.name}</p>
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-slate-500">Branch: <span className="font-bold text-slate-700">{currentBranch.name}</span></p>
                  <p className="text-xs text-slate-500">Current: <span className="font-bold text-slate-700">{adjustingProduct.branchStock[currentBranch.id] || 0}</span></p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Adjustment Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {['IN', 'OUT', 'ADJUSTMENT'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setAdjustmentType(type as any)}
                      className={`py-2 text-xs font-bold rounded-lg border ${adjustmentType === type
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                    >
                      {type === 'IN' ? 'Restock (+)' : type === 'OUT' ? 'Damage/Loss (-)' : 'Set Count (=)'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Quantity</label>
                <input
                  type="number"
                  min="0"
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                  value={adjustmentQty}
                  onChange={e => setAdjustmentQty(Number(e.target.value))}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Reason / Note</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly Supplier Delivery"
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                  value={adjustmentReason}
                  onChange={e => setAdjustmentReason(e.target.value)}
                />
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
              <button onClick={() => setIsStockModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg">Cancel</button>
              <button onClick={handleSubmitAdjustment} className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800">Confirm Adjustment</button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Delete Confirmation Popup */}
      {deleteConfirm && (
        <ConfirmDialog
          title="Delete Product"
          message={`Are you sure you want to delete "${deleteConfirm.name}"? This action cannot be undone.`}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
};

export default Inventory;
