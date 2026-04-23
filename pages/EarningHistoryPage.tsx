import React, { useState, useEffect, useMemo } from 'react';
import { ref, onValue } from 'firebase/database';
import { rtdb } from '../services/firebase';
import { History, ArrowLeft, Search, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Spinner from '../components/Spinner';

const EarningHistoryPage: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const usersRef = ref(rtdb, 'users');
    const unsubscribe = onValue(usersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const userList = Object.entries(data).map(([id, val]: [string, any]) => {
          const displayName = val.username || val.name || (id.length < 20 ? id : 'Unknown User');
          return {
            id,
            ...val,
            displayName: displayName === 'Unknown User' ? id : displayName
          };
        });
        // Sort by most earnings or most recent? Let's sort by totalEarnings desc
        userList.sort((a, b) => (b.totalEarnings || 0) - (a.totalEarnings || 0));
        setUsers(userList);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching users:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter(user => 
      user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [users, searchTerm]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-gray-500">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <History className="text-indigo-500" /> Earning History by User
            </h1>
            <p className="text-sm text-gray-500">Select a user to view their detailed earning records</p>
          </div>
        </div>
      </div>

      <div className="relative group">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors w-5 h-5" />
          <input
            type="text"
            placeholder="Search by username, name, email or UID..."
            className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredUsers.map((user) => (
                <div 
                    key={user.id} 
                    onClick={() => navigate(`/earning-history/${user.id}`)}
                    className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer group flex items-center gap-4"
                >
                    <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors capitalize">
                        {user.displayName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 dark:text-white truncate">
                            {user.displayName}
                        </h3>
                        <p className="text-xs text-green-600 font-semibold">Total: Rs {(user.totalEarnings || 0).toFixed(2)}</p>
                    </div>
                    <ChevronRight size={18} className="text-gray-300 group-hover:text-indigo-500 transform group-hover:translate-x-1 transition-all" />
                </div>
            ))}
            
            {filteredUsers.length === 0 && !loading && (
                <div className="col-span-full py-20 text-center bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-gray-200 dark:border-slate-800">
                    <p className="text-gray-500">No users found matching your search.</p>
                </div>
            )}
        </div>
      )}
    </div>
  );
};

export default EarningHistoryPage;
