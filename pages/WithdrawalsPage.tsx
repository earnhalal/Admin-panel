import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, runTransaction, getDoc, Timestamp, writeBatch, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { User } from './UsersPage';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';
import TransactionIdModal from '../components/TransactionIdModal';
import { CheckIcon } from '../components/icons/CheckIcon';
import { XIcon } from '../components/icons/XIcon';
import Pagination from '../components/Pagination';
import Checkbox from '../components/Checkbox';
import RejectionModal from '../components/RejectionModal';

// Interfaces...
interface WithdrawalRequest {
  id: string;
  userId: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
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
    amount: number;
}

type SortConfig = { key: keyof WithdrawalRequest; direction: 'ascending' | 'descending' } | null;

const WithdrawalsPage: React.FC = () => {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});
  const { addToast } = useToast();
  
  // New state for advanced features
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'requestedAt', direction: 'descending' });
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const ITEMS_PER_PAGE = 10;
  
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionPayload, setRejectionPayload] = useState<RejectionPayload | null>(null);
  
  const [isTxnModalOpen, setIsTxnModalOpen] = useState(false);
  const [approvalPayload, setApprovalPayload] = useState<ApprovalPayload | null>(null);

  useEffect(() => {
    setLoading(true);
    setSelectedRequests(new Set());
    const q = query(collection(db, 'withdrawal_requests'), where('status', '==', filter));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
        const requests = snapshot.docs.map(doc => {
          const data = doc.data();
          const requestedAtDate = data.requestedAt ? (data.requestedAt as Timestamp).toDate() : new Date(0); // Fallback date
          return { id: doc.id, ...data, requestedAt: requestedAtDate } as WithdrawalRequest
        });
        const enrichedRequests = await Promise.all(requests.map(async req => {
            const userRef = doc(db, 'users', req.userId);
            const userSnap = await getDoc(userRef);
            return userSnap.exists() ? { ...req, userEmail: (userSnap.data() as User).email } : { ...req, userEmail: 'Unknown User' };
        }));
        setWithdrawals(enrichedRequests);
        setLoading(false);
    }, (error) => {
        console.error("Error fetching withdrawals:", error);
        addToast("Error fetching withdrawals.", 'error');
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


  const openApprovalModal = (id: string, userId: string, amount: number) => {
    setApprovalPayload({ id, userId, amount });
    setIsTxnModalOpen(true);
  };
  
  const handleConfirmApproval = async (enteredTransactionId: string) => {
    if (!approvalPayload) return;
    const { id, userId, amount } = approvalPayload;

    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await runTransaction(db, async (transaction) => {
          const settingsRef = doc(db, 'settings', 'global');
          const settingsDoc = await transaction.get(settingsRef);
          const withdrawalFeeRate = settingsDoc.exists() ? (settingsDoc.data().withdrawalFeeRate || 0) : 0;
          
          const feeAmount = (amount * withdrawalFeeRate) / 100;
          
          const withdrawalRef = doc(db, 'withdrawal_requests', id);
          const userRef = doc(db, 'users', userId);
          const userDoc = await transaction.get(userRef);
          
          if (!userDoc.exists()) throw new Error("User not found.");
          if (userDoc.data().balance < amount) throw new Error("Insufficient balance.");
          
          const newBalance = userDoc.data().balance - amount;
          
          transaction.update(userRef, { balance: newBalance });
          transaction.update(withdrawalRef, { status: 'approved', transactionId: enteredTransactionId });

          if (feeAmount > 0) {
              const revenueRef = collection(db, 'revenueTransactions');
              transaction.set(doc(revenueRef), {
                  adminFeeAmount: feeAmount,
                  originalAmount: amount,
                  sourceUser: userId,
                  timestamp: Timestamp.now(),
                  transactionType: 'withdrawal_fee',
                  relatedDocId: id,
              });
          }
      });
      addToast('Withdrawal approved successfully!', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unknown error occurred.";
      addToast(`Failed to approve withdrawal: ${message}`, 'error');
      console.error('Approval failed:', error);
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
      setIsTxnModalOpen(false);
      setApprovalPayload(null);
    }
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
            const withdrawalRef = doc(db, 'withdrawal_requests', id);
            const userRef = doc(db, 'users', userId);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) throw new Error("User not found.");
            
            // This logic assumes balance was deducted on request. If not, no need to add back.
            // Let's assume balance is only deducted on approval for consistency.
            // const newBalance = userDoc.data().balance + amount;
            // transaction.update(userRef, { balance: newBalance });
            
            transaction.update(withdrawalRef, { status: 'rejected', rejectionReason: reason });
        });
        addToast('Withdrawal rejected.', 'success');
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
      selectedRequests.forEach(reqId => {
          const request = withdrawals.find(w => w.id === reqId);
          if (request) {
              const withdrawalRef = doc(db, 'withdrawal_requests', reqId);
              batch.update(withdrawalRef, { status: 'rejected', rejectionReason: 'Bulk rejected by admin.' });
          }
      });

      try {
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
      <div className="mb-4 flex flex-wrap gap-2">
        {(['pending', 'approved', 'rejected'] as const).map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`capitalize px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
              filter === status
                ? 'bg-indigo-600 text-white'
                : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {filter === 'pending' && selectedRequests.size > 0 && (
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
        <>
            {/* Desktop Table */}
            <div className="bg-white dark:bg-slate-900 shadow-md rounded-lg overflow-hidden hidden md:block">
                <div className="overflow-x-auto">
                    <table className="min-w-full leading-normal">
                    <thead>
                        <tr>
                        {filter === 'pending' && (
                            <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800">
                            <Checkbox
                                checked={selectedRequests.size === paginatedWithdrawals.length && paginatedWithdrawals.length > 0}
                                onChange={handleSelectAll}
                                indeterminate={selectedRequests.size > 0 && selectedRequests.size < paginatedWithdrawals.length}
                            />
                            </th>
                        )}
                        <th onClick={() => requestSort('userEmail')} className="cursor-pointer px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">User & Details</th>
                        <th onClick={() => requestSort('amount')} className="cursor-pointer px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                        <th onClick={() => requestSort('requestedAt')} className="cursor-pointer px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Date</th>
                        {filter !== 'pending' && <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Details</th>}
                        {filter === 'pending' && <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Actions</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedWithdrawals.map((req) => (
                        <tr key={req.id}>
                            {filter === 'pending' && <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm"><Checkbox checked={selectedRequests.has(req.id)} onChange={() => handleSelectRequest(req.id)} /></td>}
                            <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                                <p className="font-semibold">{req.userEmail}</p>
                                <p className="text-xs text-gray-500">{req.method}: {req.accountNumber}</p>
                            </td>
                            <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm"><p>Rs {req.amount.toFixed(2)}</p></td>
                            <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm"><p>{req.requestedAt.toLocaleString()}</p></td>
                            {filter !== 'pending' && <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm"><p className="break-all">{req.transactionId || 'N/A'}</p>{req.rejectionReason && <p className="text-red-500 text-xs mt-1">Reason: {req.rejectionReason}</p>}</td>}
                            {filter === 'pending' && <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm"><div className="flex items-center gap-2"><button onClick={() => openApprovalModal(req.id, req.userId, req.amount)} disabled={actionLoading[req.id]} className="p-2 bg-green-100 dark:bg-green-900/50 rounded-full"><CheckIcon className="w-4 h-4 text-green-600 dark:text-green-400"/></button><button onClick={() => openRejectModal({id: req.id, userId: req.userId, amount: req.amount})} disabled={actionLoading[req.id]} className="p-2 bg-red-100 dark:bg-red-900/50 rounded-full"><XIcon className="w-4 h-4 text-red-600 dark:text-red-400" /></button></div></td>}
                        </tr>
                        ))}
                    </tbody>
                    </table>
                </div>
                <Pagination currentPage={currentPage} totalPages={Math.ceil(sortedWithdrawals.length / ITEMS_PER_PAGE)} onPageChange={setCurrentPage}/>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-4">
                {paginatedWithdrawals.map(req => (
                    <div key={req.id} className="bg-white dark:bg-slate-900 shadow-md rounded-lg p-4">
                        <div className="flex justify-between items-start">
                             <div>
                                <p className="font-bold text-lg text-gray-900 dark:text-white">Rs {req.amount.toFixed(2)}</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{req.userEmail}</p>
                            </div>
                            {filter === 'pending' && <Checkbox checked={selectedRequests.has(req.id)} onChange={() => handleSelectRequest(req.id)} />}
                        </div>
                        <div className="mt-4 text-sm space-y-1">
                            <p><span className="font-semibold">Method:</span> {req.method}</p>
                            <p><span className="font-semibold">Account:</span> {req.accountNumber}</p>
                            <p><span className="font-semibold">Name:</span> {req.accountName}</p>
                            {req.bankName && <p><span className="font-semibold">Bank:</span> {req.bankName}</p>}
                            <p className="text-xs text-gray-400 pt-1">{req.requestedAt.toLocaleString()}</p>
                        </div>
                         {filter !== 'pending' && (
                            <div className="mt-2 text-sm">
                                {req.transactionId && <p><span className="font-semibold">Txn ID:</span> <span className="break-all">{req.transactionId}</span></p>}
                                {req.rejectionReason && <p><span className="font-semibold text-red-500">Reason:</span> {req.rejectionReason}</p>}
                            </div>
                         )}
                        {filter === 'pending' && (
                            <div className="mt-4 flex justify-end gap-2">
                                <button onClick={() => openApprovalModal(req.id, req.userId, req.amount)} disabled={actionLoading[req.id]} className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700">Approve</button>
                                <button onClick={() => openRejectModal({id: req.id, userId: req.userId, amount: req.amount})} disabled={actionLoading[req.id]} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700">Reject</button>
                            </div>
                        )}
                    </div>
                ))}
                 <Pagination currentPage={currentPage} totalPages={Math.ceil(sortedWithdrawals.length / ITEMS_PER_PAGE)} onPageChange={setCurrentPage}/>
            </div>
        </>
      )}

      <RejectionModal isOpen={isRejectModalOpen} onClose={() => setIsRejectModalOpen(false)} onConfirm={handleReject} title="Reject Withdrawal" isLoading={rejectionPayload ? actionLoading[rejectionPayload.id] : false} />
      <TransactionIdModal isOpen={isTxnModalOpen} onClose={() => setIsTxnModalOpen(false)} onConfirm={handleConfirmApproval} isLoading={approvalPayload ? actionLoading[approvalPayload.id] : false} />
    </div>
  );
};

export default WithdrawalsPage;