import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { ref, get } from 'firebase/database';
import { db, rtdb } from '../services/firebase';
import { ArrowLeft, User, DollarSign, Calendar } from 'lucide-react';
import Spinner from '../components/Spinner';

interface EarningHistory {
  id: string;
  amount: number;
  description: string;
  source: string;
  timestamp: Timestamp;
  previousBalance?: number;
  newBalance?: number;
}

const UserEarningHistoryPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [history, setHistory] = useState<EarningHistory[]>([]);
  const [userName, setUserName] = useState<string>('Loading...');
  const [balance, setBalance] = useState<number>(0);
  const [totalEarnings, setTotalEarnings] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    // Fetch User Info
    const fetchUserInfo = async () => {
      try {
        // Try RTDB first
        const userSnap = await get(ref(rtdb, `users/${userId}/username`));
        const balanceSnap = await get(ref(rtdb, `users/${userId}/balance`));
        const totalEarnSnap = await get(ref(rtdb, `users/${userId}/totalEarnings`));
        
        const name = userSnap.exists() ? userSnap.val() : (userId.length < 20 ? userId : 'Unknown');
        setUserName(name);
        setBalance(balanceSnap.exists() ? balanceSnap.val() : 0);
        setTotalEarnings(totalEarnSnap.exists() ? totalEarnSnap.val() : 0);
      } catch (e) {
        setUserName('Unknown');
      }
    };

    // Fetch Earning History
    const q = query(
      collection(db, 'earning_history'),
      where('userId', '==', userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as EarningHistory));
      
      // Sort in memory to avoid needing a composite index
      const sortedData = data.sort((a, b) => {
        const timeA = a.timestamp?.seconds || 0;
        const timeB = b.timestamp?.seconds || 0;
        return timeB - timeA;
      });

      setHistory(sortedData);
      setLoading(false);
    }, (error) => {
        console.error("Error fetching user earning history:", error);
        setLoading(false);
    });

    fetchUserInfo();
    return () => unsubscribe();
  }, [userId]);

  const formatDate = (ts: any) => {
    if (!ts) return 'N/A';
    try {
        if (ts.toDate) return ts.toDate().toLocaleDateString();
        if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleDateString();
        if (typeof ts === 'number') return new Date(ts).toLocaleDateString();
        return 'N/A';
    } catch (e) {
        return 'N/A';
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 dark:hover:text-white">
        <ArrowLeft size={20} /> Back
      </button>

      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <User size={32} />
            </div>
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{userName}</h1>
                <p className="text-sm text-gray-500">User ID: {userId}</p>
            </div>
        </div>
        <div className="flex gap-6 text-center md:text-right">
            <div>
                <p className="text-sm text-gray-500 uppercase tracking-wider">Lifetime Earnings</p>
                <p className="text-2xl font-bold text-indigo-600">Rs {totalEarnings.toFixed(2)}</p>
            </div>
            <div>
                <p className="text-sm text-gray-500 uppercase tracking-wider">Current Balance</p>
                <p className="text-3xl font-bold text-green-600">Rs {balance.toFixed(2)}</p>
            </div>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 flex gap-3 text-sm text-blue-700 dark:text-blue-300 rounded-xl">
        <div className="mt-0.5">💡</div>
        <div>
           <strong>Why might 'Current Balance' differ from 'Lifetime Earnings'?</strong>
           <p className="mt-1 opacity-90">Earning history shows all money earned through tasks and referrals. The "Current Balance" represents the active wallet balance, which reduces when the user withdraws funds and increases if administrators manually add deposits.</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-slate-800">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Earning History</h2>
        </div>
        {history.length === 0 ? (
            <p className="p-6 text-center text-gray-500">No earning history found.</p>
        ) : (
            <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                <thead className="bg-gray-50 dark:bg-slate-800">
                <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Source & Description</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase text-right">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase text-right">Previous Bal.</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase text-right">Current Bal.</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {history.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className="flex items-center gap-1"><Calendar size={14} /> {formatDate(item.timestamp)}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                        <div className="font-medium text-gray-900 dark:text-white mb-0.5">{item.source}</div>
                        <div className="text-xs">{item.description}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-600 text-right">+ Rs {item.amount.toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                        {item.previousBalance !== undefined ? `Rs ${item.previousBalance.toFixed(2)}` : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-medium text-right">
                        {item.newBalance !== undefined ? `Rs ${item.newBalance.toFixed(2)}` : 'N/A'}
                    </td>
                    </tr>
                ))}
                </tbody>
            </table>
        )}
      </div>
    </div>
  );
};

export default UserEarningHistoryPage;
