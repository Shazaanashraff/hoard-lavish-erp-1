import React from 'react';
import { Cloud, CloudOff, RefreshCw, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';
import { useStore } from '../context/StoreContext';

const OfflineQueue: React.FC = () => {
  const {
    offlineQueue,
    isCloudConnected,
    lastSyncTime,
    syncOfflineQueue,
    retryOfflineItem,
    removeOfflineItem,
    setView,
  } = useStore();

  const [isSyncing, setIsSyncing] = React.useState(false);

  const pending = offlineQueue.filter(item => item.status === 'PENDING' || item.status === 'FAILED');

  const handleSyncAll = async () => {
    setIsSyncing(true);
    try {
      await syncOfflineQueue();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <main className="flex-1 overflow-auto bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Offline Sync Queue</h1>
            <p className="text-sm text-slate-500 mt-1">
              Operations done offline are listed here until cloud sync succeeds.
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs">
              {isCloudConnected ? <Cloud size={14} className="text-green-600" /> : <CloudOff size={14} className="text-red-500" />}
              <span className={isCloudConnected ? 'text-green-700' : 'text-red-600'}>
                {isCloudConnected ? 'Cloud connected' : 'Cloud offline'}
              </span>
              {lastSyncTime && <span className="text-slate-400">Last sync: {lastSyncTime.toLocaleString()}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView('DASHBOARD')}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-100"
            >
              Back
            </button>
            <button
              onClick={handleSyncAll}
              disabled={isSyncing || pending.length === 0}
              className="px-3 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'Syncing...' : `Sync Pending (${pending.length})`}
            </button>
          </div>
        </div>

        {pending.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
            <CheckCircle2 size={38} className="mx-auto text-green-600 mb-2" />
            <p className="font-semibold text-slate-800">No pending offline operations</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(item => (
              <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <AlertCircle size={15} className={item.status === 'FAILED' ? 'text-red-500' : 'text-amber-500'} />
                    <p className="text-sm font-semibold text-slate-900">{item.operation}</p>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">{item.status}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Queued: {new Date(item.createdAt).toLocaleString()}</p>
                  {item.errorMessage && <p className="text-xs text-red-600 mt-1">{item.errorMessage}</p>}
                  <p className="text-xs text-slate-500 mt-1">Retries: {item.retryCount}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void retryOfflineItem(item.id)}
                    className="px-3 py-1.5 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => removeOfflineItem(item.id)}
                    className="px-2 py-1.5 text-xs bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
                    title="Remove from queue"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
};

export default OfflineQueue;
