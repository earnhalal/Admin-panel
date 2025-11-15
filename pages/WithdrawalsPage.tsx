import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, runTransaction, getDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebase';
import { User } from './UsersPage';
import { useToast } from '../contexts/ToastContext';
import ConfirmationModal from '../components/ConfirmationModal';
import Spinner from '../components/Spinner';
import TransactionIdModal from '../components/TransactionIdModal';
import { CheckIcon } from '../components/icons/CheckIcon';
import { XIcon } from '../components/icons/XIcon';
import { ChevronDownIcon } from '../components/icons/ChevronDownIcon';
import Pagination from '../components/Pagination';
import Checkbox from '../components/Checkbox';
import RejectionModal from '../components/RejectionModal';

// Interfaces...
interface FirestoreWithdrawalRequestData {
  userId: string;
  amount: number;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  requestedAt: Timestamp;
  method: string;
  accountName: string;
  accountNumber: string;
  transactionId?: string;
  bankName?: string;
  rejectionReason?: string;
}

interface WithdrawalRequest {
  id: string;
  userId: string;
  amount: number;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  requestedAt: Date;
  userEmail?: string;
  transactionId?: string;
  method: string;
  accountName: string;
  accountNumber: string;
  bankName?: string;
  rejectionReason?: string;
}

interface RejectionPayload {
    id: string;
    userId: string;
    amount: number;
}

interface ApprovalPayload {
    id: string;
    userId: string;
}

type SortConfig = { key: keyof WithdrawalRequest; direction: 'ascending' | 'descending' } | null;

const WithdrawalsPage: React.FC = () => {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'Pending' | 'Approved' | 'Rejected'>('Pending');
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});
  const { addToast } = useToast();
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set());

  // New state for advanced features
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'requestedAt', direction: 'descending' });
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const ITEMS_PER_PAGE = 10;
  
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionPayload, setRejectionPayload] = useState<RejectionPayload | null>(null);
  
  const [isTxnModalOpen, setIsTxnModalOpen] = useState(false);
  const [approvalPayload, setApprovalPayload] = useState<ApprovalPayload | null>(null);
  
  const toggleExpand = (id: string) => {
    setExpandedRequests(prev => {
        const newSet = new Set(prev);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        return newSet;
    });
  };

  useEffect(() => {
    // ... (existing useEffect)
    setLoading(true);
    setExpandedRequests(new Set());
    setSelectedRequests(new Set());
    const q = query(collection(db, 'withdrawalRequests'), where('status', '==', filter));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
        // ... (existing data fetching logic)
        const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), requestedAt: (doc.data().requestedAt as Timestamp).toDate() } as WithdrawalRequest));
        const enrichedRequests = await Promise.all(requests.map(async req => {
            const userRef = doc(db, 'users', req.userId);
            const userSnap = await getDoc(userRef);
            return userSnap.exists() ? { ...req, userEmail: (userSnap.data() as User).email } : { ...req, userEmail: 'Unknown User' };
        }));
        setWithdrawals(enrichedRequests);
        setLoading(false);
    });
    return () => unsubscribe();
  }, [filter, addToast]);

  const sortedWithdrawals = useMemo(() => {
    let sortableItems = [...withdrawals];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
        if (aValue === undefined || aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (bValue === undefined || aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [withdrawals, sortConfig]);

  const paginatedWithdrawals = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedWithdrawals.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [sortedWithdrawals, currentPage]);

  const requestSort = (key: keyof WithdrawalRequest) => {
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
          setSelectedRequests(new Set(paginatedWithdrawals.map(r => r.id)));
      } else {
          setSelectedRequests(new Set());
      }
  };


  const openApprovalModal = (id: string, userId: string) => {
    setApprovalPayload({ id, userId });
    setIsTxnModalOpen(true);
  };
  
  const handleConfirmApproval = async (enteredTransactionId: string) => {
    // ... (existing implementation)
  };
  
  const openRejectModal = (payload: RejectionPayload) => {
    setRejectionPayload(payload);
    setIsRejectModalOpen(true);
  };

  const handleReject = async (reason: string) => {
    if (!rejectionPayload) return;
    const { id, userId, amount } = rejectionPayload;

    setActionLoading(prev => ({...prev, [id]: true}));
    try {
        await runTransaction(db, async (transaction) => {
            const withdrawalRef = doc(db, 'withdrawalRequests', id);
            const userRef = doc(db, 'users', userId);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) throw new Error("User not found.");
            
            const newBalance = userDoc.data().balance + amount;
            
            transaction.update(userRef, { balance: newBalance });
            transaction.update(withdrawalRef, { status: 'Rejected', rejectionReason: reason });
        });
        addToast('Withdrawal rejected and funds returned.', 'success');
    } catch (error) {
        addToast(`Failed to reject withdrawal.`, 'error');
    } finally {
        setActionLoading(prev => ({...prev, [id]: false}));
        setIsRejectModalOpen(false);
        setRejectionPayload(null);
    }
  };
  
  const handleBulkReject = async () => {
      if (selectedRequests.size === 0) return;
      setActionLoading(prev => ({ ...prev, bulkReject: true }));
      const batch = writeBatch(db);
      const userBalanceUpdates = new Map<string, number>();

      for (const reqId of selectedRequests) {
          const request = withdrawals.find(w => w.id === reqId);
          if (!request) continue;
          
          const withdrawalRef = doc(db, 'withdrawalRequests', reqId);
          batch.update(withdrawalRef, { status: 'Rejected', rejectionReason: 'Bulk rejected by admin.' });
          
          userBalanceUpdates.set(request.userId, (userBalanceUpdates.get(request.userId) || 0) + request.amount);
      }
      
      try {
          // Firestore transactions are better for balance updates but harder in a loop.
          // This approach is faster but less atomic for the balance part.
          // For a production app, a Cloud Function would be ideal here.
          for (const [userId, amountToRefund] of userBalanceUpdates.entries()) {
              const userRef = doc(db, 'users', userId);
              const userDoc = await getDoc(userRef);
              if (userDoc.exists()) {
                  const newBalance = (userDoc.data().balance || 0) + amountToRefund;
                  batch.update(userRef, { balance: newBalance });
              }
          }

          await batch.commit();
          addToast(`${selectedRequests.size} requests rejected.`, 'success');
          setSelectedRequests(new Set());
      } catch (error) {
          addToast('Bulk rejection failed.', 'error');
      } finally {
          setActionLoading(prev => ({ ...prev, bulkReject: false }));
      }
  };

  return (
    <div className="container mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">Withdrawal Requests</h1>
      <div className="mb-4">
        {/* ... (existing filter buttons) ... */}
      </div>

      {filter === 'Pending' && selectedRequests.size > 0 && (
          <div className="mb-4 bg-indigo-100 dark:bg-indigo-900/50 p-3 rounded-lg flex items-center justify-between">
              <span className="text-sm font-medium text-indigo-800 dark:text-indigo-200">{selectedRequests.size} request(s) selected</span>
              <div className="flex gap-2">
                  <button onClick={handleBulkReject} className="px-3 py-1 text-xs font-semibold text-white bg-red-600 rounded-md hover:bg-red-700" disabled={actionLoading.bulkReject}>Reject Selected</button>
              </div>
          </div>
      )}
      
      {loading ? ( <div className="text-center mt-10">Loading...</div> ) : paginatedWithdrawals.length === 0 ? (
        <p className="text-center py-10 text-gray-500 dark:text-gray-400">No {filter} requests found.</p>
      ) : (
        <div className="bg-white dark:bg-slate-900 shadow-md rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full leading-normal">
              <thead>
                <tr>
                  {filter === 'Pending' && (
                    <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800">
                      <Checkbox
                          checked={selectedRequests.size === paginatedWithdrawals.length && paginatedWithdrawals.length > 0}
                          onChange={handleSelectAll}
                          indeterminate={selectedRequests.size > 0 && selectedRequests.size < paginatedWithdrawals.length}
                      />
                    </th>
                  )}
                  <th onClick={() => requestSort('userEmail')} className="cursor-pointer px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">User</th>
                  <th onClick={() => requestSort('amount')} className="cursor-pointer px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                  <th onClick={() => requestSort('requestedAt')} className="cursor-pointer px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Date</th>
                  {filter !== 'Pending' && <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Details</th>}
                  {filter === 'Pending' && <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {paginatedWithdrawals.map((req) => (
                   <React.Fragment key={req.id}>
                    <tr className="bg-white dark:bg-slate-900">
                        {filter === 'Pending' && (
                            <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                                <Checkbox
                                    checked={selectedRequests.has(req.id)}
                                    onChange={() => handleSelectRequest(req.id)}
                                />
                            </td>
                        )}
                        <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                           <div className="flex items-center">
                                <button onClick={() => toggleExpand(req.id)} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 mr-3 transition-colors">
                                    <ChevronDownIcon className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${expandedRequests.has(req.id) ? 'rotate-180' : ''}`} />
                                </button>
                                <p className="text-gray-900 dark:text-white whitespace-no-wrap">{req.userEmail}</p>
                           </div>
                        </td>
                        <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm"><p className="text-gray-900 dark:text-white whitespace-no-wrap">Rs {req.amount.toFixed(2)}</p></td>
                        <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                            <p className="text-gray-900 dark:text-white whitespace-no-wrap">{req.requestedAt.toLocaleString()}</p>
                        </td>
                        {filter !== 'Pending' && <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                            <p className="text-gray-900 dark:text-white whitespace-no-wrap break-all">{req.transactionId || 'N/A'}</p>
                            {req.rejectionReason && <p className="text-red-500 text-xs mt-1">Reason: {req.rejectionReason}</p>}
                        </td>}
                        {filter === 'Pending' && (
                        <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                            <div className="flex items-center gap-2">
                            <button onClick={() => openApprovalModal(req.id, req.userId)} disabled={actionLoading[req.id]} className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-green-400">
                                {actionLoading[req.id] ? <Spinner /> : <CheckIcon className="w-4 h-4" />}
                            </button>
                            <button onClick={() => openRejectModal({id: req.id, userId: req.userId, amount: req.amount})} disabled={actionLoading[req.id]} className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-red-400">
                                {actionLoading[req.id] ? <Spinner /> : <XIcon className="w-4 h-4" />}
                            </button>
                            </div>
                        </td>
                        )}
                    </tr>
                    {expandedRequests.has(req.id) && (
                        <tr className="bg-gray-50 dark:bg-slate-800/50">
                            <td colSpan={filter === 'Pending' ? 5 : 4} className="p-0">
                                <div className="px-10 py-4">
                                    <h4 className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-2">Account Details</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                                        <div><span className="text-gray-500 dark:text-gray-400">Method:</span> <span className="font-medium text-gray-900 dark:text-white">{req.method}</span></div>
                                        <div><span className="text-gray-500 dark:text-gray-400">Account Name:</span> <span className="font-medium text-gray-900 dark:text-white">{req.accountName}</span></div>
                                        <div><span className="text-gray-500 dark:text-gray-400">Account Number:</span> <span className="font-medium text-gray-900 dark:text-white break-all">{req.accountNumber}</span></div>
                                        {req.bankName && <div><span className="text-gray-500 dark:text-gray-400">Bank:</span> <span className="font-medium text-gray-900 dark:text-white">{req.bankName}</span></div>}
                                    </div>
                                </div>
                            </td>
                        </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(sortedWithdrawals.length / ITEMS_PER_PAGE)}
              onPageChange={setCurrentPage}
          />
        </div>
      )}

      <RejectionModal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        onConfirm={handleReject}
        title="Reject Withdrawal"
        isLoading={rejectionPayload ? actionLoading[rejectionPayload.id] : false}
      />
      <TransactionIdModal
        isOpen={isTxnModalOpen}
        onClose={() => setIsTxnModalOpen(false)}
        onConfirm={handleConfirmApproval}
        isLoading={approvalPayload ? actionLoading[approvalPayload.id] : false}
      />
    </div>
  );
};

export default WithdrawalsPage;