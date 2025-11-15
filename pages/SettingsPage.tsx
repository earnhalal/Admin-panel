import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useToast } from '../contexts/ToastContext';

interface AppSettings {
  aiAutoPilotReferrals: boolean;
  aiAutoPilotTasks: boolean;
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
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { addToast } = useToast();

    useEffect(() => {
        const settingsRef = doc(db, 'settings', 'global');
        const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
            if (docSnap.exists()) {
                setSettings(docSnap.data() as AppSettings);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleSettingChange = async (key: keyof AppSettings, value: boolean) => {
        setSaving(true);
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings); // Optimistic update

        try {
            const settingsRef = doc(db, 'settings', 'global');
            await setDoc(settingsRef, newSettings, { merge: true });
            addToast('Settings updated successfully!', 'success');
        } catch (error) {
            console.error("Error updating settings:", error);
            addToast('Failed to update settings.', 'error');
            // Revert on error if needed
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="container mx-auto max-w-4xl">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">Settings</h1>
            
            <div className="bg-white dark:bg-slate-900 shadow-md rounded-lg p-6">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white border-b border-gray-200 dark:border-slate-800 pb-4 mb-6">AI Auto-Pilot</h2>

                {loading ? <p>Loading settings...</p> : (
                    <div className="space-y-6">
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
    );
};

export default SettingsPage;