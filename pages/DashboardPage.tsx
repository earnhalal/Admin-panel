import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { db, rtdb } from '../services/firebase';
import { ref, onValue, set, remove } from 'firebase/database';
import { useToast } from '../contexts/ToastContext';
import BarChart from '../components/BarChart';
import RecentActivityFeed from '../components/RecentActivityFeed';
import Spinner from '../components/Spinner';
import { Link } from 'react-router-dom';
import { 
  Users, 
  ArrowUpRight, 
  CheckSquare, 
  Wallet, 
  ChevronRight, 
  TrendingUp,
  PlayCircle,
  Eye,
  EyeOff,
  Check,
  X,
  CreditCard,
  ArrowDownToLine
} from 'lucide-react';

interface PendingRequest {
  id: string;
  userId: string;
  amount: number;
  transactionId: string;
  userEmail?: string;
  userName?: string;
}

const StatCard: React.FC<{ title: string; value: number | string | null; icon: React.ReactNode; loading: boolean; trend?: string }> = ({ title, value, icon, loading, trend }) => (
  <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 hover:shadow-md transition-shadow duration-300">
    <div className="flex items-start justify-between mb-4">
       <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-indigo-600 dark:text-indigo-400">
          {icon}
       </div>
       {trend && <span className="text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded-full">{trend}</span>}
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

const QuickActionCard: React.FC<{ title: string; count: number | null; link: string; icon: React.ReactNode; loading: boolean; colorClass: string; description?: string }> = ({ title, count, link, icon, loading, colorClass, description }) => (
    <Link to={link} className="group relative bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 hover:border-indigo-500/30 hover:shadow-indigo-500/10 transition-all duration-300 flex items-center justify-between">
        <div className="flex items-center gap-5">
            <div className={`p-4 rounded-xl ${colorClass} bg-opacity-10 shrink-0`}>
                {React.cloneElement(icon as React.ReactElement, { className: `w-8 h-8 ${colorClass.replace('bg-', 'text-')}` })}
            </div>
            <div>
                <h3 className="font-bold text-lg text-gray-800 dark:text-white group-hover:text-indigo-600 transition-colors">{title}</h3>
                {description && <p className="text-sm text-gray-400 mb-1">{description}</p>}
                {loading ? (
                    <div className="w-20 h-5 bg-gray-100 dark:bg-slate-800 rounded-md animate-pulse"></div>
                ) : (
                    <p className={`text-sm font-bold ${count && count > 0 ? 'text-red-500' : 'text-gray-500'}`}>{count} Pending</p>
                )}
            </div>
        </div>
        <div className="bg-gray-50 dark:bg-slate-800 p-2 rounded-full group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 transition-colors">
             <ChevronRight className="w-6 h-6 text-gray-300 group-hover:text-indigo-500 transition-colors" />
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

  // RTDB Pending Requests
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});

  // UI States
  const [showActivity, setShowActivity] = useState(true);
  const [pendingDeposits, setPendingDeposits] = useState<number | null>(null);
  const [loadingDeposits, setLoadingDeposits] = useState(true);

  const { addToast } = useToast();

  useEffect(() => {
    // Firestore Listener for pending deposits (excluding activation/joining fee types)
    const depositsQuery = query(
        collection(db, 'deposits'), 
        where('status', 'in', ['pending', 'Pending']),
        where('type', '!=', 'activation')
    );
    const unsubscribeDeposits = onSnapshot(depositsQuery, (snapshot) => {
        setPendingDeposits(snapshot.size);
        setLoadingDeposits(false);
    }, (error) => {
        console.error("Error fetching pending deposits:", error);
        setLoadingDeposits(false);
    });
    // RTDB Listener for users (for balance and chart)
    const usersRef = ref(rtdb, 'users');
    const unsubscribeUsers = onValue(usersRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const usersList = Object.entries(data).map(([id, value]: [string, any]) => ({
                id,
                ...value,
                createdAt: value.createdAt ? { toDate: () => new Date(value.createdAt) } : null
            }));
            const total = usersList.reduce((acc, user) => acc + (Number(user.balance) || 0), 0);
            setAllUsers(usersList as any);
            setTotalBalance(total);
            setUserCount(usersList.length); // Use RTDB count as source of truth
            setLoadingUsers(false);
        } else {
            setAllUsers([]);
            setTotalBalance(0);
            setUserCount(0);
            setLoadingUsers(false);
        }
        setLoadingBalance(false);
    }, (error) => {
        console.error("Error fetching RTDB user data:", error);
        setLoadingBalance(false);
        setLoadingUsers(false);
    });

    // Firestore Listener for pending withdrawals
    const withdrawalsQuery = query(collection(db, 'withdrawals'), where('status', 'in', ['pending', 'Pending']));
    const unsubscribeWithdrawals = onSnapshot(withdrawalsQuery, (snapshot) => {
        setPendingWithdrawals(snapshot.size);
        setLoadingWithdrawals(false);
    }, (error) => {
        console.error("Error fetching Firestore withdrawals:", error);
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

    // RTDB Listener for pending_requests
    const pendingRef = ref(rtdb, 'pending_requests');
    const unsubscribeRTDB = onValue(pendingRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const requestsList = Object.entries(data).map(([key, value]: [string, any]) => ({
                id: key,
                userId: key,
                ...value
            }));
            setPendingRequests(requestsList);
        } else {
            setPendingRequests([]);
        }
        setLoadingRequests(false);
    }, (error) => {
        console.error("Error fetching RTDB requests:", error);
        setLoadingRequests(false);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeWithdrawals();
      unsubscribeSubmissions();
      unsubscribeRequests();
      unsubscribeRTDB();
      unsubscribeDeposits();
    };
  }, []);

  const handleApprove = async (request: PendingRequest) => {
    const { userId } = request;
    setActionLoading(prev => ({...prev, [userId]: true}));
    try {
        // 1. Set user status to active in RTDB
        await set(ref(rtdb, 'users/' + userId + '/status'), 'active');
        
        // 2. Remove pending request from RTDB
        await remove(ref(rtdb, 'pending_requests/' + userId));
        
        addToast("Request approved and account activated!", "success");
    } catch(error) {
        console.error(error);
        addToast("Failed to approve request.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [userId]: false}));
    }
  };

  const handleReject = async (request: PendingRequest) => {
    const { userId } = request;
    setActionLoading(prev => ({...prev, [userId]: true}));
    try {
        // Remove pending request from RTDB
        await remove(ref(rtdb, 'pending_requests/' + userId));
        addToast("Request rejected.", "success");
    } catch (error) {
        console.error(error);
        addToast("Failed to reject request.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [userId]: false}));
    }
  };

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

  return (
    <div className="space-y-8">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Overview of your platform's daily activity.</p>
        </div>
        <div className="flex gap-3">
            <button className="bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 text-sm font-bold hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                Export Data
            </button>
        </div>
      </div>

      {/* Main Action Area */}
      <div>
         <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <CheckSquare className="text-indigo-500" />
            Daily Actions
         </h2>
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <QuickActionCard 
                title="Deposits" 
                description="Wallet top-up requests"
                count={pendingDeposits} 
                link="/deposits" 
                icon={<ArrowDownToLine />} 
                loading={loadingDeposits} 
                colorClass="bg-green-600 text-green-600"
            />
            <QuickActionCard 
                title="Joining Approvals" 
                description="Realtime activation requests"
                count={pendingRequests.length} 
                link="/approvals" 
                icon={<CreditCard />} 
                loading={loadingRequests} 
                colorClass="bg-indigo-600 text-indigo-600"
            />
            <QuickActionCard 
                title="Withdrawals" 
                description="Review pending payouts"
                count={pendingWithdrawals} 
                link="/withdrawals" 
                icon={<ArrowUpRight />} 
                loading={loadingWithdrawals} 
                colorClass="bg-amber-500 text-amber-500"
            />
            <QuickActionCard 
                title="Task Submissions" 
                description="Verify user proof"
                count={pendingSubmissions} 
                link="/tasks" 
                icon={<CheckSquare />} 
                loading={loadingSubmissions} 
                colorClass="bg-indigo-500 text-indigo-500"
            />
         </div>
      </div>

      {/* Stats Grid */}
      <div>
        <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4">Platform Stats</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="Total Users" value={userCount} icon={<Users size={24} />} loading={loadingUsers} trend="+12% this week" />
            <StatCard title="Total Balance" value={totalBalance !== null ? `Rs ${totalBalance.toFixed(2)}` : null} icon={<Wallet size={24} />} loading={loadingBalance} />
            <StatCard title="Pending Withdrawals" value={pendingWithdrawals} icon={<ArrowUpRight size={24} />} loading={loadingWithdrawals} />
            <StatCard title="Pending Tasks" value={(pendingTaskRequests ?? 0) + (pendingSubmissions ?? 0)} icon={<CheckSquare size={24} />} loading={loadingTaskRequests || loadingSubmissions} />
        </div>
      </div>

      {/* Charts & Feeds */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-6">
            {/* Chart Section */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800">
               <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <TrendingUp size={20} className="text-indigo-500" /> User Growth
                    </h2>
                    <select className="bg-gray-50 dark:bg-slate-800 border-none text-sm rounded-lg px-3 py-1 focus:ring-2 focus:ring-indigo-500 text-gray-700 dark:text-gray-300">
                        <option>Last 7 Days</option>
                        <option>Last 30 Days</option>
                    </select>
               </div>
               <div className="h-72">
                <BarChart data={chartData} />
               </div>
            </div>
        </div>

        {/* Sidebar Area (Feed) */}
        <div className="space-y-8">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 transition-all duration-300">
               <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-bold text-gray-800 dark:text-white">Recent Activity</h2>
                  <button 
                    onClick={() => setShowActivity(!showActivity)}
                    className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1.5 rounded-full transition-colors"
                  >
                     {showActivity ? (
                         <><EyeOff size={14} /> Hide</>
                     ) : (
                         <><Eye size={14} /> View</>
                     )}
                  </button>
               </div>
               {showActivity && (
                 <div className="animate-fade-in">
                    <RecentActivityFeed />
                 </div>
               )}
            </div>
        </div>
       </div>
    </div>
  );
};

export default DashboardPage;
