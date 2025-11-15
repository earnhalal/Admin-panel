import React, { useState } from 'react';
import Spinner from './Spinner';

interface RejectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  isLoading?: boolean;
}

const RejectionModal: React.FC<RejectionModalProps> = ({ isOpen, onClose, onConfirm, title, isLoading }) => {
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(reason || 'Rejected by admin');
    onClose();
    setReason('');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-6 w-full max-w-sm m-4">
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{title}</h2>
        <p className="text-gray-600 dark:text-gray-300 mb-4 text-sm">
          Please provide a reason for this rejection (optional). This may be shown to the user.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-600 leading-tight focus:outline-none focus:shadow-outline h-24"
          placeholder="e.g., Invalid transaction details."
          autoFocus
        />
        <div className="flex justify-end space-x-4 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-slate-600 hover:bg-gray-300 dark:hover:bg-slate-500 font-semibold transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 rounded-lg text-white bg-red-600 hover:bg-red-700 font-semibold transition-colors inline-flex items-center disabled:bg-red-400"
            disabled={isLoading}
          >
            {isLoading && <Spinner />}
            Confirm Rejection
          </button>
        </div>
      </div>
    </div>
  );
};

export default RejectionModal;