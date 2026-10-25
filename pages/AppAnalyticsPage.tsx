import React, { useState, useEffect, useCallback } from 'react';
import { rtdb } from '../services/firebase';
import { ref as rtdbRef, query, orderByChild, startAt, get as rtdbGet } from 'firebase/database';
import { getAllUsersCached, invalidateUsersCache, type CachedUser } from '../services/usersCache';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';
import { Smartphone, RefreshCw, Info } from 'lucide-react';

// ================= App Analytics =================
// Usage records written by the Android app itself (v1.16+,
// services/appAnalytics.ts): every app open, every foreground session
// with its duration, and a 60-second "liveAt" heartbeat in RTDB.
// Aggregates are mirrored onto the Firestore user doc as `appUsage`,
// which is what this page reads (via the shared users cache).
//
// Honest limit, stated in the UI too: an app cannot detect its own
// uninstall, so users inactive for 30+ days are labelled "likely
// uninstalled" rather than counted as confirmed uninstalls.

interface AppUsage {
  firstAppOpenAt?: number;
  lastAppOpenAt?: number;
  appVersion?: string;
  opens?: number;
  sessions?: number;
  totalTimeSec?: number;
  lastSessionAt?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

function usageOf(u: CachedUser): AppUsage {
  return (u.appUsage || {}) as AppUsage;
}

function fmtDuration(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${sec}s`;
}

function fmtWhen(ms?: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const AppAnalyticsPage: React.FC = () => {
  const [users, setUsers] = useState<CachedUser[]>([]);
  const [online, setOnline] = useState<{ count: number; uids: Set<string> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { addToast } = useToast();

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      if (force) invalidateUsersCache();
      const all = await getAllUsersCached(force);
      setUsers(all);
      // Online now: RTDB heartbeat query (liveAt within the window).
      try {
        const snap = await rtdbGet(
          query(rtdbRef(rtdb, 'users'), orderByChild('liveAt'), startAt(Date.now() - ONLINE_WINDOW_MS)),
        );
        const uids = new Set<string>();
        snap.forEach((child) => { if (child.key) uids.add(child.key); });
        setOnline({ count: uids.size, uids });
      } catch (e) {
        console.warn('Online-now query failed:', e);
        setOnline(null);
      }
    } catch (e) {
      addToast('Failed to load app analytics.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const appUsers = users.filter((u) => usageOf(u).firstAppOpenAt);
  const installsToday = appUsers.filter((u) => (usageOf(u).firstAppOpenAt || 0) >= startOfToday.getTime()).length;
  const installs7d = appUsers.filter((u) => (usageOf(u).firstAppOpenAt || 0) >= now - 7 * DAY_MS).length;
  const activeToday = appUsers.filter((u) => (usageOf(u).lastAppOpenAt || 0) >= startOfToday.getTime()).length;
  const active7d = appUsers.filter((u) => (usageOf(u).lastAppOpenAt || 0) >= now - 7 * DAY_MS).length;
  const active30d = appUsers.filter((u) => (usageOf(u).lastAppOpenAt || 0) >= now - 30 * DAY_MS).length;
  const inactive30d = appUsers.filter((u) => (usageOf(u).lastAppOpenAt || 0) < now - 30 * DAY_MS).length;

  const totalOpens = appUsers.reduce((s, u) => s + (usageOf(u).opens || 0), 0);
  const totalSessions = appUsers.reduce((s, u) => s + (usageOf(u).sessions || 0), 0);
  const totalTimeSec = appUsers.reduce((s, u) => s + (usageOf(u).totalTimeSec || 0), 0);
  const avgSessionSec = totalSessions > 0 ? totalTimeSec / totalSessions : 0;

  const versionCounts = new Map<string, number>();
  for (const u of appUsers) {
    const v = usageOf(u).appVersion || '—';
    versionCounts.set(v, (versionCounts.get(v) || 0) + 1);
  }
  const versions = [...versionCounts.entries()].sort((a, b) => b[1] - a[1]);

  const rows = appUsers
    .filter((u) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return String(u.name || '').toLowerCase().includes(q) || String(u.email || '').toLowerCase().includes(q);
    })
    .sort((a, b) => (usageOf(b).totalTimeSec || 0) - (usageOf(a).totalTimeSec || 0))
    .slice(0, 100);

  const cardCls = 'bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-lg p-5';
  const statLabel = 'text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide';
  const statValue = 'text-2xl font-bold text-gray-800 dark:text-white mt-1';

  const statusOf = (u: CachedUser): { label: string; cls: string } => {
    if (online && online.uids.has(u.id)) return { label: 'Online now', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' };
    const last = usageOf(u).lastAppOpenAt || 0;
    if (last >= startOfToday.getTime()) return { label: 'Active today', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300' };
    if (last < now - 30 * DAY_MS) return { label: 'Inactive 30d+', cls: 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-300' };
    return { label: 'Active earlier', cls: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-300' };
  };

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
            <Smartphone size={20} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">App Analytics</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Installs, active users and time spent in the Android app — recorded by the app
              itself (v1.16+). Users appear here as their app updates and they open it.
            </p>
          </div>
        </div>
        <button onClick={() => void load(true)} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition disabled:opacity-50 shrink-0">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className={cardCls}>
          <p className={statLabel}>Online Now</p>
          <p className={statValue}>{online ? online.count : '—'}</p>
          <p className="text-xs text-gray-400 mt-1">App open in the last 2 minutes</p>
        </div>
        <div className={cardCls}>
          <p className={statLabel}>App Users (Installs)</p>
          <p className={statValue}>{appUsers.length}</p>
          <p className="text-xs text-gray-400 mt-1">+{installsToday} today · +{installs7d} this week</p>
        </div>
        <div className={cardCls}>
          <p className={statLabel}>Active Today</p>
          <p className={statValue}>{activeToday}</p>
          <p className="text-xs text-gray-400 mt-1">{active7d} in 7 days · {active30d} in 30 days</p>
        </div>
        <div className={cardCls}>
          <p className={statLabel}>Inactive 30d+ (likely uninstalled)</p>
          <p className={statValue}>{inactive30d}</p>
          <p className="text-xs text-gray-400 mt-1">Installed once, not seen for 30+ days</p>
        </div>
        <div className={cardCls}>
          <p className={statLabel}>Total App Opens</p>
          <p className={statValue}>{totalOpens.toLocaleString()}</p>
        </div>
        <div className={cardCls}>
          <p className={statLabel}>Total Sessions</p>
          <p className={statValue}>{totalSessions.toLocaleString()}</p>
        </div>
        <div className={cardCls}>
          <p className={statLabel}>Total Time in App</p>
          <p className={statValue}>{fmtDuration(totalTimeSec)}</p>
        </div>
        <div className={cardCls}>
          <p className={statLabel}>Avg. Session</p>
          <p className={statValue}>{fmtDuration(avgSessionSec)}</p>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-gray-400 dark:text-gray-500 mb-6">
        <Info size={14} className="shrink-0 mt-0.5" />
        <p>
          An app cannot detect its own uninstall, so there is no exact uninstall count anywhere —
          "Inactive 30d+" is the honest proxy (Google Play Console will show true uninstalls once
          the app is listed there). App versions in use:
          {versions.length ? ' ' + versions.map(([v, c]) => `v${v}: ${c}`).join(' · ') : ' none recorded yet'}.
        </p>
      </div>

      <div className={cardCls}>
        <div className="flex items-center justify-between gap-4 mb-4">
          <h3 className="text-gray-800 dark:text-white font-bold">Top Users by Time in App</h3>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email"
            className="bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-slate-800">
                <th className="py-2 pr-3 font-medium">User</th>
                <th className="py-2 pr-3 font-medium">Version</th>
                <th className="py-2 pr-3 font-medium">First Open</th>
                <th className="py-2 pr-3 font-medium">Last Active</th>
                <th className="py-2 pr-3 font-medium text-right">Opens</th>
                <th className="py-2 pr-3 font-medium text-right">Sessions</th>
                <th className="py-2 pr-3 font-medium text-right">Time in App</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const usage = usageOf(u);
                const st = statusOf(u);
                return (
                  <tr key={u.id} className="border-b border-gray-50 dark:border-slate-800/60">
                    <td className="py-2.5 pr-3">
                      <div className="font-medium text-gray-800 dark:text-white">{u.name || '—'}</div>
                      <div className="text-xs text-gray-400">{u.email || u.id}</div>
                    </td>
                    <td className="py-2.5 pr-3 text-gray-600 dark:text-gray-300">{usage.appVersion ? `v${usage.appVersion}` : '—'}</td>
                    <td className="py-2.5 pr-3 text-gray-600 dark:text-gray-300">{fmtWhen(usage.firstAppOpenAt)}</td>
                    <td className="py-2.5 pr-3 text-gray-600 dark:text-gray-300">{fmtWhen(usage.lastAppOpenAt)}</td>
                    <td className="py-2.5 pr-3 text-right text-gray-600 dark:text-gray-300">{usage.opens || 0}</td>
                    <td className="py-2.5 pr-3 text-right text-gray-600 dark:text-gray-300">{usage.sessions || 0}</td>
                    <td className="py-2.5 pr-3 text-right font-medium text-gray-800 dark:text-white">{fmtDuration(usage.totalTimeSec || 0)}</td>
                    <td className="py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-400">
                    No app usage recorded yet — users appear after they update to v1.16 and open the app.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AppAnalyticsPage;
