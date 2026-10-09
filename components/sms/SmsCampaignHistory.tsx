import React, { useEffect, useState } from 'react';
import { MessageSquare, ChevronDown, ChevronRight, RefreshCw, RotateCcw, Trash2, XCircle, Loader2 } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { SmsCampaign, SmsMessage, SmsCampaignStatus, SmsMessageStatus } from '../../types';
import { parseBusinessDate } from '../../utils/dateTime';
import { formatMsisdn } from '../../utils/sms';
import ConfirmDialog from '../shared/ConfirmDialog';

const CAMPAIGN_BADGE: Record<SmsCampaignStatus, string> = {
  QUEUED: 'bg-slate-100 text-slate-600',
  SENDING: 'bg-blue-50 text-blue-700',
  COMPLETED: 'bg-green-50 text-green-700',
  PARTIAL: 'bg-amber-50 text-amber-700',
  FAILED: 'bg-red-50 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const MESSAGE_BADGE: Record<SmsMessageStatus, string> = {
  QUEUED: 'bg-slate-100 text-slate-600',
  SENDING: 'bg-blue-50 text-blue-700',
  SENT: 'bg-green-50 text-green-700',
  FAILED: 'bg-red-50 text-red-700',
  SKIPPED: 'bg-slate-100 text-slate-500',
};

const SmsCampaignHistory: React.FC = () => {
  const {
    smsCampaigns, loadSmsCampaigns, refreshSmsCampaigns, loadSmsMessages,
    retrySmsCampaign, cancelSmsCampaign, deleteSmsCampaign, smsProgress, currentUser,
  } = useStore();

  const isAdmin = currentUser?.role === 'ADMIN';

  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Per-recipient rows are fetched only for the expanded campaign and kept
  // keyed by campaign id, so collapsing and re-expanding costs nothing.
  const [messages, setMessages] = useState<Record<string, SmsMessage[]>>({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<SmsCampaign | null>(null);

  useEffect(() => { void loadSmsCampaigns(); }, []);

  const toggle = async (campaign: SmsCampaign) => {
    if (expandedId === campaign.id) { setExpandedId(null); return; }
    setExpandedId(campaign.id);
    if (messages[campaign.id]) return;
    setLoadingMessages(true);
    try {
      const rows = await loadSmsMessages(campaign.id);
      setMessages(prev => ({ ...prev, [campaign.id]: rows }));
    } catch (err) {
      console.error('Failed to load SMS log', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Drop the cached logs too — the whole point of Refresh is to see
    // results that landed after the rows were first fetched.
    setMessages({});
    await refreshSmsCampaigns();
    setIsRefreshing(false);
  };

  const handleRetry = async (campaign: SmsCampaign) => {
    setBusyId(campaign.id);
    try {
      await retrySmsCampaign(campaign.id);
      const rows = await loadSmsMessages(campaign.id);
      setMessages(prev => ({ ...prev, [campaign.id]: rows }));
    } catch (err) {
      console.error('Failed to reload SMS log after retry', err);
    } finally {
      // Always clear: a throw here would otherwise leave the row's buttons
      // disabled until the screen is remounted.
      setBusyId(null);
    }
  };

  const handleCancel = async (campaign: SmsCampaign) => {
    setBusyId(campaign.id);
    await cancelSmsCampaign(campaign.id);
    setBusyId(null);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-slate-500">
          {smsCampaigns.length === 0 ? 'No campaigns sent yet.' : `${smsCampaigns.length} most recent campaigns.`}
        </p>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg flex items-center gap-2 hover:bg-slate-50 transition-colors text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="space-y-3">
        {smsCampaigns.map(campaign => {
          const isExpanded = expandedId === campaign.id;
          const isLive = smsProgress?.campaignId === campaign.id;
          const isBusy = busyId === campaign.id || isLive;
          const rows = messages[campaign.id] ?? [];

          return (
            <div key={campaign.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <button
                onClick={() => void toggle(campaign)}
                className="w-full text-left p-4 hover:bg-slate-50 transition-colors flex items-start gap-3"
              >
                {isExpanded ? <ChevronDown size={16} className="text-slate-400 mt-1 flex-shrink-0" /> : <ChevronRight size={16} className="text-slate-400 mt-1 flex-shrink-0" />}

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900 truncate">{campaign.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${CAMPAIGN_BADGE[campaign.status]}`}>
                      {isLive ? 'Sending' : campaign.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {parseBusinessDate(campaign.createdAt).toLocaleString()}
                    {campaign.createdByName ? ` · ${campaign.createdByName}` : ''}
                    {campaign.branchName ? ` · ${campaign.branchName}` : ''}
                    {' · from '}
                    <span className="font-mono">{campaign.senderId}</span>
                  </p>
                  <p className="text-sm text-slate-600 mt-1.5 line-clamp-2 break-words">{campaign.message}</p>
                </div>

                <div className="text-right flex-shrink-0 text-xs">
                  <p className="font-bold text-green-700">{campaign.sentCount} sent</p>
                  {campaign.failedCount > 0 && <p className="text-red-600">{campaign.failedCount} failed</p>}
                  {campaign.skippedCount > 0 && <p className="text-slate-400">{campaign.skippedCount} skipped</p>}
                  {campaign.totalCost > 0 && <p className="text-slate-400 mt-1">{campaign.totalCost} units</p>}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-slate-100">
                  {/* Actions. Cancel only makes sense while there is still
                      queued work; retry only once something has failed. */}
                  <div className="p-3 flex flex-wrap gap-2 bg-slate-50 border-b border-slate-100">
                    {(campaign.status === 'QUEUED' || campaign.status === 'SENDING') && (
                      <button
                        onClick={() => void handleCancel(campaign)}
                        disabled={isBusy}
                        className="px-3 py-1.5 border border-slate-200 bg-white text-slate-600 rounded-lg flex items-center gap-2 hover:bg-slate-100 text-xs font-medium disabled:opacity-50"
                      >
                        <XCircle size={13} /> Stop sending
                      </button>
                    )}
                    {campaign.failedCount > 0 && (
                      <button
                        onClick={() => void handleRetry(campaign)}
                        disabled={isBusy}
                        className="px-3 py-1.5 border border-slate-200 bg-white text-slate-700 rounded-lg flex items-center gap-2 hover:bg-slate-100 text-xs font-medium disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                        Retry {campaign.failedCount} failed
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => setDeleteConfirm(campaign)}
                        disabled={isBusy}
                        className="px-3 py-1.5 border border-red-100 bg-red-50 text-red-600 rounded-lg flex items-center gap-2 hover:bg-red-100 text-xs font-medium disabled:opacity-50"
                      >
                        <Trash2 size={13} /> Delete from history
                      </button>
                    )}
                  </div>

                  {loadingMessages && rows.length === 0 ? (
                    <p className="p-6 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Loading recipients…
                    </p>
                  ) : (
                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                      {rows.map(msg => (
                        <div key={msg.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 text-sm">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase self-start flex-shrink-0 ${MESSAGE_BADGE[msg.status]}`}>
                            {msg.status}
                          </span>
                          <span className="font-medium text-slate-800 sm:w-40 truncate">{msg.customerName || '(no name)'}</span>
                          <span className="text-xs text-slate-500 font-mono sm:w-36">
                            {/* A skipped row may hold an unusable raw number that
                                never became an msisdn — show what we have. */}
                            {msg.status === 'SKIPPED' && msg.rawPhone ? msg.rawPhone : formatMsisdn(msg.phone)}
                          </span>
                          <span className="text-xs text-slate-400 flex-1 min-w-0 break-words">
                            {msg.errorMessage || msg.providerStatus || ''}
                          </span>
                          {msg.attempts > 1 && (
                            <span className="text-[10px] text-slate-400 flex-shrink-0">{msg.attempts} attempts</span>
                          )}
                        </div>
                      ))}
                      {rows.length === 0 && (
                        <p className="p-6 text-center text-sm text-slate-400">No recipients recorded.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {smsCampaigns.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
            <MessageSquare size={28} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">Campaigns you send will be logged here, recipient by recipient.</p>
          </div>
        )}
      </div>

      {deleteConfirm && (
        <ConfirmDialog
          title="Delete campaign history"
          message={`Remove "${deleteConfirm.name}" and its ${deleteConfirm.sentCount + deleteConfirm.failedCount + deleteConfirm.skippedCount} recipient records? Messages already delivered are not affected.`}
          onConfirm={() => { void deleteSmsCampaign(deleteConfirm.id); setDeleteConfirm(null); }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
};

export default SmsCampaignHistory;
