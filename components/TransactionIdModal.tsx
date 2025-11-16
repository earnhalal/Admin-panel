import React, { useState } from 'react';
import Spinner from './Spinner';

interface TransactionIdModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (transactionId: string) => void;
  isLoading?: boolean;
}

const TransactionIdModal: React.FC<TransactionIdModalProps> = ({ isOpen, onClose, onConfirm, isLoading }) => {
  const [transactionId, setTransactionId] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleConfirmClick = () => {
    if (!transactionId.trim()) {
      setError('Transaction ID is required.');
      return;
    }
    setError('');
    onConfirm(transactionId);
  };
  
  const handleEnterKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading && transactionId.trim()) {
      handleConfirmClick();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTransactionId(e.target.value);
    if (error) {
        setError('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm m-4">
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Enter Transaction ID</h2>
        <p className="text-gray-600 dark:text-gray-300 mb-4 text-sm">
          Please enter the transaction ID you received after manually sending the payment. This field is required.
        </p>
        <input
          type="text"
          value={transactionId}
          onChange={handleInputChange}
          onKeyDown={handleEnterKey}
          className={`shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 leading-tight focus:outline-none focus:shadow-outline ${error ? 'border-red-500' : ''}`}
          placeholder="e.g., TXN123456789"
          autoFocus
        />
        {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
        <div className="flex justify-end space-x-4 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 font-semibold transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmClick}
            className="px-4 py-2 rounded-lg text-white bg-green-600 hover:bg-green-700 font-semibold transition-colors inline-flex items-center disabled:bg-green-400 disabled:cursor-not-allowed"
            disabled={isLoading || !transactionId.trim()}
          >
            {isLoading && <Spinner />}
            Confirm Approval
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransactionIdModal;