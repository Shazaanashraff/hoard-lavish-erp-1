import { useState, useCallback, useRef } from 'react';
import * as db from '../../services/supabaseService';

export type LoaderState<T> = {
  data: T;
  loading: boolean;
  loaded: boolean;
  load: () => Promise<void>;
};

export interface PeriodSaleSummary {
  id: string; invoiceNumber: string; date: string;
  branchId: string; totalAmount: number; totalCost: number;
  customerName?: string; items?: { quantity: number }[];
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
      return { dateFrom: selectedDate, dateTo: selectedDate };
    }
    const [year, month] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return {
      dateFrom: `${selectedMonth}-01`,
      dateTo: `${selectedMonth}-${String(lastDay).padStart(2, '0')}`,
    };
  }, [filterMode, selectedDate, selectedMonth]);

  const loadPeriodSales = useCallback(async () => {
    const key = getPeriodKey();
    if (periodCacheRef.current.has(key)) {
      setPeriodSalesData(periodCacheRef.current.get(key)!);
      setPeriodSalesLoaded(true);
      return;
    }
    setPeriodSalesLoading(true);
    try {
      const { dateFrom, dateTo } = getDateRange();
      const data = await db.fetchSalesSummary({ branchId, dateFrom, dateTo });
      periodCacheRef.current.set(key, data);
      setPeriodSalesData(data);
      setPeriodSalesLoaded(true);
    } finally {
      setPeriodSalesLoading(false);
    }
  }, [getPeriodKey, getDateRange, branchId]);

  const loadRecentWithItems = useCallback(async () => {
    if (recentCacheRef.current) {
      setRecentData(recentCacheRef.current);
      setRecentLoaded(true);
      return;
    }
    setRecentLoading(true);
    try {
      const data = await db.fetchSales({ branchId, limit: 20 });
      recentCacheRef.current = data;
      setRecentData(data);
      setRecentLoaded(true);
    } finally {
      setRecentLoading(false);
    }
  }, [branchId]);

  const loadChart = useCallback(async () => {
    const key = getPeriodKey();
    if (chartCacheRef.current.has(key)) {
      setChartData(chartCacheRef.current.get(key)!);
      setChartLoaded(true);
      return;
    }
    setChartLoading(true);
    try {
      const { dateFrom, dateTo } = getDateRange();
      const data = await db.fetchSalesSummary({ dateFrom, dateTo });
      chartCacheRef.current.set(key, data);
      setChartData(data);
      setChartLoaded(true);
    } finally {
      setChartLoading(false);
    }
  }, [getPeriodKey, getDateRange]);

  const loadTopPerformers = useCallback(async () => {
    const key = getPeriodKey();
    if (topCacheRef.current.has(key)) {
      setTopData(topCacheRef.current.get(key)!);
      setTopLoaded(true);
      return;
    }
    setTopLoading(true);
    try {
      const { dateFrom, dateTo } = getDateRange();
      const data = await db.fetchSales({ branchId, dateFrom, dateTo, limit: 100 });
      topCacheRef.current.set(key, data);
      setTopData(data);
      setTopLoaded(true);
    } finally {
      setTopLoading(false);
    }
  }, [getPeriodKey, getDateRange, branchId]);

  const loadDayReport = useCallback(async () => {
    const key = getPeriodKey();
    if (dayReportCacheRef.current.has(key)) {
      setDayReportData(dayReportCacheRef.current.get(key)!);
      setDayReportLoaded(true);
      return;
    }
    setDayReportLoading(true);
    try {
      const { dateFrom, dateTo } = getDateRange();
      const data = await db.fetchSales({ branchId, dateFrom, dateTo });
      dayReportCacheRef.current.set(key, data);
      setDayReportData(data);
      setDayReportLoaded(true);
    } finally {
      setDayReportLoading(false);
    }
  }, [getPeriodKey, getDateRange, branchId]);

  const invalidate = useCallback(() => {
    setPeriodSalesLoaded(false);
    setPeriodSalesData([]);
    setChartLoaded(false);
    setChartData([]);
    setTopLoaded(false);
    setTopData([]);
    setDayReportLoaded(false);
    setDayReportData([]);
    setRecentLoaded(false);
    setRecentData([]);
    // Clear caches for the new key
    periodCacheRef.current.clear();
    chartCacheRef.current.clear();
    topCacheRef.current.clear();
    dayReportCacheRef.current.clear();
    recentCacheRef.current = null;
  }, []);

  return {
    periodSales: { data: periodSalesData, loading: periodSalesLoading, loaded: periodSalesLoaded, load: loadPeriodSales },
    recentWithItems: { data: recentData, loading: recentLoading, loaded: recentLoaded, load: loadRecentWithItems },
    chart: { data: chartData, loading: chartLoading, loaded: chartLoaded, load: loadChart },
    topPerformers: { data: topData, loading: topLoading, loaded: topLoaded, load: loadTopPerformers },
    dayReport: { data: dayReportData, loading: dayReportLoading, loaded: dayReportLoaded, load: loadDayReport },
    invalidate,
  };
}
