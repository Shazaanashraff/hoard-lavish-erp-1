import { useState, useCallback, useRef, useEffect } from 'react';
import * as db from '../../services/supabaseService';

export type LoaderState<T> = {
  data: T;
  loading: boolean;
  loaded: boolean;
  load: () => Promise<T>;
  reload: () => Promise<T>;
};

export interface PeriodSaleSummary {
  id: string; invoiceNumber: string; date: string;
  branchId: string; totalAmount: number; totalCost: number;
  customerName?: string; items?: { quantity: number }[];
  paymentMethod?: string; cashAmount?: number; cardAmount?: number;
}

export interface DashboardSalesLoaders {
  periodSales: LoaderState<PeriodSaleSummary[]>;
  recentWithItems: LoaderState<any[]>;  // full SalesRecord[]
  chart: LoaderState<any[]>;
  topPerformers: LoaderState<any[]>;
  dayReport: LoaderState<any[]>;
  invalidate: () => void;
}

export function useDashboardSales(params: {
  filterMode: 'daily' | 'monthly';
  selectedDate: string;
  selectedMonth: string;
  branchId: string;
}): DashboardSalesLoaders {
  const { filterMode, selectedDate, selectedMonth, branchId } = params;

  const [periodSalesData, setPeriodSalesData] = useState<PeriodSaleSummary[]>([]);
  const [periodSalesLoading, setPeriodSalesLoading] = useState(false);
  const [periodSalesLoaded, setPeriodSalesLoaded] = useState(false);

  const [recentData, setRecentData] = useState<any[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentLoaded, setRecentLoaded] = useState(false);

  const [chartData, setChartData] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartLoaded, setChartLoaded] = useState(false);

  const [topData, setTopData] = useState<any[]>([]);
  const [topLoading, setTopLoading] = useState(false);
  const [topLoaded, setTopLoaded] = useState(false);

  const [dayReportData, setDayReportData] = useState<any[]>([]);
  const [dayReportLoading, setDayReportLoading] = useState(false);
  const [dayReportLoaded, setDayReportLoaded] = useState(false);

  const periodCacheRef = useRef(new Map<string, PeriodSaleSummary[]>());
  const recentCacheRef = useRef<any[] | null>(null);
  const chartCacheRef = useRef(new Map<string, any[]>());
  const topCacheRef = useRef(new Map<string, any[]>());
  const dayReportCacheRef = useRef(new Map<string, any[]>());

  const getPeriodKey = useCallback(() => {
    const period = filterMode === 'daily' ? selectedDate : selectedMonth;
    return `${filterMode}:${period}:${branchId}`;
  }, [filterMode, selectedDate, selectedMonth, branchId]);

  const getDateRange = useCallback(() => {
    if (filterMode === 'daily') {
      return { dateFrom: selectedDate, dateTo: selectedDate + 'T23:59:59.999' };
    }
    const [year, month] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return {
      dateFrom: `${selectedMonth}-01`,
      dateTo: `${selectedMonth}-${String(lastDay).padStart(2, '0')}T23:59:59.999`,
    };
  }, [filterMode, selectedDate, selectedMonth]);

  const loadPeriodSales = useCallback(async (): Promise<PeriodSaleSummary[]> => {
    const key = getPeriodKey();
    if (periodCacheRef.current.has(key)) {
      const cached = periodCacheRef.current.get(key)!;
      setPeriodSalesData(cached);
      setPeriodSalesLoaded(true);
      return cached;
    }
    setPeriodSalesLoading(true);
    try {
      const { dateFrom, dateTo } = getDateRange();
      const data = await db.fetchSalesSummary({ branchId, dateFrom, dateTo });
      periodCacheRef.current.set(key, data);
      setPeriodSalesData(data);
      setPeriodSalesLoaded(true);
      return data;
    } finally {
      setPeriodSalesLoading(false);
    }
  }, [getPeriodKey, getDateRange, branchId]);

  const reloadPeriodSales = useCallback(async (): Promise<PeriodSaleSummary[]> => {
    periodCacheRef.current.delete(getPeriodKey());
    setPeriodSalesLoaded(false);
    return loadPeriodSales();
  }, [getPeriodKey, loadPeriodSales]);

  const loadRecentWithItems = useCallback(async (): Promise<any[]> => {
    if (recentCacheRef.current) {
      setRecentData(recentCacheRef.current);
      setRecentLoaded(true);
      return recentCacheRef.current;
    }
    setRecentLoading(true);
    try {
      const data = await db.fetchSales({ branchId, limit: 20 });
      recentCacheRef.current = data;
      setRecentData(data);
      setRecentLoaded(true);
      return data;
    } finally {
      setRecentLoading(false);
    }
  }, [branchId]);

  const reloadRecentWithItems = useCallback(async (): Promise<any[]> => {
    recentCacheRef.current = null;
    setRecentLoaded(false);
    return loadRecentWithItems();
  }, [loadRecentWithItems]);

  const getChartDateRange = useCallback(() => {
    if (filterMode === 'daily') {
      // Chart shows last 7 days ending at selectedDate
      const end = new Date(selectedDate + 'T00:00:00');
      const start = new Date(end);
      start.setDate(end.getDate() - 6);
      return {
        dateFrom: start.toISOString().split('T')[0],
        dateTo: selectedDate + 'T23:59:59.999',
      };
    }
    return getDateRange();
  }, [filterMode, selectedDate, getDateRange]);

  const loadChart = useCallback(async (): Promise<any[]> => {
    const key = getPeriodKey();
    if (chartCacheRef.current.has(key)) {
      const cached = chartCacheRef.current.get(key)!;
      setChartData(cached);
      setChartLoaded(true);
      return cached;
    }
    setChartLoading(true);
    try {
      const { dateFrom, dateTo } = getChartDateRange();
      const data = await db.fetchSalesSummary({ dateFrom, dateTo });
      chartCacheRef.current.set(key, data);
      setChartData(data);
      setChartLoaded(true);
      return data;
    } finally {
      setChartLoading(false);
    }
  }, [getPeriodKey, getChartDateRange]);

  const reloadChart = useCallback(async (): Promise<any[]> => {
    chartCacheRef.current.delete(getPeriodKey());
    setChartLoaded(false);
    return loadChart();
  }, [getPeriodKey, loadChart]);

  const loadTopPerformers = useCallback(async (): Promise<any[]> => {
    const key = getPeriodKey();
    if (topCacheRef.current.has(key)) {
      const cached = topCacheRef.current.get(key)!;
      setTopData(cached);
      setTopLoaded(true);
      return cached;
    }
    setTopLoading(true);
    try {
      const { dateFrom, dateTo } = getDateRange();
      const data = await db.fetchSalesForTopPerformers({ branchId, dateFrom, dateTo });
      topCacheRef.current.set(key, data);
      setTopData(data);
      setTopLoaded(true);
      return data;
    } finally {
      setTopLoading(false);
    }
  }, [getPeriodKey, getDateRange, branchId]);

  const reloadTopPerformers = useCallback(async (): Promise<any[]> => {
    topCacheRef.current.delete(getPeriodKey());
    setTopLoaded(false);
    return loadTopPerformers();
  }, [getPeriodKey, loadTopPerformers]);

  const loadDayReport = useCallback(async (): Promise<any[]> => {
    const key = getPeriodKey();
    if (dayReportCacheRef.current.has(key)) {
      const cached = dayReportCacheRef.current.get(key)!;
      setDayReportData(cached);
      setDayReportLoaded(true);
      return cached;
    }
    setDayReportLoading(true);
    try {
      const { dateFrom, dateTo } = getDateRange();
      const data = await db.fetchSalesSummary({ branchId, dateFrom, dateTo, extended: true });
      dayReportCacheRef.current.set(key, data);
      setDayReportData(data);
      setDayReportLoaded(true);
      return data;
    } finally {
      setDayReportLoading(false);
    }
  }, [getPeriodKey, getDateRange, branchId]);

  const reloadDayReport = useCallback(async (): Promise<any[]> => {
    dayReportCacheRef.current.delete(getPeriodKey());
    setDayReportLoaded(false);
    return loadDayReport();
  }, [getPeriodKey, loadDayReport]);

  const invalidate = useCallback(() => {
    setPeriodSalesLoaded(false);
    setPeriodSalesData([]);
    setChartLoaded(false);
    setChartData([]);
    setTopLoaded(false);
    setTopData([]);
    setDayReportLoaded(false);
    setDayReportData([]);
    // Clear period-sensitive caches only; recentWithItems is always "today" and not date-filter sensitive
    periodCacheRef.current.clear();
    chartCacheRef.current.clear();
    topCacheRef.current.clear();
    dayReportCacheRef.current.clear();
  }, []);

  // Auto-load each loader on mount and whenever its fetch params change
  useEffect(() => { void loadPeriodSales(); }, [loadPeriodSales]);
  useEffect(() => { void loadChart(); }, [loadChart]);
  useEffect(() => { void loadTopPerformers(); }, [loadTopPerformers]);
  useEffect(() => { void loadRecentWithItems(); }, [loadRecentWithItems]);

  return {
    periodSales: { data: periodSalesData, loading: periodSalesLoading, loaded: periodSalesLoaded, load: loadPeriodSales, reload: reloadPeriodSales },
    recentWithItems: { data: recentData, loading: recentLoading, loaded: recentLoaded, load: loadRecentWithItems, reload: reloadRecentWithItems },
    chart: { data: chartData, loading: chartLoading, loaded: chartLoaded, load: loadChart, reload: reloadChart },
    topPerformers: { data: topData, loading: topLoading, loaded: topLoaded, load: loadTopPerformers, reload: reloadTopPerformers },
    dayReport: { data: dayReportData, loading: dayReportLoading, loaded: dayReportLoaded, load: loadDayReport, reload: reloadDayReport },
    invalidate,
  };
}
