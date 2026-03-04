import React, { useState, useRef, useCallback } from 'react';
import { Settings as SettingsIcon, Users, Database, Shield, Tag, Save, Upload, Download, Trash2, Plus, Edit2, CheckCircle, AlertTriangle, X, Lock, FileSpreadsheet, FileDown, PackagePlus } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { User, Role, Product } from '../types';

// CSV template columns and sample row
const CSV_COLUMNS = ['name','category','brand','sku','price','costPrice','initialStock','minStockLevel','description','color','size','barcode','barcode2'];
const CSV_REQUIRED = ['name','category','brand','sku','price','costPrice'];
const CSV_SAMPLE = ['White Polo Shirt','Shirts','Polo','SKU-001','1500','900','10','5','Classic white polo shirt','White','M','2001234567890',''];

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) || [];
    const vals = values.map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  });
}

const Settings: React.FC = () => {
  const { 
    settings, updateSettings, 
    users, addUser, updateUser, deleteUser, 
    branches, currentBranch,
    addProduct,
    exportData, importData 
  } = useStore();

  const [activeTab, setActiveTab] = useState<'GENERAL' | 'USERS' | 'DATA' | 'IMPORT'>('GENERAL');
  
  // User Management State
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User>>({});

  // Data Management State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<'IDLE' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [showDevAccessPopup, setShowDevAccessPopup] = useState(false);

  // Product Import State
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const [csvDragOver, setCsvDragOver] = useState(false);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importDone, setImportDone] = useState<{ count: number } | null>(null);

  // Local state for General tab (with save button)
  const [generalForm, setGeneralForm] = useState({
    storeName: settings.storeName,
    currencySymbol: settings.currencySymbol,
    taxRate: settings.taxRate * 100,
    enableLowStockAlerts: settings.enableLowStockAlerts
  });
  const [generalSaved, setGeneralSaved] = useState(false);

  const handleSaveGeneral = () => {
    updateSettings({
      storeName: generalForm.storeName,
      currencySymbol: generalForm.currencySymbol,
      taxRate: generalForm.taxRate * 0.01,
      enableLowStockAlerts: generalForm.enableLowStockAlerts
    });
    setGeneralSaved(true);
    setTimeout(() => setGeneralSaved(false), 2000);
  };

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

  // Product CSV import handlers
  const handleDownloadTemplate = () => {
    const header = CSV_COLUMNS.join(',');
    const sample = CSV_SAMPLE.map(v => v.includes(',') ? `"${v}"` : v).join(',');
    const notes = [
      '# NOTES:',
      '# Required fields: ' + CSV_REQUIRED.join(', '),
      '# price and costPrice: numbers only (e.g. 1500)',
      '# initialStock: quantity for ' + currentBranch.name + ' branch',
      '# minStockLevel: alert threshold (default 5)',
      '# color and size: optional (e.g. White / M)',
      '# barcode and barcode2: optional EAN-13 barcodes',
      '# Delete these comment lines before uploading',
    ].join('\n');
    const content = `${notes}\n${header}\n${sample}`;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'product_import_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const processCSVFile = (file: File) => {
    setCsvErrors([]);
    setCsvRows([]);
    setCsvFileName(file.name);
    setImportDone(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      // Strip comment lines
      const stripped = text.split(/\r?\n/).filter(l => !l.trim().startsWith('#')).join('\n');
      const rows = parseCSV(stripped);
      const errors: string[] = [];
      if (rows.length === 0) {
        errors.push('No data rows found. Make sure your file has a header row and at least one data row.');
      } else {
        rows.forEach((row, i) => {
          CSV_REQUIRED.forEach(col => {
            if (!row[col]?.trim()) errors.push(`Row ${i + 1}: "${col}" is required.`);
          });
          if (row.price && isNaN(Number(row.price))) errors.push(`Row ${i + 1}: "price" must be a number.`);
          if (row.costPrice && isNaN(Number(row.costPrice))) errors.push(`Row ${i + 1}: "costPrice" must be a number.`);
          if (row.initialStock && isNaN(Number(row.initialStock))) errors.push(`Row ${i + 1}: "initialStock" must be a number.`);
        });
      }
      setCsvErrors(errors);
      setCsvRows(rows);
    };
    reader.readAsText(file);
  };

  const handleCSVFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processCSVFile(file);
    e.target.value = '';
  };

  const handleCSVDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setCsvDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processCSVFile(file);
  }, []);

  const handleConfirmImport = async () => {
    setImportLoading(true);
    await new Promise(r => setTimeout(r, 30)); // allow UI repaint
    let count = 0;
    csvRows.forEach(row => {
      const qty = parseInt(row.initialStock || '0') || 0;
      const product: Product = {
        id: Math.random().toString(36).substr(2, 9),
        name: row.name?.trim() || 'Unnamed',
        category: row.category?.trim() || 'Uncategorized',
        brand: row.brand?.trim() || 'Generic',
        sku: row.sku?.trim() || `SKU-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
        price: parseFloat(row.price) || 0,
        costPrice: parseFloat(row.costPrice) || 0,
        stock: qty,
        branchStock: { [currentBranch.id]: qty },
        minStockLevel: parseInt(row.minStockLevel) || 5,
        description: row.description?.trim() || '',
        color: row.color?.trim() || undefined,
        size: row.size?.trim() || undefined,
        barcode: row.barcode?.trim() || '',
        barcode2: row.barcode2?.trim() || '',
      };
      addProduct(product);
      count++;
    });
    setImportLoading(false);
    setShowImportConfirm(false);
    setImportDone({ count });
    setCsvRows([]);
    setCsvFileName(null);
    setCsvErrors([]);
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
           <TabButton id="IMPORT" label="Import Products" icon={PackagePlus} />
           <TabButton id="DATA" label="Backup & Restore" icon={Database} />
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
                  value={generalForm.storeName}
                  onChange={e => setGeneralForm(prev => ({ ...prev, storeName: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Currency Symbol</label>
                  <input 
                    type="text" 
                    className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                    value={generalForm.currencySymbol}
                    onChange={e => setGeneralForm(prev => ({ ...prev, currencySymbol: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Default Tax Rate (%)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
                    value={generalForm.taxRate}
                    onChange={e => setGeneralForm(prev => ({ ...prev, taxRate: Number(e.target.value) }))}
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
                    checked={generalForm.enableLowStockAlerts}
                    onChange={e => setGeneralForm(prev => ({ ...prev, enableLowStockAlerts: e.target.checked }))}
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              <div className="flex justify-end pt-2">
                <button 
                  onClick={handleSaveGeneral}
                  className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium shadow-sm"
                >
                  {generalSaved ? <><CheckCircle size={16} /> Saved!</> : <><Save size={16} /> Save Changes</>}
                </button>
              </div>

            </div>
          </div>
        )}

        {/* USERS TAB */}
        {activeTab === 'USERS' && (
          <div className="max-w-4xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900">User Management</h3>
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

        {/* IMPORT PRODUCTS TAB */}
        {activeTab === 'IMPORT' && (
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Import Products</h3>
                <p className="text-sm text-slate-500 mt-1">Bulk-upload products from a CSV file into <span className="font-semibold text-slate-700">{currentBranch.name}</span>.</p>
              </div>
              <button
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm shadow-sm"
              >
                <FileDown size={16} /> Download CSV Template
              </button>
            </div>

            {/* Template column guide */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <h4 className="text-sm font-bold text-blue-800 mb-2 flex items-center gap-1.5"><FileSpreadsheet size={15}/> CSV Column Reference</h4>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                {CSV_COLUMNS.map(col => (
                  <div key={col} className="flex items-center gap-2 text-xs text-blue-700">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${CSV_REQUIRED.includes(col) ? 'bg-red-500' : 'bg-blue-400'}`} />
                    <span className="font-mono font-semibold">{col}</span>
                    {CSV_REQUIRED.includes(col) && <span className="text-red-500 font-bold">*</span>}
                    {col === 'initialStock' && <span className="text-blue-500">(qty for current branch)</span>}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-blue-500 mt-2"><span className="text-red-500 font-bold">*</span> Required fields. All others are optional.</p>
            </div>

            {/* Upload area */}
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer mb-4 ${csvDragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-slate-400'}`}
              onDragOver={e => { e.preventDefault(); setCsvDragOver(true); }}
              onDragLeave={() => setCsvDragOver(false)}
              onDrop={handleCSVDrop}
              onClick={() => csvFileInputRef.current?.click()}
            >
              <input ref={csvFileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCSVFileChange} />
              <Upload className={`mx-auto mb-3 ${csvDragOver ? 'text-blue-500' : 'text-slate-400'}`} size={32} />
              {csvFileName ? (
                <p className="font-semibold text-slate-700">{csvFileName}</p>
              ) : (
                <>
                  <p className="font-semibold text-slate-700">Drag & drop a CSV file here</p>
                  <p className="text-xs text-slate-400 mt-1">or click to browse — .csv files supported</p>
                </>
              )}
            </div>

            {/* Validation errors */}
            {csvErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                <p className="text-sm font-bold text-red-700 mb-2 flex items-center gap-1.5"><AlertTriangle size={15}/> {csvErrors.length} validation error{csvErrors.length > 1 ? 's' : ''} found</p>
                <ul className="list-disc list-inside space-y-0.5 max-h-36 overflow-y-auto">
                  {csvErrors.map((e, i) => <li key={i} className="text-xs text-red-600">{e}</li>)}
                </ul>
              </div>
            )}

            {/* Preview */}
            {csvRows.length > 0 && csvErrors.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4 shadow-sm">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <p className="text-sm font-bold text-slate-700">{csvRows.length} product{csvRows.length > 1 ? 's' : ''} ready to import</p>
                  <span className="text-xs text-slate-400">Preview (first 5 rows)</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 uppercase border-b border-slate-100">
                      <tr>
                        {['name','category','brand','sku','price','costPrice','initialStock','color','size'].map(c => (
                          <th key={c} className="px-3 py-2 font-semibold whitespace-nowrap">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {csvRows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          {['name','category','brand','sku','price','costPrice','initialStock','color','size'].map(c => (
                            <td key={c} className="px-3 py-2 text-slate-700 whitespace-nowrap max-w-[200px] truncate">{row[c] || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {csvRows.length > 5 && (
                  <p className="text-xs text-slate-400 text-center py-2 border-t border-slate-100">+{csvRows.length - 5} more rows</p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3">
              {csvRows.length > 0 && csvErrors.length === 0 && (
                <button
                  onClick={() => setShowImportConfirm(true)}
                  className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium text-sm shadow-sm"
                >
                  <Upload size={16} /> Import {csvRows.length} Product{csvRows.length > 1 ? 's' : ''}
                </button>
              )}
              {csvFileName && (
                <button
                  onClick={() => { setCsvFileName(null); setCsvRows([]); setCsvErrors([]); setImportDone(null); }}
                  className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors text-sm"
                >
                  <X size={15}/> Clear
                </button>
              )}
              {importDone && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm font-medium">
                  <CheckCircle size={16}/> Successfully imported {importDone.count} product{importDone.count > 1 ? 's' : ''}!
                </div>
              )}
            </div>
          </div>
        )}

        {/* DATA BACKUP TAB — Locked behind developer access */}
        {activeTab === 'DATA' && (
          <div className="max-w-2xl">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Backup & Restore</h3>
            
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center opacity-60">
                <div>
                  <h4 className="font-bold text-slate-800">Export System Data</h4>
                  <p className="text-sm text-slate-500 mt-1">Download a full JSON backup of sales, inventory, and settings.</p>
                </div>
                <button 
                  onClick={() => setShowDevAccessPopup(true)}
                  className="flex items-center gap-2 px-6 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg font-medium transition-colors"
                >
                  <Lock size={18} /> Download
                </button>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm opacity-60">
                 <div className="flex justify-between items-center mb-4">
                    <div>
                      <h4 className="font-bold text-slate-800">Import Data</h4>
                      <p className="text-sm text-slate-500 mt-1">Restore system from a previous backup file.</p>
                    </div>
                 </div>
                 
                 <div 
                   className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center bg-slate-50 cursor-pointer"
                   onClick={() => setShowDevAccessPopup(true)}
                 >
                   <Lock className="mx-auto text-slate-400 mb-3" size={32} />
                   <p className="font-medium text-slate-600">Locked — Developer Access Required</p>
                   <p className="text-xs text-slate-400 mt-1">Contact your developer to perform backup operations.</p>
                 </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Import Confirmation Popup */}
      {showImportConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 flex items-center gap-3 bg-blue-50 border-b border-blue-100">
              <div className="p-2 rounded-full bg-blue-100 text-blue-600">
                <PackagePlus size={20} />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-sm text-blue-800">Confirm Product Import</h4>
                <p className="text-sm text-slate-600 mt-0.5">
                  You are about to add <span className="font-bold text-slate-800">{csvRows.length} product{csvRows.length > 1 ? 's' : ''}</span> to the inventory for branch <span className="font-bold text-slate-800">{currentBranch.name}</span>. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="p-4 flex justify-end gap-3 bg-white">
              <button
                onClick={() => setShowImportConfirm(false)}
                disabled={importLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importLoading}
                className="px-5 py-2 rounded-lg text-white text-sm font-medium bg-blue-600 hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-70"
              >
                {importLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Importing…
                  </>
                ) : (
                  <><Upload size={15} /> Yes, Import</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Developer Access Popup */}
      {showDevAccessPopup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="p-5 flex items-center gap-3 bg-amber-50 border-b border-amber-100">
              <div className="p-2 rounded-full bg-amber-100 text-amber-600">
                <Lock size={20} />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-sm text-amber-800">Developer Access Required</h4>
                <p className="text-sm text-slate-600 mt-0.5">Backup and restore operations are restricted. Please contact your system developer for assistance.</p>
              </div>
            </div>
            <div className="p-4 flex justify-end bg-white">
              <button 
                onClick={() => setShowDevAccessPopup(false)} 
                className="px-5 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

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

    </div>
  );
};

export default Settings;
