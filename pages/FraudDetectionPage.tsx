import React, { useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useToast } from '../contexts/ToastContext';
import { runFraudDetection, SuspiciousUser } from '../services/aiService';
import { User } from './UsersPage';
import { ShieldIcon } from '../components/icons/ShieldIcon';
import Spinner from '../components/Spinner';

const FraudDetectionPage: React.FC = () => {
    const { addToast } = useToast();
    const [isScanning, setIsScanning] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [results, setResults] = useState<SuspiciousUser[]>([]);

    const handleRunScan = async () => {
        setIsScanning(true);
        setLogs(['▶️ Starting AI fraud detection scan...']);
        setResults([]);

        try {
            setLogs(prev => [...prev, '🔍 Fetching all user data from the database...']);
            const usersSnapshot = await getDocs(collection(db, 'users'));
            const allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));

            if (allUsers.length === 0) {
                setLogs(prev => [...prev, '✅ No users found to scan.']);
                setIsScanning(false);
                return;
            }

            setLogs(prev => [...prev, `👍 Fetched ${allUsers.length} total users.`]);
            setLogs(prev => [...prev, '🤖 Sending data to AI for analysis. This may take a moment...']);
            
            const suspiciousUsers = await runFraudDetection(allUsers);
            
            setResults(suspiciousUsers);

            if (suspiciousUsers.length > 0) {
                setLogs(prev => [...prev, `🚨 AI analysis complete. Found ${suspiciousUsers.length} suspicious user(s).`]);
                addToast(`Fraud scan complete. ${suspiciousUsers.length} suspicious users found.`, 'warning');
            } else {
                setLogs(prev => [...prev, `✅ AI analysis complete. No suspicious activity detected.`]);
                addToast("Fraud scan complete. Everything looks clear!", 'success');
            }

            setLogs(prev => [...prev, '🏁 Scan finished.']);

        } catch (error) {
            const message = error instanceof Error ? error.message : "An unknown error occurred.";
            console.error("Error during fraud detection scan: ", error);
            addToast(message, 'error');
            setLogs(prev => [...prev, `[FATAL ERROR] ${message}`]);
        } finally {
            setIsScanning(false);
        }
    };

    return (
        <div className="container mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">AI Fraud Detection</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-8">
                Use AI to scan all users for patterns of suspicious activity, such as multiple accounts created in a short time.
            </p>

            <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl p-6">
                <div className="flex items-start gap-4">
                    <div className="bg-red-100 dark:bg-red-900/50 p-3 rounded-lg">
                        <ShieldIcon className="w-6 h-6 text-red-500" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white">User Activity Scan</h2>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">
                            This process will analyze your entire user base. It's recommended to run this periodically.
                        </p>
                    </div>
                </div>
                <div className="mt-6">
                    <button
                        onClick={handleRunScan}
                        disabled={isScanning}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors duration-200 disabled:bg-red-400 disabled:cursor-wait"
                    >
                        {isScanning ? <><Spinner /> Scanning...</> : 'Run Full Scan'}
                    </button>
                </div>
                {logs.length > 0 && (
                    <div className="mt-4">
                        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">Live Logs</h3>
                        <div className="bg-gray-100 dark:bg-gray-900 rounded-lg p-4 max-h-60 overflow-y-auto">
                            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">{logs.join('\n')}</pre>
                        </div>
                    </div>
                )}
                 {results.length > 0 && (
                    <div className="mt-6">
                        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">Suspicious Users Found</h3>
                        <div className="overflow-x-auto">
                            <table className="min-w-full leading-normal">
                                <thead>
                                    <tr>
                                        <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">User Email</th>
                                        <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Reason for Flag</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((user) => (
                                        <tr key={user.userId}>
                                            <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                                                <p className="text-gray-900 dark:text-white whitespace-no-wrap">{user.email}</p>
                                            </td>
                                            <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                                                <p className="text-gray-900 dark:text-white whitespace-no-wrap">{user.reason}</p>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                 )}
            </div>
        </div>
    );
};

export default FraudDetectionPage;