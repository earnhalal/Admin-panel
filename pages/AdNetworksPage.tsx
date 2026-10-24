import React, { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';
import { MonitorPlay, Info } from 'lucide-react';

// ================= Ad Networks (Firestore app_settings/ads) =================
// Panel-driven configuration for the ad networks built into the user app.
// The app reads this document live, so Game ID / placement / reward changes
// apply without an app update. The Unity SDK itself ships inside the app
// (v1.2+); this page only carries its configuration.
interface UnityAdsConfig {
  unityEnabled: boolean;
  unityGameId: string;
  unityRewardedPlacementId: string;
  unityInterstitialPlacementId: string;
  unityTestMode: boolean;
  unityRewardAmount: number; // Rs. per completed rewarded view
  unityDailyLimit: number; // rewarded views per user per day; 0 = unlimited
}

const UNITY_DEFAULTS: UnityAdsConfig = {
  unityEnabled: false,
  unityGameId: '',
  unityRewardedPlacementId: '',
  unityInterstitialPlacementId: '',
  unityTestMode: true,
  unityRewardAmount: 1,
  unityDailyLimit: 0,
};

const Toggle: React.FC<{ enabled: boolean; onChange: (enabled: boolean) => void; disabled?: boolean }> = ({ enabled, onChange, disabled }) => (
  <button
    type="button"
    className={`${enabled ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-slate-700'} relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 disabled:opacity-50 shrink-0`}
    role="switch"
    aria-checked={enabled}
    onClick={() => onChange(!enabled)}
    disabled={disabled}
  >
    <span className={`${enabled ? 'translate-x-6' : 'translate-x-1'} inline-block w-4 h-4 transform bg-white rounded-full transition-transform`} />
  </button>
);

const AdNetworksPage: React.FC = () => {
  const [cfg, setCfg] = useState<UnityAdsConfig>(UNITY_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'app_settings', 'ads'), (snap) => {
      if (snap.exists()) {
        setCfg(prev => ({ ...prev, ...(snap.data() as Partial<UnityAdsConfig>) }));
      }
      setLoading(false);
    }, () => {
      addToast('Failed to load ad network settings.', 'error');
      setLoading(false);
    });
    return () => unsub();
  }, [addToast]);

  const num = (key: 'unityRewardAmount' | 'unityDailyLimit') => ({
    value: cfg[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setCfg(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 })),
  });
  const txt = (key: 'unityGameId' | 'unityRewardedPlacementId' | 'unityInterstitialPlacementId') => ({
    value: cfg[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setCfg(prev => ({ ...prev, [key]: e.target.value })),
  });

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'app_settings', 'ads'), {
        unityEnabled: cfg.unityEnabled,
        unityGameId: cfg.unityGameId.trim(),
        unityRewardedPlacementId: cfg.unityRewardedPlacementId.trim(),
        unityInterstitialPlacementId: cfg.unityInterstitialPlacementId.trim(),
        unityTestMode: cfg.unityTestMode,
        unityRewardAmount: cfg.unityRewardAmount,
        unityDailyLimit: cfg.unityDailyLimit,
      }, { merge: true });
      addToast('Ad network settings saved — the app will use them automatically.', 'success');
    } catch (e) {
      addToast('Failed to save ad network settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const labelCls = "block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5";
  const helpCls = "text-xs text-gray-400 dark:text-gray-500 mt-1.5";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page intro */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Ad Networks</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-3xl">
          Control in-app ad networks without an app update. The Unity SDK is built into the app;
          here you set its IDs and rewards.
        </p>
      </div>

      {/* Unity Ads card */}
      <div className="bg-white dark:bg-slate-900 shadow-md rounded-lg p-6 border border-gray-200 dark:border-slate-800">
        <div className="flex items-start justify-between border-b border-gray-200 dark:border-slate-800 pb-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
              <MonitorPlay size={20} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Unity Ads</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Rewarded and interstitial ads from Unity. Fill in the Game ID from your Unity
                Dashboard project, then switch Unity Ads on.
              </p>
            </div>
          </div>
          <button onClick={save} disabled={saving} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition disabled:opacity-50 shrink-0">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Enable Unity Ads</span>
            <Toggle enabled={cfg.unityEnabled} onChange={(v) => setCfg(prev => ({ ...prev, unityEnabled: v }))} />
          </div>
          <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2">
            <div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Test Mode</span>
              <p className="text-xs text-gray-400 dark:text-gray-500">On = Unity test ads. Turn OFF for live revenue.</p>
            </div>
            <Toggle enabled={cfg.unityTestMode} onChange={(v) => setCfg(prev => ({ ...prev, unityTestMode: v }))} />
          </div>
          <div>
            <label className={labelCls}>Game ID</label>
            <input className={inputCls} placeholder="From Unity Dashboard → your project → Game ID" {...txt('unityGameId')} />
            <p className={helpCls}>The Android Game ID of your Unity Ads project.</p>
          </div>
          <div>
            <label className={labelCls}>Rewarded Placement ID</label>
            <input className={inputCls} placeholder="Rewarded_Android" {...txt('unityRewardedPlacementId')} />
            <p className={helpCls}>Defaults to &quot;Rewarded_Android&quot; if left empty.</p>
          </div>
          <div>
            <label className={labelCls}>Interstitial Placement ID</label>
            <input className={inputCls} placeholder="Interstitial_Android" {...txt('unityInterstitialPlacementId')} />
            <p className={helpCls}>Optional — reserved for future use.</p>
          </div>
          <div>
            <label className={labelCls}>Reward per Completed View (Rs.)</label>
            <input type="number" min="0" step="0.1" className={inputCls} {...num('unityRewardAmount')} />
            <p className={helpCls}>Amount credited to the user for each fully watched rewarded ad.</p>
          </div>
          <div>
            <label className={labelCls}>Daily Limit per User</label>
            <input type="number" min="0" step="1" className={inputCls} {...num('unityDailyLimit')} />
            <p className={helpCls}>Maximum rewarded ads one user can earn from per day. 0 = unlimited.</p>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-lg p-5 flex gap-3">
        <Info size={18} className="text-indigo-600 dark:text-indigo-300 shrink-0 mt-0.5" />
        <div className="text-sm text-indigo-900 dark:text-indigo-100">
          <p className="font-semibold mb-1">How it works</p>
          <ul className="list-disc pl-5 space-y-1 text-indigo-800 dark:text-indigo-200/90">
            <li>Changes saved here apply to the app automatically — users do not need an update for Game ID, placement or reward changes.</li>
            <li>The Unity SDK itself ships inside the app (v1.2 and above). Older app versions simply do not show Unity ads.</li>
            <li>Keep Test Mode on while testing. Only turn it off once the Game ID is live in your Unity Dashboard, otherwise no real ads will fill.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AdNetworksPage;
