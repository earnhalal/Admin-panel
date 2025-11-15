// FIX: Import useState and useEffect from React to resolve multiple "Cannot find name" errors.
import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { UsersIcon } from '../components/icons/UsersIcon';
import { WithdrawalIcon } from '../components/icons/WithdrawalIcon';
import { TasksIcon } from '../components/icons/TasksIcon';
import { WalletIcon } from '../components/icons/WalletIcon';
import { SparklesIcon } from '../components/icons/SparklesIcon';
import { generateSmartReport } from '../services/aiService';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';

const StatCard: React.FC<{ title: string; value: number | string | null; icon: React.ReactNode; loading: boolean }> = ({ title, value, icon, loading }) => (
  <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg flex items-center justify-between">
    <div>
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{title}</p>
      {loading ? (
        <div className="w-24 h-8 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse mt-1"></div>
      ) : (
        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
      )}
    </div>
    <div className="bg-indigo-100 dark:bg-indigo-900/50 p-3 rounded-full">
      {icon}
    </div>
  </div>
);


const DashboardPage: React.FC = () => {
  const [userCount, setUserCount] = useState<number | null>(null);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<number | null>(null);
  const [pendingSubmissions, setPendingSubmissions] = useState<number | null>(null);
  const [totalBalance, setTotalBalance] = useState<number | null>(null);
  const [totalWithdrawn, setTotalWithdrawn] = useState<number | null>(null);
  
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(true);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [loadingWithdrawn, setLoadingWithdrawn] = useState(true);

  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    // Listener for total users
    const usersQuery = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      setUserCount(snapshot.size);
      const total = snapshot.docs.reduce((acc, doc) => acc + (doc.data().balance || 0), 0);
      setTotalBalance(total);
      setLoadingUsers(false);
      setLoadingBalance(false);
    }, (error) => {
      console.error("Error fetching user data:", error);
      setLoadingUsers(false);
      setLoadingBalance(false);
    });

    // Listener for pending withdrawals
    const withdrawalsQuery = query(collection(db, 'withdrawalRequests'), where('status', '==', 'pending'));
    const unsubscribeWithdrawals = onSnapshot(withdrawalsQuery, (snapshot) => {
      setPendingWithdrawals(snapshot.size);
      setLoadingWithdrawals(false);
    }, (error) => {
       console.error("Error fetching pending withdrawals:", error);
       setLoadingWithdrawals(false);
    });

    // Listener for pending task submissions
    const submissionsQuery = query(collection(db, 'userTasks'), where('status', '==', 'submitted'));
    const unsubscribeSubmissions = onSnapshot(submissionsQuery, (snapshot) => {
      setPendingSubmissions(snapshot.size);
      setLoadingSubmissions(false);
    }, (error) => {
        console.error("Error fetching pending submissions:", error);
        setLoadingSubmissions(false);
    });
    
    // Listener for total withdrawn
    const withdrawnQuery = query(collection(db, 'withdrawalRequests'), where('status', '==', 'Approved'));
    const unsubscribeWithdrawn = onSnapshot(withdrawnQuery, (snapshot) => {
        const total = snapshot.docs.reduce((acc, doc) => acc + (doc.data().amount || 0), 0);
        setTotalWithdrawn(total);
        setLoadingWithdrawn(false);
    }, (error) => {
        console.error("Error fetching total withdrawn:", error);
        setLoadingWithdrawn(false);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeWithdrawals();
      unsubscribeSubmissions();
      unsubscribeWithdrawn();
    };
  }, []);

  const handleGenerateReport = async () => {
    setIsReportLoading(true);
    setAiReport(null);
    try {
        const stats = {
            userCount,
            totalBalance,
            totalWithdrawn,
            pendingWithdrawals,
            pendingSubmissions
        };
        const report = await generateSmartReport(stats);
        setAiReport(report);
        addToast("AI Smart Report generated successfully!", "success");
    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        addToast(message, 'error');
    } finally {
        setIsReportLoading(false);
    }
  };


  return (
    <div className="container mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">
        Admin Dashboard
      </h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard title="Total Users" value={userCount} icon={<UsersIcon className="w-6 h-6 text-indigo-500" />} loading={loadingUsers} />
        <StatCard title="Total User Balance" value={totalBalance !== null ? `Rs ${totalBalance.toFixed(2)}` : null} icon={<WalletIcon className="w-6 h-6 text-indigo-500" />} loading={loadingBalance} />
        <StatCard title="Total Withdrawn" value={totalWithdrawn !== null ? `Rs ${totalWithdrawn.toFixed(2)}` : null} icon={<WithdrawalIcon className="w-6 h-6 text-indigo-500" />} loading={loadingWithdrawn} />
        <StatCard title="Pending Withdrawals" value={pendingWithdrawals} icon={<WithdrawalIcon className="w-6 h-6 text-indigo-500" />} loading={loadingWithdrawals} />
        <StatCard title="Pending Task Submissions" value={pendingSubmissions} icon={<TasksIcon className="w-6 h-6 text-indigo-500" />} loading={loadingSubmissions} />
      </div>
       <div className="mt-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-2">
            <SparklesIcon className="w-6 h-6 text-purple-500" />
            AI Smart Report
        </h2>
        
        {isReportLoading ? (
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <Spinner /> Generating your report...
            </div>
        ) : aiReport ? (
             <div className="prose prose-sm dark:prose-invert max-w-none text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{aiReport}</div>
        ) : (
            <>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                Click the button to get an AI-powered summary of your app's current performance and actionable insights.
                </p>
                <button 
                    onClick={handleGenerateReport}
                    disabled={isReportLoading}
                    className="inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200 disabled:bg-purple-400"
                >
                    <SparklesIcon className="w-5 h-5" />
                    Generate Report
                </button>
            </>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;