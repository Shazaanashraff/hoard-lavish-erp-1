import type {
    OfflineQueueItem,
    SalesRecord,
    StockTransfer,
    ExchangeRecord,
    Branch,
    Product,
    AppSettings,
    StockMovement,
    Supplier,
    SupplierTransaction,
    DamagedGood,
} from '../../types';

export const STORAGE_KEYS = {
    OFFLINE_QUEUE: 'hoard_offline_queue_v1',
    APP_DATA: 'hoard_data_v2',
    STOCK_TRANSFERS: 'hoard_stock_transfers',
    EXCHANGE_HISTORY: 'hoard_exchange_history',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export interface LocalAppData {
    branches?: Branch[];
    salesHistory?: SalesRecord[];
    customers?: unknown[];
    products?: Product[];
    categories?: string[];
    brands?: string[];
    stockHistory?: StockMovement[];
    stockTransfers?: StockTransfer[];
    exchangeHistory?: ExchangeRecord[];
    suppliers?: Supplier[];
    supplierTransactions?: SupplierTransaction[];
    expenses?: unknown[];
    users?: unknown[];
    settings?: AppSettings;
    damagedGoods?: DamagedGood[];
}

export function getStorageItem<T>(key: StorageKey): T | null {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

export function setStorageItem<T>(key: StorageKey, value: T): void {
    localStorage.setItem(key, JSON.stringify(value));
}

export function removeStorageItem(key: StorageKey): void {
    localStorage.removeItem(key);
}

export const storage = {
    offlineQueue: {
        get: () => getStorageItem<OfflineQueueItem[]>(STORAGE_KEYS.OFFLINE_QUEUE),
        set: (value: OfflineQueueItem[]) => setStorageItem(STORAGE_KEYS.OFFLINE_QUEUE, value),
        remove: () => removeStorageItem(STORAGE_KEYS.OFFLINE_QUEUE),
    },
    appData: {
        get: () => getStorageItem<LocalAppData>(STORAGE_KEYS.APP_DATA),
        set: (value: LocalAppData) => setStorageItem(STORAGE_KEYS.APP_DATA, value),
        remove: () => removeStorageItem(STORAGE_KEYS.APP_DATA),
    },
    stockTransfers: {
        get: () => getStorageItem<StockTransfer[]>(STORAGE_KEYS.STOCK_TRANSFERS),
        set: (value: StockTransfer[]) => setStorageItem(STORAGE_KEYS.STOCK_TRANSFERS, value),
        remove: () => removeStorageItem(STORAGE_KEYS.STOCK_TRANSFERS),
    },
    exchangeHistory: {
        get: () => getStorageItem<ExchangeRecord[]>(STORAGE_KEYS.EXCHANGE_HISTORY),
        set: (value: ExchangeRecord[]) => setStorageItem(STORAGE_KEYS.EXCHANGE_HISTORY, value),
        remove: () => removeStorageItem(STORAGE_KEYS.EXCHANGE_HISTORY),
    },
};
