import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, Timestamp, doc, getDoc } from 'firebase/firestore';
import { ref, get } from 'firebase/database';
import { db, rtdb } from '../services/firebase';
import { History, ArrowLeft, Search, Calendar, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Spinner from '../components/Spinner';

interface EarningHistory {
  id: string;
  userId: string;
  userName?: string;
  amount: number;
  description: string;
  source: string;
  timestamp: Timestamp;
}

const EarningHistoryPage: React.FC = () => {
  const [history, setHistory] = useState<EarningHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedSource, setSelectedSource] = useState('All');
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(collection(db, 'earning_history'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      console.log("DEBUG: Snapshot size:", snapshot.size);
      const rawData = snapshot.docs.map(doc => {
        const data = doc.data();
        console.log("DEBUG: Doc ID:", doc.id, "Data:", data);
        return {
          id: doc.id,
          ...data
        };
      }) as any[];

      // Fetch user names
      const userIds = Array.from(new Set(rawData.map(item => item.userId)));
      console.log("DEBUG: Unique User IDs:", userIds);
      const userNames: { [key: string]: string } = {};

      for (const userId of userIds) {
        try {
          // Try RTDB first
          const userSnap = await get(ref(rtdb, `users/${userId}/username`));
          if (userSnap.exists()) {
            userNames[userId] = userSnap.val();
          } else {
            // Fallback to Firestore
            const fsUserSnap = await getDoc(doc(db, 'users', userId));
            if (fsUserSnap.exists()) {
              userNames[userId] = fsUserSnap.data().username || 'Unknown';
            } else {
              userNames[userId] = 'Unknown';
            }
          }
        } catch (e) {
          console.error("DEBUG: Error fetching username for", userId, e);
          userNames[userId] = 'Unknown';
        }
      }
      console.log("DEBUG: User Names Map:", userNames);

      const data = rawData.map(item => ({
        ...item,
        userName: userNames[item.userId] || 'Unknown'
      }));

      setHistory(data);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching earning history:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const sources = ['All', ...Array.from(new Set(history.map(item => item.source)))];

  const filteredHistory = history.filter(item => {
    const matchesSearch = item.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.source?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const itemDate = item.timestamp?.toDate();
    const matchesDate = (!startDate || itemDate >= new Date(startDate)) &&
                        (!endDate || itemDate <= new Date(endDate));
    
    const matchesSource = selectedSource === 'All' || item.source === selectedSource;

    return matchesSearch && matchesDate && matchesSource;
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-gray-500">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <History className="text-indigo-500" /> Earning History
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
            type="text"
            placeholder="Search by user, source or description..."
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
        <select 
            className="p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white outline-none"
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
        >
            {sources.map(source => <option key={source} value={source}>{source}</option>)}
        </select>
        <div className="flex gap-2">
            <input type="date" className="p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white outline-none" onChange={(e) => setStartDate(e.target.value)} />
            <input type="date" className="p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white outline-none" onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <>
            <div className="grid grid-cols-1 gap-4 md:hidden">
                {filteredHistory.map((item) => (
                    <div key={item.id} className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="font-bold text-gray-900 dark:text-white">{item.userName}</span>
                            <span className="text-green-600 font-bold">Rs {item.amount.toFixed(2)}</span>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-300">{item.description}</div>
                        <div className="flex justify-between text-xs text-gray-500">
                            <span>{item.source}</span>
                            <span>{item.timestamp?.toDate().toLocaleDateString()}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                <thead className="bg-gray-50 dark:bg-slate-800">
                <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">User</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Source</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Description</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Date</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {filteredHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => navigate(`/earning-history/${item.userId}`)}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                        <User size={16} /> {item.userName}
                    </td>
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
            </div>
        </>
      )}
    </div>
  );
};

export default EarningHistoryPage;
