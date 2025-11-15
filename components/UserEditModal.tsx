import React, { useState, useEffect } from 'react';
import { User } from '../pages/UsersPage';
import Spinner from './Spinner';

interface UserEditModalProps {
  user: User;
  onClose: () => void;
  onSave: (user: User) => void;
  isLoading?: boolean;
}

const UserEditModal: React.FC<UserEditModalProps> = ({ user, onClose, onSave, isLoading }) => {
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [balance, setBalance] = useState(0);
  const [withdrawalPoints, setWithdrawalPoints] = useState(0);

  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setPhone(user.phone || '');
      setBalance(user.balance);
      setWithdrawalPoints(user.withdrawalPoints || 0);
    }
  }, [user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...user, username, phone, balance, withdrawalPoints });
  };

  if (!user) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-white">Edit User: {user.email}</h2>
        <form onSubmit={handleSubmit}>
           <div className="mb-4">
            <label htmlFor="username" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
           <div className="mb-4">
            <label htmlFor="phone" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Phone</label>
            <input
              id="phone"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label htmlFor="balance" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Balance (Rs)</label>
              <input
                id="balance"
                type="number"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(parseFloat(e.target.value) || 0)}
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 leading-tight focus:outline-none focus:shadow-outline"
                required
              />
            </div>
             <div>
              <label htmlFor="withdrawalPoints" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Withdrawal Points</label>
              <input
                id="withdrawalPoints"
                type="number"
                value={withdrawalPoints}
                onChange={(e) => setWithdrawalPoints(parseInt(e.target.value) || 0)}
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 leading-tight focus:outline-none focus:shadow-outline"
                required
              />
            </div>
          </div>
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded mr-2"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded inline-flex items-center disabled:bg-indigo-400"
              disabled={isLoading}
            >
              {isLoading && <Spinner />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserEditModal;