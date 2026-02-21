import React, { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from 'recharts';
import { DollarSign, TrendingUp, TrendingDown, Plus, Filter, Trash2, Calendar, FileText, Building2, AlertTriangle } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { EXPENSE_CATEGORIES } from '../constants';
import { Expense } from '../types';

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

const Accounting: React.FC = () => {
  const { salesHistory, expenses, supplierTransactions, currentBranch, branches, addExpense, deleteExpense } = useStore();
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'EXPENSES'>('DASHBOARD');
  const [filterPeriod, setFilterPeriod] = useState<'ALL' | 'MONTH'>('ALL');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; desc: string } | null>(null);
  
  // Add Expense Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newExpense, setNewExpense] = useState<Partial<Expense>>({
    date: new Date().toISOString().split('T')[0],
    branchId: currentBranch.id,
    category: EXPENSE_CATEGORIES[0]
  });

  // --- Calculations ---

  const isInPeriod = (dateStr: string) => {
    if (filterPeriod === 'ALL') return true;
    const d = new Date(dateStr);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };

  const matchesBranch = (branchId: string) => branchFilter === 'ALL' || branchId === branchFilter;

  // 1. Income (Sales)
  const filteredSales = salesHistory.filter(s => isInPeriod(s.date) && matchesBranch(s.branchId));
  const totalIncome = filteredSales.reduce((sum, s) => sum + s.totalAmount, 0);

  // 2. Expenses (Operating Expenses)
  const filteredExpenses = expenses.filter(e => isInPeriod(e.date) && matchesBranch(e.branchId));
  const totalOperatingExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  // 3. COGS / Inventory Costs (Supplier Payments)
  const filteredSupplierTx = supplierTransactions.filter(t => t.type === 'PAYMENT' && isInPeriod(t.date));
  const totalSupplierPayments = filteredSupplierTx.reduce((sum, t) => sum + t.amount, 0);

  // Totals
  const totalExpenses = totalOperatingExpenses + totalSupplierPayments;
  const netProfit = totalIncome - totalExpenses;

  // Chart Data: Income vs Expense (Daily for current view context)
  const chartData = useMemo(() => {
    const dataMap = new Map<string, { date: string, income: number, expense: number }>();
    
    // Helper to aggregate
    const addToMap = (dateStr: string, type: 'income' | 'expense', amount: number) => {
      const key = new Date(dateStr).toLocaleDateString();
      if (!dataMap.has(key)) dataMap.set(key, { date: key, income: 0, expense: 0 });
      const entry = dataMap.get(key)!;
      if (type === 'income') entry.income += amount;
      else entry.expense += amount;
    };

    filteredSales.forEach(s => addToMap(s.date, 'income', s.totalAmount));
    filteredExpenses.forEach(e => addToMap(e.date, 'expense', e.amount));
    filteredSupplierTx.forEach(t => addToMap(t.date, 'expense', t.amount));

    return Array.from(dataMap.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filteredSales, filteredExpenses, filteredSupplierTx]);

  // Pie Chart Data: Expense Breakdown
  const expenseBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    // Operating
    filteredExpenses.forEach(e => {
      map.set(e.category, (map.get(e.category) || 0) + e.amount);
    });
    // Supplier
    if (totalSupplierPayments > 0) {
      map.set('Inventory/Stock', totalSupplierPayments);
    }
    
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filteredExpenses, totalSupplierPayments]);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

  // Handlers
  const handleSaveExpense = () => {
    if (newExpense.amount && newExpense.description) {
      const branch = branches.find(b => b.id === newExpense.branchId);
      addExpense({
        ...newExpense,
        id: Math.random().toString(36).substr(2, 9),
        amount: Number(newExpense.amount),
        branchName: branch?.name || 'Unknown',
        date: new Date(newExpense.date!).toISOString()
      } as Expense);
      setIsModalOpen(false);
      setNewExpense({
        date: new Date().toISOString().split('T')[0],
        branchId: currentBranch.id,
        category: EXPENSE_CATEGORIES[0],
        description: '',
        amount: 0
      });
    }
  };

  // --- Combined Ledger ---
  const ledger = useMemo(() => {
    const all = [
      ...filteredSales.map(s => ({ 
        id: s.id, date: s.date, desc: `Sale #${s.invoiceNumber}`, amount: s.totalAmount, type: 'IN', category: 'Sales' 
      })),
      ...filteredExpenses.map(e => ({ 
        id: e.id, date: e.date, desc: e.description, amount: e.amount, type: 'OUT', category: e.category 
      })),
      ...filteredSupplierTx.map(t => ({ 
        id: t.id, date: t.date, desc: `Supplier Payment: ${t.supplierName}`, amount: t.amount, type: 'OUT', category: 'Inventory' 
      }))
    ];
    return all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredSales, filteredExpenses, filteredSupplierTx]);


  return (
    <div className="flex-1 bg-slate-50 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Accounting & Finance</h1>
            <p className="text-sm text-slate-500">Track expenses, income, and business profitability.</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-800 transition-colors shadow-sm text-sm font-medium"
            >
              <Plus size={16} /> Record Expense
            </button>
          </div>
        </div>

        <div className="flex justify-between items-center">
           <div className="flex gap-4">
            <button 
              onClick={() => setActiveTab('DASHBOARD')}
              className={`px-4 py-2 border-b-2 font-medium text-sm transition-colors ${activeTab === 'DASHBOARD' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              Financial Overview
            </button>
            <button 
              onClick={() => setActiveTab('EXPENSES')}
              className={`px-4 py-2 border-b-2 font-medium text-sm transition-colors ${activeTab === 'EXPENSES' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              Expense Management
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Building2 size={14} className="text-slate-400" />
              <select
                className="text-xs font-medium bg-slate-100 border-0 rounded-lg px-3 py-1.5 text-slate-700 outline-none cursor-pointer"
                value={branchFilter}
                onChange={e => setBranchFilter(e.target.value)}
              >
                <option value="ALL">All Branches</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="flex bg-slate-100 rounded-lg p-1">
               <button 
                 onClick={() => setFilterPeriod('ALL')}
                 className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${filterPeriod === 'ALL' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
               >
                 All Time
               </button>
               <button 
                 onClick={() => setFilterPeriod('MONTH')}
                 className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${filterPeriod === 'MONTH' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
               >
                 This Month
               </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'DASHBOARD' && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Total Income</p>
                    <h3 className="text-2xl font-bold text-emerald-600 mt-1">{fmtCurrency(totalIncome)}</h3>
                  </div>
                  <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600"><TrendingUp size={20} /></div>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Total Expenses</p>
                    <h3 className="text-2xl font-bold text-rose-600 mt-1">{fmtCurrency(totalExpenses)}</h3>
                    <p className="text-xs text-slate-400 mt-1">Ops: {fmtCurrency(totalOperatingExpenses)} | Stock: {fmtCurrency(totalSupplierPayments)}</p>
                  </div>
                  <div className="p-2 bg-rose-50 rounded-lg text-rose-600"><TrendingDown size={20} /></div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Net Profit</p>
                    <h3 className={`text-2xl font-bold mt-1 ${netProfit >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                      {fmtCurrency(netProfit)}
                    </h3>
                  </div>
                  <div className="p-2 bg-amber-50 rounded-lg text-amber-600"><DollarSign size={20} /></div>
                </div>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
               {/* Income vs Expense Area Chart */}
               <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-80">
                 <h3 className="font-bold text-slate-800 mb-4">Cash Flow</h3>
                 <ResponsiveContainer width="100%" height="100%">
                   <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                     <defs>
                       <linearGradient id="colorInc" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                         <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                       </linearGradient>
                       <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.1}/>
                         <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                       </linearGradient>
                     </defs>
                     <XAxis dataKey="date" fontSize={12} stroke="#94a3b8" />
                     <YAxis fontSize={12} stroke="#94a3b8" />
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                     <Tooltip />
                     <Area type="monotone" dataKey="income" stroke="#10b981" fillOpacity={1} fill="url(#colorInc)" name="Income" />
                     <Area type="monotone" dataKey="expense" stroke="#f43f5e" fillOpacity={1} fill="url(#colorExp)" name="Expense" />
                   </AreaChart>
                 </ResponsiveContainer>
               </div>

               {/* Expense Breakdown Pie Chart */}
               <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-80 flex flex-col">
                 <h3 className="font-bold text-slate-800 mb-4">Expense Distribution</h3>
                 <div className="flex-1 flex items-center justify-center">
                   {expenseBreakdown.length > 0 ? (
                     <ResponsiveContainer width="100%" height="100%">
                       <PieChart>
                         <Pie
                           data={expenseBreakdown}
                           cx="50%"
                           cy="50%"
                           innerRadius={60}
                           outerRadius={80}
                           paddingAngle={5}
                           dataKey="value"
                         >
                           {expenseBreakdown.map((entry, index) => (
                             <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                           ))}
                         </Pie>
                         <Tooltip formatter={(value) => fmtCurrency(Number(value))} />
                         <Legend />
                       </PieChart>
                     </ResponsiveContainer>
                   ) : (
                     <p className="text-slate-400 text-sm">No expense data for this period.</p>
                   )}
                 </div>
               </div>
            </div>

            {/* General Ledger (Recent Transactions) */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
               <div className="p-6 border-b border-slate-100">
                 <h3 className="font-bold text-slate-800">Unified Ledger</h3>
                 <p className="text-xs text-slate-400">Combined view of all financial transactions</p>
               </div>
               <table className="w-full text-left text-sm">
                 <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                   <tr>
                     <th className="p-4">Date</th>
                     <th className="p-4">Description</th>
                     <th className="p-4">Category</th>
                     <th className="p-4 text-right">Amount</th>
                     <th className="p-4 text-center">Type</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {ledger.slice(0, 10).map((item, idx) => (
                     <tr key={idx} className="hover:bg-slate-50">
                       <td className="p-4 text-slate-500 whitespace-nowrap">{new Date(item.date).toLocaleDateString()}</td>
                       <td className="p-4 font-medium text-slate-900">{item.desc}</td>
                       <td className="p-4 text-slate-600">{item.category}</td>
                       <td className={`p-4 text-right font-bold ${item.type === 'IN' ? 'text-emerald-600' : 'text-rose-600'}`}>
                         {item.type === 'OUT' ? '-' : ''}{fmtCurrency(item.amount)}
                       </td>
                       <td className="p-4 text-center">
                         <span className={`px-2 py-1 rounded-full text-xs font-bold ${item.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                           {item.type}
                         </span>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
            </div>
          </div>
        )}

        {activeTab === 'EXPENSES' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
             <div className="p-6 border-b border-slate-100 flex justify-between items-center">
               <h3 className="font-bold text-slate-800">Operating Expenses</h3>
               <span className="text-xs text-slate-400">{filteredExpenses.length} records found</span>
             </div>
             <table className="w-full text-left text-sm">
               <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                 <tr>
                   <th className="p-4">Date</th>
                   <th className="p-4">Description</th>
                   <th className="p-4">Category</th>
                   <th className="p-4">Branch</th>
                   <th className="p-4 text-right">Amount</th>
                   <th className="p-4 text-right">Action</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                 {filteredExpenses.map(e => (
                   <tr key={e.id} className="hover:bg-slate-50 group">
                     <td className="p-4 text-slate-500">{new Date(e.date).toLocaleDateString()}</td>
                     <td className="p-4 font-medium text-slate-900">{e.description}</td>
                     <td className="p-4 text-slate-600">
                        <span className="bg-slate-100 px-2 py-1 rounded text-xs font-medium">{e.category}</span>
                     </td>
                     <td className="p-4 text-slate-600">{e.branchName}</td>
                     <td className="p-4 text-right font-bold text-slate-800">{fmtCurrency(e.amount)}</td>
                     <td className="p-4 text-right">
                       <button 
                         onClick={() => setDeleteConfirm({ id: e.id, desc: e.description })}
                         className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                       >
                         <Trash2 size={16} />
                       </button>
                     </td>
                   </tr>
                 ))}
                 {filteredExpenses.length === 0 && (
                   <tr>
                     <td colSpan={6} className="p-8 text-center text-slate-400">No expenses recorded for this period.</td>
                   </tr>
                 )}
               </tbody>
             </table>
          </div>
        )}
      </div>

      {/* Add Expense Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl p-6">
            <h3 className="font-bold text-lg text-slate-800 mb-4">Add Operating Expense</h3>
            <div className="space-y-4">
               <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <input 
                  type="text" 
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="e.g. Office Rent"
                  value={newExpense.description || ''}
                  onChange={e => setNewExpense({...newExpense, description: e.target.value})}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount (LKR)</label>
                  <input 
                    type="number" 
                    className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                    value={newExpense.amount}
                    onChange={e => setNewExpense({...newExpense, amount: Number(e.target.value)})}
                  />
                </div>
                <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                   <input 
                    type="date" 
                    className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                    value={newExpense.date}
                    onChange={e => setNewExpense({...newExpense, date: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                   <select 
                      className="w-full p-2 border border-slate-200 rounded-lg outline-none bg-white"
                      value={newExpense.category}
                      onChange={e => setNewExpense({...newExpense, category: e.target.value})}
                   >
                     {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                   </select>
                </div>
                <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Branch</label>
                   <select 
                      className="w-full p-2 border border-slate-200 rounded-lg outline-none bg-white"
                      value={newExpense.branchId}
                      onChange={e => setNewExpense({...newExpense, branchId: e.target.value})}
                   >
                     {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                   </select>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleSaveExpense} className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800">Save Expense</button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Popup */}
      {deleteConfirm && (
        <ConfirmDialog
          title="Delete Expense"
          message={`Are you sure you want to delete "${deleteConfirm.desc}"? This action cannot be undone.`}
          onConfirm={() => { deleteExpense(deleteConfirm.id); setDeleteConfirm(null); }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
};

export default Accounting;
