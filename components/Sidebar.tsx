import React from 'react';
import { LayoutDashboard, ShoppingCart, Package, Settings, LogOut, History, Store, ChevronDown, Truck, PieChart, Users, Cloud, CloudOff, WifiOff, X } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { ViewState, Role } from '../types';

interface SidebarProps {
  /** Drawer open state — mobile only. Ignored at `md` and above, where the sidebar is always visible. */
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen = false, onClose }) => {
  const { currentView, setView, branches, currentBranch, setBranch, currentUser, logout, lastSyncTime, isCloudConnected, realtimeStatus, offlineQueue } = useStore();
  const role: Role = currentUser?.role || 'CASHIER';

  const NavItem = ({ view, icon: Icon, label }: { view: ViewState, icon: any, label: string }) => (
    <button
      onClick={() => { setView(view); onClose?.(); }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group
        ${currentView === view
          ? 'bg-slate-900 text-white shadow-md'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
    >
      <Icon size={20} className={`${currentView === view ? 'text-amber-400' : 'text-slate-400 group-hover:text-slate-600'}`} />
      <span className="font-medium">{label}</span>
    </button>
  );

  return (
    <>
      {/* Scrim — mobile only, closes the drawer on tap */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-[130] bg-slate-900/50 transition-opacity duration-300 md:hidden
          ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />

      {/* z-[140] clears the z-[100] DbErrorBanner and z-[120] offline popup, both
          `fixed` overlays that would otherwise cover the drawer's close button. */}
      <div
        className={`fixed inset-y-0 left-0 z-[140] w-64 bg-white border-r border-slate-200 flex flex-col flex-shrink-0
          transition-transform duration-300 ease-out
          md:static md:z-auto md:translate-x-0 md:transition-none
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
      <div className="p-6 border-b border-slate-100 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            HOARD <span className="text-amber-600">LAVISH</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">Fashion ERP System</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close menu"
          className="p-1 -mr-1 -mt-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors md:hidden"
        >
          <X size={20} />
        </button>
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
        {role !== 'CASHIER' && <NavItem view="SUPPLIERS" icon={Truck} label="Suppliers" />}
        {role !== 'CASHIER' && <NavItem view="ACCOUNTING" icon={PieChart} label="Accounting" />}
        <NavItem view="HISTORY" icon={History} label="Sales History" />
        <NavItem view="OFFLINE" icon={WifiOff} label={`Offline (${offlineQueue.length})`} />
        {role === 'ADMIN' && <NavItem view="BRANCHES" icon={Store} label="Branch Mgmt" />}
        {role === 'ADMIN' && <NavItem view="SETTINGS" icon={Settings} label="Settings" />}
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

        {/* Cloud + Realtime Status — compact single row */}
        <div className="flex items-center gap-1.5 px-3 py-1 mb-1">
          {isCloudConnected ? (
            <Cloud size={11} className="text-green-500 flex-shrink-0" />
          ) : (
            <CloudOff size={11} className="text-red-400 flex-shrink-0" />
          )}
          <span className={`text-[10px] font-medium truncate ${isCloudConnected ? 'text-green-600' : 'text-red-400'}`}>
            {isCloudConnected ? 'Connected' : 'Offline'}
          </span>
          {lastSyncTime && (
            <span className="text-[10px] text-slate-400 truncate">· {lastSyncTime.toLocaleTimeString()}</span>
          )}
          {realtimeStatus && (
            <>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ml-0.5 ${
                realtimeStatus === 'SUBSCRIBED' ? 'bg-green-500 animate-pulse' :
                realtimeStatus === 'CONNECTING' ? 'bg-blue-400 animate-pulse' :
                'bg-red-400'
              }`} />
              <span className={`text-[10px] font-medium truncate ${
                realtimeStatus === 'SUBSCRIBED' ? 'text-green-700' :
                realtimeStatus === 'CONNECTING' ? 'text-blue-600' :
                'text-red-500'
              }`}>
                {realtimeStatus === 'SUBSCRIBED' ? 'Live' :
                 realtimeStatus === 'CONNECTING' ? 'Sync…' :
                 'Offline'}
              </span>
            </>
          )}
        </div>
        <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
          <LogOut size={20} />
          <span className="font-medium">Logout</span>
        </button>
      </div>
      </div>
    </>
  );
};

export default Sidebar;
