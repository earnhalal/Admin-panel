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
}

const UserEarningHistoryPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [history, setHistory] = useState<EarningHistory[]>([]);
  const [userName, setUserName] = useState<string>('Loading...');
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    // Fetch User Info
    const fetchUserInfo = async () => {
      try {
        // Try RTDB first
        const userSnap = await get(ref(rtdb, `users/${userId}/username`));
        const balanceSnap = await get(ref(rtdb, `users/${userId}/balance`));
        
        setUserName(userSnap.exists() ? userSnap.val() : 'Unknown');
        setBalance(balanceSnap.exists() ? balanceSnap.val() : 0);
      } catch (e) {
        setUserName('Unknown');
      }
    };

    // Fetch Earning History
    const q = query(
      collection(db, 'earning_history'),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as EarningHistory));
      setHistory(data);
      setLoading(false);
    });

    fetchUserInfo();
    return () => unsubscribe();
  }, [userId]);

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
        <div className="text-center md:text-right">
            <p className="text-sm text-gray-500 uppercase tracking-wider">Total Balance</p>
            <p className="text-3xl font-bold text-green-600">Rs {balance.toFixed(2)}</p>
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
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Source</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Description</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Date</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {history.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.source}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{item.description}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-600">Rs {item.amount.toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 flex items-center gap-1">
                        <Calendar size={14} /> {item.timestamp?.toDate().toLocaleDateString()}
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
