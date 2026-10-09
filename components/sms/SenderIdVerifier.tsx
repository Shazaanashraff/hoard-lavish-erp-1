import React, { useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, Loader2, ShieldCheck, Send } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { SmsSenderVerification } from '../../types';
import { validateSenderId } from '../../utils/sms';
import ConfirmDialog from '../shared/ConfirmDialog';

interface SenderIdVerifierProps {
  /** The sender ID as currently typed in the Settings form (saved or not). */
  senderId: string;
}

/**
 * Settings → SMS: proves the sender ID is accepted by text.lk.
 *
 * text.lk has no "list my sender IDs" endpoint, so the only honest test is a
 * real send. This sends one message to a number the admin types, and the
 * Edge Function records the verdict — campaigns are refused server-side
 * (fn_create_sms_campaign) until the saved sender ID has such a record.
 * Because "verified" is looked up by the exact string, editing the ID makes
 * the badge fall back to "not verified" on its own.
 */
const SenderIdVerifier: React.FC<SenderIdVerifierProps> = ({ senderId }) => {
  const { getSmsSenderVerification, verifySmsSender } = useStore();

  const id = senderId.trim();
  const formatError = id ? validateSenderId(id) : null;

  // undefined = lookup in flight, null = not verified.
  const [verification, setVerification] = useState<SmsSenderVerification | null | undefined>(undefined);
  const [phone, setPhone] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; message: string } | null>(null);

  // Look the typed ID up, debounced so typing doesn't fire a query per key.
  useEffect(() => {
    setOutcome(null);
    if (!id || formatError) {
      setVerification(null);
      return;
    }
    setVerification(undefined);
    let cancelled = false;
    const timer = setTimeout(() => {
      getSmsSenderVerification(id).then(v => { if (!cancelled) setVerification(v); });
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
    // getSmsSenderVerification is recreated every render of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, formatError]);

  const canVerify = !!id && !formatError && phone.trim().length > 0 && !verifying;

  const runVerify = async () => {
    setConfirming(false);
    setVerifying(true);
    setOutcome(null);
    const result = await verifySmsSender(id, phone);
    setVerifying(false);
    if (result.error) {
      setOutcome({ ok: false, message: result.error });
      return;
    }
    setOutcome({
      ok: result.ok,
      message: result.message ?? (result.ok ? 'Sender ID accepted.' : 'text.lk rejected this sender ID.'),
    });
    if (result.ok) setVerification(await getSmsSenderVerification(id));
  };

  return (
    <div className="mt-3 space-y-3" data-testid="sender-id-verifier">
      {/* Status badge */}
      {!id ? null : formatError ? (
        <p className="flex items-start gap-2 text-sm text-red-700" data-testid="sender-status-invalid">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" /> {formatError}
        </p>
      ) : verification === undefined ? (
        <p className="flex items-center gap-2 text-sm text-slate-500" data-testid="sender-status-checking">
          <Loader2 size={16} className="animate-spin" /> Checking verification…
        </p>
      ) : verification ? (
        <p className="flex items-start gap-2 text-sm text-emerald-700" data-testid="sender-status-verified">
          <ShieldCheck size={16} className="flex-shrink-0 mt-0.5" />
          <span>
            <strong>Verified with text.lk</strong> on {new Date(verification.verifiedAt).toLocaleString()}
            {verification.phoneMasked ? ` (test sent to ${verification.phoneMasked})` : ''}
          </span>
        </p>
      ) : (
        <p className="flex items-start gap-2 text-sm text-amber-700" data-testid="sender-status-unverified">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <span>
            <strong>Not verified.</strong> Sending is blocked until text.lk has accepted a test message from this ID.
          </span>
        </p>
      )}

      {/* Verify form */}
      {!!id && !formatError && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
          <label className="block text-xs font-bold text-slate-600">
            Send a test message to (your own mobile)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="tel"
              inputMode="tel"
              placeholder="e.g. 0771234567"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="flex-1 p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-900 font-mono text-sm bg-white"
              data-testid="sender-verify-phone"
            />
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!canVerify}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              data-testid="sender-verify-button"
            >
              {verifying ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {verifying ? 'Sending…' : verification ? 'Re-verify' : 'Verify sender ID'}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Sends one real SMS (costs one text.lk credit). text.lk can't list approved sender IDs, so an actual
            send is the only reliable check. Save the sender ID afterwards — verification applies to this exact text.
          </p>
        </div>
      )}

      {outcome && (
        <p
          className={`flex items-start gap-2 text-sm rounded-lg p-3 border ${
            outcome.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
          }`}
          data-testid={outcome.ok ? 'sender-verify-success' : 'sender-verify-failure'}
        >
          {outcome.ok ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />}
          <span>{outcome.message}</span>
        </p>
      )}

      {confirming && (
        <ConfirmDialog
          title="Send a test SMS?"
          message={`One real message will be sent from "${id}" to ${phone.trim()} and will use one text.lk credit.`}
          confirmLabel="Send test"
          onConfirm={runVerify}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
};

export default SenderIdVerifier;
