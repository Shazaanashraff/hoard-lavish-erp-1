import React, { useState, useRef } from 'react';
import { Settings as SettingsIcon, Users, Database, Shield, Tag, Save, Upload, Download, Trash2, Plus, Edit2, CheckCircle, AlertTriangle, X, Lock } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { User, Role } from '../types';

const Settings: React.FC = () => {
  const { 
    settings, updateSettings, 
    users, addUser, updateUser, deleteUser, 
    branches, categories, addCategory, removeCategory, brands, addBrand, removeBrand,
    exportData, importData 
  } = useStore();

  const [activeTab, setActiveTab] = useState<'GENERAL' | 'USERS' | 'DATA'>('GENERAL');
  const [showDevAccessPopup, setShowDevAccessPopup] = useState(false);
  
  // User Management State
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User>>({});

  // Data Management State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<'IDLE' | 'SUCCESS' | 'ERROR'>('IDLE');

  // Handlers
  const handleSaveUser = () => {
    if (editingUser.name && editingUser.role && editingUser.pin) {
      if (editingUser.id) {
        updateUser(editingUser.id, editingUser);
      } else {
        addUser({
          ...editingUser,
          id: Math.random().toString(36).substr(2, 9)
        } as User);
      }
      setIsUserModalOpen(false);
      setEditingUser({});
    }
  };

  const handleExport = () => {
    const data = exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hoard_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const success = importData(content);
        setImportStatus(success ? 'SUCCESS' : 'ERROR');
        setTimeout(() => setImportStatus('IDLE'), 3000);
      };
      reader.readAsText(file);
    }
  };

  const TabButton = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-3 px-6 py-4 w-full text-left transition-colors border-l-4
        ${activeTab === id 
          ? 'bg-slate-100 border-slate-900 text-slate-900 font-medium' 
          : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
    >
      <Icon size={20} />
      {label}
    </button>
  );

  return (
    <div className="flex-1 bg-slate-50 flex h-full overflow-hidden">
      {/* Settings Sidebar */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <SettingsIcon className="text-slate-400" /> Settings
          </h2>
          <p className="text-sm text-slate-500 mt-1">System configuration</p>
        </div>
        <div className="py-4">
           <TabButton id="GENERAL" label="General" icon={SettingsIcon} />
           <TabButton id="USERS" label="Users & Roles" icon={Users} />
           <button
             onClick={() => setShowDevAccessPopup(true)}
             className="flex items-center gap-3 px-6 py-4 w-full text-left transition-colors border-l-4 border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700"
           >
             <Database size={20} />
             Backup & Restore
           </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8">
        
        {/* GENERAL TAB */}
        {activeTab === 'GENERAL' && (
          <div className="max-w-2xl">
            <h3 className="text-lg font-bold text-slate-900 mb-6">General Configuration</h3>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Store Name</label>
                <input 
                  type="text" 
                  className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                  value={settings.storeName}
                  onChange={e => updateSettings({ storeName: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Currency Symbol</label>
                  <input 
                    type="text" 
                    className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                    value={settings.currencySymbol}
                    onChange={e => updateSettings({ currencySymbol: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Default Tax Rate (%)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                    value={settings.taxRate * 100}
                    onChange={e => updateSettings({ taxRate: Number(e.target.value) * 0.01 })}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <p className="font-medium text-slate-900">Low Stock Alerts</p>
                  <p className="text-sm text-slate-500">Show warnings when inventory is low</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={settings.enableLowStockAlerts}
                    onChange={e => updateSettings({ enableLowStockAlerts: e.target.checked })}
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

            </div>
          </div>
        )}

        {/* USERS TAB */}
        {activeTab === 'USERS' && (
          <div className="max-w-4xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900">User Management</h3>
              {/* Add User button removed per business requirement */}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                  <tr>
                    <th className="p-4">Name</th>
                    <th className="p-4">Role</th>
                    <th className="p-4">Access PIN</th>
                    <th className="p-4">Assigned Branch</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map(user => (
                    <tr key={user.id} className="hover:bg-slate-50">
                      <td className="p-4 font-medium text-slate-900">{user.name}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          user.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                          user.role === 'MANAGER' ? 'bg-blue-100 text-blue-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-slate-500">****</td>
                      <td className="p-4 text-slate-600">
                        {branches.find(b => b.id === user.branchId)?.name || 'All Branches'}
                      </td>
                      <td className="p-4 text-right flex justify-end gap-2">
                         <button 
                           onClick={() => { setEditingUser(user); setIsUserModalOpen(true); }}
                           className="p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600 rounded"
                         >
                           <Edit2 size={16} />
                         </button>
                         <button 
                           onClick={() => { if(confirm('Delete user?')) deleteUser(user.id) }}
                           className="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded"
                         >
                           <Trash2 size={16} />
                         </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* INVENTORY SETTINGS TAB - Removed: available in Inventory page */}

        {/* DATA BACKUP TAB */}
        {activeTab === 'DATA' && (
          <div className="max-w-2xl">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Backup & Restore</h3>
            
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
                <div>
                  <h4 className="font-bold text-slate-800">Export System Data</h4>
                  <p className="text-sm text-slate-500 mt-1">Download a full JSON backup of sales, inventory, and settings.</p>
                </div>
                <button 
                  onClick={handleExport}
                  className="flex items-center gap-2 px-6 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg font-medium transition-colors"
                >
                  <Download size={18} /> Download
                </button>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                 <div className="flex justify-between items-center mb-4">
                    <div>
                      <h4 className="font-bold text-slate-800">Import Data</h4>
                      <p className="text-sm text-slate-500 mt-1">Restore system from a previous backup file.</p>
                    </div>
                    {importStatus === 'SUCCESS' && <span className="text-emerald-600 flex items-center gap-1 font-bold text-sm"><CheckCircle size={16}/> Done</span>}
                    {importStatus === 'ERROR' && <span className="text-red-600 flex items-center gap-1 font-bold text-sm"><AlertTriangle size={16}/> Failed</span>}
                 </div>
                 
                 <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                   <Upload className="mx-auto text-slate-400 mb-3" size={32} />
                   <p className="font-medium text-slate-600">Click to upload backup file</p>
                   <p className="text-xs text-slate-400 mt-1">JSON files only</p>
                   <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept=".json" 
                    onChange={handleImport} 
                   />
                 </div>
                 <p className="text-xs text-amber-600 mt-3 flex items-center gap-1">
                   <AlertTriangle size={12} /> Warning: Importing will overwrite all current system data.
                 </p>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* USER MODAL */}
      {isUserModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl p-6">
            <h3 className="font-bold text-lg text-slate-800 mb-4">{editingUser.id ? 'Edit User' : 'New User'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                <input 
                  type="text" 
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                  value={editingUser.name || ''}
                  onChange={e => setEditingUser({...editingUser, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Access PIN</label>
                <input 
                  type="text" 
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                  value={editingUser.pin || ''}
                  onChange={e => setEditingUser({...editingUser, pin: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <select 
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none bg-white"
                  value={editingUser.role}
                  onChange={e => setEditingUser({...editingUser, role: e.target.value as Role})}
                >
                  <option value="CASHIER">Cashier</option>
                  <option value="MANAGER">Manager</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Assigned Branch</label>
                <select 
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none bg-white"
                  value={editingUser.branchId || ''}
                  onChange={e => setEditingUser({...editingUser, branchId: e.target.value || undefined})}
                >
                  <option value="">All Branches (Admin/HQ)</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setIsUserModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleSaveUser} className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800">Save User</button>
            </div>
          </div>
        </div>
      )}

      {/* Dev Access Popup for Backup & Restore */}
      {showDevAccessPopup && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowDevAccessPopup(false)}>
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5 flex items-center gap-3 bg-amber-50">
              <div className="p-2 rounded-full bg-amber-100 text-amber-600">
                <Lock size={20} />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-sm text-amber-800">Developer Access Required</h4>
                <p className="text-sm text-slate-600 mt-1">Backup & Restore features are restricted. Please contact the developer for access.</p>
              </div>
            </div>
            <div className="p-3 flex justify-end bg-white border-t border-slate-100">
              <button onClick={() => setShowDevAccessPopup(false)} className="px-5 py-2 rounded-lg text-white text-sm font-medium bg-amber-500 hover:bg-amber-600 transition-colors">
                OK
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Settings;
