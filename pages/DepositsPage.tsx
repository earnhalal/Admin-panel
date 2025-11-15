import React, { useState, useEffect, useMemo } from 'react';
// FIX: Import `updateDoc` to resolve 'Cannot find name' error.
import { collection, query, where, onSnapshot, doc, runTransaction, getDoc, Timestamp, writeBatch, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { User } from './UsersPage';
import { useToast } from '../contexts/ToastContext';
import ConfirmationModal from '../components/ConfirmationModal';
import { CheckIcon } from '../components/icons/CheckIcon';
import { XIcon } from '../components/icons/XIcon';
import Pagination from '../components/Pagination';
import Checkbox from '../components/Checkbox';


interface DepositRequest {
  id: string;
  userId: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: Date;
  userEmail?: string;
  method: string;
  transactionId: string;
  senderInfo?: string;
}

type SortConfig = { key: keyof DepositRequest; direction: 'ascending' | 'descending' } | null;

const DepositsPage: React.FC = () => {
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [actionLoading, setActionLoading] = useState<{ [key: string]: boolean }>({});
  const { addToast } = useToast();

  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'requestedAt', direction: 'descending' });
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const ITEMS_PER_PAGE = 10;
  
  const [isRejectConfirmOpen, setIsRejectConfirmOpen] = useState(false);
  const [requestToReject, setRequestToReject] = useState<string | null>(null);

  const [isApproveConfirmOpen, setIsApproveConfirmOpen] = useState(false);
  const [requestToApprove, setRequestToApprove] = useState<DepositRequest | null>(null);

  useEffect(() => {
    setLoading(true);
    setSelectedRequests(new Set());
    const q = query(collection(db, 'depositRequests'), where('status', '==', filter));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), requestedAt: (doc.data().requestedAt as Timestamp).toDate() } as DepositRequest));
      const enrichedRequests = await Promise.all(requests.map(async req => {
          const userRef = doc(db, 'users', req.userId);
          const userSnap = await getDoc(userRef);
          return userSnap.exists() ? { ...req, userEmail: (userSnap.data() as User).email } : { ...req, userEmail: 'Unknown User' };
      }));
      setDeposits(enrichedRequests);
      setLoading(false);
    }, (error) => {
        console.error("Error fetching deposits:", error);
        addToast('Error fetching deposits.', 'error');
        setLoading(false);
    });
    return () => unsubscribe();
  }, [filter, addToast]);

  const sortedDeposits = useMemo(() => {
      let sortableItems = [...deposits];
      if(sortConfig) {
          sortableItems.sort((a,b) => {
              if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'ascending' ? -1 : 1;
              if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'ascending' ? 1 : -1;
              return 0;
          });
      }
      return sortableItems;
  }, [deposits, sortConfig]);

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
  
  const handleApproveClick = (request: DepositRequest) => {
    setRequestToApprove(request);
    setIsApproveConfirmOpen(true);
  };

  const handleConfirmApprove = async (reqToApprove?: DepositRequest) => {
    const request = reqToApprove || requestToApprove;
    if (!request) return;
    const { id, userId, amount } = request;
    
    setActionLoading(prev => ({ ...prev, [id]: true }));
     try {
        await runTransaction(db, async (transaction) => {
            const settingsRef = doc(db, 'settings', 'global');
            const settingsDoc = await transaction.get(settingsRef);
            const depositFeeRate = settingsDoc.exists() ? (settingsDoc.data().depositFeeRate || 0) : 0;

            const feeAmount = (amount * depositFeeRate) / 100;
            const netAmount = amount - feeAmount;

            const depositRef = doc(db, 'depositRequests', id);
            const userRef = doc(db, 'users', userId);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) throw new Error("User not found");
            
            const newBalance = (userDoc.data().balance || 0) + netAmount;
            transaction.update(userRef, { balance: newBalance });
            transaction.update(depositRef, { status: 'approved' });

            if (feeAmount > 0) {
              const revenueRef = collection(db, 'revenueTransactions');
              transaction.set(doc(revenueRef), {
                  adminFeeAmount: feeAmount,
                  originalAmount: amount,
                  sourceUser: userId,
                  timestamp: Timestamp.now(),
                  transactionType: 'deposit_fee',
                  relatedDocId: id,
              });
            }
        });
        addToast('Deposit approved successfully!', 'success');
    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        addToast(`Failed to approve deposit: ${message}`, 'error');
        console.error(error);
    } finally {
        setActionLoading(prev => ({ ...prev, [id]: false }));
        setIsApproveConfirmOpen(false);
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
        await updateDoc(doc(db, 'depositRequests', id), { status: 'rejected' });
        addToast('Deposit rejected.', 'success');
    } catch (error) {
        addToast('Failed to reject deposit.', 'error');
    } finally {
        setActionLoading(prev => ({ ...prev, [id]: false }));
        setIsRejectConfirmOpen(false);
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
    <div className="container mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">Deposit Requests</h1>
      
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
                  <button onClick={() => handleBulkAction('approve')} className="px-3 py-1 text-xs font-semibold text-white bg-green-600 rounded-md hover:bg-green-700" disabled={actionLoading.bulk}>Approve</button>
                  <button onClick={() => handleBulkAction('reject')} className="px-3 py-1 text-xs font-semibold text-white bg-red-600 rounded-md hover:bg-red-700" disabled={actionLoading.bulk}>Reject</button>
              </div>
          </div>
      )}

      {loading ? <p className="text-center py-10">Loading...</p> : paginatedDeposits.length === 0 ? <p className="text-center py-10 text-gray-500">No {filter} requests found.</p> : (
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
                            checked={selectedRequests.size === paginatedDeposits.length && paginatedDeposits.length > 0}
                            onChange={handleSelectAll}
                            indeterminate={selectedRequests.size > 0 && selectedRequests.size < paginatedDeposits.length}
                            />
                        </th>
                        )}
                        <th onClick={() => requestSort('userEmail')} className="cursor-pointer px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">User</th>
                        <th onClick={() => requestSort('amount')} className="cursor-pointer px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                        <th onClick={() => requestSort('requestedAt')} className="cursor-pointer px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Date</th>
                        <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Transaction ID</th>
                        {filter === 'pending' && <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Actions</th>}
                    </tr>
                    </thead>
                    <tbody>
                    {paginatedDeposits.map((req) => (
                        <tr key={req.id}>
                            {filter === 'pending' && <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm"><Checkbox checked={selectedRequests.has(req.id)} onChange={() => handleSelectRequest(req.id)} /></td>}
                            <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">{req.userEmail}</td>
                            <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">Rs {req.amount.toFixed(2)}</td>
                            <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">{req.requestedAt.toLocaleString()}</td>
                            <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm break-all">{req.transactionId || 'N/A'}</td>
                            {filter === 'pending' && <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm"><div className="flex items-center gap-2"><button onClick={() => handleApproveClick(req)} disabled={actionLoading[req.id]} className="p-2 bg-green-100 dark:bg-green-900/50 rounded-full"><CheckIcon className="w-4 h-4 text-green-600 dark:text-green-400"/></button><button onClick={() => openRejectConfirm(req.id)} disabled={actionLoading[req.id]} className="p-2 bg-red-100 dark:bg-red-900/50 rounded-full"><XIcon className="w-4 h-4 text-red-600 dark:text-red-400" /></button></div></td>}
                        </tr>
                    ))}
                    </tbody>
                </table>
                </div>
                <Pagination currentPage={currentPage} totalPages={Math.ceil(sortedDeposits.length / ITEMS_PER_PAGE)} onPageChange={setCurrentPage}/>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-4">
                {paginatedDeposits.map(req => (
                    <div key={req.id} className="bg-white dark:bg-slate-900 shadow-md rounded-lg p-4">
                         <div className="flex justify-between items-start">
                             <div>
                                <p className="font-bold text-lg text-gray-900 dark:text-white">Rs {req.amount.toFixed(2)}</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{req.userEmail}</p>
                            </div>
                            {filter === 'pending' && <Checkbox checked={selectedRequests.has(req.id)} onChange={() => handleSelectRequest(req.id)} />}
                        </div>
                        <div className="mt-4 text-sm space-y-1">
                            <p><span className="font-semibold">Txn ID:</span> <span className="break-all">{req.transactionId}</span></p>
                            <p><span className="font-semibold">Method:</span> {req.method}</p>
                            {req.senderInfo && <p><span className="font-semibold">Sender:</span> {req.senderInfo}</p>}
                            <p className="text-xs text-gray-400 pt-1">{req.requestedAt.toLocaleString()}</p>
                        </div>
                        {filter === 'pending' && (
                            <div className="mt-4 flex justify-end gap-2">
                                <button onClick={() => handleApproveClick(req)} disabled={actionLoading[req.id]} className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700">Approve</button>
                                <button onClick={() => openRejectConfirm(req.id)} disabled={actionLoading[req.id]} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700">Reject</button>
                            </div>
                        )}
                    </div>
                ))}
                 <Pagination currentPage={currentPage} totalPages={Math.ceil(sortedDeposits.length / ITEMS_PER_PAGE)} onPageChange={setCurrentPage}/>
            </div>
        </>
      )}
      
      {requestToApprove && ( <ConfirmationModal isOpen={isApproveConfirmOpen} onClose={() => setIsApproveConfirmOpen(false)} onConfirm={() => handleConfirmApprove()} title="Approve Deposit" message={`Approve deposit of Rs ${requestToApprove.amount.toFixed(2)} for ${requestToApprove.userEmail}?`} confirmButtonText="Approve" confirmButtonColor="bg-green-600 hover:bg-green-700" />)}
      <ConfirmationModal isOpen={isRejectConfirmOpen} onClose={() => setIsRejectConfirmOpen(false)} onConfirm={() => handleReject()} title="Reject Deposit" message="Are you sure you want to reject this deposit?" />
    </div>
  );
};

export default DepositsPage;