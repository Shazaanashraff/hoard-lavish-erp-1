import React, { useState } from 'react';
import { Users, Plus, Phone, Mail, Edit2, Trash2, X, Search, ChevronLeft, ShoppingBag, Star, Calendar, AlertTriangle } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { Customer } from '../types';

const CUR = 'LKR';
const fmtCurrency = (n: number) => `${CUR} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// --- Delete Confirmation Popup ---
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

const Customers: React.FC = () => {
  const { customers, addCustomer, updateCustomer, deleteCustomer, salesHistory, currentUser } = useStore();
  const role = currentUser?.role;
  const isCashier = role === 'CASHIER';
  const canEditDelete = !isCashier;
  const [activeView, setActiveView] = useState<'LIST' | 'PROFILE'>('LIST');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  // Filtered List
  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Customer Profile Calculations
  const customerHistory = salesHistory.filter(s => s.customerId === selectedCustomer?.id);
  const lastVisit = customerHistory.length > 0
    ? new Date(customerHistory[0].date).toLocaleDateString()
    : 'Never';

  // Handlers
  const handleSaveCustomer = () => {
    if (editingCustomer.name && editingCustomer.phone) {
      if (editingCustomer.id) {
        updateCustomer(editingCustomer.id, editingCustomer);
      } else {
        addCustomer({
          ...editingCustomer,
          id: Math.random().toString(36).substr(2, 9),
          loyaltyPoints: 0,
          totalSpent: 0
        } as Customer);
      }
      setIsModalOpen(false);
      setEditingCustomer({});
    }
  };

  const handleDeleteRequest = (id: string, name: string) => {
    setDeleteConfirm({ id, name });
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirm) {
      deleteCustomer(deleteConfirm.id);
      if (selectedCustomer?.id === deleteConfirm.id) {
        setSelectedCustomer(null);
        setActiveView('LIST');
      }
      setDeleteConfirm(null);
    }
  };

  const openProfile = (customer: Customer) => {
    setSelectedCustomer(customer);
    setActiveView('PROFILE');
  };

  return (
    <div className="flex-1 bg-slate-50 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4">
            {activeView === 'PROFILE' && (
              <button
                onClick={() => { setActiveView('LIST'); setSelectedCustomer(null); }}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <ChevronLeft size={24} className="text-slate-500" />
              </button>
            )}
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {activeView === 'PROFILE' ? 'Customer Profile' : 'Customer Management'}
              </h1>
              <p className="text-sm text-slate-500">
                {activeView === 'PROFILE' ? 'View history and loyalty details.' : 'Manage customer database and loyalty program.'}
              </p>
            </div>
          </div>

          {activeView === 'LIST' && (
            <button
              onClick={() => { setEditingCustomer({}); setIsModalOpen(true); }}
              className="bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-800 transition-colors shadow-sm text-sm font-medium"
            >
              <Plus size={16} /> Add Customer
            </button>
          )}

          {activeView === 'PROFILE' && selectedCustomer && canEditDelete && (
            <div className="flex gap-2">
              <button
                onClick={() => { setEditingCustomer(selectedCustomer); setIsModalOpen(true); }}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg flex items-center gap-2 hover:bg-slate-50 transition-colors text-sm font-medium"
              >
                <Edit2 size={16} /> Edit
              </button>
              <button
                onClick={() => handleDeleteRequest(selectedCustomer.id, selectedCustomer.name)}
                className="px-4 py-2 border border-red-100 text-red-600 bg-red-50 rounded-lg flex items-center gap-2 hover:bg-red-100 transition-colors text-sm font-medium"
              >
                <Trash2 size={16} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* VIEW: LIST */}
        {activeView === 'LIST' && (
          <>
            <div className="relative max-w-md mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search customers by name, phone, or email..."
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                  <tr>
                    <th className="p-4">Customer Name</th>
                    <th className="p-4">Contact Info</th>
                    <th className="p-4 text-center">Loyalty Points</th>
                    <th className="p-4 text-right">Total Spent</th>
                    <th className="p-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCustomers.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50 group cursor-pointer" onClick={() => openProfile(c)}>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold">
                            {c.name.charAt(0)}
                          </div>
                          <span className="font-bold text-slate-900">{c.name}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          <span className="flex items-center gap-2 text-slate-600"><Phone size={12} /> {c.phone}</span>
                          <span className="flex items-center gap-2 text-slate-500 text-xs"><Mail size={12} /> {c.email}</span>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs">
                          <Star size={12} /> {c.loyaltyPoints}
                        </span>
                      </td>
                      <td className="p-4 text-right font-medium text-slate-900">{fmtCurrency(c.totalSpent)}</td>
                      <td className="p-4 text-right">
                        <button className="text-slate-400 hover:text-slate-900 font-medium text-xs border border-slate-200 px-3 py-1 rounded-md hover:bg-slate-100">
                          View Profile
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredCustomers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400">No customers found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* VIEW: PROFILE */}
        {activeView === 'PROFILE' && selectedCustomer && (
          <div className="max-w-5xl mx-auto">
            {/* Top Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-2xl font-bold">
                  {selectedCustomer.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{selectedCustomer.name}</h2>
                  <div className="flex flex-col text-sm text-slate-500 mt-1">
                    <span className="flex items-center gap-1"><Phone size={12} /> {selectedCustomer.phone}</span>
                    <span className="flex items-center gap-1"><Mail size={12} /> {selectedCustomer.email}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-sm text-slate-500 font-medium mb-1">Lifetime Value</p>
                <h3 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
                  {fmtCurrency(selectedCustomer.totalSpent)}
                </h3>
                <div className="mt-2 text-xs text-green-600 bg-green-50 inline-block px-2 py-0.5 rounded-full font-bold">
                  VIP Customer
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-slate-500 font-medium mb-1">Loyalty Points</p>
                    <h3 className="text-3xl font-bold text-indigo-600">{selectedCustomer.loyaltyPoints}</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Last Visit</p>
                    <p className="font-medium text-slate-700">{lastVisit}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Purchase History */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <ShoppingBag size={20} className="text-slate-400" /> Purchase History
                </h3>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                  <tr>
                    <th className="p-4">Date</th>
                    <th className="p-4">Invoice #</th>
                    <th className="p-4">Items</th>
                    <th className="p-4">Branch</th>
                    <th className="p-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerHistory.map(sale => (
                    <tr key={sale.id} className="hover:bg-slate-50">
                      <td className="p-4 text-slate-500">{new Date(sale.date).toLocaleDateString()}</td>
                      <td className="p-4 font-mono text-slate-600">{sale.invoiceNumber}</td>
                      <td className="p-4 text-slate-800 font-medium">
                        {sale.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                      </td>
                      <td className="p-4 text-slate-600 text-xs">{sale.branchName}</td>
                      <td className="p-4 text-right font-bold text-slate-900">{fmtCurrency(sale.totalAmount)}</td>
                    </tr>
                  ))}
                  {customerHistory.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400">No purchase history available.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* Modal: Add/Edit Customer */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl p-6">
            <h3 className="font-bold text-lg text-slate-800 mb-4">{editingCustomer.id ? 'Edit Customer' : 'New Customer'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. John Perera"
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                  value={editingCustomer.name || ''}
                  onChange={e => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. 077 123 4567"
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                  value={editingCustomer.phone || ''}
                  onChange={e => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="(optional)"
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                  value={editingCustomer.email || ''}
                  onChange={e => setEditingCustomer({ ...editingCustomer, email: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleSaveCustomer} className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800">Save Customer</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Popup */}
      {deleteConfirm && (
        <ConfirmDialog
          title="Delete Customer"
          message={`Are you sure you want to delete "${deleteConfirm.name}"? This action cannot be undone.`}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
};

export default Customers;
