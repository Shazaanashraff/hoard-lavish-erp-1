import React, { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, ShoppingBag, TrendingUp, CreditCard, Wallet, Calendar, Trophy, Award, FileDown, BookOpen, Activity, Package, UserCheck, ArrowDownCircle, ArrowUpCircle, RefreshCw } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type FilterMode = 'daily' | 'monthly';

const CUR = 'LKR';

const fmtCurrency = (n: number) => `${CUR} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Dashboard: React.FC = () => {
  const { salesHistory, products, expenses, supplierTransactions, stockHistory, currentUser } = useStore();
  const role = currentUser?.role || 'CASHIER';
  const isAdmin = role === 'ADMIN';

  // --- Filter State ---
  const today = new Date();
  const [filterMode, setFilterMode] = useState<FilterMode>('daily');
  const [selectedDate, setSelectedDate] = useState(today.toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  );

  // --- Helpers ---
  const matchesDate = (dateString: string, targetDate: string) => dateString.startsWith(targetDate);
  const matchesMonth = (dateString: string, targetMonth: string) => dateString.startsWith(targetMonth);

  // --- Filtered Sales ---
  const filteredSales = useMemo(() => {
    if (filterMode === 'daily') {
      return salesHistory.filter(s => matchesDate(s.date, selectedDate));
    } else {
      return salesHistory.filter(s => matchesMonth(s.date, selectedMonth));
    }
  }, [salesHistory, filterMode, selectedDate, selectedMonth]);

  // --- Calculate Metrics ---
  const revenue = filteredSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const cost = filteredSales.reduce((sum, s) => sum + (s.totalCost || 0), 0);
  const profit = revenue - cost;
  const txCount = filteredSales.length;
  const lowStockCount = products.filter(p => p.stock < 5).length;

  // --- Display Labels ---
  const periodLabel = useMemo(() => {
    if (filterMode === 'daily') {
      const d = new Date(selectedDate + 'T00:00:00');
      return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } else {
      const [year, month] = selectedMonth.split('-');
      const d = new Date(Number(year), Number(month) - 1, 1);
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    }
  }, [filterMode, selectedDate, selectedMonth]);

  // Top Performers
  const topPerformers = useMemo(() => {
    const stats = new Map<string, { name: string, revenue: number, quantity: number }>();
    filteredSales.forEach(sale => {
      sale.items.forEach(item => {
        const current = stats.get(item.id) || { name: item.name, revenue: 0, quantity: 0 };
        stats.set(item.id, {
          name: item.name,
          revenue: current.revenue + (item.price * item.quantity),
          quantity: current.quantity + item.quantity
        });
      });
    });
    let bestRev = { name: 'No Sales Yet', value: 0 };
    let bestQty = { name: 'No Sales Yet', value: 0 };
    stats.forEach(val => {
      if (val.revenue > bestRev.value) bestRev = { name: val.name, value: val.revenue };
      if (val.quantity > bestQty.value) bestQty = { name: val.name, value: val.quantity };
    });
    return { bestRev, bestQty };
  }, [filteredSales]);

  // Chart Data
  const chartData = useMemo(() => {
    if (filterMode === 'daily') {
      const days = 7;
      const data = [];
      const endDate = new Date(selectedDate + 'T00:00:00');
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(endDate);
        d.setDate(endDate.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const daysSales = salesHistory.filter(s => s.date.startsWith(dateStr));
        const rev = daysSales.reduce((sum, s) => sum + s.totalAmount, 0);
        const cst = daysSales.reduce((sum, s) => sum + (s.totalCost || 0), 0);
        data.push({
          name: d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
          revenue: rev,
          profit: rev - cst
        });
      }
      return data;
    } else {
      const [year, month] = selectedMonth.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      const data = [];
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const daysSales = salesHistory.filter(s => s.date.startsWith(dateStr));
        const rev = daysSales.reduce((sum, s) => sum + s.totalAmount, 0);
        const cst = daysSales.reduce((sum, s) => sum + (s.totalCost || 0), 0);
        data.push({ name: `${day}`, revenue: rev, profit: rev - cst });
      }
      return data;
    }
  }, [salesHistory, filterMode, selectedDate, selectedMonth]);

  // --- Unified Ledger ---
  const filteredExpenses = useMemo(() => {
    if (filterMode === 'daily') return expenses.filter(e => matchesDate(e.date, selectedDate));
    return expenses.filter(e => matchesMonth(e.date, selectedMonth));
  }, [expenses, filterMode, selectedDate, selectedMonth]);

  const filteredSupplierTx = useMemo(() => {
    if (filterMode === 'daily') return supplierTransactions.filter(t => t.type === 'PAYMENT' && matchesDate(t.date, selectedDate));
    return supplierTransactions.filter(t => t.type === 'PAYMENT' && matchesMonth(t.date, selectedMonth));
  }, [supplierTransactions, filterMode, selectedDate, selectedMonth]);

  const ledger = useMemo(() => {
    const all = [
      ...filteredSales.map(s => ({
        id: s.id, date: s.date, desc: `Sale #${s.invoiceNumber}`, amount: s.totalAmount, type: 'IN' as const, category: 'Sales'
      })),
      ...filteredExpenses.map(e => ({
        id: e.id, date: e.date, desc: e.description, amount: e.amount, type: 'OUT' as const, category: e.category
      })),
      ...filteredSupplierTx.map(t => ({
        id: t.id, date: t.date, desc: `Supplier: ${t.supplierName}`, amount: t.amount, type: 'OUT' as const, category: 'Inventory'
      }))
    ];
    return all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredSales, filteredExpenses, filteredSupplierTx]);

  // --- Activity Feed ---
  const activityFeed = useMemo(() => {
    type ActivityItem = { id: string; date: string; icon: 'sale' | 'stock_in' | 'stock_out' | 'adjustment'; message: string; detail: string; color: string };
    const items: ActivityItem[] = [];

    // Sales events
    salesHistory.forEach(sale => {
      const itemNames = sale.items.map(i => `${i.quantity}x ${i.name}`).join(', ');
      items.push({
        id: `sale-${sale.id}`,
        date: sale.date,
        icon: 'sale',
        message: sale.customerName ? `Sold to ${sale.customerName}` : `Sale completed`,
        detail: `${itemNames} — ${fmtCurrency(sale.totalAmount)}`,
        color: 'emerald'
      });
    });

    // Stock movements
    stockHistory.forEach(mv => {
      if (mv.type === 'IN') {
        items.push({
          id: `stock-${mv.id}`,
          date: mv.date,
          icon: 'stock_in',
          message: `New stock added`,
          detail: `${mv.quantity} units of ${mv.productName} at ${mv.branchName}`,
          color: 'blue'
        });
      } else if (mv.type === 'OUT' && !mv.reason.startsWith('Sale')) {
        items.push({
          id: `stock-${mv.id}`,
          date: mv.date,
          icon: 'stock_out',
          message: `Stock removed`,
          detail: `${mv.quantity} units of ${mv.productName} — ${mv.reason}`,
          color: 'rose'
        });
      } else if (mv.type === 'ADJUSTMENT') {
        const isEdit = mv.reason.startsWith('Product edited');
        items.push({
          id: `stock-${mv.id}`,
          date: mv.date,
          icon: 'adjustment',
          message: isEdit ? 'Product updated' : 'Stock adjusted',
          detail: isEdit
            ? `${mv.productName} details were modified`
            : `${mv.productName} adjusted by ${mv.quantity} units — ${mv.reason}`,
          color: isEdit ? 'indigo' : 'amber'
        });
      }
    });

    // Sort by date descending
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items.slice(0, 20);
  }, [salesHistory, stockHistory]);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'sale': return <ShoppingBag size={16} />;
      case 'stock_in': return <ArrowDownCircle size={16} />;
      case 'stock_out': return <ArrowUpCircle size={16} />;
      case 'adjustment': return <RefreshCw size={16} />;
      default: return <Activity size={16} />;
    }
  };

  const getColorClasses = (color: string) => ({
    bg: `bg-${color}-50`,
    text: `text-${color}-600`,
    dot: `bg-${color}-400`
  });

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'Yesterday';
    return `${days}d ago`;
  };

  // --- Report Generation (PDF) ---
  const generateReport = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('HOARD LAVISH', pageWidth / 2, 18, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`${filterMode === 'daily' ? 'Daily' : 'Monthly'} Analysis Report`, pageWidth / 2, 28, { align: 'center' });
    doc.text(`Period: ${periodLabel}`, pageWidth / 2, 35, { align: 'center' });
    
    // Reset text color
    doc.setTextColor(0, 0, 0);
    
    // Generated date
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 50, { align: 'right' });
    
    // Summary Section
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', 14, 58);
    
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 61, pageWidth - 14, 61);
    
    const profitMargin = revenue ? ((profit / revenue) * 100).toFixed(1) : '0';
    
    const summaryData = [
      ['Total Revenue', fmtCurrency(revenue)],
      ['Total Cost (COGS)', fmtCurrency(cost)],
      ['Net Profit', fmtCurrency(profit)],
      ['Profit Margin', `${profitMargin}%`],
      ['Transactions', txCount.toString()]
    ];
    
    autoTable(doc, {
      startY: 65,
      head: [],
      body: summaryData,
      theme: 'plain',
      styles: { fontSize: 11, cellPadding: 3 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 60 },
        1: { halign: 'right' }
      },
      margin: { left: 14, right: 14 }
    });
    
    // Top Performers Section
    const afterSummaryY = (doc as any).lastAutoTable.finalY + 10;
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Top Performers', 14, afterSummaryY);
    doc.line(14, afterSummaryY + 3, pageWidth - 14, afterSummaryY + 3);
    
    const performersData = [
      ['Top Revenue Product', `${topPerformers.bestRev.name} (${fmtCurrency(topPerformers.bestRev.value)})`],
      ['Most Sold Product', `${topPerformers.bestQty.name} (${topPerformers.bestQty.value} units)`]
    ];
    
    autoTable(doc, {
      startY: afterSummaryY + 7,
      head: [],
      body: performersData,
      theme: 'plain',
      styles: { fontSize: 11, cellPadding: 3 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 60 }
      },
      margin: { left: 14, right: 14 }
    });
    
    // Transaction Ledger Section
    if (ledger.length > 0) {
      const afterPerformersY = (doc as any).lastAutoTable.finalY + 10;
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Transaction Ledger', 14, afterPerformersY);
      doc.line(14, afterPerformersY + 3, pageWidth - 14, afterPerformersY + 3);
      
      const ledgerTableData = ledger.map(item => {
        const date = new Date(item.date).toLocaleDateString();
        const sign = item.type === 'OUT' ? '-' : '+';
        return [date, item.type, item.category, sign + fmtCurrency(item.amount), item.desc];
      });
      
      autoTable(doc, {
        startY: afterPerformersY + 7,
        head: [['Date', 'Type', 'Category', 'Amount', 'Description']],
        body: ledgerTableData,
        theme: 'striped',
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 15 },
          2: { cellWidth: 28 },
          3: { cellWidth: 35, halign: 'right' },
          4: { cellWidth: 'auto' }
        },
        margin: { left: 14, right: 14 },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 3) {
            const text = data.cell.raw as string;
            if (text.startsWith('-')) {
              data.cell.styles.textColor = [220, 38, 38]; // red-600
            } else {
              data.cell.styles.textColor = [22, 163, 74]; // green-600
            }
          }
        }
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
    
    // Save the PDF
    const filename = filterMode === 'daily' ? `report_${selectedDate}.pdf` : `report_${selectedMonth}.pdf`;
    doc.save(filename);
  };

  // --- Reusable Components ---
  const StatCard = ({ title, value, subtext, icon: Icon, colorClass }: any) => (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex items-start gap-4 hover:shadow-md transition-shadow">
      <div className={`p-3 rounded-lg ${colorClass} text-white`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-slate-500 text-sm font-medium">{title}</p>
        <h3 className="text-2xl font-bold text-slate-900 mt-1">{value}</h3>
        {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
      </div>
    </div>
  );

  const FilterControls = () => (
    <div className="flex items-center gap-2">
      <div className="flex bg-slate-100 rounded-lg p-1">
        <button onClick={() => setFilterMode('daily')}
          className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${filterMode === 'daily' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
          Daily
        </button>
        <button onClick={() => setFilterMode('monthly')}
          className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${filterMode === 'monthly' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
          Monthly
        </button>
      </div>
      <div className="relative">
        {filterMode === 'daily' ? (
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-300 cursor-pointer" />
        ) : (
          <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-300 cursor-pointer" />
        )}
      </div>
      <button onClick={generateReport}
        className="flex items-center gap-1.5 bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors shadow-sm"
        title="Download analysis report">
        <FileDown size={14} /> Report
      </button>
    </div>
  );

  return (
    <div className="flex-1 bg-slate-50 p-6 md:p-8 overflow-y-auto">
      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
          <p className="text-slate-500 text-sm">Real-time overview of business performance.</p>
        </div>
        <FilterControls />
      </div>

      {/* OVERVIEW STATS — Admin only */}
      {isAdmin && (
      <div className="mb-2">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            {filterMode === 'daily' ? 'Daily' : 'Monthly'} Overview
          </h3>
          <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
            <Calendar size={13} /> {periodLabel}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard title="Revenue" value={fmtCurrency(revenue)} subtext={`${txCount} transactions`} icon={DollarSign} colorClass="bg-emerald-500" />
          <StatCard title="Expenses (COGS)" value={fmtCurrency(cost)} subtext="Cost of Goods Sold" icon={CreditCard} colorClass="bg-rose-500" />
          <StatCard title="Net Profit" value={fmtCurrency(profit)} subtext={`Margin: ${revenue ? ((profit / revenue) * 100).toFixed(1) : 0}%`} icon={Wallet} colorClass="bg-amber-500" />
          <StatCard title="Pending Actions" value={lowStockCount} subtext="Low stock alerts" icon={ShoppingBag} colorClass="bg-blue-500" />
        </div>
      </div>
      )}

      {/* ACTIVITY FEED + TOP PERFORMERS side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* LIVE ACTIVITY FEED */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                <Activity size={18} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Live Activity</h3>
                <p className="text-xs text-slate-400">Recent events across the store</p>
              </div>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Live"></span>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[400px]">
            {activityFeed.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {activityFeed.map((item) => {
                  const colors = getColorClasses(item.color);
                  return (
                    <div key={item.id} className="px-5 py-3.5 flex items-start gap-3 hover:bg-slate-50/50 transition-colors">
                      <div className={`p-2 rounded-lg ${colors.bg} ${colors.text} flex-shrink-0 mt-0.5`}>
                        {getActivityIcon(item.icon)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{item.message}</p>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{item.detail}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap flex-shrink-0 mt-1">
                        {timeAgo(item.date)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-12 text-center text-slate-400">
                <Activity size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No recent activity</p>
                <p className="text-xs mt-1">Events will appear here as they happen.</p>
              </div>
            )}
          </div>
        </div>

        {/* TOP PERFORMERS */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Trophy size={16} className="text-amber-500" />
              Top Performers
            </h3>
            <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <Calendar size={13} /> {periodLabel}
            </span>
          </div>
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold mb-1">Top Revenue Product</p>
                <h4 className="font-bold text-slate-800 text-lg line-clamp-1" title={topPerformers.bestRev.name}>{topPerformers.bestRev.name}</h4>
                <p className="text-emerald-600 font-bold text-sm mt-1">{fmtCurrency(topPerformers.bestRev.value)}</p>
              </div>
              <div className="bg-emerald-50 p-3 rounded-full text-emerald-600"><Award size={24} /></div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold mb-1">Most Sold Product</p>
                <h4 className="font-bold text-slate-800 text-lg line-clamp-1" title={topPerformers.bestQty.name}>{topPerformers.bestQty.name}</h4>
                <p className="text-indigo-600 font-bold text-sm mt-1 flex items-center gap-1">
                  <ShoppingBag size={14} /> {topPerformers.bestQty.value} units
                </p>
              </div>
              <div className="bg-indigo-50 p-3 rounded-full text-indigo-600"><Trophy size={24} /></div>
            </div>
          </div>
        </div>
      </div>

      {/* CHARTS — Admin only */}
      {isAdmin && (
      <div className="grid grid-cols-1 gap-8 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-bold text-slate-800">Revenue vs Profit</h3>
              <p className="text-xs text-slate-400">
                {filterMode === 'daily' ? 'Last 7 days performance' : `Daily breakdown for ${periodLabel}`}
              </p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${CUR} ${value}`} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: '#f8fafc' }}
                  formatter={(value: number) => [fmtCurrency(value)]}
                />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" name="Revenue" />
                <Area type="monotone" dataKey="profit" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorProfit)" name="Profit" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      )}

      {/* UNIFIED LEDGER */}
      <div className="mb-8">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-100 rounded-lg text-slate-600"><BookOpen size={18} /></div>
              <div>
                <h3 className="font-bold text-slate-800">Unified Ledger</h3>
                <p className="text-xs text-slate-400">Combined view of all financial transactions — {periodLabel}</p>
              </div>
            </div>
            <span className="text-xs text-slate-400 font-medium bg-slate-50 px-3 py-1 rounded-full">{ledger.length} entries</span>
          </div>
          {ledger.length > 0 ? (
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
                {ledger.slice(0, 15).map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-4 text-slate-500 whitespace-nowrap">{new Date(item.date).toLocaleDateString()}</td>
                    <td className="p-4 font-medium text-slate-900">{item.desc}</td>
                    <td className="p-4">
                      <span className="bg-slate-100 px-2 py-1 rounded text-xs font-medium text-slate-600">{item.category}</span>
                    </td>
                    <td className={`p-4 text-right font-bold ${item.type === 'IN' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {item.type === 'OUT' ? '-' : '+'}{fmtCurrency(item.amount)}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${item.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {item.type === 'IN' ? 'Income' : 'Expense'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-slate-400">
              <BookOpen size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No transactions found for this period.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;