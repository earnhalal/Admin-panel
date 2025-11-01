import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, runTransaction } from 'firebase/firestore';
import { db } from '../services/firebase';

interface WithdrawalRequest {
  id: string;
  userId: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: {
    seconds: number;
    nanoseconds: number;
  };
  userEmail: string;
  transactionId?: string;
}

const WithdrawalsPage: React.FC = () => {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'withdrawalRequests'), where('status', '==', filter));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WithdrawalRequest));
      setWithdrawals(requests);
      setLoading(false);
    }, (error) => {
      console.error(`Error fetching ${filter} withdrawals:`, error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [filter]);

  const handleApprove = async (id: string) => {
    const transactionId = window.prompt("Please enter the transaction ID for this withdrawal:");
    if (!transactionId) {
      alert("Transaction ID is required to approve.");
      return;
    }
    setActionLoading(prev => ({...prev, [id]: true}));
    try {
        const withdrawalRef = doc(db, 'withdrawalRequests', id);
        await updateDoc(withdrawalRef, { status: 'approved', transactionId: transactionId });
    } catch (error) {
        console.error('Error approving withdrawal:', error);
        alert('Failed to approve withdrawal.');
    } finally {
        setActionLoading(prev => ({...prev, [id]: false}));
    }
  };
  
  const handleReject = async (id: string, userId: string, amount: number) => {
    if (!window.confirm("Are you sure you want to reject? This will refund the amount to the user's balance.")) return;
    setActionLoading(prev => ({...prev, [id]: true}));
    try {
        await runTransaction(db, async (transaction) => {
            const withdrawalRef = doc(db, 'withdrawalRequests', id);
            const userRef = doc(db, 'users', userId);

            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) throw "User document not found!";

            const newBalance = userDoc.data().balance + amount;
            
            transaction.update(userRef, { balance: newBalance });
            transaction.update(withdrawalRef, { status: 'rejected' });
        });
    } catch (error) {
        console.error('Error rejecting withdrawal:', error);
        alert('Failed to reject withdrawal.');
    } finally {
        setActionLoading(prev => ({...prev, [id]: false}));
    }
  };

  return (
    <div className="container mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">Withdrawal Requests</h1>
      
      <div className="mb-4">
        <div className="flex space-x-2 p-1 bg-gray-200 dark:bg-gray-700 rounded-lg">
          {(['pending', 'approved', 'rejected'] as const).map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`w-full py-2 px-4 rounded-md text-sm font-medium transition-colors duration-200 ${
                filter === status
                  ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 shadow'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>
      
      {loading ? (
        <div className="text-center mt-10">Loading withdrawal requests...</div>
      ) : (
        <>
        {/* Desktop Table */}
        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden hidden md:block">
          <div className="overflow-x-auto">
            <table className="min-w-full leading-normal">
              <thead>
                <tr>
                  <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">User Email</th>
                  <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                  <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Date</th>
                  {filter !== 'pending' && <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Transaction ID</th>}
                  {filter === 'pending' && <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {withdrawals.length > 0 ? withdrawals.map((req) => (
                  <tr key={req.id}>
                    <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"><p className="text-gray-900 dark:text-white whitespace-no-wrap">{req.userEmail}</p></td>
                    <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"><p className="text-gray-900 dark:text-white whitespace-no-wrap">Rs {req.amount.toFixed(2)}</p></td>
                    <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"><p className="text-gray-900 dark:text-white whitespace-no-wrap">{new Date(req.requestedAt.seconds * 1000).toLocaleDateString()}</p></td>
                    {filter !== 'pending' && <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"><p className="text-gray-900 dark:text-white whitespace-no-wrap">{req.transactionId || 'N/A'}</p></td>}
                    {filter === 'pending' && (
                      <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                        <button onClick={() => handleApprove(req.id)} disabled={actionLoading[req.id]} className="bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-3 rounded text-xs mr-2 disabled:bg-gray-400">Approve</button>
                        <button onClick={() => handleReject(req.id, req.userId, req.amount)} disabled={actionLoading[req.id]} className="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded text-xs disabled:bg-gray-400">Reject</button>
                      </td>
                    )}
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={filter === 'pending' ? 4 : 4} className="text-center py-10 text-gray-500 dark:text-gray-400">
                      No {filter} requests found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Mobile Card View */}
        <div className="md:hidden grid grid-cols-1 gap-4">
            {withdrawals.length > 0 ? withdrawals.map((req) => (
                <div key={req.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
                    <div>
                        <p className="text-gray-900 dark:text-white font-semibold">{req.userEmail}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{new Date(req.requestedAt.seconds * 1000).toLocaleString()}</p>
                    </div>
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">Amount</span>
                            <span className="text-gray-900 dark:text-white font-medium">Rs {req.amount.toFixed(2)}</span>
                        </div>
                        {filter !== 'pending' && (
                            <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">Transaction ID</span>
                                <span className="text-gray-900 dark:text-white truncate">{req.transactionId || 'N/A'}</span>
                            </div>
                        )}
                    </div>
                    {filter === 'pending' && (
                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button onClick={() => handleApprove(req.id)} disabled={actionLoading[req.id]} className="bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-3 rounded text-xs mr-2 disabled:bg-gray-400">Approve</button>
                            <button onClick={() => handleReject(req.id, req.userId, req.amount)} disabled={actionLoading[req.id]} className="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded text-xs disabled:bg-gray-400">Reject</button>
                        </div>
                    )}
                </div>
            )) : <p className="text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-lg shadow p-4">No {filter} requests found.</p>}
        </div>
        </>
      )}
    </div>
  );
};

export default WithdrawalsPage;
