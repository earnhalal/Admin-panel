import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
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

const SettingsPage: React.FC = () => {
    const [settings, setSettings] = useState<AppSettings>({
        aiAutoPilotReferrals: false,
        aiAutoPilotTasks: false,
        aiAutoPilotWithdrawals: false,
        taskCommissionRate: 10,
        depositFeeRate: 2,
        withdrawalFeeRate: 3,
        taskListingFee: 5,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { addToast } = useToast();

    useEffect(() => {
        const settingsRef = doc(db, 'settings', 'global');
        const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
            if (docSnap.exists()) {
                setSettings(prev => ({ ...prev, ...docSnap.data() }));
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleSettingChange = async (key: keyof AppSettings, value: boolean | number) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
    };

    const handleSaveSettings = async () => {
        setSaving(true);
        try {
            const settingsRef = doc(db, 'settings', 'global');
            await setDoc(settingsRef, settings, { merge: true });
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
                <div className="bg-white dark:bg-slate-900 shadow-md rounded-lg p-6">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-white border-b border-gray-200 dark:border-slate-800 pb-4 mb-6">Revenue Configuration</h2>
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