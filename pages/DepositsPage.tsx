import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, runTransaction, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { User } from './UsersPage';
import { useToast } from '../contexts/ToastContext';
import ConfirmationModal from '../components/ConfirmationModal';
import Spinner from '../components/Spinner';
import { CheckIcon } from '../components/icons/CheckIcon';
import { XIcon } from '../components/icons/XIcon';
import { ChevronDownIcon } from '../components/icons/ChevronDownIcon';

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

const DepositsPage: React.FC = () => {
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [actionLoading, setActionLoading] = useState<{ [key: string]: boolean }>({});
  const { addToast } = useToast();
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set());

  const [isRejectConfirmOpen, setIsRejectConfirmOpen] = useState(false);
  const [requestToReject, setRequestToReject] = useState<string | null>(null);

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
    const q = query(collection(db, 'depositRequests'), where('status', '==', filter));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (snapshot.empty) {
        setDeposits([]);
        setLoading(false);
        return;
      }

      const requests = snapshot.docs.map(doc => {
        const data = doc.data() as FirestoreDepositRequestData;
        return {
          id: doc.id,
          ...data,
          requestedAt: data.requestedAt.toDate(),
        };
      });

      const enrichedRequests = await Promise.all(
        requests.map(async (req) => {
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

      setDeposits(enrichedRequests);
      setLoading(false);
    }, (error) => {
      console.error(`Firestore error fetching ${filter} deposits:`, error);
      addToast('Failed to fetch deposit requests.', 'error');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [filter, addToast]);

  const handleApprove = async (request: DepositRequest) => {
    setActionLoading(prev => ({ ...prev, [request.id]: true }));
    try {
      await runTransaction(db, async (transaction) => {
        const depositRef = doc(db, 'depositRequests', request.id);
        const userRef = doc(db, 'users', request.userId);

        const depositDoc = await transaction.get(depositRef);
        if (!depositDoc.exists() || depositDoc.data().status !== 'pending') {
          throw new Error("This deposit request is already processed or does not exist.");
        }
        
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) {
          throw new Error(`User with ID ${request.userId} not found.`);
        }

        const currentBalance = userDoc.data().balance || 0;
        const newBalance = currentBalance + request.amount;

        transaction.update(userRef, { balance: newBalance });
        transaction.update(depositRef, { status: 'approved' });
      });
      addToast('Deposit approved and balance updated!', 'success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      console.error('Error approving deposit:', error);
      addToast(`Failed to approve deposit: ${errorMessage}`, 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [request.id]: false }));
    }
  };

  const openRejectConfirm = (id: string) => {
    setRequestToReject(id);
    setIsRejectConfirmOpen(true);
  };

  const handleReject = async () => {
    if (!requestToReject) return;
    const requestId = requestToReject;

    setActionLoading(prev => ({ ...prev, [requestId]: true }));
    try {
      const depositRef = doc(db, 'depositRequests', requestId);
      await runTransaction(db, async (transaction) => {
        const depositDoc = await transaction.get(depositRef);
         if (!depositDoc.exists() || depositDoc.data().status !== 'pending') {
          throw new Error("This deposit request is already processed or does not exist.");
        }
        transaction.update(depositRef, { status: 'rejected' });
      });
      addToast('Deposit rejected successfully.', 'success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      console.error('Error rejecting deposit:', error);
      addToast(`Failed to reject deposit: ${errorMessage}`, 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [requestId]: false }));
      setIsRejectConfirmOpen(false);
      setRequestToReject(null);
    }
  };

  const renderContent = () => {
    if (loading) {
      return <div className="text-center mt-10">Loading deposit requests...</div>;
    }
    if (deposits.length === 0) {
      return <p className="text-center py-10 text-gray-500 dark:text-gray-400">No {filter} requests found.</p>;
    }
    return (
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
                  <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Transaction ID</th>
                  {filter === 'pending' && <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-1/4">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {deposits.map((req) => (
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
                        <p className="text-gray-900 dark:text-white whitespace-no-wrap">{req.requestedAt.toLocaleString()}</p>
                      </td>
                      <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 text-sm"><p className="text-gray-900 dark:text-white whitespace-no-wrap break-all">{req.transactionId || 'N/A'}</p></td>
                      {filter === 'pending' && (
                        <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 text-sm">
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleApprove(req)} disabled={actionLoading[req.id]} className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-green-400 transition-colors">
                              {actionLoading[req.id] ? <Spinner /> : <CheckIcon className="w-4 h-4" />} Approve
                            </button>
                            <button onClick={() => openRejectConfirm(req.id)} disabled={actionLoading[req.id]} className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-red-400 transition-colors">
                              {actionLoading[req.id] ? <Spinner /> : <XIcon className="w-4 h-4" />} Reject
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {expandedRequests.has(req.id) && (
                      <tr className="bg-gray-50 dark:bg-gray-900/50">
                        <td colSpan={5} className="p-0">
                          <div className="px-10 py-4">
                            <h4 className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-2">Deposit Details</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                              <div><span className="text-gray-500 dark:text-gray-400">Method:</span> <span className="font-medium text-gray-900 dark:text-white">{req.method}</span></div>
                              {req.senderInfo && <div><span className="text-gray-500 dark:text-gray-400">Sender Info:</span> <span className="font-medium text-gray-900 dark:text-white">{req.senderInfo}</span></div>}
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
          {deposits.map(req => (
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
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Method:</span> <span className="font-medium text-gray-800 dark:text-gray-200">{req.method}</span></div>
                    {req.senderInfo && <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Sender:</span> <span className="font-medium text-gray-800 dark:text-gray-200">{req.senderInfo}</span></div>}
                    <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Txn ID:</span> <span className="font-medium text-gray-800 dark:text-gray-200 break-all">{req.transactionId || 'N/A'}</span></div>
                  </div>
                  
                  {filter === 'pending' && (
                    <div className="pt-3 flex items-center gap-2">
                      <button onClick={() => handleApprove(req)} disabled={actionLoading[req.id]} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-green-400 transition-colors">
                        {actionLoading[req.id] ? <Spinner /> : <><CheckIcon className="w-4 h-4" /> Approve</>}
                      </button>
                      <button onClick={() => openRejectConfirm(req.id)} disabled={actionLoading[req.id]} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-red-400 transition-colors">
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
    );
  };

  return (
    <div className="container mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">Deposit Requests</h1>
      
      <div className="mb-4">
        <div className="flex space-x-1 p-1 bg-gray-200 dark:bg-gray-700 rounded-lg">
          {(['pending', 'approved', 'rejected'] as const).map(statusValue => (
            <button
              key={statusValue}
              onClick={() => setFilter(statusValue)}
              className={`w-full py-2 px-4 rounded-md text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-900 capitalize ${
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
      
      {renderContent()}

      <ConfirmationModal
        isOpen={isRejectConfirmOpen}
        onClose={() => setIsRejectConfirmOpen(false)}
        onConfirm={handleReject}
        title="Reject Deposit"
        message="Are you sure you want to reject this deposit? This action cannot be undone."
      />
    </div>
  );
};

export default DepositsPage;
