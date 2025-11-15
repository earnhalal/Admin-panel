import React, { useState, useEffect } from 'react';
import { Booster } from '../pages/BoosterStorePage';
import Spinner from './Spinner';

interface BoosterModalProps {
  booster: Booster | null;
  onClose: () => void;
  onSave: (booster: Omit<Booster, 'id'>) => void;
  isLoading?: boolean;
}

const BoosterModal: React.FC<BoosterModalProps> = ({ booster, onClose, onSave, isLoading }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(0);
  const [activateAccount, setActivateAccount] = useState(false);
  const [withdrawalPoints, setWithdrawalPoints] = useState(0);

  useEffect(() => {
    if (booster) {
      setName(booster.name);
      setDescription(booster.description);
      setPrice(booster.price);
      setActivateAccount(booster.benefits.activateAccount || false);
      setWithdrawalPoints(booster.benefits.withdrawalPoints || 0);
    } else {
      setName('');
      setDescription('');
      setPrice(0);
      setActivateAccount(false);
      setWithdrawalPoints(0);
    }
  }, [booster]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      description,
      price,
      benefits: {
        activateAccount,
        withdrawalPoints,
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-white">{booster ? 'Edit Booster' : 'Create Booster'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="name" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Booster Name</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" required />
          </div>
          <div className="mb-4">
            <label htmlFor="description" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Description</label>
            <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 h-24" required />
          </div>
          <div className="mb-4">
            <label htmlFor="price" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Price (Rs)</label>
            <input id="price" type="number" step="0.01" value={price} onChange={(e) => setPrice(parseFloat(e.target.value))} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" required />
          </div>

          <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-white">Benefits</h3>
          <div className="space-y-3 p-4 border rounded-lg border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <input id="activateAccount" type="checkbox" checked={activateAccount} onChange={(e) => setActivateAccount(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
              <label htmlFor="activateAccount" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">Activate User's Account</label>
            </div>
            <div>
              <label htmlFor="withdrawalPoints" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Add Withdrawal Points</label>
              <input id="withdrawalPoints" type="number" value={withdrawalPoints} onChange={(e) => setWithdrawalPoints(parseInt(e.target.value) || 0)} className="mt-1 shadow-sm appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" />
            </div>
          </div>

          <div className="flex items-center justify-end mt-6">
            <button type="button" onClick={onClose} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded mr-2" disabled={isLoading}>
              Cancel
            </button>
            <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded inline-flex items-center disabled:bg-indigo-400" disabled={isLoading}>
              {isLoading && <Spinner />}
              {booster ? 'Save Changes' : 'Create Booster'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BoosterModal;
