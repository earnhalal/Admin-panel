import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, runTransaction, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { User } from './UsersPage';
import { useToast } from '../contexts/ToastContext';
import ConfirmationModal from '../components/ConfirmationModal';
import Spinner from '../components/Spinner';
import TransactionIdModal from '../components/TransactionIdModal';

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

  const [isRejectConfirmOpen, setIsRejectConfirmOpen] = useState(false);
  const [rejectionPayload, setRejectionPayload] = useState<RejectionPayload | null>(null);
  
  const [isTxnModalOpen, setIsTxnModalOpen] = useState(false);
  const [approvalPayload, setApprovalPayload] = useState<ApprovalPayload | null>(null);

  useEffect(() => {
    setLoading(true);
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
      <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">Withdrawal Requests</h1>
      
      <div className="mb-4">
        <div className="flex space-x-2 p-1 bg-gray-200 dark:bg-gray-700 rounded-lg">
          {(['Pending', 'Approved', 'Rejected'] as const).map(statusValue => (
            <button
              key={statusValue}
              onClick={() => setFilter(statusValue)}
              className={`w-full py-2 px-4 rounded-md text-sm font-medium transition-colors duration-200 ${
                filter === statusValue
                  ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 shadow'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {statusValue}
            </button>
          ))}
        </div>
      </div>
      
      {loading ? (
        <div className="text-center mt-10">Loading withdrawal requests...</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full leading-normal">
              <thead>
                <tr>
                  <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">User</th>
                  <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                  <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Method</th>
                  <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Account Name</th>
                  <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Account Number</th>
                  <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Date</th>
                  {filter !== 'Pending' && <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Transaction ID</th>}
                  {filter === 'Pending' && <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {withdrawals.length > 0 ? withdrawals.map((req) => (
                  <tr key={req.id}>
                    <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"><p className="text-gray-900 dark:text-white whitespace-no-wrap">{req.userEmail}</p></td>
                    <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"><p className="text-gray-900 dark:text-white whitespace-no-wrap">Rs {req.amount.toFixed(2)}</p></td>
                    <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"><p className="text-gray-900 dark:text-white whitespace-no-wrap">{req.method}</p></td>
                    <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"><p className="text-gray-900 dark:text-white whitespace-no-wrap">{req.accountName}</p></td>
                    <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"><p className="text-gray-900 dark:text-white whitespace-no-wrap">{req.accountNumber}</p></td>
                    <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                      <p className="text-gray-900 dark:text-white whitespace-no-wrap">
                        {req.requestedAt ? req.requestedAt.toLocaleString() : 'N/A'}
                      </p>
                    </td>
                    {filter !== 'Pending' && <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"><p className="text-gray-900 dark:text-white whitespace-no-wrap">{req.transactionId || 'N/A'}</p></td>}
                    {filter === 'Pending' && (
                      <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm space-x-2">
                        <button onClick={() => openApprovalModal(req.id, req.userId)} disabled={actionLoading[req.id]} className="bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-3 rounded text-xs disabled:bg-gray-400 inline-flex items-center">
                          {actionLoading[req.id] && <Spinner />} Approve
                        </button>
                        <button onClick={() => openRejectConfirm({id: req.id, userId: req.userId, amount: req.amount})} disabled={actionLoading[req.id]} className="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded text-xs disabled:bg-gray-400 inline-flex items-center">
                          {actionLoading[req.id] && <Spinner />} Reject
                        </button>
                      </td>
                    )}
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={filter === 'Pending' ? 8 : 7} className="text-center py-10 text-gray-500 dark:text-gray-400">
                      No {filter} requests found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
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