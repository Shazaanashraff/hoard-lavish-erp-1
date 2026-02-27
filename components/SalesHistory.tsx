import React, { useState, useRef, useMemo } from 'react';
import { Search, Printer, User, Calendar, DollarSign, X, Building2, ArrowLeftRight } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { SalesRecord, ExchangeRecord } from '../types';

const CUR = 'LKR';
const fmtCurrency = (n: number) => `${CUR} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type TimePeriod = 'TODAY' | 'WEEK' | 'MONTH' | 'ALL' | 'CUSTOM';

const isInPeriod = (dateStr: string, period: TimePeriod, dateFrom?: string, dateTo?: string): boolean => {
  if (period === 'ALL') return true;
  const d = new Date(dateStr);
  const now = new Date();
  if (period === 'TODAY') {
    return d.toDateString() === now.toDateString();
  }
  if (period === 'WEEK') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return d >= weekAgo;
  }
  if (period === 'MONTH') {
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }
  if (period === 'CUSTOM') {
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      if (d < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (d > to) return false;
    }
    return true;
  }
  return true;
};

type ListItem =
  | { recordType: 'sale'; data: SalesRecord }
  | { recordType: 'exchange'; data: ExchangeRecord };

const SalesHistory: React.FC = () => {
  const { salesHistory, exchangeHistory, branches } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState<ListItem | null>(null);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('ALL');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const invoiceRef = useRef<HTMLDivElement>(null);

  // --- Combined filtered list ---
  const filteredItems = useMemo((): ListItem[] => {
    const sales: ListItem[] = salesHistory
      .filter(s => {
        const matchesSearch =
          s.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (s.customerName && s.customerName.toLowerCase().includes(searchTerm.toLowerCase()));
        return matchesSearch && isInPeriod(s.date, timePeriod, dateFrom, dateTo) &&
          (branchFilter === 'ALL' || s.branchId === branchFilter);
      })
      .map(s => ({ recordType: 'sale', data: s }));

    const exchanges: ListItem[] = (exchangeHistory || [])
      .filter(e => {
        const matchesSearch =
          e.exchangeNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (e.originalInvoiceNumber && e.originalInvoiceNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (e.customerName && e.customerName.toLowerCase().includes(searchTerm.toLowerCase()));
        return matchesSearch && isInPeriod(e.date, timePeriod, dateFrom, dateTo) &&
          (branchFilter === 'ALL' || e.branchId === branchFilter);
      })
      .map(e => ({ recordType: 'exchange', data: e }));

    return [...sales, ...exchanges].sort(
      (a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime()
    );
  }, [salesHistory, exchangeHistory, searchTerm, timePeriod, branchFilter, dateFrom, dateTo]);

  // --- Print invoice ---
  const handlePrint = () => {
    if (!invoiceRef.current) return;
    const printContents = invoiceRef.current.innerHTML;
    const title = selectedItem?.recordType === 'exchange'
      ? `Exchange ${(selectedItem.data as ExchangeRecord).exchangeNumber}`
      : `Invoice ${(selectedItem?.data as SalesRecord)?.invoiceNumber || ''}`;
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
            body { padding: 32px; color: #1e293b; }
            .inv-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e2e8f0; }
            .inv-title { font-size: 22px; font-weight: 700; }
            .inv-num { font-size: 12px; color: #64748b; font-family: monospace; }
            .inv-badge { display: inline-block; padding: 4px 12px; background: #dcfce7; color: #166534; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
            .inv-date { font-size: 11px; color: #94a3b8; margin-top: 6px; }
            .inv-customer { background: #f8fafc; padding: 12px 16px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px; }
            .inv-customer-title { font-size: 10px; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 8px; }
            .inv-customer-name { font-weight: 700; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th { background: #f1f5f9; color: #64748b; font-size: 11px; text-transform: uppercase; padding: 8px 12px; text-align: left; }
            th:last-child, th:nth-child(2), th:nth-child(3) { text-align: right; }
            td { padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
            td:last-child, td:nth-child(2), td:nth-child(3) { text-align: right; }
            .totals { max-width: 260px; margin-left: auto; }
            .totals .row { display: flex; justify-content: space-between; font-size: 13px; color: #64748b; padding: 4px 0; }
            .totals .grand { font-weight: 700; font-size: 16px; color: #0f172a; border-top: 2px solid #e2e8f0; padding-top: 8px; margin-top: 4px; }
            .footer { text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8; }
          </style>
        </head>
        <body>${printContents}<script>window.onload=function(){window.print();window.close();}<\/script></body>
      </html>
    `);
    printWindow.document.close();
  };

  const selectedIsExchange = selectedItem?.recordType === 'exchange';
  const selectedExchange = selectedIsExchange ? (selectedItem!.data as ExchangeRecord) : null;
  const selectedSale = !selectedIsExchange ? (selectedItem?.data as SalesRecord | undefined) : undefined;

  return (
    <div className="flex h-full bg-slate-50 overflow-hidden">
      {/* List Section */}
      <div className={`${selectedItem ? 'w-1/2' : 'w-full'} flex flex-col transition-all duration-300 border-r border-slate-200`}>
        <div className="p-6 bg-white border-b border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-slate-900">Sales History</h2>
            <div className="bg-slate-100 px-3 py-1 rounded-full text-xs font-medium text-slate-600">
              {filteredItems.length} Records
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search by Invoice #, Exchange # or Customer..."
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Filters Row */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Time Period Filter */}
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              {(['TODAY', 'WEEK', 'MONTH', 'CUSTOM', 'ALL'] as TimePeriod[]).map(p => (
                <button
                  key={p}
                  onClick={() => setTimePeriod(p)}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${timePeriod === p ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                  {p === 'TODAY' ? 'Today' : p === 'WEEK' ? 'This Week' : p === 'MONTH' ? 'This Month' : p === 'CUSTOM' ? 'Custom' : 'All Time'}
                </button>
              ))}
            </div>

            {/* Custom Date Range Picker */}
            {timePeriod === 'CUSTOM' && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <label className="text-xs font-bold text-slate-400">From:</label>
                  <input
                    type="date"
                    className="px-2 py-1 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:ring-2 focus:ring-amber-300"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <label className="text-xs font-bold text-slate-400">To:</label>
                  <input
                    type="date"
                    className="px-2 py-1 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:ring-2 focus:ring-amber-300"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                  />
                </div>
                {(dateFrom || dateTo) && (
                  <button
                    onClick={() => { setDateFrom(''); setDateTo(''); }}
                    className="text-xs text-slate-400 hover:text-red-500 px-1"
                    title="Clear dates"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}

            {/* Branch Filter */}
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
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredItems.map(item => {
            const isExchange = item.recordType === 'exchange';
            const ex = isExchange ? (item.data as ExchangeRecord) : null;
            const sale = !isExchange ? (item.data as SalesRecord) : null;
            const isSelected = selectedItem?.data.id === item.data.id && selectedItem?.recordType === item.recordType;

            if (isExchange && ex) {
              const diffPositive = ex.difference >= 0;
              return (
                <div
                  key={`ex-${ex.id}`}
                  onClick={() => setSelectedItem(item)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md
                    ${isSelected ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-100 text-slate-900 hover:border-amber-200'}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isSelected ? 'bg-amber-500/30 text-amber-300' : 'bg-amber-100 text-amber-700'}`}>
                        EXCHANGE
                      </span>
                      <span className={`font-mono text-sm ${isSelected ? 'text-amber-400' : 'text-slate-500'}`}>
                        {ex.exchangeNumber}
                      </span>
                    </div>
                    <span className={`font-bold text-sm ${diffPositive ? (isSelected ? 'text-green-400' : 'text-green-600') : (isSelected ? 'text-red-400' : 'text-red-600')}`}>
                      {diffPositive ? '+' : '-'}{fmtCurrency(Math.abs(ex.difference))}
                    </span>
                  </div>
                  {ex.originalInvoiceNumber && (
                    <p className={`text-xs mb-1 ${isSelected ? 'text-white/60' : 'text-slate-400'}`}>
                      Ref: {ex.originalInvoiceNumber}
                    </p>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2 opacity-80">
                      <ArrowLeftRight size={14} />
                      <span className="text-xs">{ex.returnedItems.length} returned Â· {ex.newItems.length} new</span>
                    </div>
                    <div className="flex items-center gap-2 opacity-60 text-xs">
                      <Calendar size={12} />
                      <span>{new Date(ex.date).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {ex.branchName && (
                    <div className="mt-2">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${isSelected ? 'bg-white/20 text-white/80' : 'bg-slate-100 text-slate-500'}`}>
                        {ex.branchName}
                      </span>
                    </div>
                  )}
                </div>
              );
            }

            if (!isExchange && sale) {
              return (
                <div
                  key={`sale-${sale.id}`}
                  onClick={() => setSelectedItem(item)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md
                    ${isSelected ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-100 text-slate-900 hover:border-amber-200'}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={`font-mono text-sm ${isSelected ? 'text-amber-400' : 'text-slate-500'}`}>
                      {sale.invoiceNumber}
                    </span>
                    <span className={`font-bold ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                      {fmtCurrency(sale.totalAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2 opacity-80">
                      <User size={14} />
                      <span>{sale.customerName || 'Walk-in Customer'}</span>
                    </div>
                    <div className="flex items-center gap-2 opacity-60 text-xs">
                      <Calendar size={12} />
                      <span>{new Date(sale.date).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {sale.branchName && (
                    <div className="mt-2">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${isSelected ? 'bg-white/20 text-white/80' : 'bg-slate-100 text-slate-500'}`}>
                        {sale.branchName}
                      </span>
                    </div>
                  )}
                </div>
              );
            }
            return null;
          })}
          {filteredItems.length === 0 && (
            <div className="text-center py-10 text-slate-400">
              No records found.
            </div>
          )}
        </div>
      </div>

      {/* Detail Section */}
      {selectedItem && (
        <div className="w-1/2 bg-white flex flex-col h-full animate-in slide-in-from-right duration-300">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <div>
              <h3 className="font-bold text-lg text-slate-800">
                {selectedIsExchange ? 'Exchange Details' : 'Invoice Details'}
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                {selectedIsExchange ? selectedExchange!.exchangeNumber : selectedSale?.invoiceNumber}
              </p>
            </div>
            <button
              onClick={() => setSelectedItem(null)}
              className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
            >
              <X size={20} />
            </button>
          </div>

          {/* Printable Content */}
          <div className="flex-1 overflow-y-auto p-8" ref={invoiceRef}>
            {selectedIsExchange && selectedExchange ? (
              /* --- Exchange Detail --- */
              <>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingBottom: 16, borderBottom: '2px solid #e2e8f0' }}>
                  <div>
                    <p style={{ fontSize: 22, fontWeight: 700 }}>Exchange Receipt</p>
                    <p style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{selectedExchange.exchangeNumber}</p>
                    {selectedExchange.originalInvoiceNumber && (
                      <p style={{ fontSize: 11, color: '#94a3b8' }}>Original: {selectedExchange.originalInvoiceNumber}</p>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ display: 'inline-block', padding: '4px 12px', background: '#fef3c7', color: '#92400e', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const }}>
                      Exchange via {selectedExchange.paymentMethod}
                    </span>
                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>{new Date(selectedExchange.date).toLocaleString()}</p>
                  </div>
                </div>

                {/* On-screen summary */}
                <div className="flex justify-between items-center mb-6 print:hidden">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-600">
                      <ArrowLeftRight size={22} />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Net Difference</p>
                      <p className={`text-2xl font-bold ${selectedExchange.difference >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {selectedExchange.difference >= 0 ? '+' : ''}{fmtCurrency(selectedExchange.difference)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <p>Returned: <span className="text-red-500 font-bold">{fmtCurrency(selectedExchange.returnedTotal)}</span></p>
                    <p>New items: <span className="text-green-600 font-bold">{fmtCurrency(selectedExchange.newTotal)}</span></p>
                  </div>
                </div>

                {/* Customer */}
                {(selectedExchange.customerName || selectedExchange.branchName) && (
                  <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 20 }}>
                    <p style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' as const, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>Customer / Branch</p>
                    <p style={{ fontWeight: 700, fontSize: 14 }}>{selectedExchange.customerName || 'Walk-in Customer'}</p>
                    {selectedExchange.branchName && <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Branch: {selectedExchange.branchName}</p>}
                  </div>
                )}

                {/* Returned Items */}
                <p style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase' as const, marginBottom: 8 }}>Returned Items</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
                  <thead>
                    <tr style={{ background: '#fff1f2' }}>
                      <th style={{ padding: '8px 12px', fontSize: 11, textTransform: 'uppercase' as const, color: '#64748b', textAlign: 'left' }}>Item</th>
                      <th style={{ padding: '8px 12px', fontSize: 11, textTransform: 'uppercase' as const, color: '#64748b', textAlign: 'right' }}>Qty</th>
                      <th style={{ padding: '8px 12px', fontSize: 11, textTransform: 'uppercase' as const, color: '#64748b', textAlign: 'right' }}>Price</th>
                      <th style={{ padding: '8px 12px', fontSize: 11, textTransform: 'uppercase' as const, color: '#64748b', textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedExchange.returnedItems.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px', fontSize: 13 }}>{item.name}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', color: '#64748b' }}>{item.quantity}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', color: '#64748b' }}>{fmtCurrency(item.price)}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', color: '#ef4444', fontWeight: 500 }}>-{fmtCurrency(item.price * item.quantity)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={3} style={{ padding: '8px 12px', fontSize: 13, fontWeight: 700, textAlign: 'right', color: '#ef4444' }}>Returned Total</td>
                      <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 700, textAlign: 'right', color: '#ef4444' }}>-{fmtCurrency(selectedExchange.returnedTotal)}</td>
                    </tr>
                  </tbody>
                </table>

                {/* New Items */}
                <p style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase' as const, marginBottom: 8 }}>New Items</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
                  <thead>
                    <tr style={{ background: '#f0fdf4' }}>
                      <th style={{ padding: '8px 12px', fontSize: 11, textTransform: 'uppercase' as const, color: '#64748b', textAlign: 'left' }}>Item</th>
                      <th style={{ padding: '8px 12px', fontSize: 11, textTransform: 'uppercase' as const, color: '#64748b', textAlign: 'right' }}>Qty</th>
                      <th style={{ padding: '8px 12px', fontSize: 11, textTransform: 'uppercase' as const, color: '#64748b', textAlign: 'right' }}>Price</th>
                      <th style={{ padding: '8px 12px', fontSize: 11, textTransform: 'uppercase' as const, color: '#64748b', textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedExchange.newItems.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px', fontSize: 13 }}>{item.name}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', color: '#64748b' }}>{item.quantity}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', color: '#64748b' }}>{fmtCurrency(item.price)}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', color: '#16a34a', fontWeight: 500 }}>{fmtCurrency(item.price * item.quantity)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={3} style={{ padding: '8px 12px', fontSize: 13, fontWeight: 700, textAlign: 'right', color: '#16a34a' }}>New Items Total</td>
                      <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 700, textAlign: 'right', color: '#16a34a' }}>{fmtCurrency(selectedExchange.newTotal)}</td>
                    </tr>
                  </tbody>
                </table>

                {/* Net difference */}
                <div style={{ maxWidth: 260, marginLeft: 'auto', borderTop: '2px solid #e2e8f0', paddingTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16, color: selectedExchange.difference >= 0 ? '#16a34a' : '#ef4444' }}>
                    <span>{selectedExchange.difference >= 0 ? 'Customer Paid' : 'Store Refunded'}</span>
                    <span>{fmtCurrency(Math.abs(selectedExchange.difference))}</span>
                  </div>
                </div>

                <div style={{ textAlign: 'center', marginTop: 32, paddingTop: 16, borderTop: '1px solid #f1f5f9', fontSize: 11, color: '#94a3b8' }}>
                  Thank you for your exchange!
                </div>
              </>
            ) : selectedSale ? (
              /* --- Sale Detail --- */
              <>
                {/* Header Status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingBottom: 16, borderBottom: '2px solid #e2e8f0' }}>
                  <div>
                    <p style={{ fontSize: 22, fontWeight: 700 }}>Invoice</p>
                    <p style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{selectedSale.invoiceNumber}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ display: 'inline-block', padding: '4px 12px', background: '#dcfce7', color: '#166534', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const }}>
                      Paid via {selectedSale.paymentMethod}
                    </span>
                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>{new Date(selectedSale.date).toLocaleString()}</p>
                  </div>
                </div>

                {/* Total Amount (on-screen only) */}
                <div className="flex justify-between items-center mb-8 print:hidden">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                      <DollarSign size={24} />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Total Amount</p>
                      <p className="text-2xl font-bold text-slate-900">{fmtCurrency(selectedSale.totalAmount)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase">
                      Paid via {selectedSale.paymentMethod}
                    </span>
                    <p className="text-xs text-slate-400 mt-2">{new Date(selectedSale.date).toLocaleString()}</p>
                  </div>
                </div>

                {/* Customer Info */}
                <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 20 }}>
                  <p style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' as const, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>Customer Information</p>
                  <p style={{ fontWeight: 700, fontSize: 14 }}>{selectedSale.customerName || 'Walk-in Customer'}</p>
                  {selectedSale.branchName && <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Branch: {selectedSale.branchName}</p>}
                </div>

                {/* Items Table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th style={{ padding: '8px 12px', fontSize: 11, textTransform: 'uppercase' as const, color: '#64748b', textAlign: 'left' }}>Item</th>
                      <th style={{ padding: '8px 12px', fontSize: 11, textTransform: 'uppercase' as const, color: '#64748b', textAlign: 'right' }}>Qty</th>
                      <th style={{ padding: '8px 12px', fontSize: 11, textTransform: 'uppercase' as const, color: '#64748b', textAlign: 'right' }}>Price</th>
                      <th style={{ padding: '8px 12px', fontSize: 11, textTransform: 'uppercase' as const, color: '#64748b', textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSale.items.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px', fontSize: 13 }}>{item.name}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', color: '#64748b' }}>{item.quantity}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', color: '#64748b' }}>{fmtCurrency(item.price)}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', fontWeight: 500 }}>{fmtCurrency(item.price * item.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals */}
                <div style={{ maxWidth: 260, marginLeft: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b', padding: '4px 0' }}>
                    <span>Subtotal</span><span>{fmtCurrency(selectedSale.subtotal)}</span>
                  </div>
                  {selectedSale.discount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b', padding: '4px 0' }}>
                      <span>Discount</span><span>-{fmtCurrency(selectedSale.discount)}</span>
                    </div>
                  )}
                  {selectedSale.tax > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b', padding: '4px 0' }}>
                      <span>Tax</span><span>{fmtCurrency(selectedSale.tax)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16, color: '#0f172a', borderTop: '2px solid #e2e8f0', paddingTop: 8, marginTop: 4 }}>
                    <span>Grand Total</span><span>{fmtCurrency(selectedSale.totalAmount)}</span>
                  </div>
                </div>

                <div style={{ textAlign: 'center', marginTop: 32, paddingTop: 16, borderTop: '1px solid #f1f5f9', fontSize: 11, color: '#94a3b8' }}>
                  Thank you for your purchase!
                </div>
              </>
            ) : null}
          </div>

          <div className="p-6 border-t border-slate-100 flex justify-end">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-6 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium shadow-sm"
            >
              <Printer size={18} /> {selectedIsExchange ? 'Print Exchange Receipt' : 'Print Invoice'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesHistory;
