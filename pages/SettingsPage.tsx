import React, { useState, useEffect } from 'react';
import { rtdb, db } from '../services/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref, onValue, set } from 'firebase/database';
import { useToast } from '../contexts/ToastContext';

interface AppSettings {
  aiAutoPilotReferrals: boolean;
  aiAutoPilotTasks: boolean;
  aiAutoPilotWithdrawals: boolean;
  // Revenue settings
  taskCommissionRate: number; // percentage
  depositFeeRate: number; // percentage
  withdrawalFeeRate: number; // percentage
  taskListingFee: number; // fixed amount
  // Spin settings
  spinCoins: number;
  spinDailyLimit: number;
}

const Toggle: React.FC<{ enabled: boolean; onChange: (enabled: boolean) => void; disabled?: boolean }> = ({ enabled, onChange, disabled }) => (
    <button
        type="button"
        className={`${enabled ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-slate-700'} relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 disabled:opacity-50`}
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        disabled={disabled}
    >
        <span className={`${enabled ? 'translate-x-6' : 'translate-x-1'} inline-block w-4 h-4 transform bg-white rounded-full transition-transform`} />
    </button>
);


// ================= User App Control (Firestore app_settings/global) =================
// These are the LIVE settings the TaskMint user app actually reads.
interface AppControl {
  paymentName: string;
  paymentNumber: string;
  whatsappNumber: string;
  activationFee: number;
  partnerFee: number;
  referralBonusBasic: number;
  referralBonusPartner: number;
  indirectReferralBonus: number;
  minWithdrawal: number;
  withdrawalFeeRate: number;
  manualWithdrawUnlock: boolean;
}

const APP_DEFAULTS: AppControl = {
  paymentName: 'M-WASEEM',
  paymentNumber: '03338739929',
  whatsappNumber: '923338739929',
  activationFee: 150,
  partnerFee: 1000,
  referralBonusBasic: 100,
  referralBonusPartner: 150,
  indirectReferralBonus: 10,
  minWithdrawal: 500,
  withdrawalFeeRate: 5,
  manualWithdrawUnlock: false,
};

const AppControlSettings: React.FC = () => {
  const [cfg, setCfg] = useState<AppControl>(APP_DEFAULTS);
  const [savingCfg, setSavingCfg] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'app_settings', 'global'), (snap) => {
      if (snap.exists()) {
        setCfg(prev => ({ ...prev, ...(snap.data() as Partial<AppControl>) }));
      }
    }, () => {
      addToast('Failed to load app control settings.', 'error');
    });
    return () => unsub();
  }, []);

  const num = (key: keyof AppControl) => ({
    value: cfg[key] as number,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setCfg(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 })),
  });
  const txt = (key: keyof AppControl) => ({
    value: cfg[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setCfg(prev => ({ ...prev, [key]: e.target.value })),
  });

  const save = async () => {
    setSavingCfg(true);
    try {
      await setDoc(doc(db, 'app_settings', 'global'), { ...cfg }, { merge: true });
      addToast('App settings saved — the user app will use them immediately.', 'success');
    } catch (e) {
      addToast('Failed to save app settings.', 'error');
    } finally {
      setSavingCfg(false);
    }
  };

  const inputCls = "w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const labelCls = "block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5";

  return (
    <div className="bg-white dark:bg-slate-900 shadow-md rounded-lg p-6 border-2 border-emerald-500/40">
      <div className="flex items-start justify-between border-b border-gray-200 dark:border-slate-800 pb-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white">App Control — User App Settings</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">These settings are read live by the TaskMint user app (payments, fees, bonuses).</p>
        </div>
        <button onClick={save} disabled={savingCfg} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition disabled:opacity-50 shrink-0">
          {savingCfg ? 'Saving...' : 'Save App Settings'}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div><label className={labelCls}>EasyPaisa Account Title</label><input className={inputCls} {...txt('paymentName')} /></div>
        <div><label className={labelCls}>EasyPaisa Account Number</label><input className={inputCls} {...txt('paymentNumber')} /></div>
        <div><label className={labelCls}>WhatsApp Number (country code, no +)</label><input className={inputCls} {...txt('whatsappNumber')} /></div>
        <div><label className={labelCls}>Joining / Activation Fee (Rs.)</label><input type="number" className={inputCls} {...num('activationFee')} /></div>
        <div><label className={labelCls}>Partner Fee (Rs.)</label><input type="number" className={inputCls} {...num('partnerFee')} /></div>
        <div><label className={labelCls}>Minimum Withdrawal (Rs.)</label><input type="number" className={inputCls} {...num('minWithdrawal')} /></div>
        <div><label className={labelCls}>Withdrawal Fee (%)</label><input type="number" className={inputCls} {...num('withdrawalFeeRate')} /></div>
        <div><label className={labelCls}>Referral Bonus — Basic (Rs.)</label><input type="number" className={inputCls} {...num('referralBonusBasic')} /></div>
        <div><label className={labelCls}>Referral Bonus — Partner (Rs.)</label><input type="number" className={inputCls} {...num('referralBonusPartner')} /></div>
        <div><label className={labelCls}>Indirect Referral Bonus (Rs.)</label><input type="number" className={inputCls} {...num('indirectReferralBonus')} /></div>
        <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Withdrawals Always Open (ignore payout windows)</span>
          <Toggle enabled={cfg.manualWithdrawUnlock} onChange={(v) => setCfg(prev => ({ ...prev, manualWithdrawUnlock: v }))} />
        </div>
      </div>
    </div>
  );
};

const SettingsPage: React.FC = () => {
    const [settings, setSettings] = useState<AppSettings>({
        aiAutoPilotReferrals: false,
        aiAutoPilotTasks: false,
        aiAutoPilotWithdrawals: false,
        taskCommissionRate: 10,
        depositFeeRate: 2,
        withdrawalFeeRate: 3,
        taskListingFee: 5,
        spinCoins: 10,
        spinDailyLimit: 5,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { addToast } = useToast();

    useEffect(() => {
        const settingsRef = ref(rtdb, 'settings');
        const unsubscribe = onValue(settingsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setSettings(prev => ({ ...prev, ...data }));
            }
            setLoading(false);
        }, () => setLoading(false));
        return () => unsubscribe();
    }, []);

    const handleSettingChange = async (key: keyof AppSettings, value: boolean | number) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
    };

    const handleSaveSettings = async () => {
        setSaving(true);
        try {
            const settingsRef = ref(rtdb, 'settings');
            await set(settingsRef, settings);
            addToast('Settings updated successfully!', 'success');
        } catch (error) {
            console.error("Error updating settings:", error);
            addToast('Failed to update settings.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const NumberInput: React.FC<{ label: string; value: number; onChange: (val: number) => void; isPercentage?: boolean }> = ({ label, value, onChange, isPercentage }) => (
         <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
            <div className="mt-1 relative rounded-md shadow-sm">
                <input
                    type="number"
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                    className="block w-full pr-12 sm:text-sm border-gray-300 rounded-md dark:bg-slate-800 dark:border-slate-700"
                    placeholder="0"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 sm:text-sm">{isPercentage ? '%' : 'Rs'}</span>
                </div>
            </div>
        </div>
    );


    return (
        <div className="container mx-auto max-w-4xl">
            <div className="flex justify-between items-center mb-6">
                 <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Settings</h1>
                 <button
                    onClick={handleSaveSettings}
                    disabled={saving || loading}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors duration-200 disabled:bg-indigo-400"
                >
                    {saving ? 'Saving...' : 'Save All Settings'}
                </button>
            </div>
            
            <div className="space-y-8">
                <AppControlSettings />
                <div className="bg-white dark:bg-slate-900 shadow-md rounded-lg p-6">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-white border-b border-gray-200 dark:border-slate-800 pb-4 mb-2">Revenue Configuration (Automation)</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Legacy automation settings stored in the Realtime Database. These drive AI autopilot features only — use App Control above for anything the user app shows.</p>
                     {loading ? <p>Loading settings...</p> : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <NumberInput label="Task Commission Rate" value={settings.taskCommissionRate} onChange={val => handleSettingChange('taskCommissionRate', val)} isPercentage />
                           <NumberInput label="Task Listing Fee" value={settings.taskListingFee} onChange={val => handleSettingChange('taskListingFee', val)} />
                           <NumberInput label="Deposit Fee Rate" value={settings.depositFeeRate} onChange={val => handleSettingChange('depositFeeRate', val)} isPercentage />
                           <NumberInput label="Withdrawal Fee Rate" value={settings.withdrawalFeeRate} onChange={val => handleSettingChange('withdrawalFeeRate', val)} isPercentage />
                        </div>
                     )}
                </div>

                <div className="bg-white dark:bg-slate-900 shadow-md rounded-lg p-6">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-white border-b border-gray-200 dark:border-slate-800 pb-4 mb-6">AI Auto-Pilot</h2>

                    {loading ? <p>Loading settings...</p> : (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-medium text-gray-900 dark:text-gray-100">Auto-Process Withdrawals</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">When enabled, AI will automatically reject suspicious withdrawals in the background.</p>
                                </div>
                                <Toggle
                                    enabled={settings.aiAutoPilotWithdrawals}
                                    onChange={(value) => handleSettingChange('aiAutoPilotWithdrawals', value)}
                                    disabled={saving}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-medium text-gray-900 dark:text-gray-100">Auto-Process Referral Bonuses</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">When enabled, AI will automatically approve/reject pending referral bonuses in the background.</p>
                                </div>
                                <Toggle
                                    enabled={settings.aiAutoPilotReferrals}
                                    onChange={(value) => handleSettingChange('aiAutoPilotReferrals', value)}
                                    disabled={saving}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-medium text-gray-900 dark:text-gray-100">Auto-Process Task Submissions</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">When enabled, AI will automatically approve pending task submissions based on policy.</p>
                                </div>
                                <Toggle
                                    enabled={settings.aiAutoPilotTasks}
                                    onChange={(value) => handleSettingChange('aiAutoPilotTasks', value)}
                                    disabled={saving}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;
