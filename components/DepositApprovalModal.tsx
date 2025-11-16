import React from 'react';
import Spinner from './Spinner';
import { DepositRequest } from '../pages/DepositsPage';

interface DepositApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  request: DepositRequest | null;
}

const DepositApprovalModal: React.FC<DepositApprovalModalProps> = ({ isOpen, onClose, onConfirm, isLoading, request }) => {
  if (!isOpen || !request) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md m-4">
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Confirm Deposit Approval</h2>
        <p className="text-gray-600 dark:text-gray-300 mb-4 text-sm">
          Please verify the details below with your payment records before approving.
        </p>
        <div className="space-y-2 bg-gray-50 dark:bg-slate-800 p-4 rounded-lg text-sm">
            <p><strong>User:</strong> {request.userEmail}</p>
            <p><strong>Amount:</strong> Rs {request.amount.toFixed(2)}</p>
            <p><strong>Method:</strong> {request.method}</p>
            <p className="break-all"><strong>Transaction ID:</strong> {request.transactionId}</p>
        </div>
        <div className="flex justify-end space-x-4 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 font-semibold transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-white bg-green-600 hover:bg-green-700 font-semibold transition-colors inline-flex items-center disabled:bg-green-400 disabled:cursor-not-allowed"
            disabled={isLoading}
          >
            {isLoading && <Spinner />}
            Confirm Approval
          </button>
        </div>
      </div>
    </div>
  );
};

export default DepositApprovalModal;
