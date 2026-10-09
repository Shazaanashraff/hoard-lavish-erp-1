import React, { useEffect, useMemo, useState } from 'react';
import { Send, Users, UserCheck, AlertTriangle, CheckCircle, Info, Eye, ChevronDown, ChevronRight, Loader2, FlaskConical } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { Customer } from '../../types';
import { buildRecipients, smsSegmentInfo, SMS_PLACEHOLDERS } from '../../utils/sms';
import ConfirmDialog from '../shared/ConfirmDialog';

interface SmsComposerProps {
  /** Every customer currently loaded — the "All customers" audience. */
  customers: Customer[];
  /** Ticked in the customer list; the default audience when non-empty. */
  selectedIds: string[];
}

const SmsComposer: React.FC<SmsComposerProps> = ({ customers, selectedIds }) => {
  const { settings, sendSmsCampaign, smsProgress, refreshSmsCampaigns, getSmsSenderVerification } = useStore();

  const [audience, setAudience] = useState<'ALL' | 'SELECTED'>(selectedIds.length > 0 ? 'SELECTED' : 'ALL');
  const [campaignName, setCampaignName] = useState('');
  const [message, setMessage] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; skipped: number; error?: string } | null>(null);

  const isConfigured = !!settings.smsEnabled && !!(settings.smsSenderId || '').trim();

  // Has text.lk accepted a test message from the saved sender ID?
  // undefined = still looking it up. The server enforces this in
  // fn_create_sms_campaign; this lookup only lets the screen say why Send is off.
  const senderId = (settings.smsSenderId || '').trim();
  const [verified, setVerified] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    if (!senderId) { setVerified(false); return; }
    let cancelled = false;
    setVerified(undefined);
    getSmsSenderVerification(senderId).then(v => { if (!cancelled) setVerified(!!v); });
    return () => { cancelled = true; };
    // getSmsSenderVerification is recreated every render of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [senderId]);
  const needsVerification = isConfigured && verified === false;

  const audienceCustomers = useMemo(
    () => (audience === 'ALL' ? customers : customers.filter(c => selectedIds.includes(c.id))),
    [audience, customers, selectedIds]
  );

  // Same function the send path uses, so this preview is the bill.
  const built = useMemo(
    () => buildRecipients(audienceCustomers, message, {
      storeName: settings.storeName,
      currencySymbol: settings.currencySymbol,
    }),
    [audienceCustomers, message, settings.storeName, settings.currencySymbol]
  );

  // Segment maths for the template itself — placeholders make each recipient's
  // body a different length, so the per-message figure is the longest one we
  // will actually send rather than the template's own length.
  const longestBody = useMemo(
    () => built.queued.reduce((longest, r) => (r.body.length > longest.length ? r.body : longest), ''),
    [built.queued]
  );
  const segmentInfo = smsSegmentInfo(longestBody || message);
  const previewBody = built.queued[0]?.body ?? '';

  const isSending = smsProgress !== null;
  const canSend = isConfigured && verified === true && message.trim().length > 0 && built.queued.length > 0 && !isSending;

  const insertPlaceholder = (token: string) => setMessage(prev => (prev ? `${prev}${token}` : token));

  const handleSend = async () => {
    setConfirming(false);
    setResult(null);
    const outcome = await sendSmsCampaign({
      name: campaignName,
      message,
      recipients: audienceCustomers,
      audience,
      dryRun,
    });
    setResult({
      sent: outcome.sent ?? 0,
      failed: outcome.failed ?? 0,
      skipped: outcome.skipped ?? 0,
      error: outcome.error,
    });
    if (outcome.campaignId) void refreshSmsCampaigns();
  };

  const progressPct = smsProgress && smsProgress.total > 0
    ? Math.round(((smsProgress.sent + smsProgress.failed) / smsProgress.total) * 100)
    : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">

      {/* Not-configured gate. Everything below stays visible and usable
          (drafting a message before the token is set up is reasonable) —
          only Send is blocked. */}
      {!isConfigured && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 min-w-0">
            <p className="font-bold">SMS is not set up yet</p>
            <p className="mt-1">
              {settings.smsEnabled
                ? 'No sender ID configured. An admin can add it in Settings → SMS.'
                : 'Ask an admin to enable SMS and set the sender ID in Settings → SMS.'}
              {' '}The text.lk API token is set once on the server — see <code className="font-mono text-xs">docs/sms-setup.md</code>.
            </p>
          </div>
        </div>
      )}

      {needsVerification && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3" data-testid="sender-unverified-banner">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 min-w-0">
            <p className="font-bold">Sender ID "{senderId}" is not verified</p>
            <p className="mt-1">
              Sending is blocked until text.lk has accepted a test message from this sender ID. An admin can do this in
              Settings → SMS → Verify sender ID. (Test runs are blocked too, since the check happens before any campaign is created.)
            </p>
          </div>
        </div>
      )}

      {/* Audience */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
        <h3 className="font-bold text-slate-800 mb-4">1. Who gets it</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => setAudience('SELECTED')}
            disabled={selectedIds.length === 0}
            className={`p-4 rounded-lg border text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              audience === 'SELECTED' ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
              <UserCheck size={16} /> Selected customers
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {selectedIds.length === 0 ? 'Tick customers in the list first' : `${selectedIds.length} ticked`}
            </p>
          </button>

          <button
            onClick={() => setAudience('ALL')}
            className={`p-4 rounded-lg border text-left transition-colors ${
              audience === 'ALL' ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
              <Users size={16} /> All customers
            </div>
            <p className="text-xs text-slate-500 mt-1">{customers.length} in the database</p>
          </button>
        </div>
      </div>

      {/* Message */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
        <h3 className="font-bold text-slate-800 mb-4">2. The message</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Campaign name <span className="text-slate-400 font-normal">(for your history — not sent)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Avurudu sale announcement"
              className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900"
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1 gap-2">
              <label className="block text-sm font-medium text-slate-700">Message text</label>
              <span className="text-xs text-slate-400">
                Sender: <span className="font-mono text-slate-600">{settings.smsSenderId || 'not set'}</span>
              </span>
            </div>
            <textarea
              rows={5}
              placeholder="Hi {first_name}, our new collection is in at {store}. Visit us this weekend!"
              className="w-full p-3 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900 resize-y font-normal text-sm"
              value={message}
              onChange={e => setMessage(e.target.value)}
            />

            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-xs text-slate-400">Insert:</span>
              {SMS_PLACEHOLDERS.map(p => (
                <button
                  key={p.token}
                  onClick={() => insertPlaceholder(p.token)}
                  title={p.label}
                  className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-xs hover:bg-slate-200 transition-colors"
                >
                  {p.token}
                </button>
              ))}
            </div>

            {/* Segment counter. The encoding note matters commercially: one
                Sinhala character or emoji drops capacity 160 → 70. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs">
              <span className="text-slate-500">
                {segmentInfo.length} / {segmentInfo.perSegment} characters
              </span>
              <span className={`font-medium ${segmentInfo.segments > 1 ? 'text-amber-600' : 'text-slate-600'}`}>
                {segmentInfo.segments} SMS per recipient
              </span>
              {segmentInfo.encoding === 'UNICODE' && (
                <span className="text-amber-600 flex items-center gap-1">
                  <Info size={12} /> Unicode text — only 70 characters per SMS
                </span>
              )}
            </div>
          </div>

          {previewBody && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5 mb-1.5">
                <Eye size={12} /> Preview — {built.queued[0].customer_name}
              </p>
              <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{previewBody}</p>
            </div>
          )}
        </div>
      </div>

      {/* Review + send */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
        <h3 className="font-bold text-slate-800 mb-4">3. Review and send</h3>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-green-50 border border-green-100">
            <p className="text-xs text-green-700 font-bold uppercase">Will send</p>
            <p className="text-2xl font-bold text-green-800">{built.queued.length}</p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <p className="text-xs text-slate-500 font-bold uppercase">Skipped</p>
            <p className="text-2xl font-bold text-slate-700">{built.skipped.length}</p>
          </div>
          <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100">
            <p className="text-xs text-indigo-700 font-bold uppercase">SMS units</p>
            <p className="text-2xl font-bold text-indigo-800">{built.segments}</p>
          </div>
        </div>

        {built.skipped.length > 0 && (
          <div className="mb-4 border border-slate-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setShowSkipped(v => !v)}
              className="w-full flex items-center gap-2 p-3 text-left text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              {showSkipped ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Why {built.skipped.length} {built.skipped.length === 1 ? 'customer is' : 'customers are'} being skipped
            </button>
            {showSkipped && (
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border-t border-slate-200">
                {built.skipped.map((s, i) => (
                  <div key={`${s.customer_id}-${i}`} className="p-3 text-sm flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                    <span className="font-medium text-slate-800 sm:w-48 truncate">{s.customer_name || '(no name)'}</span>
                    <span className="text-xs text-slate-400 font-mono sm:w-32">{s.raw_phone || '—'}</span>
                    <span className="text-xs text-amber-700 min-w-0 break-words">{s.error_message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dry run sends nothing to the gateway but exercises the whole path,
            so a new sender ID / template can be rehearsed for free. */}
        <label className="flex items-start gap-2.5 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={e => setDryRun(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
          />
          <span className="text-sm text-slate-600">
            <span className="font-medium text-slate-800 flex items-center gap-1.5"><FlaskConical size={13} /> Test run</span>
            Record the campaign without contacting the gateway — nothing is delivered and nothing is charged.
          </span>
        </label>

        {isSending && smsProgress && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-slate-600 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Sending…
              </span>
              <span className="font-medium text-slate-800">
                {smsProgress.sent + smsProgress.failed} / {smsProgress.total}
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-slate-900 transition-all duration-300" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              {smsProgress.sent} sent{smsProgress.failed > 0 ? ` · ${smsProgress.failed} failed` : ''} · {smsProgress.remaining} to go
            </p>
          </div>
        )}

        {result && (
          <div className={`mb-4 p-3 rounded-lg border flex items-start gap-3 text-sm ${
            result.error ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'
          }`}>
            {result.error ? <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> : <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />}
            <div className="min-w-0">
              <p className="font-bold">
                {result.error ? 'Campaign stopped early' : dryRun ? 'Test run finished' : 'Campaign finished'}
              </p>
              <p className="mt-0.5">
                {result.sent} sent · {result.failed} failed · {result.skipped} skipped
              </p>
              {result.error && <p className="mt-1 break-words">{result.error}</p>}
              {!result.error && result.failed > 0 && (
                <p className="mt-1">Open the History tab to see which numbers failed, and retry just those.</p>
              )}
            </div>
          </div>
        )}

        <button
          onClick={() => setConfirming(true)}
          disabled={!canSend}
          className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 text-white rounded-lg flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send size={16} />
          {isSending
            ? 'Sending…'
            : dryRun
              ? `Test run to ${built.queued.length}`
              : `Send to ${built.queued.length} customer${built.queued.length === 1 ? '' : 's'}`}
        </button>

        {!canSend && !isSending && isConfigured && (
          <p className="text-xs text-slate-400 mt-2">
            {message.trim().length === 0 ? 'Write a message first.' : 'No customers in this selection have a usable mobile number.'}
          </p>
        )}
      </div>

      {confirming && (
        <ConfirmDialog
          title={dryRun ? 'Start test run?' : 'Send this SMS?'}
          message={
            dryRun
              ? `This records a campaign for ${built.queued.length} recipient${built.queued.length === 1 ? '' : 's'} without contacting the gateway. Nothing is delivered or charged.`
              : `${built.queued.length} customer${built.queued.length === 1 ? '' : 's'} will receive this message from "${settings.smsSenderId}", costing about ${built.segments} SMS unit${built.segments === 1 ? '' : 's'}. This cannot be undone once a message leaves the gateway.`
          }
          confirmLabel={dryRun ? 'Start test run' : 'Send now'}
          onConfirm={handleSend}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
};

export default SmsComposer;
