import React, { useState } from 'react';
import { Truck, Plus, Phone, Mail, MapPin, Edit2, Trash2, X, Calendar, FileText, Search, Package, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { Supplier, SupplierTransaction, DamagedGood } from '../types';

const CUR = 'LKR';
const fmtCurrency = (n: number) => `${CUR} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Inventory line item for supplier purchases
interface InventoryLineItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

// --- Delete Confirmation ---
const ConfirmDialog: React.FC<{
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ title, message, onConfirm, onCancel }) => (
  <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onCancel}>
    <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="p-4 flex items-center gap-3 bg-red-50">
        <div className="p-2 rounded-full bg-red-100 text-red-600"><AlertTriangle size={20} /></div>
        <div className="flex-1">
          <h4 className="font-bold text-sm text-red-800">{title}</h4>
          <p className="text-sm text-slate-600 mt-0.5">{message}</p>
        </div>
      </div>
      <div className="p-3 flex justify-end gap-2 bg-white border-t border-slate-100">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
        <button onClick={onConfirm} className="px-5 py-2 rounded-lg text-white text-sm font-medium bg-red-500 hover:bg-red-600 transition-colors">Delete</button>
      </div>
    </div>
  </div>
);

type SupplierTab = 'LIST' | 'EXPENSE' | 'HISTORY' | 'DAMAGED';

const Suppliers: React.FC = () => {
  const { suppliers, products, addSupplier, updateSupplier, deleteSupplier, supplierTransactions, addSupplierTransaction, damagedGoods, addDamagedGood, deleteDamagedGood, currentUser } = useStore();
  const isAdmin = currentUser?.role === 'ADMIN';
  const [activeTab, setActiveTab] = useState<SupplierTab>('LIST');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State for Add/Edit Supplier
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Partial<Supplier>>({});

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  // 1. Inventory line items for the expense form
  const [inventoryItems, setInventoryItems] = useState<InventoryLineItem[]>([]);

  // Form State for Expenses
  const [expenseForm, setExpenseForm] = useState({
    supplierId: '',
    amount: '',
    reference: '',
    notes: '',
    date: new Date().toISOString().split('T')[0]
  });

  // Damaged Goods form state
  const [damagedForm, setDamagedForm] = useState({
    productId: '',
    supplierId: '',
    quantity: 1,
    unitPrice: 0,
    reason: '',
    date: new Date().toISOString().split('T')[0]
  });

  // Derived State
  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.contactPerson.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredTransactions = supplierTransactions.filter(t =>
    t.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.reference.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handlers
  const handleSaveSupplier = () => {
    if (editingSupplier.name && editingSupplier.contactPerson) {
      if (editingSupplier.id) {
        updateSupplier(editingSupplier.id, editingSupplier);
      } else {
        addSupplier({
          ...editingSupplier,
          id: Math.random().toString(36).substr(2, 9),
        } as Supplier);
      }
      setIsModalOpen(false);
      setEditingSupplier({});
    }
  };

  const handleDeleteRequest = (id: string, name: string) => {
    setDeleteConfirm({ id, name });
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirm) {
      deleteSupplier(deleteConfirm.id);
      setDeleteConfirm(null);
    }
  };

  // 1. Inventory line item helpers
  const handleAddInventoryItem = () => {
    setInventoryItems(prev => [...prev, { productId: '', productName: '', quantity: 1, unitPrice: 0 }]);
  };

  const handleUpdateInventoryItem = (idx: number, field: keyof InventoryLineItem, value: string | number) => {
    setInventoryItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      if (field === 'productId') {
        const prod = products.find(p => p.id === value);
        return { ...item, productId: value as string, productName: prod?.name || '', unitPrice: prod?.costPrice || 0 };
      }
      return { ...item, [field]: value };
    }));
  };

  const handleRemoveInventoryItem = (idx: number) => {
    setInventoryItems(prev => prev.filter((_, i) => i !== idx));
  };

  const inventoryTotal = inventoryItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

  const handleSubmitExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const supplier = suppliers.find(s => s.id === expenseForm.supplierId);
    if (supplier && expenseForm.amount) {
      // Build notes with inventory items if any
      let notesWithInventory = expenseForm.notes;
      if (inventoryItems.length > 0) {
        const itemLines = inventoryItems.filter(i => i.productName).map(i =>
          `${i.quantity}x ${i.productName} @ ${fmtCurrency(i.unitPrice)} = ${fmtCurrency(i.quantity * i.unitPrice)}`
        ).join(' | ');
        notesWithInventory = notesWithInventory ? `${notesWithInventory} — Items: ${itemLines}` : `Items: ${itemLines}`;
      }

      addSupplierTransaction({
        id: Math.random().toString(36).substr(2, 9),
        supplierId: supplier.id,
        supplierName: supplier.name,
        amount: Number(expenseForm.amount),
        date: new Date(expenseForm.date).toISOString(),
        type: 'PAYMENT',
        reference: expenseForm.reference,
        notes: notesWithInventory
      });
      setExpenseForm({
        supplierId: '',
        amount: '',
        reference: '',
        notes: '',
        date: new Date().toISOString().split('T')[0]
      });
      setInventoryItems([]);
      setActiveTab('HISTORY');
    }
  };

  // 2. Damaged goods handler
  const handleSubmitDamaged = (e: React.FormEvent) => {
    e.preventDefault();
    const product = products.find(p => p.id === damagedForm.productId);
    const supplier = suppliers.find(s => s.id === damagedForm.supplierId);
    if (product && supplier && damagedForm.quantity > 0) {
      const record: DamagedGood = {
        id: Math.random().toString(36).substr(2, 9),
        productId: product.id,
        productName: product.name,
        supplierId: supplier.id,
        supplierName: supplier.name,
        quantity: damagedForm.quantity,
        unitPrice: damagedForm.unitPrice,
        totalLoss: damagedForm.quantity * damagedForm.unitPrice,
        reason: damagedForm.reason || 'Damaged on arrival',
        date: new Date(damagedForm.date).toISOString()
      };
      addDamagedGood(record);
      setDamagedForm({
        productId: '',
        supplierId: '',
        quantity: 1,
        unitPrice: 0,
        reason: '',
        date: new Date().toISOString().split('T')[0]
      });
    }
  };

  const handleDeleteDamaged = (id: string) => {
    deleteDamagedGood(id);
  };

  // Tab button component
  const TabBtn = ({ id, label }: { id: SupplierTab; label: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`px-4 py-2 border-b-2 font-medium text-sm transition-colors ${activeTab === id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex-1 bg-slate-50 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Supplier Management</h1>
            <p className="text-sm text-slate-500">Manage vendor profiles, purchase expenses, and damaged goods.</p>
          </div>
          {isAdmin && (
          <button
            onClick={() => { setEditingSupplier({}); setIsModalOpen(true); }}
            className="bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-800 transition-colors shadow-sm text-sm font-medium"
          >
            <Plus size={16} /> Add Supplier
          </button>
          )}
        </div>

        <div className="flex gap-4">
          <TabBtn id="LIST" label="Suppliers List" />
          <TabBtn id="EXPENSE" label="Record Expense" />
          <TabBtn id="HISTORY" label="Expense History" />
          <TabBtn id="DAMAGED" label="Damaged Goods" />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* VIEW: LIST */}
        {activeTab === 'LIST' && (
          <>
            <div className="relative max-w-md mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search suppliers..."
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSuppliers.map(supplier => (
                <div key={supplier.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                      <Truck size={20} />
                    </div>
                    <div className="flex gap-1">
                      {isAdmin && (
                      <>
                      <button
                        onClick={() => { setEditingSupplier(supplier); setIsModalOpen(true); }}
                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteRequest(supplier.id, supplier.name)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 size={16} />
                      </button>
                      </>
                      )}
                    </div>
                  </div>

                  <h3 className="font-bold text-slate-900 text-lg mb-1">{supplier.name}</h3>
                  <p className="text-sm text-slate-500 mb-4">{supplier.contactPerson}</p>

                  <div className="space-y-2 text-sm text-slate-600">
                    <div className="flex items-center gap-2"><Phone size={14} className="text-slate-400" /> {supplier.phone}</div>
                    <div className="flex items-center gap-2"><Mail size={14} className="text-slate-400" /> {supplier.email}</div>
                    <div className="flex items-center gap-2"><MapPin size={14} className="text-slate-400" /> {supplier.address}</div>
                  </div>
                </div>
              ))}
              {filteredSuppliers.length === 0 && (
                <div className="col-span-full text-center py-12 text-slate-400">
                  No suppliers found. Add one to get started.
                </div>
              )}
            </div>
          </>
        )}

        {/* VIEW: EXPENSE ENTRY — 1. with inventory items section */}
        {activeTab === 'EXPENSE' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50">
                <h3 className="font-bold text-lg text-slate-800">Record Supplier Payment</h3>
                <p className="text-slate-500 text-sm">Log payments for stock purchases or services.</p>
              </div>
              <form onSubmit={handleSubmitExpense} className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Select Supplier</label>
                    <select
                      required
                      className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                      value={expenseForm.supplierId}
                      onChange={e => setExpenseForm({ ...expenseForm, supplierId: e.target.value })}
                    >
                      <option value="">-- Choose Supplier --</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Amount ({CUR})</label>
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0.00"
                      className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                      value={expenseForm.amount}
                      onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                    <input
                      required
                      type="date"
                      className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                      value={expenseForm.date}
                      onChange={e => setExpenseForm({ ...expenseForm, date: e.target.value })}
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Reference (Invoice #)</label>
                    <input
                      type="text"
                      className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                      placeholder="e.g. INV-2024-001"
                      value={expenseForm.reference}
                      onChange={e => setExpenseForm({ ...expenseForm, reference: e.target.value })}
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                    <textarea
                      className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900 h-20 resize-none"
                      placeholder="Additional details..."
                      value={expenseForm.notes}
                      onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                    />
                  </div>
                </div>

                {/* 1. Inventory Items Section (Optional) */}
                <div className="border-t border-slate-200 pt-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <Package size={14} className="text-indigo-500" />
                        Stock Being Purchased
                        <span className="text-xs text-slate-400 font-normal">(optional)</span>
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddInventoryItem}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                    >
                      <Plus size={12} /> Add Item
                    </button>
                  </div>

                  {inventoryItems.length > 0 && (
                    <div className="space-y-2">
                      {/* Header */}
                      <div className="grid grid-cols-12 gap-2 text-xs font-bold text-slate-400 uppercase px-1">
                        <span className="col-span-5">Product</span>
                        <span className="col-span-2">Qty</span>
                        <span className="col-span-2">Unit Price</span>
                        <span className="col-span-2">Line Total</span>
                        <span className="col-span-1"></span>
                      </div>

                      {inventoryItems.map((item, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                          <select
                            className="col-span-5 p-1.5 border border-slate-200 rounded text-xs bg-white"
                            value={item.productId}
                            onChange={e => handleUpdateInventoryItem(idx, 'productId', e.target.value)}
                          >
                            <option value="">-- Select Product --</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                          </select>
                          <input
                            type="number"
                            min="1"
                            className="col-span-2 p-1.5 border border-slate-200 rounded text-xs"
                            value={item.quantity}
                            onChange={e => handleUpdateInventoryItem(idx, 'quantity', Number(e.target.value))}
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="col-span-2 p-1.5 border border-slate-200 rounded text-xs"
                            value={item.unitPrice}
                            onChange={e => handleUpdateInventoryItem(idx, 'unitPrice', Number(e.target.value))}
                          />
                          <span className="col-span-2 text-xs font-bold text-slate-700 text-right">
                            {fmtCurrency(item.quantity * item.unitPrice)}
                          </span>
                          <div className="col-span-1 flex justify-center">
                            <button type="button" onClick={() => handleRemoveInventoryItem(idx)} className="p-1 text-red-400 hover:text-red-600 rounded">
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ))}

                      <div className="flex justify-end pt-2 pr-8">
                        <span className="text-sm font-bold text-slate-700">
                          Inventory Total: <span className="text-indigo-600">{fmtCurrency(inventoryTotal)}</span>
                        </span>
                      </div>
                    </div>
                  )}

                  {inventoryItems.length === 0 && (
                    <button
                      type="button"
                      onClick={handleAddInventoryItem}
                      className="w-full py-3 border-2 border-dashed border-slate-200 rounded-lg text-sm text-slate-400 hover:border-slate-300 hover:text-slate-500 transition-colors flex items-center justify-center gap-2"
                    >
                      <Package size={14} /> Click to add stock items being purchased
                    </button>
                  )}
                </div>

                <div className="flex justify-end pt-4">
                  <button type="submit" className="bg-slate-900 text-white px-8 py-2.5 rounded-lg font-medium hover:bg-slate-800 transition-colors shadow-lg">
                    Record Payment
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* VIEW: EXPENSE HISTORY */}
        {activeTab === 'HISTORY' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">Transaction History</h3>
              <div className="relative max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Search transactions..."
                  className="w-full pl-9 pr-4 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                <tr>
                  <th className="p-4">Date</th>
                  <th className="p-4">Supplier</th>
                  <th className="p-4">Reference</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="p-4 text-slate-500">{new Date(t.date).toLocaleDateString()}</td>
                    <td className="p-4 font-medium text-slate-900">{t.supplierName}</td>
                    <td className="p-4 text-slate-600 font-mono">{t.reference || '-'}</td>
                    <td className="p-4 font-bold text-slate-900">{fmtCurrency(t.amount)}</td>
                    <td className="p-4 text-slate-500 max-w-xs truncate">{t.notes}</td>
                  </tr>
                ))}
                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">No transactions found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 2. VIEW: DAMAGED GOODS TAB */}
        {activeTab === 'DAMAGED' && (
          <div className="space-y-6">
            {/* Record New Damaged Goods */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden max-w-2xl mx-auto">
              <div className="p-5 border-b border-slate-100 bg-red-50 flex items-center gap-3">
                <div className="p-2 rounded-full bg-red-100 text-red-600"><ShieldAlert size={18} /></div>
                <div>
                  <h3 className="font-bold text-slate-800">Record Damaged Goods</h3>
                  <p className="text-slate-500 text-xs">Log stock that arrived damaged or was found defective.</p>
                </div>
              </div>
              <form onSubmit={handleSubmitDamaged} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Select Product</label>
                    <select
                      required
                      className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900 bg-white text-sm"
                      value={damagedForm.productId}
                      onChange={e => {
                        const p = products.find(pr => pr.id === e.target.value);
                        setDamagedForm({ ...damagedForm, productId: e.target.value, unitPrice: p?.costPrice || 0 });
                      }}
                    >
                      <option value="">-- Choose Product --</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Related Supplier</label>
                    <select
                      required
                      className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900 bg-white text-sm"
                      value={damagedForm.supplierId}
                      onChange={e => setDamagedForm({ ...damagedForm, supplierId: e.target.value })}
                    >
                      <option value="">-- Choose Supplier --</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Quantity</label>
                    <input
                      required
                      type="number"
                      min="1"
                      className="w-full p-2 border border-slate-200 rounded-lg outline-none text-sm"
                      value={damagedForm.quantity}
                      onChange={e => setDamagedForm({ ...damagedForm, quantity: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Unit Price ({CUR})</label>
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full p-2 border border-slate-200 rounded-lg outline-none text-sm"
                      value={damagedForm.unitPrice}
                      onChange={e => setDamagedForm({ ...damagedForm, unitPrice: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date</label>
                    <input
                      required
                      type="date"
                      className="w-full p-2 border border-slate-200 rounded-lg outline-none text-sm"
                      value={damagedForm.date}
                      onChange={e => setDamagedForm({ ...damagedForm, date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Total Loss</label>
                    <div className="w-full p-2 border border-slate-200 rounded-lg bg-red-50 text-red-700 font-bold text-sm">
                      {fmtCurrency(damagedForm.quantity * damagedForm.unitPrice)}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Reason / Description</label>
                    <input
                      type="text"
                      placeholder="e.g. Arrived with torn packaging, water damage"
                      className="w-full p-2 border border-slate-200 rounded-lg outline-none text-sm"
                      value={damagedForm.reason}
                      onChange={e => setDamagedForm({ ...damagedForm, reason: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button type="submit" className="bg-red-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors text-sm">
                    Record Damaged Item
                  </button>
                </div>
              </form>
            </div>

            {/* Damaged Goods History */}
            {damagedGoods.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <ShieldAlert size={16} className="text-red-500" /> Damaged Goods Records
                    <span className="text-xs text-slate-400 font-normal ml-2">({damagedGoods.length} records)</span>
                  </h3>
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                    <tr>
                      <th className="p-4">Date</th>
                      <th className="p-4">Product</th>
                      <th className="p-4">Supplier</th>
                      <th className="p-4 text-center">Qty</th>
                      <th className="p-4 text-right">Unit Price</th>
                      <th className="p-4 text-right">Total Loss</th>
                      <th className="p-4">Reason</th>
                      <th className="p-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {damagedGoods.map(d => (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <td className="p-4 text-slate-500 whitespace-nowrap">{new Date(d.date).toLocaleDateString()}</td>
                        <td className="p-4 font-medium text-slate-900">{d.productName}</td>
                        <td className="p-4 text-slate-600">{d.supplierName}</td>
                        <td className="p-4 text-center font-mono">{d.quantity}</td>
                        <td className="p-4 text-right text-slate-600">{fmtCurrency(d.unitPrice)}</td>
                        <td className="p-4 text-right font-bold text-red-600">{fmtCurrency(d.totalLoss)}</td>
                        <td className="p-4 text-slate-500 max-w-xs truncate">{d.reason}</td>
                        <td className="p-4 text-center">
                          <button onClick={() => handleDeleteDamaged(d.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="p-4 bg-red-50 border-t border-red-100 flex justify-end">
                  <span className="text-sm font-bold text-red-700">
                    Total Losses: {fmtCurrency(damagedGoods.reduce((s, d) => s + d.totalLoss, 0))}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Add/Edit Supplier */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <h3 className="font-bold text-lg text-slate-800">{editingSupplier.id ? 'Edit Supplier' : 'New Supplier'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Company Name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. Lanka Textiles Pvt Ltd"
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                  value={editingSupplier.name || ''}
                  onChange={e => setEditingSupplier({ ...editingSupplier, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. Amal Fernando"
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                  value={editingSupplier.contactPerson || ''}
                  onChange={e => setEditingSupplier({ ...editingSupplier, contactPerson: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    placeholder="e.g. 011 234 5678"
                    className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                    value={editingSupplier.phone || ''}
                    onChange={e => setEditingSupplier({ ...editingSupplier, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="(optional)"
                    className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                    value={editingSupplier.email || ''}
                    onChange={e => setEditingSupplier({ ...editingSupplier, email: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                <input
                  type="text"
                  placeholder="e.g. No. 45, Galle Road, Colombo 03"
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                  value={editingSupplier.address || ''}
                  onChange={e => setEditingSupplier({ ...editingSupplier, address: e.target.value })}
                />
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
              <button onClick={handleSaveSupplier} className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 font-medium shadow-md">Save Supplier</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <ConfirmDialog
          title="Delete Supplier"
          message={`Are you sure you want to delete "${deleteConfirm.name}"? This action cannot be undone.`}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
};

export default Suppliers;
