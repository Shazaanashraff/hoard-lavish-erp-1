import React, { useMemo } from 'react';
import { LayoutDashboard, ShoppingCart, Package, Settings, LogOut, History, Store, ChevronDown, Truck, PieChart, Users } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { ViewState } from '../types';

const Sidebar: React.FC = () => {
  const { currentView, setView, branches, currentBranch, setBranch, currentUser, logout } = useStore();

  const NavItem = ({ view, icon: Icon, label }: { view: ViewState, icon: any, label: string }) => (
    <button
      onClick={() => setView(view)}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group
        ${currentView === view
          ? 'bg-slate-900 text-white shadow-md'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
    >
      <Icon size={20} className={`${currentView === view ? 'text-amber-400' : 'text-slate-400 group-hover:text-slate-600'}`} />
      <span className="font-medium">{label}</span>
    </button>
  );

  const role = currentUser?.role;
  const isAdmin = role === 'ADMIN';
  const isManager = role === 'MANAGER';
  const isCashier = role === 'CASHIER';

  return (
    <div className="w-64 h-screen bg-white border-r border-slate-200 flex flex-col flex-shrink-0">
      <div className="p-6 border-b border-slate-100">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          HOARD <span className="text-amber-600">LAVISH</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">Fashion ERP System</p>
      </div>

      {/* Branch Switcher */}
      <div className="px-4 py-4">
        <div className="relative">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Current Branch</label>
          <div className="relative">
            <Store className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <select
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 appearance-none focus:outline-none focus:ring-2 focus:ring-slate-200"
              value={currentBranch.id}
              onChange={(e) => setBranch(e.target.value)}
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
        <NavItem view="DASHBOARD" icon={LayoutDashboard} label="Dashboard" />
        <NavItem view="POS" icon={ShoppingCart} label="Point of Sale" />
        <NavItem view="INVENTORY" icon={Package} label="Inventory" />
        <NavItem view="CUSTOMERS" icon={Users} label="Customers" />
        {/* Cashier: no Suppliers, no Accounting */}
        {!isCashier && <NavItem view="SUPPLIERS" icon={Truck} label="Suppliers" />}
        {!isCashier && <NavItem view="ACCOUNTING" icon={PieChart} label="Accounting" />}
        <NavItem view="HISTORY" icon={History} label="Sales History" />
        {/* Manager & Cashier: no Branches, no Settings */}
        {isAdmin && <NavItem view="BRANCHES" icon={Store} label="Branch Mgmt" />}
        {isAdmin && <NavItem view="SETTINGS" icon={Settings} label="Settings" />}
      </nav>

      <div className="p-4 border-t border-slate-100">
        {currentUser && (
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-sm">
              {currentUser.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{currentUser.name}</p>
              <p className="text-[10px] text-slate-400 uppercase font-bold">{currentUser.role}</p>
            </div>
          </div>
        )}
        <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
          <LogOut size={20} />
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
