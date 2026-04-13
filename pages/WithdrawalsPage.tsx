import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  ArrowUpFromLine, 
  Search, 
  User as UserIcon, 
  Calendar, 
  X, 
  Check,
  RefreshCcw
} from 'lucide-react';
import { collection, onSnapshot, doc, updateDoc, getDoc, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db, rtdb } from '../services/firebase';
import { ref, get, set } from 'firebase/database';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';
import TransactionIdModal from '../components/TransactionIdModal';
import RejectionModal from '../components/RejectionModal';

interface WithdrawalRequest {
  id: string;
  userId: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  userEmail?: string;
  username?: string;
  userName?: string;
  withdrawalDetails: {
    method: string;
    accountName: string;
    accountNumber: string;
    bankName?: string;
  };
  rejectionReason?: string;
}

const WithdrawalsPage: React.FC = () => {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});
  const { addToast } = useToast();
  const navigate = useNavigate();
  
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionPayload, setRejectionPayload] = useState<WithdrawalRequest | null>(null);
  
  const [isTxnModalOpen, setIsTxnModalOpen] = useState(false);
  const [approvalPayload, setApprovalPayload] = useState<WithdrawalRequest | null>(null);

  useEffect(() => {
    setLoading(true);
    // Fetch from Firestore 'withdrawals' collection
    const withdrawalsRef = collection(db, 'withdrawals');
    const q = query(withdrawalsRef, where('status', 'in', ['pending', 'Pending']));
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
        const allRequests: WithdrawalRequest[] = [];
        
        // Fetch user data for names/emails if not in the withdrawal doc
        const userIds = new Set<string>();
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.userId) userIds.add(data.userId);
        });

        const userMap: {[key: string]: any} = {};
        if (userIds.size > 0) {
            const userPromises = Array.from(userIds).map(uid => get(ref(rtdb, `users/${uid}`)));
            const userSnapshots = await Promise.all(userPromises);
            userSnapshots.forEach((snap, index) => {
                userMap[Array.from(userIds)[index]] = snap.val() || {};
            });
        }

        snapshot.docs.forEach((doc) => {
            const data = doc.data();
            const userData = userMap[data.userId] || {};
            
            const details = data.withdrawalDetails || data.details || data.paymentDetails || {};
            const finalName = userData.username || userData.userName || data.userName || data.username || 'Unknown User';
            const finalEmail = userData.email || data.userEmail || data.email || 'N/A';
            
            let createdAt = data.createdAt || data.timestamp || data.date || null;
            if (createdAt instanceof Timestamp) {
                createdAt = createdAt.toMillis();
            }

            allRequests.push({ 
                ...data, 
                id: doc.id, 
                username: finalName,
                userName: finalName,
                userEmail: finalEmail,
                createdAt,
                status: (data.status || 'pending').toLowerCase(),
                withdrawalDetails: {
                    method: details.method || data.method || 'N/A',
                    accountName: details.accountName || data.accountName || 'N/A',
                    accountNumber: details.accountNumber || data.accountNumber || 'N/A',
                    bankName: details.bankName || data.bankName || ''
                }
            } as WithdrawalRequest);
        });
        
        allRequests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setWithdrawals(allRequests);
        setLoading(false);
    }, (error) => {
        console.error("Error fetching withdrawals:", error);
        addToast(`Error fetching withdrawals: ${error.message}`, 'error');
        setLoading(false);
    });
    return () => unsubscribe();
  }, [addToast]);

  const filteredWithdrawals = withdrawals.filter(req => 
    req.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.userEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.withdrawalDetails?.accountNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.withdrawalDetails?.accountName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleConfirmApproval = async (enteredTransactionId: string) => {
    if (!approvalPayload) return;
    const { id } = approvalPayload;

    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      // Update status directly in the Firestore document
      const withdrawalRef = doc(db, 'withdrawals', id);
      await updateDoc(withdrawalRef, {
          status: 'approved',
          transactionId: enteredTransactionId,
          approvedAt: Timestamp.now()
      });
      
      addToast('Withdrawal approved successfully!', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unknown error occurred.";
      addToast(`Failed to approve withdrawal: ${message}`, 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
      setIsTxnModalOpen(false);
      setApprovalPayload(null);
    }
  };
  
  const handleReject = async (reason: string) => {
    if (!rejectionPayload) return;
    const { id, userId, amount } = rejectionPayload;

    setActionLoading(prev => ({...prev, [id]: true}));
    try {
        // 1. Update status in Firestore
        const withdrawalRef = doc(db, 'withdrawals', id);
        await updateDoc(withdrawalRef, {
            status: 'rejected',
            rejectionReason: reason,
            rejectedAt: Timestamp.now()
        });

        // 2. Return funds in RTDB
        const balanceRef = ref(rtdb, `users/${userId}/balance`);
        const balanceSnap = await get(balanceRef);
        const currentBalance = balanceSnap.val() || 0;
        await set(balanceRef, currentBalance + amount);
        
        addToast('Withdrawal rejected and funds returned.', 'success');
    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        addToast(`Failed to reject withdrawal: ${message}`, 'error');
    } finally {
        setActionLoading(prev => ({...prev, [id]: false}));
        setIsRejectModalOpen(false);
        setRejectionPayload(null);
    }
  };

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
                <ArrowUpFromLine className="text-amber-500" /> Withdrawal Requests
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Review and process user payout requests</p>
        </div>
      </div>

      <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by Name, Email or Account Number..."
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
      </div>

      {filteredWithdrawals.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-gray-100 dark:border-slate-800">
              <div className="w-16 h-16 bg-gray-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ArrowUpFromLine className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">No Pending Withdrawals</h3>
              <p className="text-gray-500 dark:text-gray-400">All payout requests have been processed.</p>
          </div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredWithdrawals.map((req) => (
                  <div key={req.id} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                      <div className="p-6 flex-grow">
                          <div className="flex items-center gap-3 mb-4">
                              <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center text-amber-600 dark:text-amber-400">
                                  <UserIcon size={20} />
                              </div>
                              <div className="overflow-hidden">
                                  <h3 className="font-bold text-gray-900 dark:text-white truncate">{req.userName || 'Unknown User'}</h3>
                                  <p className="text-xs text-amber-600 dark:text-amber-400 truncate">{req.userEmail || 'No Email'}</p>
                              </div>
                          </div>
                          
                          <div className="space-y-3">
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1">Amount</span>
                                  <span className="text-sm font-bold text-green-600">Rs {(req.amount ?? 0).toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1">Method</span>
                                  <span className="text-sm font-medium text-amber-600 dark:text-amber-400">{req.withdrawalDetails?.method || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1">Account Name</span>
                                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[150px]">{req.withdrawalDetails?.accountName || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1">Account Number</span>
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">{req.withdrawalDetails?.accountNumber || 'N/A'}</span>
                              </div>
                              {req.withdrawalDetails?.bankName && (
                                <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                    <span className="text-xs text-gray-500 flex items-center gap-1">Bank</span>
                                    <span className="text-sm font-medium text-gray-900 dark:text-white">{req.withdrawalDetails.bankName}</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1"><Calendar size={14} /> Requested</span>
                                  <span className="text-sm text-gray-700 dark:text-gray-300">
                                      {req.createdAt ? new Date(req.createdAt).toLocaleString() : 'N/A'}
                                  </span>
                              </div>
                          </div>
                      </div>
                      
                      <div className="p-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex gap-3">
                          <button 
                            onClick={() => { setRejectionPayload(req); setIsRejectModalOpen(true); }}
                            disabled={actionLoading[req.id]}
                            className="flex-1 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-sm font-bold hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors flex items-center justify-center gap-2"
                          >
                              {actionLoading[req.id] ? <Spinner size="sm" /> : <><X size={16} /> Reject</>}
                          </button>
                          <button 
                            onClick={() => { setApprovalPayload(req); setIsTxnModalOpen(true); }}
                            disabled={actionLoading[req.id]}
                            className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-green-600/20"
                          >
                              {actionLoading[req.id] ? <Spinner size="sm" /> : <><Check size={16} /> Approve</>}
                          </button>
                      </div>
                  </div>
              ))}
          </div>
      )}
      <RejectionModal isOpen={isRejectModalOpen} onClose={() => setIsRejectModalOpen(false)} onConfirm={handleReject} title="Reject Withdrawal" isLoading={rejectionPayload ? actionLoading[rejectionPayload.id] : false} />
      <TransactionIdModal isOpen={isTxnModalOpen} onClose={() => setIsTxnModalOpen(false)} onConfirm={handleConfirmApproval} isLoading={approvalPayload ? actionLoading[approvalPayload.id] : false} />
    </div>
  );
};

export default WithdrawalsPage;
