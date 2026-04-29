import React, { useState, useRef, useMemo } from 'react';
import { Search, Printer, User, Calendar, DollarSign, X, Building2, ArrowLeftRight, Package, FileText, Filter } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { SalesRecord, ExchangeRecord } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { parseBusinessDate } from '../utils/dateTime';
import { fmtCurrency } from '../utils/formatters';

type TimePeriod = 'TODAY' | 'WEEK' | 'MONTH' | 'ALL' | 'CUSTOM';

const isInPeriod = (dateStr: string, period: TimePeriod, dateFrom?: string, dateTo?: string): boolean => {
  if (period === 'ALL') return true;
  const d = parseBusinessDate(dateStr);
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
  const { salesHistory, exchangeHistory, branches, products } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState<ListItem | null>(null);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('ALL');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  // Item stats independent filter
  const [itemTimePeriod, setItemTimePeriod] = useState<TimePeriod>('ALL');
  const [itemDateFrom, setItemDateFrom] = useState<string>('');
  const [itemDateTo, setItemDateTo] = useState<string>('');
  const [itemCategoryFilter, setItemCategoryFilter] = useState<string>('ALL');
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
      (a, b) => parseBusinessDate(b.data.date).getTime() - parseBusinessDate(a.data.date).getTime()
    );
  }, [salesHistory, exchangeHistory, searchTerm, timePeriod, branchFilter, dateFrom, dateTo]);

  // --- Item-wise filtered list (independent from main list) ---
  const itemFilteredItems = useMemo((): ListItem[] => {
    const sales: ListItem[] = salesHistory
      .filter(s => isInPeriod(s.date, itemTimePeriod, itemDateFrom, itemDateTo))
      .map(s => ({ recordType: 'sale', data: s }));

    const exchanges: ListItem[] = (exchangeHistory || [])
      .filter(e => isInPeriod(e.date, itemTimePeriod, itemDateFrom, itemDateTo))
      .map(e => ({ recordType: 'exchange', data: e }));

    return [...sales, ...exchanges];
  }, [salesHistory, exchangeHistory, itemTimePeriod, itemDateFrom, itemDateTo]);

  const productCategoryById = useMemo(() => {
    const categoryMap = new Map<string, string>();
    products.forEach(product => {
      const normalizedCategory = product.category?.trim();
      if (normalizedCategory) {
        categoryMap.set(product.id, normalizedCategory);
      }
    });
    return categoryMap;
  }, [products]);

  const resolveItemCategory = (item: { id: string; category?: string }) => {
    const itemCategory = item.category?.trim();
    if (itemCategory) return itemCategory;
    const productCategory = productCategoryById.get(item.id);
    if (productCategory) return productCategory;
    return 'Uncategorized';
  };

  // --- Item-wise sold quantities ---
  const itemStats = useMemo(() => {
    const stats = new Map<string, { name: string; quantity: number; revenue: number; sku: string; size?: string; color?: string; category: string }>();
    
    itemFilteredItems.forEach(item => {
      if (item.recordType === 'sale') {
        const sale = item.data as SalesRecord;
        const grossItemTotal = sale.items.reduce((sum, cartItem) => sum + (cartItem.price * cartItem.quantity), 0);
        const fallbackShare = sale.items.length > 0 ? 1 / sale.items.length : 0;
        sale.items.forEach(cartItem => {
          const existing = stats.get(cartItem.id) || {
            name: cartItem.name, 
            quantity: 0, 
            revenue: 0, 
            sku: cartItem.sku,
            size: cartItem.size,
            color: cartItem.color,
            category: resolveItemCategory(cartItem)
          };
          const itemGross = cartItem.price * cartItem.quantity;
          const share = grossItemTotal > 0 ? itemGross / grossItemTotal : fallbackShare;
          stats.set(cartItem.id, {
            ...existing,
            quantity: existing.quantity + cartItem.quantity,
            revenue: existing.revenue + (sale.totalAmount * share)
          });
        });
      } else {
        const exchange = item.data as ExchangeRecord;
        exchange.newItems?.forEach(cartItem => {
          const existing = stats.get(cartItem.id) || {
            name: cartItem.name, 
            quantity: 0, 
            revenue: 0, 
            sku: cartItem.sku,
            size: cartItem.size,
            color: cartItem.color,
            category: resolveItemCategory(cartItem)
          };
          const lineRevenue = cartItem.lineEffectiveTotal ?? ((cartItem.effectiveUnitPrice ?? cartItem.price) * cartItem.quantity);
          stats.set(cartItem.id, {
            ...existing,
            quantity: existing.quantity + cartItem.quantity,
            revenue: existing.revenue + lineRevenue
          });
        });
      }
    });
    
    return Array.from(stats.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.quantity - a.quantity);
  }, [itemFilteredItems, productCategoryById]);

  const soldItemCategories = useMemo(() => {
    return Array.from(new Set(itemStats.map(item => item.category).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [itemStats]);

  const filteredItemStats = useMemo(() => {
    if (itemCategoryFilter === 'ALL') return itemStats;
    return itemStats.filter(item => item.category === itemCategoryFilter);
  }, [itemStats, itemCategoryFilter]);

  // --- Generate Item Stats Report ---
  const generateItemStatsReport = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('HOARD LAVISH', pageWidth / 2, 18, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Item-Wise Sales Report', pageWidth / 2, 28, { align: 'center' });
    
    const periodLabel = itemTimePeriod === 'TODAY' ? 'Today' : 
                        itemTimePeriod === 'WEEK' ? 'This Week' : 
                        itemTimePeriod === 'MONTH' ? 'This Month' : 
                        itemTimePeriod === 'CUSTOM' ? `${itemDateFrom || 'Start'} to ${itemDateTo || 'End'}` : 
                        'All Time';
    doc.text(`Period: ${periodLabel}`, pageWidth / 2, 35, { align: 'center' });
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 50, { align: 'right' });
    
    // Summary Stats
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', 14, 58);
    
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 61, pageWidth - 14, 61);
    
    const totalQuantity = filteredItemStats.reduce((sum, item) => sum + item.quantity, 0);
    const totalRevenue = filteredItemStats.reduce((sum, item) => sum + item.revenue, 0);
    
    autoTable(doc, {
      startY: 65,
      head: [],
      body: [
        ['Total Products Sold', totalQuantity.toString() + ' units'],
        ['Total Revenue', fmtCurrency(totalRevenue)],
        ['Unique Products', filteredItemStats.length.toString()]
      ],
      theme: 'plain',
      styles: { fontSize: 11, cellPadding: 3 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 60 },
        1: { halign: 'right' }
      },
      margin: { left: 14, right: 14 }
    });
    
    // Item Table
    if (filteredItemStats.length > 0) {
      const afterSummaryY = (doc as any).lastAutoTable.finalY + 10;
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Products', 14, afterSummaryY);
      doc.line(14, afterSummaryY + 3, pageWidth - 14, afterSummaryY + 3);
      
      const tableData = filteredItemStats.map(item => [
        item.sku || 'N/A',
        item.name,
        item.quantity.toString(),
        fmtCurrency(item.revenue)
      ]);
      
      autoTable(doc, {
        startY: afterSummaryY + 7,
        head: [['SKU', 'Product Name', 'Qty Sold', 'Revenue']],
        body: tableData,
        theme: 'striped',
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 25, halign: 'center' },
          3: { cellWidth: 35, halign: 'right' }
        },
        margin: { left: 14, right: 14 }
      });
    }
    
    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Page ${i} of ${pageCount} — Hoard Lavish ERP`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }
    
    // Save
    doc.save(`item-sales-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

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
      <div className={`${selectedItem ? 'w-5/12' : 'w-2/3'} flex flex-col transition-all duration-300 border-r border-slate-200`}>
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
                      <span>{parseBusinessDate(ex.date).toLocaleDateString()}</span>
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
                      <span>{parseBusinessDate(sale.date).toLocaleDateString()}</span>
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

      {/* Item-Wise Summary Section */}
      <div className={`${selectedItem ? 'w-3/12' : 'w-1/3'} flex flex-col bg-white border-r border-slate-200`}>
        <div className="p-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Package size={20} className="text-slate-600" />
              <h3 className="font-bold text-slate-900">Items Sold</h3>
            </div>
            <button
              onClick={generateItemStatsReport}
              className="p-1.5 text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
              title="Generate Report"
            >
              <FileText size={16} />
            </button>
          </div>
          
          {/* Item Filter Controls */}
          <div className="space-y-2">
            <select
              value={itemTimePeriod}
              onChange={(e) => setItemTimePeriod(e.target.value as TimePeriod)}
              className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md focus:border-slate-400 focus:outline-none bg-white"
            >
              <option value="TODAY">Today</option>
              <option value="WEEK">This Week</option>
              <option value="MONTH">This Month</option>
              <option value="ALL">All Time</option>
              <option value="CUSTOM">Custom Range</option>
            </select>
            
            {itemTimePeriod === 'CUSTOM' && (
              <div className="space-y-1.5">
                <input
                  type="date"
                  value={itemDateFrom}
                  onChange={(e) => setItemDateFrom(e.target.value)}
                  className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md focus:border-slate-400 focus:outline-none"
                  placeholder="From"
                />
                <input
                  type="date"
                  value={itemDateTo}
                  onChange={(e) => setItemDateTo(e.target.value)}
                  className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md focus:border-slate-400 focus:outline-none"
                  placeholder="To"
                />
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <Filter size={14} className="text-slate-400" />
              <select
                value={itemCategoryFilter}
                onChange={(e) => setItemCategoryFilter(e.target.value)}
                className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md focus:border-slate-400 focus:outline-none bg-white"
              >
                <option value="ALL">All Categories</option>
                {soldItemCategories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          {filteredItemStats.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <Package size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No items sold yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredItemStats.map(item => (
                <div key={item.id} className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-medium text-slate-900 text-sm line-clamp-2 flex-1">{item.name}</h4>
                  </div>
                  <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-400">
                    <span>{item.category}</span>
                  </div>
                  {(item.size || item.color) && (
                    <div className="mb-1">
                      <p className="text-xs text-slate-600">
                        {[item.size, item.color].filter(Boolean).join(' / ')}
                      </p>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Qty: <span className="font-bold text-slate-900">{item.quantity}</span></span>
                    <span className="text-emerald-600 font-bold">{fmtCurrency(item.revenue)}</span>
                  </div>
                  {item.sku && (
                    <div className="mt-1">
                      <span className="text-xs text-slate-400">SKU: {item.sku}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Summary Footer */}
        {filteredItemStats.length > 0 && (
          <div className="p-4 bg-slate-50 border-t border-slate-200">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Total Items:</span>
                <span className="font-bold text-slate-900">{filteredItemStats.reduce((sum, item) => sum + item.quantity, 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Revenue:</span>
                <span className="font-bold text-emerald-600">{fmtCurrency(filteredItemStats.reduce((sum, item) => sum + item.revenue, 0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Unique Products:</span>
                <span className="font-bold text-slate-900">{filteredItemStats.length}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Detail Section */}
      {selectedItem && (
        <div className="w-4/12 bg-white flex flex-col h-full animate-in slide-in-from-right duration-300">
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
                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>{parseBusinessDate(selectedExchange.date).toLocaleString()}</p>
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
                        <td style={{ padding: '8px 12px', fontSize: 13 }}>
                          {item.name}
                          {(item.size || item.color) && (
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                              {[item.size ? `Size: ${item.size}` : '', item.color ? `Color: ${item.color}` : ''].filter(Boolean).join(' • ')}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', color: '#64748b' }}>{item.quantity}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', color: '#64748b' }}>{fmtCurrency(item.effectiveUnitPrice ?? item.price)}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', color: '#ef4444', fontWeight: 500 }}>-{fmtCurrency(item.lineEffectiveTotal ?? ((item.effectiveUnitPrice ?? item.price) * item.quantity))}</td>
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
                        <td style={{ padding: '8px 12px', fontSize: 13 }}>
                          {item.name}
                          {(item.size || item.color) && (
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                              {[item.size ? `Size: ${item.size}` : '', item.color ? `Color: ${item.color}` : ''].filter(Boolean).join(' • ')}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', color: '#64748b' }}>{item.quantity}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', color: '#64748b' }}>{fmtCurrency(item.effectiveUnitPrice ?? item.price)}</td>
                        <td style={{ padding: '8px 12px', fontSize: 13, textAlign: 'right', color: '#16a34a', fontWeight: 500 }}>{fmtCurrency(item.lineEffectiveTotal ?? ((item.effectiveUnitPrice ?? item.price) * item.quantity))}</td>
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
                  {selectedExchange.exchangeBillDiscount ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                      <span>Exchange Bill Discount</span>
                      <span>-{fmtCurrency(selectedExchange.exchangeBillDiscount)}</span>
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16, color: selectedExchange.difference >= 0 ? '#16a34a' : '#ef4444' }}>
                    <span>{selectedExchange.difference >= 0 ? 'Customer Paid' : 'Store Refunded'}</span>
                    <span>{fmtCurrency(Math.abs(selectedExchange.difference))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginTop: 6 }}>
                    <span>Settlement</span>
                    <span>{selectedExchange.settlementType || (selectedExchange.difference > 0 ? 'CUSTOMER_PAYS' : selectedExchange.difference < 0 ? 'STORE_REFUND' : 'EVEN')}</span>
                  </div>
                  {selectedExchange.refundMethod ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginTop: 4 }}>
                      <span>Refund Method</span>
                      <span>{selectedExchange.refundMethod}</span>
                    </div>
                  ) : null}
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
                    {selectedSale.paymentMethod === 'Cash+Card' && (
                      <p style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                        Cash: {fmtCurrency(selectedSale.cashAmount || 0)} | Card: {fmtCurrency(selectedSale.cardAmount || 0)}
                      </p>
                    )}
                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>{parseBusinessDate(selectedSale.date).toLocaleString()}</p>
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
                    {selectedSale.paymentMethod === 'Cash+Card' && (
                      <p className="text-xs text-slate-500 mt-2">
                        Cash: {fmtCurrency(selectedSale.cashAmount || 0)} | Card: {fmtCurrency(selectedSale.cardAmount || 0)}
                      </p>
                    )}
                    <p className="text-xs text-slate-400 mt-2">{parseBusinessDate(selectedSale.date).toLocaleString()}</p>
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
                        <td style={{ padding: '8px 12px', fontSize: 13 }}>
                          {item.name}
                          {(item.size || item.color) && (
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                              {[item.size ? `Size: ${item.size}` : '', item.color ? `Color: ${item.color}` : ''].filter(Boolean).join(' • ')}
                            </div>
                          )}
                        </td>
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
                  {selectedSale.paymentMethod === 'Cash+Card' && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', padding: '4px 0' }}>
                        <span>Cash Portion</span><span>{fmtCurrency(selectedSale.cashAmount || 0)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', padding: '4px 0' }}>
                        <span>Card Portion</span><span>{fmtCurrency(selectedSale.cardAmount || 0)}</span>
                      </div>
                    </>
                  )}
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
