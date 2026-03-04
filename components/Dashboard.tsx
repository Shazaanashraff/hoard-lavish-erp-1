import React, { useMemo, useState, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { DollarSign, ShoppingBag, TrendingUp, TrendingDown, CreditCard, Wallet, Calendar, Trophy, Award, FileDown, BookOpen, Activity, Package, UserCheck, ArrowDownCircle, ArrowUpCircle, RefreshCw, Eye, X, Download, ArrowRightLeft, Edit2, Printer, Plus, Minus, Trash2, CheckCircle, ClipboardList } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CartItem, SalesRecord } from '../types';

type FilterMode = 'daily' | 'monthly';

const CUR = 'LKR';

const BRANCH_COLORS   = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'];
const BRANCH_PROFIT_COLORS = ['#34d399', '#60a5fa', '#fcd34d', '#f9a8d4', '#c4b5fd'];

const fmtCurrency = (n: number) => `${CUR} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Dashboard: React.FC = () => {
  const { salesHistory, products, expenses, supplierTransactions, stockHistory, stockTransfers, exchangeHistory, currentUser, updateSale, customers, currentBranch, branches } = useStore();
  const role = currentUser?.role || 'CASHIER';
  const isAdmin = role === 'ADMIN';

  // --- Filter State ---
  const today = new Date();
  const [filterMode, setFilterMode] = useState<FilterMode>('daily');
  const [selectedDate, setSelectedDate] = useState(today.toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  );
  const [detailModalType, setDetailModalType] = useState<'revenue' | 'expenses' | 'profit' | null>(null);
  const [showLowStockModal, setShowLowStockModal] = useState(false);

  // --- Edit Sale State ---
  const [editingSale, setEditingSale] = useState<SalesRecord | null>(null);
  const [editCart, setEditCart] = useState<CartItem[]>([]);
  const [editDiscount, setEditDiscount] = useState<number>(0);
  const [editCustomerId, setEditCustomerId] = useState<string | undefined>(undefined);
  const [isEditInvoiceOpen, setIsEditInvoiceOpen] = useState(false);
  const [lastEditedSale, setLastEditedSale] = useState<SalesRecord | null>(null);

  // --- Helpers ---
  const matchesDate = (dateString: string, targetDate: string) => dateString.startsWith(targetDate);
  const matchesMonth = (dateString: string, targetMonth: string) => dateString.startsWith(targetMonth);

  // --- Filtered Sales (branch-scoped) ---
  const filteredSales = useMemo(() => {
    const branchSales = salesHistory.filter(s => s.branchId === currentBranch.id);
    if (filterMode === 'daily') {
      return branchSales.filter(s => matchesDate(s.date, selectedDate));
    } else {
      return branchSales.filter(s => matchesMonth(s.date, selectedMonth));
    }
  }, [salesHistory, filterMode, selectedDate, selectedMonth, currentBranch.id]);

  // --- Filtered Exchanges (branch-scoped) ---
  const filteredExchanges = useMemo(() => {
    const ex = (exchangeHistory || []).filter(e => e.branchId === currentBranch.id);
    if (filterMode === 'daily') return ex.filter(e => matchesDate(e.date, selectedDate));
    return ex.filter(e => matchesMonth(e.date, selectedMonth));
  }, [exchangeHistory, filterMode, selectedDate, selectedMonth, currentBranch.id]);

  // --- Calculate Metrics ---
  const salesRevenue = filteredSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const exchangeNetRevenue = filteredExchanges.reduce((sum, e) => sum + e.difference, 0);
  const revenue = salesRevenue + exchangeNetRevenue;
  const cost = filteredSales.reduce((sum, s) => sum + (s.totalCost || 0), 0);
  const profit = revenue - cost;
  const txCount = filteredSales.length + filteredExchanges.length;
  const lowStockProducts = products.filter(p => (p.branchStock?.[currentBranch?.id ?? ''] ?? p.stock) <= p.minStockLevel);
  const lowStockCount = lowStockProducts.length;

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

  // Chart Data — per branch
  const chartData = useMemo(() => {
    if (filterMode === 'daily') {
      const days = 7;
      const data: Record<string, any>[] = [];
      const endDate = new Date(selectedDate + 'T00:00:00');
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(endDate);
        d.setDate(endDate.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const point: Record<string, any> = {
          name: d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
        };
        branches.forEach(br => {
          const daySales = salesHistory.filter(s => s.branchId === br.id && s.date.startsWith(dateStr));
          const rev = daySales.reduce((sum, s) => sum + s.totalAmount, 0);
          const cst = daySales.reduce((sum, s) => sum + (s.totalCost || 0), 0);
          point[`rev_${br.id}`] = rev;
          point[`profit_${br.id}`] = rev - cst;
        });
        data.push(point);
      }
      return data;
    } else {
      const [year, month] = selectedMonth.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      const data: Record<string, any>[] = [];
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const point: Record<string, any> = { name: `${day}` };
        branches.forEach(br => {
          const daySales = salesHistory.filter(s => s.branchId === br.id && s.date.startsWith(dateStr));
          const rev = daySales.reduce((sum, s) => sum + s.totalAmount, 0);
          const cst = daySales.reduce((sum, s) => sum + (s.totalCost || 0), 0);
          point[`rev_${br.id}`] = rev;
          point[`profit_${br.id}`] = rev - cst;
        });
        data.push(point);
      }
      return data;
    }
  }, [salesHistory, filterMode, selectedDate, selectedMonth, branches]);

  // --- Unified Ledger ---
  const filteredExpenses = useMemo(() => {
    const branchExpenses = expenses.filter(e => e.branchId === currentBranch.id);
    if (filterMode === 'daily') return branchExpenses.filter(e => matchesDate(e.date, selectedDate));
    return branchExpenses.filter(e => matchesMonth(e.date, selectedMonth));
  }, [expenses, filterMode, selectedDate, selectedMonth, currentBranch.id]);

  const filteredSupplierTx = useMemo(() => {
    if (filterMode === 'daily') return supplierTransactions.filter(t => t.type === 'PAYMENT' && matchesDate(t.date, selectedDate));
    return supplierTransactions.filter(t => t.type === 'PAYMENT' && matchesMonth(t.date, selectedMonth));
  }, [supplierTransactions, filterMode, selectedDate, selectedMonth]);

  const filteredTransfers = useMemo(() => {
    if (filterMode === 'daily') return stockTransfers.filter(t => matchesDate(t.date, selectedDate));
    return stockTransfers.filter(t => matchesMonth(t.date, selectedMonth));
  }, [stockTransfers, filterMode, selectedDate, selectedMonth]);

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
      })),
      ...filteredTransfers.map(t => ({
        id: t.id, date: t.date, desc: `Transfer ${t.transferNumber}: ${t.fromBranchName} → ${t.toBranchName}`, amount: t.totalValue, type: 'TRANSFER' as const, category: 'Stock Transfer'
      })),
      ...filteredExchanges.map(e => ({
        id: e.id, date: e.date,
        desc: `Exchange #${e.exchangeNumber}${e.originalInvoiceNumber ? ` (Sale #${e.originalInvoiceNumber})` : ''}: ${e.description || 'Product exchange'}`,
        amount: Math.abs(e.difference),
        type: (e.difference >= 0 ? 'IN' : 'OUT') as 'IN' | 'OUT' | 'TRANSFER',
        category: 'Exchange'
      }))
    ];
    return all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredSales, filteredExpenses, filteredSupplierTx, filteredTransfers, filteredExchanges]);

  // --- Recent Sales (Last 10 minutes) ---
  const recentEditableSales = useMemo(() => {
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    return salesHistory.filter(sale => {
      const saleTime = new Date(sale.date).getTime();
      return saleTime >= tenMinutesAgo;
    }).slice(0, 10); // Show max 10 sales
  }, [salesHistory]);

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
      } else if (mv.type === 'TRANSFER') {
        items.push({
          id: `stock-${mv.id}`,
          date: mv.date,
          icon: 'stock_out',
          message: `Stock transferred`,
          detail: `${mv.quantity} units of ${mv.productName} — ${mv.reason}`,
          color: 'indigo'
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

  // --- Day End Report (PDF) ---
  const generateDayEndReport = (cashierName: string, note: string) => {
    // Payment method breakdown
    const cashSales    = filteredSales.filter(s => s.paymentMethod === 'Cash');
    const cardSales    = filteredSales.filter(s => s.paymentMethod === 'Card');
    const payhereS     = filteredSales.filter(s => s.paymentMethod === 'PayHere');
    const onlineS      = filteredSales.filter(s => s.paymentMethod === 'Online Transfer');
    const mintpayS     = filteredSales.filter(s => s.paymentMethod === 'MintPay');

    const cashTotal    = cashSales.reduce((s, x) => s + x.totalAmount, 0);
    const cardTotal    = cardSales.reduce((s, x) => s + x.totalAmount, 0);
    const payhereTotal  = payhereS.reduce((s, x) => s + x.totalAmount, 0);
    const onlineTotal  = onlineS.reduce((s, x) => s + x.totalAmount, 0);
    const mintpayTotal = mintpayS.reduce((s, x) => s + x.totalAmount, 0);
    const allCardTotal = cardTotal + payhereTotal + onlineTotal + mintpayTotal;

    const totalSalesRevenue  = filteredSales.reduce((s, x) => s + x.totalAmount, 0);
    const exchangeNet         = filteredExchanges.reduce((s, e) => s + e.difference, 0);
    const grossSales          = totalSalesRevenue + exchangeNet;
    const txCount             = filteredSales.length + filteredExchanges.length;
    const totalItemsSold      = filteredSales.reduce((s, x) => s + x.items.reduce((a, i) => a + i.quantity, 0), 0);

    // Expenses
    const totalOperatingExpenses = filteredExpenses.reduce((s, e) => s + e.amount, 0);
    const totalSupplierPayments  = filteredSupplierTx.reduce((s, t) => s + t.amount, 0);
    const totalExpenses          = totalOperatingExpenses + totalSupplierPayments;
    const netSales               = grossSales - totalExpenses;

    const avgBill             = txCount > 0 ? grossSales / txCount : 0;
    const avgItemSale         = totalItemsSold > 0 ? grossSales / totalItemsSold : 0;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // ── Header ──
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pageWidth, 44, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('HOARD LAVISH', pageWidth / 2, 16, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`${filterMode === 'daily' ? 'Daily' : 'Monthly'} Day End Report — ${periodLabel} — ${currentBranch.name}`, pageWidth / 2, 27, { align: 'center' });

    if (cashierName.trim()) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`Cashier: ${cashierName.trim()}`, pageWidth / 2, 38, { align: 'center' });
    }

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 54, { align: 'right' });

    // ── Sales Breakdown ──
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Sales Summary', 14, 62);
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 65, pageWidth - 14, 65);

    const salesBreakdown: (string | number)[][] = [];
    salesBreakdown.push(['Cash Sales', fmtCurrency(cashTotal), `${cashSales.length} transaction${cashSales.length !== 1 ? 's' : ''}`]);

    // Card total row
    const cardSubParts: string[] = [];
    if (cardTotal > 0)    cardSubParts.push(`Card: ${fmtCurrency(cardTotal)}`);
    if (payhereTotal > 0) cardSubParts.push(`PayHere: ${fmtCurrency(payhereTotal)}`);
    if (onlineTotal > 0)  cardSubParts.push(`Online Transfer: ${fmtCurrency(onlineTotal)}`);
    if (mintpayTotal > 0) cardSubParts.push(`MintPay: ${fmtCurrency(mintpayTotal)}`);
    const cardSubLabel = cardSubParts.length > 0 ? `(${cardSubParts.join('  |  ')})` : '—';
    const allCardCount = cardSales.length + payhereS.length + onlineS.length + mintpayS.length;
    salesBreakdown.push([`Card Sales  ${cardSubLabel}`, fmtCurrency(allCardTotal), `${allCardCount} transaction${allCardCount !== 1 ? 's' : ''}`]);

    if (exchangeNet !== 0) {
      salesBreakdown.push(['Exchange Adjustments', (exchangeNet >= 0 ? '+' : '') + fmtCurrency(exchangeNet), `${filteredExchanges.length} exchange${filteredExchanges.length !== 1 ? 's' : ''}`]);
    }

    autoTable(doc, {
      startY: 69,
      head: [['Payment Type', 'Amount', 'Count']],
      body: salesBreakdown,
      theme: 'striped',
      styles: { fontSize: 10, cellPadding: 3.5 },
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'right', cellWidth: 38, fontStyle: 'bold' },
        2: { halign: 'right', cellWidth: 32, textColor: [100, 116, 139] }
      },
      margin: { left: 14, right: 14 },
      foot: [[{ content: 'TOTAL SALES', styles: { fontStyle: 'bold' } }, { content: fmtCurrency(grossSales), styles: { halign: 'right', fontStyle: 'bold', textColor: [22, 163, 74] } }, { content: `${txCount} total`, styles: { halign: 'right', textColor: [100, 116, 139] } }]],
      footStyles: { fillColor: [241, 245, 249], fontStyle: 'bold', fontSize: 11 }
    });

    // ── Expenses Breakdown ──
    const afterSalesY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Expenses', 14, afterSalesY);
    doc.setDrawColor(200, 200, 200);
    doc.line(14, afterSalesY + 3, pageWidth - 14, afterSalesY + 3);

    const expenseRows: (string | number)[][] = [];
    filteredExpenses.forEach(e => {
      expenseRows.push([new Date(e.date).toLocaleDateString(), e.category, e.description, fmtCurrency(e.amount)]);
    });
    filteredSupplierTx.forEach(t => {
      expenseRows.push([new Date(t.date).toLocaleDateString(), 'Supplier Payment', t.supplierName + (t.reference ? ` — ${t.reference}` : ''), fmtCurrency(t.amount)]);
    });

    let afterExpensesY: number;
    if (expenseRows.length > 0) {
      autoTable(doc, {
        startY: afterSalesY + 7,
        head: [['Date', 'Category', 'Description', 'Amount']],
        body: expenseRows,
        theme: 'striped',
        styles: { fontSize: 9.5, cellPadding: 3 },
        headStyles: { fillColor: [127, 29, 29], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 36 },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 36, halign: 'right', fontStyle: 'bold' },
        },
        margin: { left: 14, right: 14 },
        foot: [[{ content: 'TOTAL EXPENSES', colSpan: 3, styles: { fontStyle: 'bold' } }, { content: fmtCurrency(totalExpenses), styles: { halign: 'right', fontStyle: 'bold' } }]],
        footStyles: { fillColor: [241, 245, 249], fontStyle: 'bold', fontSize: 11 },
      });
      afterExpensesY = (doc as any).lastAutoTable.finalY + 10;
    } else {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text('No expenses recorded for this period.', 14, afterSalesY + 12);
      afterExpensesY = afterSalesY + 22;
    }

    // ── Summary ──
    const afterBreakdownY = afterExpensesY;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Summary', 14, afterBreakdownY);
    doc.line(14, afterBreakdownY + 3, pageWidth - 14, afterBreakdownY + 3);

    const metricsData = [
      ['Total Sales', fmtCurrency(grossSales)],
      ['Less: Expenses', `- ${fmtCurrency(totalExpenses)}`],
      ['Net Sales', fmtCurrency(netSales)],
      ['', ''],
      ['Total Transactions', txCount.toString()],
      ['Total Items Sold', totalItemsSold.toString()],
      ['Average Bill Amount', fmtCurrency(avgBill)],
      ['Average Item Sale Amount', fmtCurrency(avgItemSale)],
    ];

    autoTable(doc, {
      startY: afterBreakdownY + 7,
      head: [],
      body: metricsData,
      theme: 'plain',
      styles: { fontSize: 11, cellPadding: 3 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 }, 1: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });

    // ── Top Performers ──
    const afterMetricsY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Top Performers', 14, afterMetricsY);
    doc.line(14, afterMetricsY + 3, pageWidth - 14, afterMetricsY + 3);

    const performersData = [
      ['Top Revenue Product', `${topPerformers.bestRev.name} (${fmtCurrency(topPerformers.bestRev.value)})`],
      ['Most Sold Product', `${topPerformers.bestQty.name} (${topPerformers.bestQty.value} units)`]
    ];

    autoTable(doc, {
      startY: afterMetricsY + 7,
      head: [],
      body: performersData,
      theme: 'plain',
      styles: { fontSize: 11, cellPadding: 3 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 } },
      margin: { left: 14, right: 14 },
    });

    // ── Transaction Ledger ──
    if (ledger.length > 0) {
      const afterPerfY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Transaction Ledger', 14, afterPerfY);
      doc.line(14, afterPerfY + 3, pageWidth - 14, afterPerfY + 3);

      const ledgerRows = ledger.map(item => [
        new Date(item.date).toLocaleDateString(),
        item.type === 'OUT' ? '-' + fmtCurrency(item.amount) : '+' + fmtCurrency(item.amount),
        item.category,
        item.desc,
      ]);

      autoTable(doc, {
        startY: afterPerfY + 7,
        head: [['Date', 'Amount', 'Category', 'Description']],
        body: ledgerRows,
        theme: 'striped',
        styles: { fontSize: 8.5, cellPadding: 2.5 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 34, halign: 'right' },
          2: { cellWidth: 30 },
          3: { cellWidth: 'auto' },
        },
        margin: { left: 14, right: 14 },
        didParseCell: data => {
          if (data.section === 'body' && data.column.index === 1) {
            const text = data.cell.raw as string;
            data.cell.styles.textColor = text.startsWith('-') ? [220, 38, 38] : [22, 163, 74];
          }
        }
      });
    }

    // ── Cashier Note ──
    if (note.trim()) {
      const afterLedgerY = (doc as any).lastAutoTable?.finalY ?? 200;
      const noteY = afterLedgerY + 12;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Notes', 14, noteY);
      doc.line(14, noteY + 3, pageWidth - 14, noteY + 3);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      const noteLines = doc.splitTextToSize(note.trim(), pageWidth - 28);
      doc.text(noteLines, 14, noteY + 9);
    }

    // ── Footer ──
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

    const filename = filterMode === 'daily'
      ? `day_end_report_${selectedDate}.pdf`
      : `day_end_report_${selectedMonth}.pdf`;
    const dataUri = doc.output('datauristring');
    const blob = doc.output('blob');
    setPreviewDataUri(dataUri);
    setPreviewBlob(blob);
    setPreviewFilename(filename);
  };

  // --- Preview State ---
  const [previewDataUri, setPreviewDataUri] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewFilename, setPreviewFilename] = useState('');

  const closePreview = useCallback(() => {
    setPreviewDataUri(null);
    setPreviewBlob(null);
    setPreviewFilename('');
  }, []);

  const downloadReport = useCallback(() => {
    if (!previewBlob) return;
    const url = URL.createObjectURL(previewBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = previewFilename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }, [previewBlob, previewFilename]);

  // --- Day End Report Modal State ---
  const [showDayEndModal, setShowDayEndModal] = useState(false);
  const [dayEndCashier, setDayEndCashier] = useState('');
  const [dayEndNote, setDayEndNote] = useState('');

  // --- Reusable Components ---
  const StatCard = ({ title, value, subtext, icon: Icon, colorClass, onClick }: any) => (
    <div 
      className={`bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex items-start gap-4 transition-all ${
        onClick ? 'hover:shadow-md hover:scale-[1.02] cursor-pointer active:scale-[0.98]' : 'hover:shadow-md'
      }`}
      onClick={onClick}
    >
      <div className={`p-3 rounded-lg ${colorClass} text-white`}>
        <Icon size={24} />
      </div>
      <div className="flex-1">
        <p className="text-slate-500 text-sm font-medium">{title}</p>
        <h3 className="text-2xl font-bold text-slate-900 mt-1">{value}</h3>
        {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
      </div>
      {onClick && <Eye size={16} className="text-slate-300 mt-1" />}
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
      <button onClick={() => setShowDayEndModal(true)}
        className="flex items-center gap-1.5 bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-900 transition-colors shadow-sm"
        title="Generate Day End Report (cash, card breakdown + ledger)">
        <ClipboardList size={14} /> Day End Report
      </button>
    </div>
  );

  // --- Edit Sale Handlers ---
  const handleEditSale = (sale: SalesRecord) => {
    setEditingSale(sale);
    setEditCart([...sale.items]);
    setEditDiscount(sale.discount);
    setEditCustomerId(sale.customerId);
  };

  const handleEditCartQuantity = (productId: string, quantity: number) => {
    setEditCart(prev => prev.map(item =>
      item.id === productId ? { ...item, quantity: Math.max(1, quantity) } : item
    ));
  };

  const handleRemoveEditCartItem = (productId: string) => {
    setEditCart(prev => prev.filter(item => item.id !== productId));
  };

  const handleUpdateSale = () => {
    if (!editingSale || editCart.length === 0) return;
    const updatedSale = updateSale(editingSale.id, editCart, editDiscount, editCustomerId);
    setLastEditedSale(updatedSale);
    setIsEditInvoiceOpen(true);
    setEditingSale(null);
    setEditCart([]);
    setEditDiscount(0);
    setEditCustomerId(undefined);
  };

  const handlePrintEditedSale = () => {
    if (window.electronAPI?.silentPrint) {
      window.electronAPI.silentPrint();
    } else {
      window.print();
    }
    setTimeout(() => setIsEditInvoiceOpen(false), 500);
  };

  const editCartSubtotal = editCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const editCartTotal = Math.max(0, editCartSubtotal - editDiscount);

  return (
    <div className="flex-1 bg-slate-50 p-6 md:p-8 overflow-y-auto">

      {/* DETAIL BREAKDOWN MODAL */}
      {detailModalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDetailModalType(null)}>
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[85vh] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${detailModalType === 'revenue' ? 'bg-emerald-50 text-emerald-600' : detailModalType === 'expenses' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                  {detailModalType === 'revenue' && <DollarSign size={18} />}
                  {detailModalType === 'expenses' && <CreditCard size={18} />}
                  {detailModalType === 'profit' && <Wallet size={18} />}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">
                    {detailModalType === 'revenue' && 'Revenue Breakdown'}
                    {detailModalType === 'expenses' && 'Expense Breakdown'}
                    {detailModalType === 'profit' && 'Net Profit Breakdown'}
                  </h3>
                  <p className="text-xs text-slate-400">{periodLabel}</p>
                </div>
              </div>
              <button onClick={() => setDetailModalType(null)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(85vh-120px)]">
              {detailModalType === 'revenue' && (
                <div>
                  <div className="bg-emerald-50 p-4 rounded-lg mb-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-600">Total Revenue</span>
                      <span className="text-2xl font-bold text-emerald-600">{fmtCurrency(revenue)}</span>
                    </div>
                  </div>
                  
                  {/* Sales */}
                  {filteredSales.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
                          <ShoppingBag size={14} />
                        </div>
                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                          Sales ({filteredSales.length})
                        </h4>
                      </div>
                      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                            <tr>
                              <th className="p-3">Invoice</th>
                              <th className="p-3">Date</th>
                              <th className="p-3">Customer</th>
                              <th className="p-3 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredSales.map(sale => (
                              <tr key={sale.id} className="hover:bg-slate-50">
                                <td className="p-3 font-medium text-slate-900">#{sale.invoiceNumber}</td>
                                <td className="p-3 text-slate-500 whitespace-nowrap text-xs">{new Date(sale.date).toLocaleDateString()}</td>
                                <td className="p-3 text-slate-600 text-xs">{sale.customerName || 'Walk-in Customer'}</td>
                                <td className="p-3 text-right font-bold text-emerald-600">+{fmtCurrency(sale.totalAmount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  
                  {/* Exchanges with positive difference */}
                  {filteredExchanges.filter(e => e.difference > 0).length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
                          <ArrowRightLeft size={14} />
                        </div>
                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                          Exchange Revenue ({filteredExchanges.filter(e => e.difference > 0).length})
                        </h4>
                      </div>
                      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                            <tr>
                              <th className="p-3">Exchange #</th>
                              <th className="p-3">Date</th>
                              <th className="p-3">Description</th>
                              <th className="p-3 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredExchanges.filter(e => e.difference > 0).map(ex => (
                              <tr key={ex.id} className="hover:bg-slate-50">
                                <td className="p-3 font-medium text-slate-900">{ex.exchangeNumber}</td>
                                <td className="p-3 text-slate-500 whitespace-nowrap text-xs">{new Date(ex.date).toLocaleDateString()}</td>
                                <td className="p-3 text-slate-600 text-xs">{ex.description || 'Product exchange'}</td>
                                <td className="p-3 text-right font-bold text-emerald-600">+{fmtCurrency(ex.difference)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  
                  {filteredSales.length === 0 && filteredExchanges.filter(e => e.difference > 0).length === 0 && (
                    <div className="p-12 text-center text-slate-400">
                      <DollarSign size={32} className="mx-auto mb-3 opacity-30" />
                      <p className="text-sm font-medium">No revenue transactions in this period</p>
                    </div>
                  )}
                </div>
              )}
              
              {detailModalType === 'expenses' && (
                <div>
                  <div className="bg-rose-50 p-4 rounded-lg mb-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-600">Total Expenses (COGS)</span>
                      <span className="text-2xl font-bold text-rose-600">{fmtCurrency(cost)}</span>
                    </div>
                  </div>
                  
                  {/* COGS from Sales */}
                  {filteredSales.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="p-1.5 bg-rose-50 rounded-lg text-rose-600">
                          <Package size={14} />
                        </div>
                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                          Cost of Goods Sold ({filteredSales.length} sales)
                        </h4>
                      </div>
                      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                            <tr>
                              <th className="p-3">Invoice</th>
                              <th className="p-3">Date</th>
                              <th className="p-3">Items</th>
                              <th className="p-3 text-right">Cost</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredSales.map(sale => (
                              <tr key={sale.id} className="hover:bg-slate-50">
                                <td className="p-3 font-medium text-slate-900">#{sale.invoiceNumber}</td>
                                <td className="p-3 text-slate-500 whitespace-nowrap text-xs">{new Date(sale.date).toLocaleDateString()}</td>
                                <td className="p-3 text-slate-600 text-xs">{sale.items.length} items</td>
                                <td className="p-3 text-right font-bold text-rose-600">-{fmtCurrency(sale.totalCost || 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  
                  {/* Operating Expenses */}
                  {filteredExpenses.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="p-1.5 bg-rose-50 rounded-lg text-rose-600">
                          <CreditCard size={14} />
                        </div>
                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                          Operating Expenses ({filteredExpenses.length})
                        </h4>
                      </div>
                      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                            <tr>
                              <th className="p-3">Description</th>
                              <th className="p-3">Date</th>
                              <th className="p-3">Category</th>
                              <th className="p-3 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredExpenses.map(expense => (
                              <tr key={expense.id} className="hover:bg-slate-50">
                                <td className="p-3 font-medium text-slate-900">{expense.description}</td>
                                <td className="p-3 text-slate-500 whitespace-nowrap text-xs">{new Date(expense.date).toLocaleDateString()}</td>
                                <td className="p-3">
                                  <span className="bg-slate-100 px-2 py-1 rounded text-xs font-medium text-slate-600">{expense.category}</span>
                                </td>
                                <td className="p-3 text-right font-bold text-rose-600">-{fmtCurrency(expense.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  
                  {/* Supplier Payments */}
                  {filteredSupplierTx.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="p-1.5 bg-rose-50 rounded-lg text-rose-600">
                          <TrendingDown size={14} />
                        </div>
                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                          Supplier Payments ({filteredSupplierTx.length})
                        </h4>
                      </div>
                      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                            <tr>
                              <th className="p-3">Supplier</th>
                              <th className="p-3">Date</th>
                              <th className="p-3">Reference</th>
                              <th className="p-3 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredSupplierTx.map(tx => (
                              <tr key={tx.id} className="hover:bg-slate-50">
                                <td className="p-3 font-medium text-slate-900">{tx.supplierName}</td>
                                <td className="p-3 text-slate-500 whitespace-nowrap text-xs">{new Date(tx.date).toLocaleDateString()}</td>
                                <td className="p-3 text-slate-600 text-xs">{tx.reference || 'Payment'}</td>
                                <td className="p-3 text-right font-bold text-rose-600">-{fmtCurrency(tx.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  
                  {filteredSales.length === 0 && filteredExpenses.length === 0 && filteredSupplierTx.length === 0 && (
                    <div className="p-12 text-center text-slate-400">
                      <CreditCard size={32} className="mx-auto mb-3 opacity-30" />
                      <p className="text-sm font-medium">No expenses in this period</p>
                    </div>
                  )}
                </div>
              )}
              
              {detailModalType === 'profit' && (
                <div>
                  <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
                    <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
                      <span className="text-sm font-medium text-slate-600">Total Revenue</span>
                      <span className="font-bold text-emerald-600">{fmtCurrency(revenue)}</span>
                    </div>
                    <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
                      <span className="text-sm font-medium text-slate-600">Total Expenses</span>
                      <span className="font-bold text-rose-600">-{fmtCurrency(cost)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">Net Profit</span>
                      <span className={`text-2xl font-bold ${profit >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                        {fmtCurrency(profit)}
                      </span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs text-slate-500">Profit Margin</span>
                      <span className="text-xs font-bold text-slate-700">
                        {revenue ? ((profit / revenue) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setDetailModalType('revenue')}
                      className="bg-white rounded-lg border border-slate-200 p-5 hover:shadow-md transition-shadow text-left group"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                          <DollarSign size={16} />
                        </div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Revenue Details</span>
                      </div>
                      <p className="text-xl font-bold text-emerald-600 mb-1">{fmtCurrency(revenue)}</p>
                      <p className="text-xs text-slate-500">{txCount} transactions</p>
                    </button>
                    
                    <button
                      onClick={() => setDetailModalType('expenses')}
                      className="bg-white rounded-lg border border-slate-200 p-5 hover:shadow-md transition-shadow text-left group"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <div className="p-2 bg-rose-50 rounded-lg text-rose-600">
                          <CreditCard size={16} />
                        </div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Expense Details</span>
                      </div>
                      <p className="text-xl font-bold text-rose-600 mb-1">{fmtCurrency(cost)}</p>
                      <p className="text-xs text-slate-500">Cost of goods sold</p>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* LOW STOCK MODAL */}
      {showLowStockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowLowStockModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[85vh] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                  <ShoppingBag size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Low Stock — Restock Needed</h3>
                  <p className="text-xs text-slate-400">{lowStockCount} product{lowStockCount !== 1 ? 's' : ''} at or below minimum stock level</p>
                </div>
              </div>
              <button onClick={() => setShowLowStockModal(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(85vh-88px)]">
              {lowStockProducts.length > 0 ? (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-xs sticky top-0">
                    <tr>
                      <th className="p-4">Product</th>
                      <th className="p-4">SKU</th>
                      <th className="p-4">Category</th>
                      <th className="p-4 text-center">Current Stock</th>
                      <th className="p-4 text-center">Min Level</th>
                      <th className="p-4 text-center">Shortage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lowStockProducts
                      .slice()
                      .sort((a, b) => {
                        const aStock = a.branchStock?.[currentBranch?.id ?? ''] ?? a.stock;
                        const bStock = b.branchStock?.[currentBranch?.id ?? ''] ?? b.stock;
                        return aStock - bStock;
                      })
                      .map(p => {
                        const currentStock = p.branchStock?.[currentBranch?.id ?? ''] ?? p.stock;
                        const shortage = Math.max(0, p.minStockLevel - currentStock);
                        const isOut = currentStock === 0;
                        return (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="p-4">
                              <div className="font-medium text-slate-900">{p.name}</div>
                              {p.color && <div className="text-xs text-slate-400">{p.color}{p.size ? ` · ${p.size}` : ''}</div>}
                            </td>
                            <td className="p-4 font-mono text-xs text-slate-500">{p.sku}</td>
                            <td className="p-4 text-slate-500">{p.category}</td>
                            <td className="p-4 text-center">
                              <span className={`inline-flex items-center justify-center w-10 h-7 rounded-full text-xs font-bold ${
                                isOut ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                                {currentStock}
                              </span>
                            </td>
                            <td className="p-4 text-center text-slate-500 text-xs">{p.minStockLevel}</td>
                            <td className="p-4 text-center">
                              <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold ${
                                isOut ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'
                              }`}>
                                {isOut ? 'Out of Stock' : `−${shortage} units`}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              ) : (
                <div className="p-12 text-center text-slate-400">
                  <ShoppingBag size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">All products are well stocked!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PDF PREVIEW MODAL */}
      {previewDataUri && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-[90vw] h-[90vh] max-w-5xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-800 rounded-lg text-white"><FileDown size={18} /></div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Report Preview</h3>
                  <p className="text-xs text-slate-400">{previewFilename}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={downloadReport}
                  className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm">
                  <Download size={16} /> Download PDF
                </button>
                <button onClick={closePreview}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>
            {/* PDF Embed */}
            <div className="flex-1 bg-slate-200 p-2">
              <iframe src={previewDataUri} title="Report Preview" className="w-full h-full rounded-lg border-0" />
            </div>
          </div>
        </div>
      )}
      {/* DAY END REPORT MODAL */}
      {showDayEndModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 flex items-center gap-3 bg-slate-800 border-b border-slate-700">
              <div className="p-2 rounded-lg bg-slate-700 text-white">
                <ClipboardList size={20} />
              </div>
              <div>
                <h3 className="font-bold text-white">Day End Report</h3>
                <p className="text-xs text-slate-400 mt-0.5">{periodLabel}</p>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  Cashier Name <span className="text-slate-400 font-normal">(printed at top)</span>
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900 text-sm"
                  placeholder="e.g. Aisha Fernando"
                  value={dayEndCashier}
                  onChange={e => setDayEndCashier(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  Notes <span className="text-slate-400 font-normal">(printed at bottom, optional)</span>
                </label>
                <textarea
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900 text-sm resize-none"
                  placeholder="e.g. All amounts verified. Cash drawer balanced."
                  rows={3}
                  value={dayEndNote}
                  onChange={e => setDayEndNote(e.target.value)}
                />
              </div>

              <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 space-y-1 border border-slate-200">
                <p className="font-bold text-slate-600">Report includes:</p>
                <p>• Cash sales &amp; card sales (broken down by Card / PayHere / MintPay / Online Transfer)</p>
                <p>• Expenses breakdown — Total Sales − Expenses = <strong className="text-blue-600">Net Sales</strong></p>
                <p>• Avg Bill Amount, Avg Item Sale Amount</p>
                <p>• Top Performers &amp; full Transaction Ledger</p>
              </div>
            </div>

            <div className="p-4 flex justify-end gap-3 border-t border-slate-100">
              <button
                onClick={() => { setShowDayEndModal(false); setDayEndCashier(''); setDayEndNote(''); }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  generateDayEndReport(dayEndCashier, dayEndNote);
                  setShowDayEndModal(false);
                  setDayEndCashier('');
                  setDayEndNote('');
                }}
                className="flex items-center gap-2 px-5 py-2 bg-slate-800 text-white text-sm font-bold rounded-lg hover:bg-slate-900 transition-colors shadow-sm"
              >
                <FileDown size={16} /> Generate Report
              </button>
            </div>
          </div>
        </div>
      )}

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
          <StatCard title="Revenue" value={fmtCurrency(revenue)} subtext={`${txCount} transactions`} icon={DollarSign} colorClass="bg-emerald-500" onClick={() => setDetailModalType('revenue')} />
          <StatCard title="Expenses (COGS)" value={fmtCurrency(cost)} subtext="Cost of Goods Sold" icon={CreditCard} colorClass="bg-rose-500" onClick={() => setDetailModalType('expenses')} />
          <StatCard title="Net Profit" value={fmtCurrency(profit)} subtext={`Margin: ${revenue ? ((profit / revenue) * 100).toFixed(1) : 0}%`} icon={Wallet} colorClass="bg-amber-500" onClick={() => setDetailModalType('profit')} />
          <StatCard title="Pending Actions" value={lowStockCount} subtext="Low stock alerts" icon={ShoppingBag} colorClass="bg-blue-500" onClick={() => setShowLowStockModal(true)} />
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
              <h3 className="font-bold text-slate-800">Revenue vs Profit — All Branches</h3>
              <p className="text-xs text-slate-400">
                {filterMode === 'daily' ? 'Last 7 days — per branch' : `Daily breakdown — per branch`}
              </p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  {branches.flatMap((br, i) => [
                    <linearGradient key={`rg-${br.id}`} id={`colorRev_${br.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={BRANCH_COLORS[i % BRANCH_COLORS.length]} stopOpacity={0.12} />
                      <stop offset="95%" stopColor={BRANCH_COLORS[i % BRANCH_COLORS.length]} stopOpacity={0} />
                    </linearGradient>,
                    <linearGradient key={`pg-${br.id}`} id={`colorProfit_${br.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={BRANCH_PROFIT_COLORS[i % BRANCH_PROFIT_COLORS.length]} stopOpacity={0.12} />
                      <stop offset="95%" stopColor={BRANCH_PROFIT_COLORS[i % BRANCH_PROFIT_COLORS.length]} stopOpacity={0} />
                    </linearGradient>
                  ])}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${CUR} ${value}`} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: '#f8fafc' }}
                  formatter={(value: number) => [fmtCurrency(value)]}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                {branches.flatMap((br, i) => [
                  <Area key={`rev-${br.id}`} type="monotone" dataKey={`rev_${br.id}`} stroke={BRANCH_COLORS[i % BRANCH_COLORS.length]} strokeWidth={2} fillOpacity={1} fill={`url(#colorRev_${br.id})`} name={`${br.name} Revenue`} />,
                  <Area key={`profit-${br.id}`} type="monotone" dataKey={`profit_${br.id}`} stroke={BRANCH_PROFIT_COLORS[i % BRANCH_PROFIT_COLORS.length]} strokeWidth={2} strokeDasharray="4 3" fillOpacity={1} fill={`url(#colorProfit_${br.id})`} name={`${br.name} Profit`} />
                ])}
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
                    <td className={`p-4 text-right font-bold ${item.type === 'IN' ? 'text-emerald-600' : item.type === 'TRANSFER' ? 'text-indigo-600' : 'text-rose-600'}`}>
                      {item.type === 'OUT' ? '-' : item.type === 'TRANSFER' ? '⇄ ' : '+'}{fmtCurrency(item.amount)}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${item.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : item.type === 'TRANSFER' ? 'bg-indigo-100 text-indigo-700' : 'bg-rose-100 text-rose-700'}`}>
                        {item.type === 'IN' ? 'Income' : item.type === 'TRANSFER' ? 'Transfer' : 'Expense'}
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

      {/* EDIT RECENT SALES */}
      {recentEditableSales.length > 0 && (
        <div className="mb-8">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg text-amber-600"><Edit2 size={18} /></div>
                <div>
                  <h3 className="font-bold text-slate-800">Edit Recent Sales</h3>
                  <p className="text-xs text-slate-400">Sales from the last 10 minutes can be edited</p>
                </div>
              </div>
              <span className="text-xs text-slate-400 font-medium bg-amber-50 px-3 py-1 rounded-full">{recentEditableSales.length} editable</span>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                <tr>
                  <th className="p-4">Invoice</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Items</th>
                  <th className="p-4 text-right">Amount</th>
                  <th className="p-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentEditableSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-slate-50">
                    <td className="p-4 font-medium text-slate-900">#{sale.invoiceNumber}</td>
                    <td className="p-4 text-slate-600">{sale.customerName || 'Walk-in'}</td>
                    <td className="p-4 text-slate-500">{sale.items.length} item(s)</td>
                    <td className="p-4 text-right font-bold text-slate-900">{fmtCurrency(sale.totalAmount)}</td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleEditSale(sale)}
                        className="inline-flex items-center gap-1.5 bg-amber-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-amber-600 transition-colors"
                      >
                        <Edit2 size={14} /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EDIT SALE MODAL */}
      {editingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-amber-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-full text-amber-600"><Edit2 size={20} /></div>
                <div>
                  <h3 className="font-bold text-slate-800">Edit Sale #{editingSale.invoiceNumber}</h3>
                  <p className="text-xs text-slate-500">Modify items and quantities</p>
                </div>
              </div>
              <button onClick={() => setEditingSale(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {editCart.map((item) => (
                <div key={item.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex-1">
                    <h4 className="font-bold text-slate-800">{item.name}</h4>
                    <p className="text-xs text-slate-500">{fmtCurrency(item.price)} each</p>
                    {(item.size || item.color) && (
                      <div className="flex gap-2 mt-1">
                        {item.size && <span className="text-xs bg-white px-2 py-0.5 rounded border border-slate-200">{item.size}</span>}
                        {item.color && <span className="text-xs bg-white px-2 py-0.5 rounded border border-slate-200">{item.color}</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEditCartQuantity(item.id, item.quantity - 1)}
                      className="p-1.5 bg-slate-200 hover:bg-slate-300 rounded-lg transition-colors"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="w-12 text-center font-bold text-slate-900">{item.quantity}</span>
                    <button
                      onClick={() => handleEditCartQuantity(item.id, item.quantity + 1)}
                      className="p-1.5 bg-slate-200 hover:bg-slate-300 rounded-lg transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="text-right min-w-[100px]">
                    <p className="font-bold text-slate-900">{fmtCurrency(item.price * item.quantity)}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveEditCartItem(item.id)}
                    className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}

              <div className="border-t border-slate-200 pt-4 space-y-3">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-bold">{fmtCurrency(editCartSubtotal)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">Discount</span>
                  <input
                    type="number"
                    value={editDiscount}
                    onChange={(e) => setEditDiscount(Math.max(0, Number(e.target.value)))}
                    className="w-32 px-3 py-1 border border-slate-300 rounded-lg text-right"
                  />
                </div>
                <div className="flex justify-between text-lg font-bold text-slate-900 pt-2 border-t border-slate-200">
                  <span>Total</span>
                  <span>{fmtCurrency(editCartTotal)}</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex gap-3 bg-white">
              <button
                onClick={() => setEditingSale(null)}
                className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateSale}
                disabled={editCart.length === 0}
                className="flex-1 py-3 bg-amber-500 text-white rounded-xl hover:bg-amber-600 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Update Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDITED SALE INVOICE */}
      {isEditInvoiceOpen && lastEditedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-700 flex justify-between items-center text-white">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="text-amber-400" size={24} />
                  <h2 className="text-xl font-bold">Sale Updated</h2>
                </div>
                <p className="text-slate-400 text-sm mt-1">Invoice #{lastEditedSale.invoiceNumber}</p>
              </div>
              <button onClick={() => setIsEditInvoiceOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 bg-slate-50 print:bg-white" id="edited-invoice-preview">
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">HOARD LAVISH</h1>
                <p className="text-slate-500 text-sm mt-1">Luxury Fashion Retail</p>
                <p className="text-amber-600 text-xs mt-2 font-bold">EDITED INVOICE</p>
                <p className="text-slate-400 text-xs mt-1">{new Date().toLocaleString()}</p>
                <p className="text-slate-400 text-xs mt-1 font-bold">{lastEditedSale.branchName}</p>
              </div>

              {lastEditedSale.customerName && (
                <div className="mb-6 pb-6 border-b border-dashed border-slate-200">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Customer</p>
                  <p className="font-bold text-slate-900">{lastEditedSale.customerName}</p>
                </div>
              )}

              <div className="space-y-3 mb-6">
                {lastEditedSale.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <div className="flex gap-2 flex-1">
                      <span className="font-bold text-slate-700">{item.quantity}x</span>
                      <div className="flex-1">
                        <span className="text-slate-600">{item.name}</span>
                        {(item.size || item.color) && (
                          <div className="flex gap-1 mt-0.5">
                            {item.size && <span className="text-xs text-slate-400">Size: {item.size}</span>}
                            {item.size && item.color && <span className="text-xs text-slate-400">•</span>}
                            {item.color && <span className="text-xs text-slate-400">Color: {item.color}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="font-medium text-slate-900 ml-2">{fmtCurrency(item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 pt-4 space-y-2">
                <div className="flex justify-between text-sm text-slate-500">
                  <span>Subtotal</span>
                  <span>{fmtCurrency(lastEditedSale.subtotal)}</span>
                </div>
                {lastEditedSale.discount > 0 && (
                  <div className="flex justify-between text-sm text-amber-600">
                    <span>Discount</span>
                    <span>-{fmtCurrency(lastEditedSale.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold text-slate-900 pt-2 border-t border-slate-200 mt-2">
                  <span>Total</span>
                  <span>{fmtCurrency(lastEditedSale.totalAmount)}</span>
                </div>
              </div>

              <div className="mt-8 text-center">
                <p className="text-[10px] text-slate-400">Thank you for shopping with us.</p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-white">
              <button
                onClick={handlePrintEditedSale}
                className="w-full flex items-center justify-center gap-2 bg-amber-500 text-white py-3 rounded-xl hover:bg-amber-600 transition-colors font-medium"
              >
                <Printer size={18} /> Print Updated Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;