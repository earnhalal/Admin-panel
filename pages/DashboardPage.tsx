import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, Timestamp, doc, updateDoc, getDoc, getDocs, increment, addDoc } from 'firebase/firestore';
import { db, rtdb } from '../services/firebase';
import { ref, onValue, set, remove, get, update, increment as rtdbIncrement } from 'firebase/database';
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
  ArrowDownToLine,
  Activity,
  Globe,
  Smartphone,
  Zap,
  Megaphone,
  Share2
} from 'lucide-react';

type ChartRange = '7days' | '30days' | 'today' | 'yesterday' | 'yearly' | 'all';

interface PendingRequest {
  id: string;
  userId: string;
  amount: number;
  transactionId: string;
  userEmail?: string;
  userName?: string;
}

const StatCard: React.FC<{ title: string; value: number | string | null; icon: React.ReactNode; loading: boolean; trend?: string }> = ({ title, value, icon, loading, trend }) => (
  <div className="stat-card">
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
    <Link to={link} className="group relative bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 hover:border-indigo-500/30 hover:shadow-indigo-500/10 transition-all duration-300 flex items-center justify-between">
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
  const [rtdbUsers, setRtdbUsers] = useState<any[]>([]);
  const [fsUsers, setFsUsers] = useState<any[]>([]);
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
  const [chartRange, setChartRange] = useState<ChartRange>('7days');

  const { addToast } = useToast();

  useEffect(() => {
    // Firestore Listener for pending deposits (excluding activation/joining fee types)
    const depositsQuery = query(
        collection(db, 'deposits'), 
        where('status', 'in', ['pending', 'Pending'])
    );
    const unsubscribeDeposits = onSnapshot(depositsQuery, (snapshot) => {
        // Filter out 'activation' type client-side to avoid composite index
        const count = snapshot.docs.filter(doc => doc.data().type !== 'activation').length;
        setPendingDeposits(count);
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
            setRtdbUsers(usersList);
            setLoadingUsers(false);
        } else {
            setRtdbUsers([]);
            setLoadingUsers(false);
        }
        setLoadingBalance(false);
    }, (error) => {
        console.error("Error fetching RTDB user data:", error);
        setLoadingBalance(false);
        setLoadingUsers(false);
    });

    // Firestore Listener for users
    const fsUsersRef = collection(db, 'users');
    const unsubscribeFsUsers = onSnapshot(fsUsersRef, (snapshot) => {
        const usersList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        setFsUsers(usersList);
    }, (error) => {
        console.error("Error fetching Firestore users:", error);
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
      unsubscribeFsUsers();
    };
  }, []);

  const allUsers = useMemo(() => {
    const merged = new Map();
    // Use Firestore as base if available, then override with RTDB data (balances etc)
    fsUsers.forEach(u => merged.set(u.id, u));
    rtdbUsers.forEach(u => {
        if (merged.has(u.id)) {
            merged.set(u.id, { ...merged.get(u.id), ...u });
        } else {
            merged.set(u.id, u);
        }
    });
    return Array.from(merged.values());
  }, [rtdbUsers, fsUsers]);

  useEffect(() => {
    if (allUsers.length > 0 || !loadingUsers) {
        setUserCount(allUsers.length);
        const total = allUsers.reduce((acc, user) => acc + (Number(user.balance) || 0), 0);
        setTotalBalance(total);
    }
  }, [allUsers, loadingUsers]);

  const handleApprove = async (request: PendingRequest) => {
    const { userId } = request;
    setActionLoading(prev => ({...prev, [userId]: true}));
    try {
        // 1. Set user status to active in RTDB
        const userRtdbRef = ref(rtdb, 'users/' + userId);
        await update(userRtdbRef, { 
            status: 'active',
            isActivated: true,
            isPaid: true,
            paymentStatus: 'verified'
        });
        
        // 2. Update Firestore
        try {
            await updateDoc(doc(db, 'users', userId), {
                isPaid: true,
                paymentStatus: 'verified',
                isActivated: true,
                status: 'active'
            });
        } catch (e) {}

        // 3. Referral Tracking
        const userSnap = await get(userRtdbRef);
        const userData = userSnap.val();
        
        const sanitizeReferrer = (raw: any) => {
            if (!raw) return null;
            if (typeof raw !== 'string') return raw.uid || raw.id || raw.username || null;
            const str = raw.trim();
            if (str.includes('ref/')) return str.split('ref/')[1].trim();
            if (str.includes('=')) return str.split('=')[1].trim();
            return str;
        };

        const resolveReferrerUid = async (uidOrUsername: string) => {
            if (!uidOrUsername) return null;
            const cleanId = uidOrUsername.trim();
            
            // 1. Check direct RTDB UID
            const rtdbUserSnap = await get(ref(rtdb, 'users/' + cleanId));
            if (rtdbUserSnap.exists()) return cleanId;
            
            // 2. Search RTDB Users for username
            const allUsersSnap = await get(ref(rtdb, 'users'));
            if (allUsersSnap.exists()) {
                const users = allUsersSnap.val();
                for (const uid in users) {
                    const u = users[uid];
                    if (u.username === cleanId || 
                        u.username?.toLowerCase() === cleanId.toLowerCase() || 
                        u.name === cleanId || 
                        u.code === cleanId) {
                        return uid;
                    }
                }
            }

            return cleanId;
        };

        let rawReferrer = sanitizeReferrer(userData?.referredBy || userData?.referrerUid || userData?.referrerId);
        let referrerUid = rawReferrer ? await resolveReferrerUid(rawReferrer) : null;
        
        if (referrerUid) {
            const rewardAmount = 100;
            const invitePath = `invites/${referrerUid}/history/${userId}`;
            const inviteSnap = await get(ref(rtdb, invitePath));

            if (!(inviteSnap.exists() && inviteSnap.val().status === 'paid')) {
                // Get previous balance before update
                const referrerRtdbRef = ref(rtdb, `users/${referrerUid}`);
                const referrerSnap = await get(referrerRtdbRef);
                const prevBalance = referrerSnap.exists() ? (referrerSnap.val().balance || 0) : 0;
                const newBalance = prevBalance + rewardAmount;

                await update(ref(rtdb, invitePath), { 
                    status: 'paid',
                    paidAt: Date.now(),
                    commission: rewardAmount
                });
                
                await update(ref(rtdb, `users/${referrerUid}`), {
                    balance: rtdbIncrement(rewardAmount),
                    totalEarnings: rtdbIncrement(rewardAmount),
                    inviteCount: rtdbIncrement(1),
                    activeMembers: rtdbIncrement(1)
                });

                try {
                    await updateDoc(doc(db, 'users', referrerUid), { 
                        balance: increment(rewardAmount),
                        totalEarnings: increment(rewardAmount),
                        'referralStats.activeMembers': increment(1)
                    });
                } catch (e) {}

                try {
                    await addDoc(collection(db, 'earning_history'), {
                        userId: referrerUid,
                        amount: rewardAmount,
                        source: 'Referral Bonus',
                        description: `Bonus for referring user ${userId}`,
                        timestamp: Timestamp.now(),
                        previousBalance: prevBalance,
                        newBalance: newBalance
                    });
                } catch (e) {}
            }
        }
        
        // 4. Remove pending request from RTDB
        await remove(ref(rtdb, 'pending_requests/' + userId));
        
        addToast("Request approved and referral processed!", "success");
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

    if (chartRange === '7days' || chartRange === '30days') {
        const days = chartRange === '7days' ? 7 : 30;
        for (let i = days - 1; i >= 0; i--) {
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
    } else if (chartRange === 'today' || chartRange === 'yesterday') {
        const targetDate = new Date();
        if (chartRange === 'yesterday') targetDate.setDate(targetDate.getDate() - 1);
        const dateStr = targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        // Show hourly for today/yesterday
        for (let i = 0; i < 24; i++) {
            const label = `${i}:00`;
            labels.push(label);
            data[label] = 0;
        }

        allUsers.forEach(user => {
            if (user.createdAt) {
                const joinDate = user.createdAt.toDate();
                if (joinDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) === dateStr) {
                    const hour = joinDate.getHours();
                    const label = `${hour}:00`;
                    if (data.hasOwnProperty(label)) {
                        data[label]++;
                    }
                }
            }
        });
    } else if (chartRange === 'yearly') {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        months.forEach(m => {
            labels.push(m);
            data[m] = 0;
        });

        const currentYear = new Date().getFullYear();
        allUsers.forEach(user => {
            if (user.createdAt) {
                const joinDate = user.createdAt.toDate();
                if (joinDate.getFullYear() === currentYear) {
                    const month = months[joinDate.getMonth()];
                    data[month]++;
                }
            }
        });
    } else if (chartRange === 'all') {
        // Show by year
        const years = new Set<number>();
        allUsers.forEach(user => {
            if (user.createdAt) years.add(user.createdAt.toDate().getFullYear());
        });
        const sortedYears = Array.from(years).sort();
        if (sortedYears.length === 0) sortedYears.push(new Date().getFullYear());
        
        sortedYears.forEach(y => {
            const label = y.toString();
            labels.push(label);
            data[label] = 0;
        });

        allUsers.forEach(user => {
            if (user.createdAt) {
                const label = user.createdAt.toDate().getFullYear().toString();
                data[label]++;
            }
        });
    }

    return {
      labels,
      datasets: [{
        label: 'New Users',
        data: labels.map(label => data[label]),
      }]
    };
  }, [allUsers, chartRange]);

  const liveStats = useMemo(() => {
    const now = Date.now();
    const tenMinsAgo = now - 10 * 60 * 1000;
    
    const onlineUsers = allUsers.filter((u: any) => {
        const lastActive = u.lastLoginAt || u.lastActive;
        if (!lastActive) return false;
        const time = typeof lastActive === 'number' ? lastActive : new Date(lastActive).getTime();
        return time > tenMinsAgo;
    }).length;

    // Simulate app vs website if no field exists, or use platform field
    const appUsers = allUsers.filter((u: any) => u.platform === 'app' || u.isApp).length;
    const webUsers = allUsers.length - appUsers;

    return { onlineUsers, appUsers, webUsers };
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

      {/* Main Action Area - Daily Operations */}
      <div>
         <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Zap className="text-amber-500 fill-amber-500" size={20} />
                Daily Operations
            </h2>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Priority Tasks</span>
         </div>
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <QuickActionCard 
                title="Joining Approvals" 
                description="New account activations"
                count={pendingRequests.length} 
                link="/approvals" 
                icon={<CreditCard />} 
                loading={loadingRequests} 
                colorClass="bg-indigo-600 text-indigo-600"
            />
            <QuickActionCard 
                title="Task Submissions" 
                description="Verify social task proof"
                count={pendingSubmissions} 
                link="/social-task-submissions" 
                icon={<CheckSquare />} 
                loading={loadingSubmissions} 
                colorClass="bg-blue-500 text-blue-500"
            />
            <QuickActionCard 
                title="Withdrawals" 
                description="Payout requests"
                count={pendingWithdrawals} 
                link="/withdrawals" 
                icon={<ArrowUpRight />} 
                loading={loadingWithdrawals} 
                colorClass="bg-rose-500 text-rose-500"
            />
            <QuickActionCard 
                title="Deposits" 
                description="Wallet top-ups"
                count={pendingDeposits} 
                link="/deposits" 
                icon={<ArrowDownToLine />} 
                loading={loadingDeposits} 
                colorClass="bg-green-600 text-green-600"
            />
         </div>
      </div>

      {/* Secondary Operations */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <QuickActionCard 
              title="Promotion Orders" 
              description="Manage active campaigns"
              count={null} 
              link="/promotion-orders" 
              icon={<Megaphone />} 
              loading={false} 
              colorClass="bg-purple-500 text-purple-500"
          />
          <QuickActionCard 
              title="Revenue Report" 
              description="Financial overview"
              count={null} 
              link="/revenue" 
              icon={<Wallet />} 
              loading={false} 
              colorClass="bg-emerald-500 text-emerald-500"
          />
          <QuickActionCard 
              title="Referral Report" 
              description="Inviter performance"
              count={null} 
              link="/referral-report" 
              icon={<Share2 />} 
              loading={false} 
              colorClass="bg-blue-600 text-blue-600"
          />
          <QuickActionCard 
              title="Team Manager" 
              description="Manage staff roles"
              count={null} 
              link="/team" 
              icon={<Users />} 
              loading={false} 
              colorClass="bg-slate-600 text-slate-600"
          />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
            <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4">Platform Stats</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <StatCard title="Total Users" value={userCount} icon={<Users size={24} />} loading={loadingUsers} trend="+12% this week" />
                <StatCard title="Total Balance" value={totalBalance !== null ? `Rs ${totalBalance.toFixed(2)}` : null} icon={<Wallet size={24} />} loading={loadingBalance} />
                <StatCard title="Pending Withdrawals" value={pendingWithdrawals} icon={<ArrowUpRight size={24} />} loading={loadingWithdrawals} />
                <StatCard title="Pending Tasks" value={(pendingTaskRequests ?? 0) + (pendingSubmissions ?? 0)} icon={<CheckSquare size={24} />} loading={loadingTaskRequests || loadingSubmissions} />
            </div>
        </div>

        {/* Live Stats Card */}
        <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-6 text-white shadow-lg shadow-indigo-500/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
                <Zap size={120} />
            </div>
            <div className="relative z-10">
                <div className="flex items-center gap-2 mb-6">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        Live Platform Activity
                    </h2>
                </div>

                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white/10 rounded-lg">
                                <Activity size={20} />
                            </div>
                            <span className="text-sm font-medium opacity-90">Online Now</span>
                        </div>
                        <span className="text-2xl font-bold">{liveStats.onlineUsers}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/10 p-4 rounded-xl">
                            <div className="flex items-center gap-2 mb-1 opacity-80">
                                <Smartphone size={14} />
                                <span className="text-xs">App Users</span>
                            </div>
                            <p className="text-xl font-bold">{liveStats.appUsers}</p>
                        </div>
                        <div className="bg-white/10 p-4 rounded-xl">
                            <div className="flex items-center gap-2 mb-1 opacity-80">
                                <Globe size={14} />
                                <span className="text-xs">Website</span>
                            </div>
                            <p className="text-xl font-bold">{liveStats.webUsers}</p>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-white/10">
                        <p className="text-xs opacity-70 italic">
                            * Users active in the last 10 minutes
                        </p>
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* Charts & Feeds */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-6">
            {/* Chart Section */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
               <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <TrendingUp size={20} className="text-indigo-500" /> User Growth
                    </h2>
                    <select 
                        value={chartRange}
                        onChange={(e) => setChartRange(e.target.value as ChartRange)}
                        className="bg-gray-50 dark:bg-slate-800 border-none text-sm rounded-lg px-3 py-1 focus:ring-2 focus:ring-indigo-500 text-gray-700 dark:text-gray-300 outline-none"
                    >
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="7days">Last 7 Days</option>
                        <option value="30days">Last 30 Days</option>
                        <option value="yearly">This Year</option>
                        <option value="all">All Time</option>
                    </select>
               </div>
               <div className="h-72">
                <BarChart data={chartData} />
               </div>
            </div>
        </div>

        {/* Sidebar Area (Feed) */}
        <div className="space-y-8">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 transition-all duration-300">
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
