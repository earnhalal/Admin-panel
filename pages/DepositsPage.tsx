import React, { useState, useEffect, useMemo } from 'react';
import { db, rtdb } from '../services/firebase';
import { collection, onSnapshot, doc, updateDoc, setDoc, getDoc, query, orderBy, Timestamp, increment } from 'firebase/firestore';
import { ref, set as setRtdb, get as getRtdb, remove as removeRtdb } from 'firebase/database';
import { useToast } from '../contexts/ToastContext';
import ConfirmationModal from '../components/ConfirmationModal';
import Pagination from '../components/Pagination';
import Checkbox from '../components/Checkbox';
import DepositApprovalModal from '../components/DepositApprovalModal';
import Spinner from '../components/Spinner';
import { 
  Check, 
  X, 
  Search, 
  ArrowLeft, 
  ArrowDownToLine, 
  User as UserIcon, 
  Calendar, 
  CreditCard,
  Filter
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface DepositRequest {
  id: string;
  userId: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'Pending' | 'Approved' | 'Rejected';
  createdAt: any;
  userEmail?: string;
  userName?: string;
  method: string;
  transactionId: string;
  senderInfo?: string;
  type?: 'activation' | 'deposit';
}

type SortConfig = { key: keyof DepositRequest; direction: 'ascending' | 'descending' } | null;

const DepositsPage: React.FC = () => {
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState<{ [key: string]: boolean }>({});
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'createdAt', direction: 'descending' });
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const ITEMS_PER_PAGE = 10;
  
  const [isRejectConfirmOpen, setIsRejectConfirmOpen] = useState(false);
  const [requestToReject, setRequestToReject] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [proofModal, setProofModal] = useState<{ img: string; req: DepositRequest } | null>(null);

  const viewProof = async (req: DepositRequest) => {
    try {
      const snap = await getDoc(doc(db, 'deposits', req.id, 'proof', 'image'));
      if (snap.exists()) {
        setProofModal({ img: (snap.data() as any).data || '', req });
      } else {
        addToast('No screenshot found for this deposit.', 'error');
      }
    } catch (e) {
      addToast('Failed to load the screenshot.', 'error');
    }
  };

  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [approvalPayload, setApprovalPayload] = useState<DepositRequest | null>(null);

  useEffect(() => {
    setLoading(true);
    setSelectedRequests(new Set());
    
    // Fetch from Firestore 'deposits'
    const depositsRef = collection(db, 'deposits');
    
    const unsubscribe = onSnapshot(depositsRef, async (snapshot) => {
        const requests: DepositRequest[] = [];
        
        // We might need to fetch user names if they aren't in the deposit doc
        const userIds = new Set<string>();
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.userId) userIds.add(data.userId);
        });

        // Fetch user data from RTDB for names
        const userMap: {[key: string]: any} = {};
        if (userIds.size > 0) {
            const userPromises = Array.from(userIds).map(uid => getRtdb(ref(rtdb, `users/${uid}`)));
            const userSnaps = await Promise.all(userPromises);
            userSnaps.forEach((snap, idx) => {
                userMap[Array.from(userIds)[idx]] = snap.val() || {};
            });
        }

        snapshot.docs.forEach((doc) => {
            const data = doc.data();
            // Flexible status check
            const rawStatus = data.status || data.Status || 'pending';
            const status = rawStatus.toLowerCase();
            
            // The user app writes type 'regular' (normal deposits) and
            // 'activation' (joining-fee deposits); older docs use 'deposit'
            // or no type at all. Every doc here is a deposit request.
            const type = (data.type || 'deposit').toLowerCase();
            if (status === filter && (type === 'deposit' || type === 'regular' || type === 'activation')) {
                const userData = userMap[data.userId] || {};
                const name = userData.username || userData.userName || userData.name || userData.displayName || data.userName || data.username || 'Anonymous';
                const email = userData.email || data.userEmail || data.email || 'N/A';
                
                requests.push({ 
                    ...data,
                    id: doc.id,
                    userName: name,
                    userEmail: email,
                    createdAt: data.createdAt || data.timestamp || data.date || null,
                    method: data.method || data.paymentMethod || data.gateway || 'N/A',
                    transactionId: data.transactionId || data.txnId || data.transactionID || 'N/A',
                    amount: Number(data.amount) || 0
                } as DepositRequest);
            }
        });
        setDeposits(requests);
        setLoading(false);
    }, (error) => {
        console.error("Error fetching deposits:", error);
        addToast('Error fetching deposits from Firestore.', 'error');
        setLoading(false);
    });
    return () => unsubscribe();
  }, [filter, addToast]);

  const filteredDeposits = useMemo(() => {
    return deposits.filter(req => 
      req.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.userEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.transactionId?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [deposits, searchTerm]);

  const sortedDeposits = useMemo(() => {
      let sortableItems = [...filteredDeposits];
      if(sortConfig) {
          sortableItems.sort((a,b) => {
              let aVal = a[sortConfig.key];
              let bVal = b[sortConfig.key];
              
              // Handle Firestore Timestamps
              if (aVal instanceof Timestamp) aVal = aVal.toMillis();
              if (bVal instanceof Timestamp) bVal = bVal.toMillis();
              
              if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
              if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
              return 0;
          });
      }
      return sortableItems;
  }, [filteredDeposits, sortConfig]);

  const paginatedDeposits = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedDeposits.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [sortedDeposits, currentPage]);

  const requestSort = (key: keyof DepositRequest) => {
      let direction: 'ascending' | 'descending' = 'ascending';
      if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
          direction = 'descending';
      }
      setSortConfig({ key, direction });
  };
  
  const handleSelectRequest = (id: string) => {
      setSelectedRequests(prev => {
          const newSet = new Set(prev);
          if (newSet.has(id)) newSet.delete(id);
          else newSet.add(id);
          return newSet;
      });
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.checked) {
          setSelectedRequests(new Set(paginatedDeposits.map(d => d.id)));
      } else {
          setSelectedRequests(new Set());
      }
  };
  
  const openApprovalModal = (request: DepositRequest) => {
    setApprovalPayload(request);
    setIsApprovalModalOpen(true);
  };

  const handleConfirmApprove = async (requestToApprove: DepositRequest) => {
    if (!requestToApprove) return;
    const { id, userId, amount } = requestToApprove;
    
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
        // 1. Credit the wallet — regular deposits only. An activation fee
        // is platform revenue, never wallet balance, so approving an
        // activation request must not credit it back to the user.
        if (requestToApprove.type !== 'activation') {
        const balanceRef = ref(rtdb, `users/${userId}/balance`);
        const balanceSnap = await getRtdb(balanceRef);
        const currentBalance = balanceSnap.val() || 0;
        await setRtdb(balanceRef, currentBalance + amount);

        // 1b. Mirror the RESULTING RTDB balance into Firestore (set, not
        // increment): RTDB is the source of truth, so writing the final
        // value also heals any drift the Firestore copy had accumulated.
        await setDoc(doc(db, 'users', userId), { balance: currentBalance + amount }, { merge: true });
        }

        // 2. If activation type, update status
        if (requestToApprove.type === 'activation') {
            await setRtdb(ref(rtdb, 'users/' + userId + '/status'), 'active');
            await setRtdb(ref(rtdb, 'users/' + userId + '/feeStatus'), 'paid');
        }
        
        // 3. Update deposit status in Firestore
        const depositRef = doc(db, 'deposits', id);
        await updateDoc(depositRef, {
            status: 'Approved',
            approvedAt: Timestamp.now()
        });
        
        addToast('Deposit approved and balance updated!', 'success');
    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        addToast(`Failed to approve deposit: ${message}`, 'error');
        console.error(error);
    } finally {
        setActionLoading(prev => ({ ...prev, [id]: false }));
        if (approvalPayload && approvalPayload.id === id) {
          setIsApprovalModalOpen(false);
          setApprovalPayload(null);
        }
    }
  };

  const openRejectConfirm = (id: string) => {
    setRequestToReject(id);
    setIsRejectConfirmOpen(true);
  };

  const handleReject = async (reqId?: string) => {
    const id = reqId || requestToReject;
    if (!id) return;

    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
        // Update deposit status in Firestore
        const depositRef = doc(db, 'deposits', id);
        await updateDoc(depositRef, {
            status: 'Rejected',
            rejectedAt: Timestamp.now(),
            rejectReason: rejectReason.trim() || 'Payment proof was not clear or the details did not match.'
        });

        // If this was an activation request, also clear it from the RTDB joining queue
        const rejectedReq = deposits.find(r => r.id === id);
        if (rejectedReq && (rejectedReq as any).type === 'activation') {
            try { await removeRtdb(ref(rtdb, `pending_requests/${rejectedReq.userId}`)); } catch (e) {}
            try { await setRtdb(ref(rtdb, 'users/' + rejectedReq.userId + '/status'), 'rejected'); } catch (e) {}
        }
        
        addToast('Deposit rejected.', 'success');
    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        addToast(`Failed to reject deposit: ${message}`, 'error');
    } finally {
        setActionLoading(prev => ({ ...prev, [id]: false }));
        setIsRejectConfirmOpen(false);
        setRejectReason('');
    }
  };

  const handleBulkAction = async (action: 'approve' | 'reject') => {
      if (selectedRequests.size === 0) return;
      setActionLoading({ ...actionLoading, bulk: true });

      try {
          const promises: Promise<void>[] = [];
          for (const reqId of selectedRequests) {
              if (action === 'approve') {
                  const request = deposits.find(d => d.id === reqId);
                  if (request) {
                      promises.push(handleConfirmApprove(request));
                  }
              } else { // Reject action
                  promises.push(handleReject(reqId));
              }
          }
          await Promise.all(promises);
          
          addToast(`Successfully ${action}d ${selectedRequests.size} requests.`, 'success');
          setSelectedRequests(new Set());
      } catch (error) {
          addToast(`Bulk ${action} failed.`, 'error');
      } finally {
          setActionLoading({ ...actionLoading, bulk: false });
      }
  };

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
                <ArrowDownToLine className="text-indigo-500" /> Deposit Requests
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Manage user wallet top-ups (Firestore)</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by Name, Email or Transaction ID..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
        <div className="relative min-w-[180px]">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 appearance-none outline-none"
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
            >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
            </select>
        </div>
      </div>
      
       {filter === 'pending' && selectedRequests.size > 0 && (
          <div className="bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3 rounded-xl border border-indigo-100 dark:border-indigo-800 flex items-center justify-between">
              <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400">{selectedRequests.size} Selected</span>
              <div className="flex gap-3">
                  <button onClick={() => handleBulkAction('approve')} className="px-4 py-1.5 text-xs font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-sm" disabled={actionLoading.bulk}>Approve All</button>
                  <button onClick={() => handleBulkAction('reject')} className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors shadow-sm" disabled={actionLoading.bulk}>Reject All</button>
              </div>
          </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center min-h-[400px]"><Spinner /></div>
      ) : paginatedDeposits.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-gray-100 dark:border-slate-800">
            <div className="w-16 h-16 bg-gray-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <ArrowDownToLine className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">No {filter} requests</h3>
            <p className="text-gray-500 dark:text-gray-400">There are no {filter} deposit requests at the moment.</p>
        </div>
      ) : (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paginatedDeposits.map((req) => (
                    <div key={req.id} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                        <div className="p-6 flex-grow">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                        <UserIcon size={20} />
                                    </div>
                                    <div className="overflow-hidden">
                                        <h3 className="font-bold text-gray-900 dark:text-white truncate">{req.userName || 'Anonymous'}</h3>
                                        <p className="text-xs text-indigo-600 dark:text-indigo-400 truncate">{req.userEmail || 'No Email'}</p>
                                    </div>
                                </div>
                                {filter === 'pending' && (
                                    <Checkbox checked={selectedRequests.has(req.id)} onChange={() => handleSelectRequest(req.id)} />
                                )}
                            </div>
                            
                            <div className="space-y-3">
                                <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                    <span className="text-xs text-gray-500 flex items-center gap-1"><CreditCard size={14} /> Amount</span>
                                    <span className="text-sm font-bold text-green-600">Rs {(req.amount ?? 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                    <span className="text-xs text-gray-500 flex items-center gap-1">Method</span>
                                    <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{req.method || 'N/A'}</span>
                                </div>
                                {req.senderInfo && (
                                    <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                        <span className="text-xs text-gray-500 flex items-center gap-1">Sender</span>
                                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[150px]">{req.senderInfo}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                    <span className="text-xs text-gray-500 flex items-center gap-1"><Calendar size={14} /> Date</span>
                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                        {req.createdAt ? (req.createdAt instanceof Timestamp ? req.createdAt.toDate().toLocaleString() : new Date(req.createdAt).toLocaleString()) : 'N/A'}
                                    </span>
                                </div>
                                <div className="pt-2">
                                    <span className="text-xs text-gray-500 block mb-1">Transaction ID</span>
                                    <div className="bg-gray-50 dark:bg-slate-800 p-2 rounded-lg text-xs font-mono text-gray-700 dark:text-gray-300 break-all border border-gray-100 dark:border-slate-700">
                                        {req.transactionId || 'No ID provided'}
                                    </div>
                                </div>
                                {(req as any).proofMethod === 'upload' && (
                                    <button onClick={() => viewProof(req)} className="mt-3 w-full py-2 rounded-lg bg-emerald-600/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-600/20 transition">
                                        View Payment Screenshot
                                    </button>
                                )}
                                {req.type && (
                                    <div className="mt-2 text-center">
                                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${req.type === 'activation' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30'}`}>
                                            {req.type}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        {filter === 'pending' && (
                            <div className="p-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex gap-3">
                                <button 
                                    onClick={() => openRejectConfirm(req.id)}
                                    disabled={actionLoading[req.id]}
                                    className="flex-1 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-sm font-bold hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors flex items-center justify-center gap-2"
                                >
                                    {actionLoading[req.id] ? <Spinner size="sm" /> : <><X size={16} /> Reject</>}
                                </button>
                                <button 
                                    onClick={() => openApprovalModal(req)}
                                    disabled={actionLoading[req.id]}
                                    className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-green-600/20"
                                >
                                    {actionLoading[req.id] ? <Spinner size="sm" /> : <><Check size={16} /> Approve</>}
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <div className="mt-8">
                <Pagination currentPage={currentPage} totalPages={Math.ceil(sortedDeposits.length / ITEMS_PER_PAGE)} onPageChange={setCurrentPage}/>
            </div>
        </>
      )}
      
      <DepositApprovalModal 
        isOpen={isApprovalModalOpen}
        onClose={() => { setIsApprovalModalOpen(false); setApprovalPayload(null); }}
        onConfirm={() => approvalPayload && handleConfirmApprove(approvalPayload)}
        request={approvalPayload}
        isLoading={approvalPayload ? actionLoading[approvalPayload.id] : false}
      />
      {isRejectConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setIsRejectConfirmOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black text-gray-900 dark:text-white">Reject Deposit</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">The user sees this reason in their verification chat, so pick or write it clearly.</p>
            <div className="flex flex-wrap gap-2 mt-4">
              {['Duplicate screenshot — already used before', 'Screenshot is not clear', 'Amount does not match the request', 'Payment sent to the wrong account', 'Transaction details do not match'].map(r => (
                <button key={r} onClick={() => setRejectReason(r)} className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition ${rejectReason === r ? 'bg-rose-600 text-white border-rose-600' : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 hover:border-rose-400'}`}>{r}</button>
              ))}
            </div>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} placeholder="Reason for rejection (shown to the user)…" className="mt-3 w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 py-2.5 text-sm text-gray-800 dark:text-gray-100 outline-none focus:border-rose-400" />
            <div className="flex gap-3 mt-5">
              <button onClick={() => setIsRejectConfirmOpen(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-bold text-gray-600 dark:text-gray-300">Cancel</button>
              <button onClick={() => handleReject()} className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 transition">Reject Deposit</button>
            </div>
          </div>
        </div>
      )}
      {proofModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setProofModal(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-gray-900 dark:text-white">Payment Screenshot</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold">{proofModal.req.userName} • Rs. {proofModal.req.amount} • {proofModal.req.type || 'regular'}</p>
              </div>
              <button onClick={() => setProofModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500"><X size={18} /></button>
            </div>
            {(proofModal.req as any).screenshotHash && deposits.filter(d => (d as any).screenshotHash === (proofModal.req as any).screenshotHash).length > 1 && (
              <div className="mt-3 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/50 rounded-xl px-3 py-2">
                Duplicate screenshot — this exact image was submitted {deposits.filter(d => (d as any).screenshotHash === (proofModal.req as any).screenshotHash).length} times.
              </div>
            )}
            {proofModal.img ? (
              <img src={proofModal.img} alt="Payment screenshot" className="mt-3 w-full rounded-xl border border-gray-100 dark:border-slate-800" />
            ) : (
              <p className="mt-3 text-sm text-gray-500">Screenshot data is empty.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DepositsPage;
