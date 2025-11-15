import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, runTransaction, getDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebase';
import { User } from './UsersPage';
import { useToast } from '../contexts/ToastContext';
import ConfirmationModal from '../components/ConfirmationModal';
import Spinner from '../components/Spinner';
import { CheckIcon } from '../components/icons/CheckIcon';
import { XIcon } from '../components/icons/XIcon';
import { ChevronDownIcon } from '../components/icons/ChevronDownIcon';
import Pagination from '../components/Pagination';
import Checkbox from '../components/Checkbox';


interface FirestoreDepositRequestData {
  userId: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: Timestamp;
  method: string;
  transactionId: string;
  senderInfo?: string;
}

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
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set());

  // New state for advanced features
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'requestedAt', direction: 'descending' });
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const ITEMS_PER_PAGE = 10;
  
  const [isRejectConfirmOpen, setIsRejectConfirmOpen] = useState(false);
  const [requestToReject, setRequestToReject] = useState<string | null>(null);

  const [isApproveConfirmOpen, setIsApproveConfirmOpen] = useState(false);
  const [requestToApprove, setRequestToApprove] = useState<DepositRequest | null>(null);


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
    const q = query(collection(db, 'depositRequests'), where('status', '==', filter));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
        // ... (existing data fetching)
      const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), requestedAt: (doc.data().requestedAt as Timestamp).toDate() } as DepositRequest));
      const enrichedRequests = await Promise.all(requests.map(async req => {
          const userRef = doc(db, 'users', req.userId);
          const userSnap = await getDoc(userRef);
          return userSnap.exists() ? { ...req, userEmail: (userSnap.data() as User).email } : { ...req, userEmail: 'Unknown User' };
      }));
      setDeposits(enrichedRequests);
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

  const handleConfirmApprove = async () => {
    // ... (existing single approval logic)
  };

  const openRejectConfirm = (id: string) => {
    setRequestToReject(id);
    setIsRejectConfirmOpen(true);
  };

  const handleReject = async () => {
    // ... (existing single rejection logic)
  };

  const handleBulkAction = async (action: 'approve' | 'reject') => {
      if (selectedRequests.size === 0) return;
      setActionLoading({ ...actionLoading, bulk: true });

      try {
          if (action === 'approve') {
              for (const reqId of selectedRequests) {
                  const request = deposits.find(d => d.id === reqId);
                  if (request) {
                      await runTransaction(db, async (transaction) => {
                        const depositRef = doc(db, 'depositRequests', request.id);
                        const userRef = doc(db, 'users', request.userId);
                        const userDoc = await transaction.get(userRef);
                        if (!userDoc.exists()) throw new Error("User not found");
                        const newBalance = (userDoc.data().balance || 0) + request.amount;
                        transaction.update(userRef, { balance: newBalance });
                        transaction.update(depositRef, { status: 'approved' });
                      });
                  }
              }
          } else { // Reject action
              const batch = writeBatch(db);
              selectedRequests.forEach(reqId => {
                  batch.update(doc(db, 'depositRequests', reqId), { status: 'rejected' });
              });
              await batch.commit();
          }
          addToast(`Successfully ${action}d ${selectedRequests.size} requests.`, 'success');
          setSelectedRequests(new Set());
      } catch (error) {
          addToast(`Bulk ${action} failed.`, 'error');
      } finally {
          setActionLoading({ ...actionLoading, bulk: false });
      }
  };


  const renderContent = () => {
    if (loading) return <div className="text-center mt-10">Loading...</div>;
    if (paginatedDeposits.length === 0) return <p className="text-center py-10 text-gray-500 dark:text-gray-400">No {filter} requests found.</p>;
    
    return (
      <div className="bg-white dark:bg-slate-900 shadow-md rounded-lg overflow-hidden">
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
                <React.Fragment key={req.id}>
                  <tr>
                    {filter === 'pending' && (
                        <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                          <Checkbox checked={selectedRequests.has(req.id)} onChange={() => handleSelectRequest(req.id)} />
                        </td>
                    )}
                    <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                      <div className="flex items-center">
                        <button onClick={() => toggleExpand(req.id)} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 mr-3">
                          <ChevronDownIcon className={`w-5 h-5 text-gray-500 transition-transform ${expandedRequests.has(req.id) ? 'rotate-180' : ''}`} />
                        </button>
                        <p className="text-gray-900 dark:text-white">{req.userEmail}</p>
                      </div>
                    </td>
                    <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">Rs {req.amount.toFixed(2)}</td>
                    <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">{req.requestedAt.toLocaleString()}</td>
                    <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm break-all">{req.transactionId || 'N/A'}</td>
                    {filter === 'pending' && (
                      <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleApproveClick(req)} disabled={actionLoading[req.id]} className="p-1.5 bg-green-600 text-white rounded-md hover:bg-green-700"><CheckIcon className="w-4 h-4"/></button>
                          <button onClick={() => openRejectConfirm(req.id)} disabled={actionLoading[req.id]} className="p-1.5 bg-red-600 text-white rounded-md hover:bg-red-700"><XIcon className="w-4 h-4"/></button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {expandedRequests.has(req.id) && (
                    <tr className="bg-gray-50 dark:bg-slate-800/50">
                      <td colSpan={filter === 'pending' ? 6 : 5} className="p-4">
                          <h4 className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-2">Details</h4>
                          <div><span className="text-gray-500">Method:</span> {req.method}</div>
                          {req.senderInfo && <div><span className="text-gray-500">Sender:</span> {req.senderInfo}</div>}
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
            totalPages={Math.ceil(sortedDeposits.length / ITEMS_PER_PAGE)}
            onPageChange={setCurrentPage}
        />
      </div>
    );
  };

  return (
    <div className="container mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">Deposit Requests</h1>
      
      <div className="mb-4">
          {/* ... (existing filter buttons) ... */}
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

      {renderContent()}
      
      {requestToApprove && ( <ConfirmationModal isOpen={isApproveConfirmOpen} onClose={() => setIsApproveConfirmOpen(false)} onConfirm={handleConfirmApprove} title="Approve Deposit" message={`Approve deposit of Rs ${requestToApprove.amount.toFixed(2)} for ${requestToApprove.userEmail}?`} confirmButtonText="Approve" confirmButtonColor="bg-green-600 hover:bg-green-700" />)}
      <ConfirmationModal isOpen={isRejectConfirmOpen} onClose={() => setIsRejectConfirmOpen(false)} onConfirm={handleReject} title="Reject Deposit" message="Are you sure you want to reject this deposit?" />
    </div>
  );
};

export default DepositsPage;