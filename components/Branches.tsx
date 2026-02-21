import React, { useState } from 'react';
import { Store, Plus, MapPin, Phone, Edit2, BarChart2, Package } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { Branch } from '../types';

const CUR = 'LKR';
const fmtCurrency = (n: number) => `${CUR} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Branches: React.FC = () => {
  const { branches, addBranch, updateBranch, products, salesHistory } = useStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Partial<Branch>>({});

  const handleSave = () => {
    if (editingBranch.name && editingBranch.address) {
      if (editingBranch.id) {
        updateBranch(editingBranch.id, editingBranch);
      } else {
        addBranch({
          ...editingBranch,
          id: Math.random().toString(36).substr(2, 9),
        } as Branch);
      }
      setIsModalOpen(false);
      setEditingBranch({});
    }
  };

  const getBranchStats = (branchId: string) => {
    const totalStock = products.reduce((sum, p) => sum + (p.branchStock[branchId] || 0), 0);
    const stockValue = products.reduce((sum, p) => sum + ((p.branchStock[branchId] || 0) * p.price), 0);
    const totalSales = salesHistory
      .filter(s => s.branchId === branchId)
      .reduce((sum, s) => sum + s.totalAmount, 0);
    
    return { totalStock, stockValue, totalSales };
  };

  return (
    <div className="flex-1 bg-slate-50 p-8 overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Branch Management</h2>
          <p className="text-slate-500">Manage store locations and view performance.</p>
        </div>
        {/* Add Branch removed per business requirement */}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {branches.map(branch => {
          const stats = getBranchStats(branch.id);
          return (
            <div key={branch.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-6 border-b border-slate-50">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
                    <Store size={24} />
                  </div>
                  <button 
                    onClick={() => { setEditingBranch(branch); setIsModalOpen(true); }}
                    className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-full transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">{branch.name}</h3>
                <div className="space-y-2 text-sm text-slate-500">
                  <div className="flex items-center gap-2">
                    <MapPin size={14} /> {branch.address}
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone size={14} /> {branch.phone}
                  </div>
                </div>
              </div>
              <div className="bg-slate-50 p-6 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-400 uppercase font-bold mb-1">Total Stock</p>
                  <p className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Package size={16} className="text-slate-400" />
                    {stats.totalStock}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-bold mb-1">Stock Value</p>
                  <p className="text-lg font-bold text-slate-800">{fmtCurrency(stats.stockValue)}</p>
                </div>
                <div className="col-span-2 pt-4 border-t border-slate-200">
                  <p className="text-xs text-slate-400 uppercase font-bold mb-1">Total Revenue</p>
                  <p className="text-xl font-bold text-emerald-600 flex items-center gap-2">
                    <BarChart2 size={18} />
                    {fmtCurrency(stats.totalSales)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl p-6">
            <h3 className="font-bold text-lg text-slate-800 mb-4">{editingBranch.id ? 'Edit Branch' : 'New Branch'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Branch Name</label>
                <input 
                  type="text" 
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                  value={editingBranch.name || ''}
                  onChange={e => setEditingBranch({...editingBranch, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                <input 
                  type="text" 
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                  value={editingBranch.address || ''}
                  onChange={e => setEditingBranch({...editingBranch, address: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                <input 
                  type="text" 
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                  value={editingBranch.phone || ''}
                  onChange={e => setEditingBranch({...editingBranch, phone: e.target.value})}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleSave} className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Branches;
