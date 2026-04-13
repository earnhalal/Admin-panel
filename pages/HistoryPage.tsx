import React, { useState, useEffect } from 'react';
import { ref, onValue, set, remove, get } from 'firebase/database';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { rtdb, db } from '../services/firebase';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';
import { Check, X, User as UserIcon, CreditCard, Calendar, Search, ArrowLeft, History, RefreshCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface HistoryRequest {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  phoneNumber?: string;
  amount?: number;
  transactionId?: string;
  method?: string;
  createdAt?: any;
  approvedAt?: any;
  rejectedAt?: any;
  status?: string;
  withdrawalDetails?: {
    method: string;
    accountName: string;
    accountNumber: string;
  };
}

const HistoryPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'joining_approved' | 'joining_rejected' | 'withdrawals'>('joining_approved');
  const [joiningApproved, setJoiningApproved] = useState<HistoryRequest[]>([]);
  const [joiningRejected, setJoiningRejected] = useState<HistoryRequest[]>([]);
  const [withdrawalHistory, setWithdrawalHistory] = useState<HistoryRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});
  const { addToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    
    // 1. Listen to RTDB for Joining History
    const approvedRef = ref(rtdb, 'approved_history');
    const rejectedRef = ref(rtdb, 'rejected_history');

    const unsubJoiningApproved = onValue(approvedRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const list = Object.entries(data).map(([key, value]: [string, any]) => ({
                id: key,
                userId: key,
                ...value
            }));
            list.sort((a, b) => (b.approvedAt || 0) - (a.approvedAt || 0));
            setJoiningApproved(list);
        } else setJoiningApproved([]);
    });

    const unsubJoiningRejected = onValue(rejectedRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const list = Object.entries(data).map(([key, value]: [string, any]) => ({
                id: key,
                userId: key,
                ...value
            }));
            list.sort((a, b) => (b.rejectedAt || 0) - (a.rejectedAt || 0));
            setJoiningRejected(list);
        } else setJoiningRejected([]);
    });

    // 2. Listen to Firestore for Withdrawal History
    const withdrawalsRef = collection(db, 'withdrawals');
    const q = query(withdrawalsRef, where('status', 'in', ['approved', 'rejected']));
    
    const unsubWithdrawals = onSnapshot(q, async (snapshot) => {
        const list: HistoryRequest[] = [];
        
        // Fetch user data for names
        const userIds = new Set<string>();
        snapshot.docs.forEach(doc => {
            if (doc.data().userId) userIds.add(doc.data().userId);
        });

        const userMap: {[key: string]: any} = {};
        if (userIds.size > 0) {
            const userPromises = Array.from(userIds).map(uid => get(ref(rtdb, `users/${uid}`)));
            const userSnaps = await Promise.all(userPromises);
            userSnaps.forEach((snap, idx) => {
                userMap[Array.from(userIds)[idx]] = snap.val() || {};
            });
        }

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const userData = userMap[data.userId] || {};
            list.push({
                id: doc.id,
                ...data,
                userName: userData.username || data.userName || 'Unknown',
                userEmail: userData.email || data.userEmail || 'N/A',
                createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt,
                approvedAt: data.approvedAt instanceof Timestamp ? data.approvedAt.toMillis() : data.approvedAt,
                rejectedAt: data.rejectedAt instanceof Timestamp ? data.rejectedAt.toMillis() : data.rejectedAt,
            } as HistoryRequest);
        });

        list.sort((a, b) => (b.approvedAt || b.rejectedAt || 0) - (a.approvedAt || a.rejectedAt || 0));
        setWithdrawalHistory(list);
        setLoading(false);
    });

    return () => {
        unsubJoiningApproved();
        unsubJoiningRejected();
        unsubWithdrawals();
    };
  }, []);

  const handleApproveAnyway = async (request: HistoryRequest) => {
    const { userId } = request;
    setActionLoading(prev => ({...prev, [userId]: true}));
    try {
        await set(ref(rtdb, 'users/' + userId + '/status'), 'active');
        const approvedData = { ...request, approvedAt: Date.now() };
        delete approvedData.rejectedAt;
        await set(ref(rtdb, 'approved_history/' + userId), approvedData);
        await remove(ref(rtdb, 'rejected_history/' + userId));
        addToast("Account restored and activated successfully!", "success");
    } catch(error) {
        addToast("Failed to restore account.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [userId]: false}));
    }
  };

  const currentRequests = 
    activeTab === 'joining_approved' ? joiningApproved : 
    activeTab === 'joining_rejected' ? joiningRejected : 
    withdrawalHistory;
  
  const filteredRequests = currentRequests.filter(req => 
    req.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.userEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.transactionId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.withdrawalDetails?.accountNumber?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="flex justify-center items-center min-h-[400px]"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-gray-500">
          <ArrowLeft size={20} />
        </button>
        <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <History className="text-indigo-500" /> Platform History
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">View all processed requests across the platform</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 bg-gray-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('joining_approved')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'joining_approved' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm' : 'text-gray-500'}`}
        >
          Joining Approved ({joiningApproved.length})
        </button>
        <button
          onClick={() => setActiveTab('joining_rejected')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'joining_rejected' ? 'bg-white dark:bg-slate-900 text-rose-600 shadow-sm' : 'text-gray-500'}`}
        >
          Joining Rejected ({joiningRejected.length})
        </button>
        <button
          onClick={() => setActiveTab('withdrawals')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'withdrawals' ? 'bg-white dark:bg-slate-900 text-amber-600 shadow-sm' : 'text-gray-500'}`}
        >
          Withdrawals ({withdrawalHistory.length})
        </button>
      </div>

      <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search history..."
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
      </div>

      {filteredRequests.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-gray-100 dark:border-slate-800">
              <div className="w-16 h-16 bg-gray-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <History className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">No records found</h3>
              <p className="text-gray-500 dark:text-gray-400">There are no records in this category matching your search.</p>
          </div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredRequests.map((req) => (
                  <div key={req.id} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                      <div className="p-6 flex-grow">
                          <div className="flex items-center gap-3 mb-4">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${activeTab === 'joining_approved' ? 'bg-indigo-100 text-indigo-600' : activeTab === 'joining_rejected' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
                                  <UserIcon size={20} />
                              </div>
                              <div className="overflow-hidden">
                                  <h3 className="font-bold text-gray-900 dark:text-white truncate">{req.userName || 'Anonymous'}</h3>
                                  <p className="text-xs text-gray-500 truncate">{req.userEmail || 'No Email'}</p>
                              </div>
                          </div>
                          
                          <div className="space-y-3">
                              {activeTab === 'withdrawals' ? (
                                  <>
                                      <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                          <span className="text-xs text-gray-500">Amount</span>
                                          <span className="text-sm font-bold text-green-600">Rs {req.amount}</span>
                                      </div>
                                      <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                          <span className="text-xs text-gray-500">Method</span>
                                          <span className="text-sm font-medium text-amber-600">{req.withdrawalDetails?.method || 'N/A'}</span>
                                      </div>
                                      <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                          <span className="text-xs text-gray-500">Status</span>
                                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${req.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'}`}>{req.status}</span>
                                      </div>
                                  </>
                              ) : (
                                  <>
                                      <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                          <span className="text-xs text-gray-500">Phone</span>
                                          <span className="text-sm font-medium text-gray-900 dark:text-white">{req.phoneNumber || 'N/A'}</span>
                                      </div>
                                      <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                          <span className="text-xs text-gray-500">Method</span>
                                          <span className="text-sm font-medium text-indigo-600">{req.method || 'N/A'}</span>
                                      </div>
                                  </>
                              )}
                              
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500">Processed At</span>
                                  <span className="text-sm text-gray-700 dark:text-gray-300">
                                      {req.approvedAt ? new Date(req.approvedAt).toLocaleString() : 
                                       req.rejectedAt ? new Date(req.rejectedAt).toLocaleString() : 'N/A'}
                                  </span>
                              </div>
                              <div className="pt-2">
                                  <span className="text-xs text-gray-500 block mb-1">Transaction ID</span>
                                  <div className="bg-gray-50 dark:bg-slate-800 px-3 py-2 rounded-lg text-sm font-mono text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-slate-700 break-all">
                                      {req.transactionId || 'N/A'}
                                  </div>
                              </div>
                          </div>
                      </div>
                      
                      {activeTab === 'joining_rejected' && (
                        <div className="p-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800">
                            <button onClick={() => handleApproveAnyway(req)} disabled={actionLoading[req.userId]} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20">
                                {actionLoading[req.userId] ? <Spinner size="sm" /> : <><RefreshCcw size={16} /> Approve Anyway</>}
                            </button>
                        </div>
                      )}
                  </div>
              ))}
          </div>
      )}
    </div>
  );
};

export default HistoryPage;
