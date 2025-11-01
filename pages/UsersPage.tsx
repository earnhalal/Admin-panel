import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import UserEditModal from '../components/UserEditModal';

export interface User {
  id: string;
  email: string;
  username?: string;
  phone?: string;
  balance: number;
  isPaid: boolean;
  paymentStatus: 'pending' | 'verified' | 'rejected' | 'none';
  submittedTransactionId?: string | null;
}

type PaymentStatusFilter = 'all' | 'pending' | 'verified' | 'rejected';

const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatusFilter>('all');
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      setUsers(usersData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching users:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleEditClick = (user: User) => {
    setSelectedUser(user);
    setIsModalOpen(true);
  };
  
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedUser(null);
  };

  const handleSaveUser = async (updatedUser: User) => {
    if (!updatedUser.id) return;
    setActionLoading(prev => ({...prev, [updatedUser.id]: true}));
    try {
      const userRef = doc(db, 'users', updatedUser.id);
      await updateDoc(userRef, {
        username: updatedUser.username,
        phone: updatedUser.phone,
        balance: updatedUser.balance,
      });
      console.log('User updated successfully');
      handleCloseModal();
    } catch (error) {
      console.error('Error updating user:', error);
    } finally {
       setActionLoading(prev => ({...prev, [updatedUser.id]: false}));
    }
  };
  
  const handleVerifyPayment = async (userId: string) => {
    setActionLoading(prev => ({...prev, [userId]: true}));
    try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, { isPaid: true, paymentStatus: 'verified' });
    } catch (error) {
        console.error("Error verifying payment:", error);
    } finally {
        setActionLoading(prev => ({...prev, [userId]: false}));
    }
  };

  const handleRejectPayment = async (userId: string) => {
    setActionLoading(prev => ({...prev, [userId]: true}));
    try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, { isPaid: false, paymentStatus: 'rejected', submittedTransactionId: null });
    } catch (error) {
        console.error("Error rejecting payment:", error);
    } finally {
        setActionLoading(prev => ({...prev, [userId]: false}));
    }
  };

  const filteredUsers = useMemo(() => {
    return users
      .filter(user => {
        if (paymentFilter === 'all') return true;
        return user.paymentStatus === paymentFilter;
      })
      .filter(user => {
        const term = searchTerm.toLowerCase();
        return (user.email?.toLowerCase().includes(term) || user.username?.toLowerCase().includes(term));
      });
  }, [users, searchTerm, paymentFilter]);


  if (loading) return <div className="text-center mt-10">Loading users...</div>;

  return (
    <div className="container mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">Manage Users</h1>
      
      <div className="mb-4 flex flex-col md:flex-row gap-4">
        <input
          type="text"
          placeholder="Search by username or email..."
          className="flex-grow p-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select
            className="p-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value as PaymentStatusFilter)}
        >
            <option value="all">All Payment Statuses</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Desktop Table */}
      <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full leading-normal">
            <thead>
              <tr>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">User</th>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Balance</th>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Payment Status</th>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                    <p className="text-gray-900 dark:text-white whitespace-no-wrap font-semibold">{user.username || 'N/A'}</p>
                    <p className="text-gray-600 dark:text-gray-400 whitespace-no-wrap">{user.email}</p>
                     <p className="text-gray-600 dark:text-gray-400 whitespace-no-wrap">{user.phone || ''}</p>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                    <p className="text-gray-900 dark:text-white whitespace-no-wrap">Rs {user.balance.toFixed(2)}</p>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                    <span className={`relative inline-block px-3 py-1 font-semibold leading-tight capitalize ${
                        user.paymentStatus === 'verified' ? 'text-green-900 dark:text-green-100' :
                        user.paymentStatus === 'pending' ? 'text-yellow-900 dark:text-yellow-100' :
                        user.paymentStatus === 'rejected' ? 'text-red-900 dark:text-red-100' : 'text-gray-700 dark:text-gray-100'}`}>
                      <span aria-hidden className={`absolute inset-0 ${
                        user.paymentStatus === 'verified' ? 'bg-green-200 dark:bg-green-700' :
                        user.paymentStatus === 'pending' ? 'bg-yellow-200 dark:bg-yellow-700' :
                        user.paymentStatus === 'rejected' ? 'bg-red-200 dark:bg-red-700' : 'bg-gray-200 dark:bg-gray-700'
                      } opacity-50 rounded-full`}></span>
                      <span className="relative">{user.paymentStatus}</span>
                    </span>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                    <button onClick={() => handleEditClick(user)} className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-200 mr-4 font-medium" disabled={actionLoading[user.id]}>Edit</button>
                    {user.paymentStatus === 'pending' && (
                        <>
                        <button onClick={() => handleVerifyPayment(user.id)} className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-200 mr-4 font-medium" disabled={actionLoading[user.id]}>Verify</button>
                        <button onClick={() => handleRejectPayment(user.id)} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200 font-medium" disabled={actionLoading[user.id]}>Reject</button>
                        </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Mobile Card View */}
      <div className="md:hidden grid grid-cols-1 gap-4">
        {filteredUsers.length > 0 ? filteredUsers.map((user) => (
            <div key={user.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-gray-900 dark:text-white font-semibold">{user.username || 'N/A'}</p>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">{user.email}</p>
                        {user.phone && <p className="text-gray-600 dark:text-gray-400 text-sm">{user.phone}</p>}
                    </div>
                     <span className={`relative inline-block px-3 py-1 font-semibold leading-tight capitalize text-xs ${
                        user.paymentStatus === 'verified' ? 'text-green-900 dark:text-green-100' :
                        user.paymentStatus === 'pending' ? 'text-yellow-900 dark:text-yellow-100' :
                        user.paymentStatus === 'rejected' ? 'text-red-900 dark:text-red-100' : 'text-gray-700 dark:text-gray-100'}`}>
                      <span aria-hidden className={`absolute inset-0 ${
                        user.paymentStatus === 'verified' ? 'bg-green-200 dark:bg-green-700' :
                        user.paymentStatus === 'pending' ? 'bg-yellow-200 dark:bg-yellow-700' :
                        user.paymentStatus === 'rejected' ? 'bg-red-200 dark:bg-red-700' : 'bg-gray-200 dark:bg-gray-700'
                      } opacity-50 rounded-full`}></span>
                      <span className="relative">{user.paymentStatus}</span>
                    </span>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Balance</span>
                        <span className="text-gray-900 dark:text-white font-medium">Rs {user.balance.toFixed(2)}</span>
                    </div>
                </div>
                <div className="flex items-center justify-end gap-3 pt-2">
                    <button onClick={() => handleEditClick(user)} className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-200 font-medium text-sm" disabled={actionLoading[user.id]}>Edit</button>
                    {user.paymentStatus === 'pending' && (
                        <>
                        <button onClick={() => handleVerifyPayment(user.id)} className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-200 font-medium text-sm" disabled={actionLoading[user.id]}>Verify</button>
                        <button onClick={() => handleRejectPayment(user.id)} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200 font-medium text-sm" disabled={actionLoading[user.id]}>Reject</button>
                        </>
                    )}
                </div>
            </div>
        )) : <p className="text-center text-gray-500 dark:text-gray-400 py-4">No users found.</p>}
      </div>

      {isModalOpen && selectedUser && (
        <UserEditModal 
          user={selectedUser}
          onClose={handleCloseModal}
          onSave={handleSaveUser}
        />
      )}
    </div>
  );
};

export default UsersPage;
