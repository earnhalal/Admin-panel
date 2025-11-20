import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { generateSmartReport } from '../services/aiService';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';
import BarChart from '../components/BarChart';
import RecentActivityFeed from '../components/RecentActivityFeed';
import { Link } from 'react-router-dom';
import { 
  Users, 
  ArrowUpRight, 
  ArrowDownLeft, 
  CheckSquare, 
  Wallet, 
  Sparkles, 
  ChevronRight, 
  TrendingUp
} from 'lucide-react';

const StatCard: React.FC<{ title: string; value: number | string | null; icon: React.ReactNode; loading: boolean; trend?: string }> = ({ title, value, icon, loading, trend }) => (
  <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 hover:shadow-md transition-shadow duration-300">
    <div className="flex items-start justify-between mb-4">
       <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-600 dark:text-emerald-400">
          {icon}
       </div>
       {trend && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-full">{trend}</span>}
    </div>
    <div>
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400 tracking-wide">{title}</p>
      {loading ? (
        <div className="w-24 h-8 bg-gray-100 dark:bg-slate-800 rounded-md animate-pulse mt-2"></div>
      ) : (
        <p className="text-3xl font-extrabold text-gray-900 dark:text-white mt-1 tracking-tight">{value}</p>
      )}
    </div>
  </div>
);

const QuickActionCard: React.FC<{ title: string; count: number | null; link: string; icon: React.ReactNode; loading: boolean; colorClass: string }> = ({ title, count, link, icon, loading, colorClass }) => (
    <Link to={link} className="group relative bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 hover:border-emerald-500/30 hover:shadow-emerald-500/10 transition-all duration-300">
        <div className="flex items-center justify-between">
             <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${colorClass} bg-opacity-10`}>
                    {React.cloneElement(icon as React.ReactElement, { className: `w-6 h-6 ${colorClass.replace('bg-', 'text-')}` })}
                </div>
                <div>
                    <p className="font-bold text-gray-800 dark:text-white group-hover:text-emerald-600 transition-colors">{title}</p>
                     {loading ? (
                        <div className="w-16 h-4 bg-gray-100 dark:bg-slate-800 rounded-md animate-pulse mt-1"></div>
                     ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{count ?? 0} Pending Actions</p>
                     )}
                </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-emerald-500 transition-colors" />
        </div>
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
    <div className="space-y-8">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Overview</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Welcome back, here is your platform summary.</p>
        </div>
        <div className="flex gap-3">
            <button className="bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 text-sm font-bold hover:bg-gray-50 dark:hover:bg-slate-800">
                Export Data
            </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Users" value={userCount} icon={<Users size={24} />} loading={loadingUsers} trend="+12% this week" />
        <StatCard title="User Balance" value={totalBalance !== null ? `Rs ${totalBalance.toFixed(2)}` : null} icon={<Wallet size={24} />} loading={loadingBalance} />
        <StatCard title="Withdrawal Requests" value={pendingWithdrawals} icon={<ArrowUpRight size={24} />} loading={loadingWithdrawals} />
        <StatCard title="Pending Tasks" value={(pendingTaskRequests ?? 0) + (pendingSubmissions ?? 0)} icon={<CheckSquare size={24} />} loading={loadingTaskRequests || loadingSubmissions} />
      </div>

      {/* Action Area */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* Quick Actions */}
        <div className="xl:col-span-2 space-y-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Action Required</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <QuickActionCard 
                    title="Review Withdrawals" 
                    count={pendingWithdrawals} 
                    link="/withdrawals" 
                    icon={<ArrowUpRight />} 
                    loading={loadingWithdrawals} 
                    colorClass="bg-amber-500 text-amber-500"
                />
                <QuickActionCard 
                    title="Task Submissions" 
                    count={pendingSubmissions} 
                    link="/tasks" 
                    icon={<CheckSquare />} 
                    loading={loadingSubmissions} 
                    colorClass="bg-emerald-500 text-emerald-500"
                />
                <QuickActionCard 
                    title="Task Approval Requests" 
                    count={pendingTaskRequests} 
                    link="/tasks" 
                    icon={<CheckSquare />} 
                    loading={loadingTaskRequests} 
                    colorClass="bg-blue-500 text-blue-500"
                />
                <QuickActionCard 
                    title="User Directory" 
                    count={null} 
                    link="/users" 
                    icon={<Users />} 
                    loading={false} 
                    colorClass="bg-purple-500 text-purple-500"
                />
            </div>

            {/* Chart Section */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800">
               <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <TrendingUp size={20} className="text-emerald-500" /> User Growth
                    </h2>
                    <select className="bg-gray-50 dark:bg-slate-800 border-none text-sm rounded-lg px-3 py-1 focus:ring-2 focus:ring-emerald-500">
                        <option>Last 7 Days</option>
                        <option>Last 30 Days</option>
                    </select>
               </div>
               <div className="h-72">
                <BarChart data={chartData} />
               </div>
            </div>
        </div>

        {/* Sidebar Area (Feed & AI) */}
        <div className="space-y-8">
            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-6 rounded-2xl shadow-lg text-white">
                <div className="flex items-center gap-2 mb-4">
                    <Sparkles size={24} className="text-yellow-300" />
                    <h2 className="text-lg font-bold">AI Insights</h2>
                </div>
                
                {isReportLoading ? (
                    <div className="flex items-center gap-2 text-emerald-100">
                        <Spinner /> Generating insights...
                    </div>
                ) : aiReport ? (
                    <div className="prose prose-sm prose-invert max-w-none bg-white/10 p-4 rounded-xl backdrop-blur-sm text-emerald-50 whitespace-pre-wrap text-xs leading-relaxed">{aiReport}</div>
                ) : (
                    <div className="text-center py-4">
                        <p className="text-emerald-100 mb-4 text-sm">
                        Get a smart summary of your platform's performance instantly.
                        </p>
                        <button 
                            onClick={handleGenerateReport}
                            className="w-full bg-white text-emerald-700 font-bold py-3 px-4 rounded-xl shadow-md hover:bg-emerald-50 transition-colors duration-200 text-sm"
                        >
                            Generate Report
                        </button>
                    </div>
                )}
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800">
               <RecentActivityFeed />
            </div>
        </div>
       </div>
    </div>
  );
};

export default DashboardPage;