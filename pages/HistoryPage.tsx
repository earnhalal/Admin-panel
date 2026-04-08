import React, { useState, useEffect } from 'react';
import { ref, onValue, set, remove } from 'firebase/database';
import { rtdb } from '../services/firebase';
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
  createdAt?: number;
  approvedAt?: number;
  rejectedAt?: number;
}

const HistoryPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'approved' | 'rejected'>('approved');
  const [approvedRequests, setApprovedRequests] = useState<HistoryRequest[]>([]);
  const [rejectedRequests, setRejectedRequests] = useState<HistoryRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});
  const { addToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const approvedRef = ref(rtdb, 'approved_history');
    const rejectedRef = ref(rtdb, 'rejected_history');

    let approvedLoaded = false;
    let rejectedLoaded = false;

    const checkLoading = () => {
        if (approvedLoaded && rejectedLoaded) {
            setLoading(false);
        }
    };

    const unsubscribeApproved = onValue(approvedRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const requestsList = Object.entries(data).map(([key, value]: [string, any]) => ({
                id: key,
                userId: key,
                ...value
            }));
            // Sort by approvedAt descending
            requestsList.sort((a, b) => (b.approvedAt || 0) - (a.approvedAt || 0));
            setApprovedRequests(requestsList);
        } else {
            setApprovedRequests([]);
        }
        approvedLoaded = true;
        checkLoading();
    }, (error) => {
        console.error("RTDB Error (Approved):", error);
        approvedLoaded = true;
        checkLoading();
    });

    const unsubscribeRejected = onValue(rejectedRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const requestsList = Object.entries(data).map(([key, value]: [string, any]) => ({
                id: key,
                userId: key,
                ...value
            }));
            // Sort by rejectedAt descending
            requestsList.sort((a, b) => (b.rejectedAt || 0) - (a.rejectedAt || 0));
            setRejectedRequests(requestsList);
        } else {
            setRejectedRequests([]);
        }
        rejectedLoaded = true;
        checkLoading();
    }, (error) => {
        console.error("RTDB Error (Rejected):", error);
        rejectedLoaded = true;
        checkLoading();
    });

    return () => {
        unsubscribeApproved();
        unsubscribeRejected();
    };
  }, []);

  const handleApproveAnyway = async (request: HistoryRequest) => {
    const { userId } = request;
    setActionLoading(prev => ({...prev, [userId]: true}));
    try {
        // 1. Set user status to active in RTDB
        await set(ref(rtdb, 'users/' + userId + '/status'), 'active');
        
        // 2. Move to approved_history
        const approvedData = { ...request, approvedAt: Date.now() };
        delete approvedData.rejectedAt; // Remove rejected timestamp
        await set(ref(rtdb, 'approved_history/' + userId), approvedData);

        // 3. Remove from rejected_history
        await remove(ref(rtdb, 'rejected_history/' + userId));
        
        addToast("Account restored and activated successfully!", "success");
    } catch(error) {
        console.error(error);
        addToast("Failed to restore account.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [userId]: false}));
    }
  };

  const currentRequests = activeTab === 'approved' ? approvedRequests : rejectedRequests;
  
  const filteredRequests = currentRequests.filter(req => 
    req.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.userEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.phoneNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <History className="text-indigo-500" /> Approvals History
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">View approved and rejected joining requests</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('approved')}
          className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'approved' 
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' 
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Approved ({approvedRequests.length})
        </button>
        <button
          onClick={() => setActiveTab('rejected')}
          className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'rejected' 
              ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-sm' 
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Rejected ({rejectedRequests.length})
        </button>
      </div>

      <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by Name, User ID or Transaction ID..."
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
      </div>

      {filteredRequests.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-gray-100 dark:border-slate-800">
              <div className="w-16 h-16 bg-gray-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  {activeTab === 'approved' ? (
                      <Check className="w-8 h-8 text-indigo-400" />
                  ) : (
                      <X className="w-8 h-8 text-rose-400" />
                  )}
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">No {activeTab} requests</h3>
              <p className="text-gray-500 dark:text-gray-400">There are no records in this category yet.</p>
          </div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredRequests.map((req) => (
                  <div key={req.id} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                      <div className="p-6 flex-grow">
                          <div className="flex items-center gap-3 mb-4">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${activeTab === 'approved' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'}`}>
                                  <UserIcon size={20} />
                              </div>
                              <div className="overflow-hidden">
                                  <h3 className="font-bold text-gray-900 dark:text-white truncate">{req.userName || 'Anonymous'}</h3>
                                  <p className="text-xs text-indigo-600 dark:text-indigo-400 truncate">{req.userEmail || 'No Email'}</p>
                              </div>
                          </div>
                          
                          <div className="space-y-3">
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1">Phone</span>
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">{req.phoneNumber || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1"><CreditCard size={14} /> Amount</span>
                                  <span className="text-sm font-bold text-green-600">Rs {req.amount}</span>
                              </div>
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1"><CreditCard size={14} /> Method</span>
                                  <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{req.method || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1"><Calendar size={14} /> Submitted</span>
                                  <span className="text-sm text-gray-700 dark:text-gray-300">
                                      {req.createdAt ? new Date(req.createdAt).toLocaleDateString() : 'N/A'}
                                  </span>
                              </div>
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1"><Calendar size={14} /> {activeTab === 'approved' ? 'Approved' : 'Rejected'} At</span>
                                  <span className="text-sm text-gray-700 dark:text-gray-300">
                                      {activeTab === 'approved' && req.approvedAt ? new Date(req.approvedAt).toLocaleString() : 
                                       activeTab === 'rejected' && req.rejectedAt ? new Date(req.rejectedAt).toLocaleString() : 'N/A'}
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
                      
                      {activeTab === 'rejected' && (
                        <div className="p-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800">
                            <button 
                                onClick={() => handleApproveAnyway(req)}
                                disabled={actionLoading[req.userId]}
                                className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
                            >
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
