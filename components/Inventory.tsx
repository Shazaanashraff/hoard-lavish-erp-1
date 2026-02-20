import React, { useState, useMemo } from 'react';
import { Plus, Edit2, AlertCircle, Trash2, Search, Filter, History, Box, Tag, ArrowUpRight, ArrowDownRight, Save, X, Building2, AlertTriangle, Palette, Ruler } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { Product } from '../types';

type InventoryTab = 'ALL' | 'LOW_STOCK' | 'ADJUSTMENTS' | 'CATEGORIES';

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
}

const Inventory: React.FC = () => {
  const {
    products, categories, brands, stockHistory, currentBranch,
    addProduct, updateProduct, deleteProduct, adjustStock,
    addCategory, removeCategory, addBrand, removeBrand,
    currentUser
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
    setIsProductModalOpen(true);
  };

  const handleOpenEdit = (product: Product) => {
    setEditingProduct({ ...product });
    setUseVariations(false);
    setVariations([]);
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
      quantity: 0
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
      const productData = {
        ...editingProduct,
        price: Number(editingProduct.price),
        costPrice: Number(editingProduct.costPrice),
        minStockLevel: Number(editingProduct.minStockLevel),
        branchStock: editingProduct.branchStock || {}
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
            </table>
            {filteredProducts.length === 0 && (
              <div className="p-8 text-center text-slate-400">No products found matching your criteria.</div>
            )}
          </div>
        )}

        {/* STOCK HISTORY TAB */}
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
                          log.type === 'OUT' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                        {log.type === 'IN' && <ArrowDownRight size={12} />}
                        {log.type === 'OUT' && <ArrowUpRight size={12} />}
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
                    <select
                      className="w-full p-2 border border-slate-200 rounded-lg outline-none bg-white"
                      value={editingProduct.color || ''}
                      onChange={e => setEditingProduct({ ...editingProduct, color: e.target.value })}
                    >
                      <option value="">No Color</option>
                      {AVAILABLE_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
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
                          <select
                            className="w-full p-2 border border-slate-200 rounded-lg outline-none bg-white"
                            value={editingProduct.color || ''}
                            onChange={e => setEditingProduct({ ...editingProduct, color: e.target.value })}
                          >
                            <option value="">No Color</option>
                            {AVAILABLE_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
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
                        <div className="grid grid-cols-12 gap-2 text-xs font-bold text-slate-400 uppercase px-1">
                          <span className="col-span-2">Color</span>
                          <span className="col-span-2">Size</span>
                          <span className="col-span-2">SKU</span>
                          <span className="col-span-2">Cost ({CUR})</span>
                          <span className="col-span-2">Price ({CUR})</span>
                          <span className="col-span-1">Qty</span>
                          <span className="col-span-1"></span>
                        </div>

                        {variations.map((v, idx) => (
                          <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <select
                              className="col-span-2 p-1.5 border border-slate-200 rounded text-xs bg-white"
                              value={v.color}
                              onChange={e => handleUpdateVariation(idx, 'color', e.target.value)}
                            >
                              {AVAILABLE_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
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
