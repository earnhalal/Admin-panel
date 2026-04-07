import React, { useState, useEffect } from 'react';
import { rtdb } from '../services/firebase';
import { ref, onValue, set, remove } from 'firebase/database';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';
import { Check, X, User as UserIcon, CreditCard, Calendar, Search, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PendingRequest {
  id: string;
  userId: string;
  amount: number;
  transactionId: string;
  userEmail?: string;
  userName?: string;
  method?: string;
  createdAt?: number;
}

const JoiningApprovalsPage: React.FC = () => {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});
  const { addToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const pendingRef = ref(rtdb, 'pending_requests');
    const unsubscribe = onValue(pendingRef, (snapshot) => {
        const data = snapshot.val();
        console.log('RTDB Data:', data);
        if (data) {
            const requestsList = Object.entries(data).map(([key, value]: [string, any]) => ({
                id: key,
                userId: key,
                ...value
            }));
            setRequests(requestsList);
        } else {
            setRequests([]);
        }
        setLoading(false);
    }, (error) => {
        console.error("RTDB Error:", error);
        addToast("Failed to load requests from Realtime Database.", "error");
        setLoading(false);
    });

    return () => unsubscribe();
  }, [addToast]);

  const handleApprove = async (request: PendingRequest) => {
    const { userId } = request;
    setActionLoading(prev => ({...prev, [userId]: true}));
    try {
        // 1. Set user status to active in RTDB
        await set(ref(rtdb, 'users/' + userId + '/status'), 'active');
        
        // 2. Remove pending request from RTDB
        await remove(ref(rtdb, 'pending_requests/' + userId));
        
        addToast("Account activated successfully!", "success");
    } catch(error) {
        console.error(error);
        addToast("Failed to approve account.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [userId]: false}));
    }
  };

  const handleReject = async (request: PendingRequest) => {
    const { userId } = request;
    setActionLoading(prev => ({...prev, [userId]: true}));
    try {
        await remove(ref(rtdb, 'pending_requests/' + userId));
        addToast("Request rejected.", "success");
    } catch (error) {
        console.error(error);
        addToast("Failed to reject request.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [userId]: false}));
    }
  };

  const filteredRequests = requests.filter(req => 
    req.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.userId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.transactionId?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="flex justify-center items-center min-h-[400px]"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-gray-500"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Joining Approvals</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Manage account activation requests (Realtime Database)</p>
        </div>
      </div>

      <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by User ID, Name or Transaction ID..."
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
      </div>

      {filteredRequests.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-gray-100 dark:border-slate-800">
              <div className="w-16 h-16 bg-gray-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CreditCard className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">No Pending Requests</h3>
              <p className="text-gray-500 dark:text-gray-400">All caught up! No pending activation requests found.</p>
          </div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredRequests.map((req) => (
                  <div key={req.id} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                      <div className="p-6 flex-grow">
                          <div className="flex items-center gap-3 mb-4">
                              <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                  <UserIcon size={20} />
                              </div>
                              <div className="overflow-hidden">
                                  <h3 className="font-bold text-gray-900 dark:text-white truncate">{req.userName || req.userId || 'Anonymous'}</h3>
                                  <p className="text-xs text-gray-500 truncate">ID: {req.userId}</p>
                              </div>
                          </div>
                          
                          <div className="space-y-3">
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1"><CreditCard size={14} /> Amount</span>
                                  <span className="text-sm font-bold text-green-600">Rs {req.amount}</span>
                              </div>
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1"><CreditCard size={14} /> Method</span>
                                  <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{req.method || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1"><Calendar size={14} /> Date</span>
                                  <span className="text-sm text-gray-700 dark:text-gray-300">
                                      {req.createdAt ? new Date(req.createdAt).toLocaleDateString() : 'N/A'}
                                  </span>
                              </div>
                              <div className="pt-2">
                                  <span className="text-xs text-gray-500 block mb-1">Transaction ID</span>
                                  <div className="bg-gray-50 dark:bg-slate-800 p-2 rounded-lg text-xs font-mono text-gray-700 dark:text-gray-300 break-all border border-gray-100 dark:border-slate-700">
                                      {req.transactionId || 'No ID provided'}
                                  </div>
                              </div>
                          </div>
                      </div>
                      
                      <div className="p-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex gap-3">
                          <button 
                            onClick={() => handleReject(req)}
                            disabled={actionLoading[req.userId]}
                            className="flex-1 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-sm font-bold hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors flex items-center justify-center gap-2"
                          >
                              {actionLoading[req.userId] ? <Spinner size="sm" /> : <><X size={16} /> Reject</>}
                          </button>
                          <button 
                            onClick={() => handleApprove(req)}
                            disabled={actionLoading[req.userId]}
                            className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-green-600/20"
                          >
                              {actionLoading[req.userId] ? <Spinner size="sm" /> : <><Check size={16} /> Approve</>}
                          </button>
                      </div>
                  </div>
              ))}
          </div>
      )}
    </div>
  );
};

export default JoiningApprovalsPage;
