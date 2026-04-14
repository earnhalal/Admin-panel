import React, { useState, useEffect, useMemo } from 'react';
import { db, rtdb } from '../services/firebase';
import { ref, onValue } from 'firebase/database';
import { doc, getDoc } from 'firebase/firestore';
import Spinner from '../components/Spinner';
import { Users, DollarSign, Clock, ArrowLeft, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Pagination from '../components/Pagination';

interface Referral {
  id: string;
  referrerUid: string;
  userUid: string;
  referrerName: string;
  userName: string;
  status: 'paid' | 'unpaid';
  commission: number;
  date?: number;
}

const ReferralReportPage: React.FC = () => {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const ITEMS_PER_PAGE = 10;
  const navigate = useNavigate();

  useEffect(() => {
    const invitesRef = ref(rtdb, 'invites');
    
    const unsubscribe = onValue(invitesRef, async (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setReferrals([]);
        setLoading(false);
        return;
      }

      const allReferrals: Referral[] = [];
      const uidsToFetch = new Set<string>();

      for (const referrerUid in data) {
        uidsToFetch.add(referrerUid);
        const history = data[referrerUid].history;
        if (history) {
          for (const userUid in history) {
            uidsToFetch.add(userUid);
            const referralData = history[userUid];
            allReferrals.push({
              id: `${referrerUid}_${userUid}`,
              referrerUid,
              userUid,
              referrerName: nameMap[referrerUid] || 'Loading...',
              userName: nameMap[userUid] || referralData.userName || 'Loading...',
              status: referralData.status || 'unpaid',
              commission: referralData.status === 'paid' ? (referralData.commission || 125) : 0,
              date: referralData.timestamp || 0
            });
          }
        }
      }
      
      // Sort by date descending
      allReferrals.sort((a, b) => (b.date || 0) - (a.date || 0));
      setReferrals(allReferrals);
      setLoading(false);

      // Fetch missing names
      const missingUids = Array.from(uidsToFetch).filter(uid => !nameMap[uid]);
      if (missingUids.length > 0) {
        const namePromises = missingUids.map(async (uid) => {
          try {
            const userSnap = await getDoc(doc(db, 'users', uid));
            if (userSnap.exists()) {
              const userData = userSnap.data();
              return { uid, name: userData.username || userData.name || userData.email || 'Unknown' };
            }
            return { uid, name: 'Unknown' };
          } catch (e) {
            return { uid, name: 'Unknown' };
          }
        });

        const names = await Promise.all(namePromises);
        const newNames = names.reduce((acc, curr) => ({ ...acc, [curr.uid]: curr.name }), {} as Record<string, string>);
        setNameMap(prev => ({ ...prev, ...newNames }));
      }
    });

    return () => unsubscribe();
  }, [nameMap]);

  const filteredReferrals = useMemo(() => {
    return referrals.filter(ref => 
      ref.referrerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ref.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ref.status.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [referrals, searchTerm]);

  const paginatedReferrals = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredReferrals.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredReferrals, currentPage]);

  const stats = useMemo(() => {
    const total = referrals.length;
    const paid = referrals.filter(r => r.status === 'paid').length;
    const pending = total - paid;
    const totalEarnings = referrals.filter(r => r.status === 'paid').reduce((acc, curr) => acc + (curr.commission || 125), 0);
    return { total, paid, pending, totalEarnings };
  }, [referrals]);

  if (loading) return <div className="flex justify-center items-center min-h-[400px]"><Spinner /></div>;

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-gray-500"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Referral Report</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Detailed overview of all platform referrals</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600">
              <Users size={18} />
            </div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
        </div>
        
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-600">
              <DollarSign size={18} />
            </div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Paid</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.paid}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-amber-600">
              <Clock size={18} />
            </div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Pending</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.pending}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-indigo-600">
              <DollarSign size={18} />
            </div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Earnings</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">Rs {stats.totalEarnings}</p>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input 
          type="text"
          placeholder="Search by name or status..."
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white dark:bg-slate-900 shadow-sm rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100 dark:divide-slate-800">
          <thead>
            <tr className="bg-gray-50 dark:bg-slate-800/50">
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Who Invited</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Who Joined</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Earning</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
            {paginatedReferrals.map((ref) => (
              <tr key={ref.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 font-bold text-xs">
                      {ref.referrerName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{ref.referrerName}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 font-bold text-xs">
                      {ref.userName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{ref.userName}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    ref.status === 'paid' 
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  }`}>
                    {ref.status.toUpperCase()}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-white">
                  {ref.status === 'paid' ? `Rs ${ref.commission}` : <span className="text-gray-400 font-normal italic">Pending</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {paginatedReferrals.map((ref) => (
          <div key={ref.id} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 font-bold">
                  {ref.referrerName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Invited By</p>
                  <p className="font-bold text-gray-900 dark:text-white">{ref.referrerName}</p>
                </div>
              </div>
              <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${
                ref.status === 'paid' 
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              }`}>
                {ref.status}
              </span>
            </div>

            <div className="flex items-center gap-3 pl-2 border-l-2 border-gray-100 dark:border-slate-800">
              <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 font-bold text-xs">
                {ref.userName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Joined User</p>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{ref.userName}</p>
              </div>
            </div>

            <div className="pt-2 flex justify-between items-center border-t border-gray-50 dark:border-slate-800">
              <span className="text-xs text-gray-500">Commission Earning</span>
              <span className="text-sm font-bold text-indigo-600">
                {ref.status === 'paid' ? `Rs ${ref.commission}` : 'Pending'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {filteredReferrals.length > ITEMS_PER_PAGE && (
        <div className="pt-4">
          <Pagination 
            currentPage={currentPage} 
            totalPages={Math.ceil(filteredReferrals.length / ITEMS_PER_PAGE)} 
            onPageChange={setCurrentPage} 
          />
        </div>
      )}

      {filteredReferrals.length === 0 && !loading && (
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-gray-200 dark:border-slate-800">
          <Users className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-500 dark:text-gray-400">No referral records found matching your search.</p>
        </div>
      )}
    </div>
  );
};

export default ReferralReportPage;
