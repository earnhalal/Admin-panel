import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { UsersIcon } from '../components/icons/UsersIcon';
import { WithdrawalIcon } from '../components/icons/WithdrawalIcon';
import { TasksIcon } from '../components/icons/TasksIcon';
import { WalletIcon } from '../components/icons/WalletIcon';
import { SparklesIcon } from '../components/icons/SparklesIcon';
import { generateSmartReport } from '../services/aiService';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';
import BarChart from '../components/BarChart';
import RecentActivityFeed from '../components/RecentActivityFeed';
import { Link } from 'react-router-dom';
import { ArrowRightIcon } from '../components/icons/ArrowRightIcon';

const StatCard: React.FC<{ title: string; value: number | string | null; icon: React.ReactNode; loading: boolean }> = ({ title, value, icon, loading }) => (
  <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-lg flex items-center justify-between">
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

const QuickActionCard: React.FC<{ title: string; count: number | null; link: string; icon: React.ReactNode; loading: boolean }> = ({ title, count, link, icon, loading }) => (
    <Link to={link} className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-lg flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
        <div className="flex items-center gap-4">
             <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg">
                {icon}
            </div>
            <div>
                <p className="font-semibold text-gray-800 dark:text-white">{title}</p>
                 {loading ? (
                    <div className="w-16 h-4 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse mt-1"></div>
                 ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{count ?? 0} pending</p>
                 )}
            </div>
        </div>
        <ArrowRightIcon className="w-5 h-5 text-gray-400" />
    </Link>
);


const DashboardPage: React.FC = () => {
  const [userCount, setUserCount] = useState<number | null>(null);
  const [allUsers, setAllUsers] = useState<{ createdAt: Timestamp }[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<number | null>(null);
  const [pendingSubmissions, setPendingSubmissions] = useState<number | null>(null);
  const [pendingTaskRequests, setPendingTaskRequests] = useState<number | null>(null);
  const [totalBalance, setTotalBalance] = useState<number | null>(null);
  
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(true);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);
  const [loadingTaskRequests, setLoadingTaskRequests] = useState(true);
  const [loadingBalance, setLoadingBalance] = useState(true);

  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    const usersQuery = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      setUserCount(snapshot.size);
      const usersData = snapshot.docs.map(doc => doc.data() as { balance?: number, createdAt: Timestamp });
      const total = usersData.reduce((acc, user) => acc + (user.balance || 0), 0);
      setAllUsers(usersData);
      setTotalBalance(total);
      setLoadingUsers(false);
      setLoadingBalance(false);
    }, (error) => {
      console.error("Error fetching user data:", error);
      setLoadingUsers(false);
      setLoadingBalance(false);
    });

    // CRITICAL FIX: Changed 'pending' to 'Pending' to match database value
    const withdrawalsQuery = query(collection(db, 'withdrawal_requests'), where('status', '==', 'Pending'));
    const unsubscribeWithdrawals = onSnapshot(withdrawalsQuery, (snapshot) => {
      setPendingWithdrawals(snapshot.size);
      setLoadingWithdrawals(false);
    }, (error) => {
       console.error("Error fetching pending withdrawals:", error);
       setLoadingWithdrawals(false);
    });

    const submissionsQuery = query(collection(db, 'userTasks'), where('status', '==', 'submitted'));
    const unsubscribeSubmissions = onSnapshot(submissionsQuery, (snapshot) => {
      setPendingSubmissions(snapshot.size);
      setLoadingSubmissions(false);
    }, (error) => {
        console.error("Error fetching pending submissions:", error);
        setLoadingSubmissions(false);
    });

    const requestsQuery = query(collection(db, 'tasks'), where('status', '==', 'pending'));
    const unsubscribeRequests = onSnapshot(requestsQuery, (snapshot) => {
        setPendingTaskRequests(snapshot.size);
        setLoadingTaskRequests(false);
    }, (error) => {
        console.error("Error fetching pending task requests:", error);
        setLoadingTaskRequests(false);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeWithdrawals();
      unsubscribeSubmissions();
      unsubscribeRequests();
    };
  }, []);

  const chartData = useMemo(() => {
    const data: { [key: string]: number } = {};
    const labels: string[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      labels.push(label);
      data[label] = 0;
    }

    allUsers.forEach(user => {
      if (user.createdAt) {
        const joinDate = user.createdAt.toDate();
        const label = joinDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (data.hasOwnProperty(label)) {
          data[label]++;
        }
      }
    });

    return {
      labels,
      datasets: [{
        label: 'New Users',
        data: labels.map(label => data[label]),
      }]
    };
  }, [allUsers]);


  const handleGenerateReport = async () => {
    setIsReportLoading(true);
    setAiReport(null);
    try {
        const stats = {
            userCount,
            totalBalance,
            pendingWithdrawals,
            pendingSubmissions,
            pendingTaskRequests
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        <StatCard title="Total Users" value={userCount} icon={<UsersIcon className="w-6 h-6 text-indigo-500" />} loading={loadingUsers} />
        <StatCard title="User Balance" value={totalBalance !== null ? `Rs ${totalBalance.toFixed(2)}` : null} icon={<WalletIcon className="w-6 h-6 text-indigo-500" />} loading={loadingBalance} />
        <StatCard title="Pending Withdrawals" value={pendingWithdrawals} icon={<WithdrawalIcon className="w-6 h-6 text-indigo-500" />} loading={loadingWithdrawals} />
        <StatCard title="Pending Task Requests" value={pendingTaskRequests} icon={<TasksIcon className="w-6 h-6 text-indigo-500" />} loading={loadingTaskRequests} />
        <StatCard title="Pending Submissions" value={pendingSubmissions} icon={<TasksIcon className="w-6 h-6 text-indigo-500" />} loading={loadingSubmissions} />
      </div>

      <div className="mt-8">
        <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-200 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <QuickActionCard title="Manage Withdrawals" count={pendingWithdrawals} link="/withdrawals" icon={<WithdrawalIcon className="w-6 h-6 text-red-500" />} loading={loadingWithdrawals} />
            <QuickActionCard title="Manage Tasks" count={(pendingTaskRequests ?? 0) + (pendingSubmissions ?? 0)} link="/tasks" icon={<TasksIcon className="w-6 h-6 text-purple-500" />} loading={loadingTaskRequests || loadingSubmissions} />
            <QuickActionCard title="Manage Users" count={null} link="/users" icon={<UsersIcon className="w-6 h-6 text-sky-500" />} loading={false} />
        </div>
      </div>


       <div className="mt-8 grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-xl shadow-lg">
           <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-4">
             New User Sign-ups (Last 7 Days)
           </h2>
           <div className="h-80">
            <BarChart data={chartData} />
           </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-lg">
           <RecentActivityFeed />
        </div>
       </div>

       <div className="mt-8 bg-white dark:bg-slate-900 p-6 rounded-xl shadow-lg">
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
                  Click the button to get an AI-powered summary of your app's current performance.
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