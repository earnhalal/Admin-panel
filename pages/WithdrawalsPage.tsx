import React, { useState, useEffect } from 'react';
import { RefreshCcw } from 'lucide-react';
import { ref, onValue, remove, update, set, get } from 'firebase/database';
import { rtdb } from '../services/firebase';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';
import TransactionIdModal from '../components/TransactionIdModal';
import { CheckIcon } from '../components/icons/CheckIcon';
import { XIcon } from '../components/icons/XIcon';
import RejectionModal from '../components/RejectionModal';

interface WithdrawalRequest {
  id: string;
  userId: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  userEmail?: string;
  username?: string;
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
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});
  const { addToast } = useToast();
  
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionPayload, setRejectionPayload] = useState<WithdrawalRequest | null>(null);
  
  const [isTxnModalOpen, setIsTxnModalOpen] = useState(false);
  const [approvalPayload, setApprovalPayload] = useState<WithdrawalRequest | null>(null);

  useEffect(() => {
    setLoading(true);
    const pendingRef = ref(rtdb, 'withdrawals/pending');
    
    const unsubscribe = onValue(pendingRef, (snapshot) => {
        const data = snapshot.val();
        const allRequests: WithdrawalRequest[] = [];
        
        if (data) {
            // Nested structure: withdrawals/pending/{userId}/{requestId}
            Object.entries(data).forEach(([userId, requests]: [string, any]) => {
                Object.entries(requests).forEach(([requestId, requestData]: [string, any]) => {
                    allRequests.push({ ...requestData, id: requestId, userId } as WithdrawalRequest);
                });
            });
        }
        
        setWithdrawals(allRequests);
        setLoading(false);
    }, (error) => {
        console.error("Error fetching withdrawals:", error);
        addToast(`Error fetching withdrawals: ${error.message}`, 'error');
        setLoading(false);
    });
    return () => unsubscribe();
  }, [addToast]);

  const handleConfirmApproval = async (enteredTransactionId: string) => {
    if (!approvalPayload) return;
    const { id, userId } = approvalPayload;

    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      // Move to approved
      await set(ref(rtdb, `withdrawals/approved/${userId}/${id}`), {
          ...approvalPayload,
          status: 'approved',
          transactionId: enteredTransactionId
      });
      // Remove from pending
      await remove(ref(rtdb, `withdrawals/pending/${userId}/${id}`));
      
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
        // Move to rejected
        await set(ref(rtdb, `withdrawals/rejected/${userId}/${id}`), {
            ...rejectionPayload,
            status: 'rejected',
            rejectionReason: reason
        });
        // Remove from pending
        await remove(ref(rtdb, `withdrawals/pending/${userId}/${id}`));
        
        // Return funds
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

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Withdrawal Requests</h1>
      {loading ? <Spinner /> : (
        <div className="space-y-4">
            {withdrawals.map(req => (
                <div key={req.id} className="bg-white p-4 rounded shadow flex justify-between items-center">
                    <div>
                        <p className="font-bold">User: {req.username || 'N/A'}</p>
                        <p className="font-bold">Amount: Rs {(req.amount ?? 0).toFixed(2)}</p>
                        <p className="text-sm text-gray-600">Method: {req.withdrawalDetails?.method}</p>
                        <p className="text-sm text-gray-600">Account: {req.withdrawalDetails?.accountName} - {req.withdrawalDetails?.accountNumber}</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => { setApprovalPayload(req); setIsTxnModalOpen(true); }} className="p-2 bg-green-100 rounded-full"><CheckIcon className="w-4 h-4 text-green-600"/></button>
                        <button onClick={() => { setRejectionPayload(req); setIsRejectModalOpen(true); }} className="p-2 bg-red-100 rounded-full"><XIcon className="w-4 h-4 text-red-600" /></button>
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
