import React, { useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, orderBy, limit, setDoc } from 'firebase/firestore';
import { ref as rtdbRef, onValue } from 'firebase/database';
import { db, rtdb } from '../services/firebase';
import { useToast } from '../contexts/ToastContext';
import { AgentSettings, DEFAULT_AGENT_SETTINGS, runAgent } from '../services/agentEngine';
import Spinner from '../components/Spinner';
import { Bot, Play, CheckCircle2, XCircle, AlertTriangle, ShieldCheck } from 'lucide-react';

interface AgentLog {
  id: string;
  queue: string;
  targetId: string;
  userId?: string;
  action: string;
  reasons?: string[];
  amount?: number;
  timestamp?: any;
}

const Toggle: React.FC<{ label: string; desc: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }> =
  ({ label, desc, value, onChange, disabled }) => (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 dark:border-slate-800 last:border-0">
      <div>
        <p className="font-semibold text-gray-900 dark:text-white text-sm">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>
      </div>
      <button
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${value ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-slate-700'} ${disabled ? 'opacity-40' : ''}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${value ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );

const AiAgentPage: React.FC = () => {
  const { addToast } = useToast();
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_AGENT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [counts, setCounts] = useState({ deposit: 0, joining: 0, promotion: 0, partner: 0, withdrawal: 0 });
  const [lastRun, setLastRun] = useState<string>('');
  const runningRef = useRef(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'agent_settings', 'config'), (snap) => {
      if (snap.exists()) setSettings({ ...DEFAULT_AGENT_SETTINGS, ...(snap.data() as any) });
      setSettingsLoaded(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    const watch = (col: string, field: string | null, key: keyof typeof counts) => {
      const q = field
        ? query(collection(db, col))
        : query(collection(db, col));
      unsubs.push(onSnapshot(q, (snap) => {
        const n = snap.docs.filter(d => {
          const s = String((d.data() as any).status ?? '').toLowerCase();
          return field ? s === field : true;
        }).length;
        setCounts(prev => ({ ...prev, [key]: n }));
      }, () => {}));
    };
    watch('deposits', 'pending', 'deposit');
    watch('promotion_orders', 'pending', 'promotion');
    watch('partnerRequests', 'pending', 'partner');
    watch('withdrawals', 'pending', 'withdrawal');
    unsubs.push(onValue(rtdbRef(rtdb, 'pending_requests'), (snap) => {
      setCounts(prev => ({ ...prev, joining: snap.exists() ? Object.keys(snap.val() || {}).length : 0 }));
    }, () => {}));
    return () => unsubs.forEach(u => u());
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'agent_logs'), orderBy('timestamp', 'desc'), limit(60));
    const unsub = onSnapshot(q, (snap) => {
      setLogs(snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) } as AgentLog))
        .filter(l => l.queue !== 'run'));
    }, () => {});
    return () => unsub();
  }, []);

  const saveSettings = async (next: AgentSettings) => {
    setSettings(next);
    try {
      await setDoc(doc(db, 'agent_settings', 'config'), { ...next, updatedAt: new Date() }, { merge: true });
    } catch (e) {
      addToast('Failed to save agent settings.', 'error');
    }
  };

  const doRun = async (silent = false) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    try {
      const res = await runAgent(settings);
      setLastRun(new Date().toLocaleTimeString());
      if (!silent) {
        const esc = Object.values(res.escalated).reduce((a, b) => a + b, 0);
        addToast(`Agent run complete: ${res.actions.length} actions, ${esc} waiting for your review.`, 'success');
      }
    } catch (e: any) {
      if (!silent) addToast(`Agent run failed: ${e.message || 'unknown error'}`, 'error');
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  };

  // Auto-run while this page stays open and the agent is enabled.
  useEffect(() => {
    if (!settings.enabled || !settingsLoaded) return;
    doRun(true);
    const t = setInterval(() => doRun(true), 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.enabled, settingsLoaded]);

  const totalPending = counts.deposit + counts.joining + counts.promotion + counts.partner + counts.withdrawal;

  if (!settingsLoaded) return <div className="flex justify-center items-center min-h-[400px]"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
          <Bot className="text-emerald-500" size={26} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AI Agent</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Automatically verifies pending requests and approves or rejects them by clear safety rules.
            Anything uncertain stays in the queue for you.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Deposits', n: counts.deposit },
          { label: 'Joining', n: counts.joining },
          { label: 'Promotions', n: counts.promotion },
          { label: 'Partner', n: counts.partner },
          { label: 'Withdrawals', n: counts.withdrawal },
          { label: 'Total pending', n: totalPending }
        ].map(c => (
          <div key={c.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-4">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{c.n}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <ShieldCheck size={18} className="text-emerald-500" /> Agent controls
            </h2>
            <button
              onClick={() => doRun(false)}
              disabled={running}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl"
            >
              {running ? <Spinner /> : <Play size={16} />} Run now
            </button>
          </div>

          <Toggle
            label="Agent enabled"
            desc="While this page is open, the agent re-checks every queue every minute. Keep this tab open for continuous operation."
            value={settings.enabled}
            onChange={v => saveSettings({ ...settings, enabled: v })}
          />
          <Toggle
            label="Deposits"
            desc="Approves deposits with a unique transaction ID within the auto limit. Auto-rejects duplicates, missing transaction IDs and invalid amounts."
            value={settings.deposits}
            onChange={v => saveSettings({ ...settings, deposits: v })}
          />
          <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-slate-800">
            <div>
              <p className="font-semibold text-gray-900 dark:text-white text-sm">Max auto-approve amount</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Deposits above this stay for your manual review.</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-sm text-gray-500">Rs.</span>
              <input
                type="number"
                min={0}
                value={settings.maxAutoDeposit}
                onChange={e => saveSettings({ ...settings, maxAutoDeposit: Math.max(0, Number(e.target.value) || 0) })}
                className="w-24 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm text-gray-900 dark:text-white"
              />
            </div>
          </div>
          <Toggle
            label="Joining approvals"
            desc="Activates accounts whose activation payment is verified. Referred users stay manual so referral bonuses are paid by the full flow."
            value={settings.joining}
            onChange={v => saveSettings({ ...settings, joining: v })}
          />
          <Toggle
            label="Promotions"
            desc="Approves orders with a valid link (task is created and the platform commission is recorded). Invalid links are rejected with an automatic refund."
            value={settings.promotions}
            onChange={v => saveSettings({ ...settings, promotions: v })}
          />
          <Toggle
            label="Partner requests"
            desc="Approves requests with a unique transaction ID and unlocks partner in the app. Duplicates and missing IDs are rejected."
            value={settings.partner}
            onChange={v => saveSettings({ ...settings, partner: v })}
          />
          <Toggle
            label="Withdrawal guard"
            desc="The agent never sends payments or invents transaction references. It only rejects withdrawals with incomplete payout account details (with automatic refund); valid ones stay for your one-tap approval."
            value={settings.withdrawalsGuard}
            onChange={v => saveSettings({ ...settings, withdrawalsGuard: v })}
          />
          {lastRun && <p className="text-xs text-gray-400 mt-3">Last run: {lastRun}</p>}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-6">
          <h2 className="font-bold text-gray-900 dark:text-white mb-4">Agent activity</h2>
          {logs.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No agent actions yet. Enable the agent or press Run now.</p>
          ) : (
            <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
              {logs.map(l => (
                <div key={l.id} className="flex gap-3 p-3 rounded-xl bg-gray-50 dark:bg-slate-800/60">
                  {l.action === 'approved'
                    ? <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                    : l.action === 'rejected'
                      ? <XCircle size={18} className="text-rose-500 shrink-0 mt-0.5" />
                      : <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white capitalize">
                      {l.queue} — {l.action}
                      {typeof l.amount === 'number' ? <span className="text-gray-500 font-normal"> · Rs. {l.amount}</span> : null}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 break-words">
                      {(l.reasons || []).join(' · ') || l.targetId}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-4 flex gap-3">
        <AlertTriangle className="text-amber-500 shrink-0" size={20} />
        <p className="text-sm text-amber-800 dark:text-amber-200">
          Safety first: the agent only acts on clear, objective checks and records every action above.
          Deposits above your limit, referred joining requests, legacy promotions without price data,
          and all valid withdrawals always wait for a human.
        </p>
      </div>
    </div>
  );
};

export default AiAgentPage;
