import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, runTransaction, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { User } from './UsersPage';
import { useToast } from '../contexts/ToastContext';
import ConfirmationModal from '../components/ConfirmationModal';
import Spinner from '../components/Spinner';
import TransactionIdModal from '../components/TransactionIdModal';
import { CheckIcon } from '../components/icons/CheckIcon';
import { XIcon } from '../components/icons/XIcon';
import { ChevronDownIcon } from '../components/icons/ChevronDownIcon';

// Interface for data coming directly from Firestore with a Timestamp object
interface FirestoreWithdrawalRequestData {
  userId: string;
  amount: number;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  requestedAt: Timestamp; // Firestore Timestamp
  method: string;
  accountName: string;
  accountNumber: string;
  transactionId?: string;
  bankName?: string;
}

// Interface for data stored in React state with a serializable JS Date object
interface WithdrawalRequest {
  id: string;
  userId: string;
  amount: number;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  requestedAt: Date; // Using JS Date object to prevent circular reference errors.
  userEmail?: string;
  transactionId?: string;
  method: string;
  accountName: string;
  accountNumber: string;
  bankName?: string;
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

const WithdrawalsPage: React.FC = () => {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'Pending' | 'Approved' | 'Rejected'>('Pending');
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});
  const { addToast } = useToast();
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set());

  const [isRejectConfirmOpen, setIsRejectConfirmOpen] = useState(false);
  const [rejectionPayload, setRejectionPayload] = useState<RejectionPayload | null>(null);
  
  const [isTxnModalOpen, setIsTxnModalOpen] = useState(false);
  const [approvalPayload, setApprovalPayload] = useState<ApprovalPayload | null>(null);
  
  const toggleExpand = (id: string) => {
    setExpandedRequests(prev => {
        const newSet = new Set(prev);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        return newSet;
    });
  };

  useEffect(() => {
    setLoading(true);
    setExpandedRequests(new Set()); // Collapse all on filter change
    const q = query(collection(db, 'withdrawalRequests'), where('status', '==', filter));
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (snapshot.empty) {
          setWithdrawals([]);
          setLoading(false);
          return;
      }

      const requests = snapshot.docs.map(doc => {
          const data = doc.data() as FirestoreWithdrawalRequestData;
          return {
              id: doc.id,
              ...data,
              requestedAt: data.requestedAt && typeof data.requestedAt.toDate === 'function'
                  ? data.requestedAt.toDate()
                  : new Date(),
          };
      });

      const enrichedRequests = await Promise.all(
          requests.map(async (req) => {
              if ((req as any).userEmail) return req;
              try {
                  const userRef = doc(db, 'users', req.userId);
                  const userSnap = await getDoc(userRef);
                  return userSnap.exists() 
                    ? { ...req, userEmail: (userSnap.data() as User).email }
                    : { ...req, userEmail: 'Unknown User' };
              } catch (error) {
                  console.error(`Failed to enrich request ${req.id}:`, error);
                  return { ...req, userEmail: 'Error fetching email' };
              }
          })
      );
      
      setWithdrawals(enrichedRequests);
      setLoading(false);
    }, (error) => {
      console.error(`Firestore error fetching ${filter} withdrawals:`, error);
      addToast('Failed to fetch requests. Check console.', 'error');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [filter, addToast]);

  const openApprovalModal = (id: string, userId: string) => {
    setApprovalPayload({ id, userId });
    setIsTxnModalOpen(true);
  };
  
  const handleConfirmApproval = async (enteredTransactionId: string) => {
    if (!approvalPayload) return;
    
    const { id, userId } = approvalPayload;
    const transactionId = enteredTransactionId.trim();

    if (transactionId === '') {
        alert("Transaction ID is required to approve.");
        return; 
    }

    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
        await runTransaction(db, async (transaction) => {
            const withdrawalRef = doc(db, 'withdrawalRequests', id);
            const userRef = doc(db, 'users', userId);

            const withdrawalDoc = await transaction.get(withdrawalRef);
            if (!withdrawalDoc.exists()) throw new Error("This withdrawal request no longer exists.");
            
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) throw new Error(`User with ID ${userId} not found.`);

            transaction.update(withdrawalRef, { status: 'Approved', transactionId: transactionId });
            transaction.update(userRef, { lastWithdrawalStatus: 'Approved' });
        });
        addToast('Withdrawal approved successfully!', 'success');
        setIsTxnModalOpen(false);
        setApprovalPayload(null);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        console.error('Error approving withdrawal:', error);
        addToast(`Failed to approve withdrawal: ${errorMessage}`, 'error');
    } finally {
        setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };
  
  const openRejectConfirm = (payload: RejectionPayload) => {
    setRejectionPayload(payload);
    setIsRejectConfirmOpen(true);
  };

  const handleReject = async () => {
    if (!rejectionPayload) return;
    const { id, userId, amount } = rejectionPayload;

    setActionLoading(prev => ({...prev, [id]: true}));
    try {
        await runTransaction(db, async (transaction) => {
            const withdrawalRef = doc(db, 'withdrawalRequests', id);
            const userRef = doc(db, 'users', userId);

            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) throw new Error("User not found. Cannot refund balance.");

            const currentBalance = userDoc.data().balance || 0;
            const newBalance = currentBalance + amount;
            
            transaction.update(userRef, { balance: newBalance, lastWithdrawalStatus: 'Rejected' });
            transaction.update(withdrawalRef, { status: 'Rejected' });
        });
        addToast('Withdrawal rejected and funds returned to user.', 'success');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        console.error('Error rejecting withdrawal:', error);
        addToast(`Failed to reject withdrawal: ${errorMessage}`, 'error');
    } finally {
        setActionLoading(prev => ({...prev, [id]: false}));
        setIsRejectConfirmOpen(false);
        setRejectionPayload(null);
    }
  };

  return (
    <div className="container mx-auto">
       <style>{`
        @keyframes fade-in-down {
            0% {
                opacity: 0;
                transform: translateY(-10px);
            }
            100% {
                opacity: 1;
                transform: translateY(0);
            }
        }
        .animate-fade-in-down {
            animation: fade-in-down 0.3s ease-out forwards;
        }
    `}</style>
      <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">Withdrawal Requests</h1>
      
      <div className="mb-4">
        <div className="flex space-x-1 p-1 bg-gray-200 dark:bg-gray-700 rounded-lg">
          {(['Pending', 'Approved', 'Rejected'] as const).map(statusValue => (
            <button
              key={statusValue}
              onClick={() => setFilter(statusValue)}
              className={`w-full py-2 px-4 rounded-md text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-900 ${
                filter === statusValue
                  ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 shadow'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-300/50 dark:hover:bg-gray-600/50'
              }`}
            >
              {statusValue}
            </button>
          ))}
        </div>
      </div>
      
      {loading ? (
        <div className="text-center mt-10">Loading withdrawal requests...</div>
      ) : withdrawals.length === 0 ? (
        <p className="text-center py-10 text-gray-500 dark:text-gray-400">
            No {filter} requests found.
        </p>
      ) : (
        <>
        {/* Desktop Table View */}
        <div className="hidden md:block bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full leading-normal">
              <thead>
                <tr>
                  <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-1/3">User</th>
                  <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                  <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Date</th>
                  {filter !== 'Pending' && <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Transaction ID</th>}
                  {filter === 'Pending' && <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-1/4">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((req) => (
                   <React.Fragment key={req.id}>
                    <tr className="bg-white dark:bg-gray-800">
                        <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 text-sm">
                           <div className="flex items-center">
                                <button onClick={() => toggleExpand(req.id)} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 mr-3 transition-colors">
                                    <ChevronDownIcon className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${expandedRequests.has(req.id) ? 'rotate-180' : ''}`} />
                                </button>
                                <p className="text-gray-900 dark:text-white whitespace-no-wrap">{req.userEmail}</p>
                           </div>
                        </td>
                        <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 text-sm"><p className="text-gray-900 dark:text-white whitespace-no-wrap">Rs {req.amount.toFixed(2)}</p></td>
                        <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 text-sm">
                            <p className="text-gray-900 dark:text-white whitespace-no-wrap">
                                {req.requestedAt ? req.requestedAt.toLocaleString() : 'N/A'}
                            </p>
                        </td>
                        {filter !== 'Pending' && <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 text-sm"><p className="text-gray-900 dark:text-white whitespace-no-wrap break-all">{req.transactionId || 'N/A'}</p></td>}
                        {filter === 'Pending' && (
                        <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 text-sm">
                            <div className="flex items-center gap-2">
                            <button onClick={() => openApprovalModal(req.id, req.userId)} disabled={actionLoading[req.id]} className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-green-400 transition-colors">
                                {actionLoading[req.id] ? <Spinner /> : <CheckIcon className="w-4 h-4" />} Approve
                            </button>
                            <button onClick={() => openRejectConfirm({id: req.id, userId: req.userId, amount: req.amount})} disabled={actionLoading[req.id]} className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-red-400 transition-colors">
                                {actionLoading[req.id] ? <Spinner /> : <XIcon className="w-4 h-4" />} Reject
                            </button>
                            </div>
                        </td>
                        )}
                    </tr>
                    {expandedRequests.has(req.id) && (
                        <tr className="bg-gray-50 dark:bg-gray-900/50">
                            <td colSpan={filter === 'Pending' ? 4 : 4} className="p-0">
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
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden grid grid-cols-1 gap-4">
            {withdrawals.map(req => (
                <div key={req.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                    <div 
                        className="flex justify-between items-center cursor-pointer"
                        onClick={() => toggleExpand(req.id)}
                        role="button"
                        aria-expanded={expandedRequests.has(req.id)}
                    >
                        <div>
                            <p className="font-semibold text-gray-900 dark:text-white">{req.userEmail}</p>
                            <p className="font-bold text-lg text-gray-900 dark:text-white mt-1">Rs {req.amount.toFixed(2)}</p>
                        </div>
                        <div className="text-right flex-shrink-0 pl-4">
                            <ChevronDownIcon className={`w-6 h-6 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${expandedRequests.has(req.id) ? 'rotate-180' : ''}`} />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 whitespace-nowrap">{req.requestedAt.toLocaleDateString()}</p>
                        </div>
                    </div>
                    
                    {expandedRequests.has(req.id) && (
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3 animate-fade-in-down">
                             <div className="space-y-2 text-sm">
                                <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Method:</span> <span className="font-medium text-gray-800 dark:text-gray-200">{req.method}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Name:</span> <span className="font-medium text-gray-800 dark:text-gray-200">{req.accountName}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Account:</span> <span className="font-medium text-gray-800 dark:text-gray-200 break-all">{req.accountNumber}</span></div>
                                {req.bankName && <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Bank:</span> <span className="font-medium text-gray-800 dark:text-gray-200">{req.bankName}</span></div>}
                                {filter !== 'Pending' && <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Txn ID:</span> <span className="font-medium text-gray-800 dark:text-gray-200 break-all">{req.transactionId || 'N/A'}</span></div>}
                            </div>
                            
                            {filter === 'Pending' && (
                            <div className="pt-3 flex items-center gap-2">
                                <button onClick={() => openApprovalModal(req.id, req.userId)} disabled={actionLoading[req.id]} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-green-400 transition-colors">
                                {actionLoading[req.id] ? <Spinner /> : <><CheckIcon className="w-4 h-4" /> Approve</>}
                                </button>
                                <button onClick={() => openRejectConfirm({id: req.id, userId: req.userId, amount: req.amount})} disabled={actionLoading[req.id]} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-red-400 transition-colors">
                                {actionLoading[req.id] ? <Spinner /> : <><XIcon className="w-4 h-4" /> Reject</>}
                                </button>
                            </div>
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
        </>
      )}
      <ConfirmationModal
        isOpen={isRejectConfirmOpen}
        onClose={() => setIsRejectConfirmOpen(false)}
        onConfirm={handleReject}
        title="Reject Withdrawal"
        message="Are you sure you want to reject this withdrawal? The amount will be refunded to the user's balance."
      />
      <TransactionIdModal
        isOpen={isTxnModalOpen}
        onClose={() => {
            setIsTxnModalOpen(false);
            setApprovalPayload(null);
        }}
        onConfirm={handleConfirmApproval}
        isLoading={approvalPayload ? actionLoading[approvalPayload.id] : false}
      />
    </div>
  );
};

export default WithdrawalsPage;