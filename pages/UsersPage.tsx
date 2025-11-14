import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, onSnapshot, doc, updateDoc, runTransaction, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import UserEditModal from '../components/UserEditModal';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';
import { CheckIcon } from '../components/icons/CheckIcon';
import { XIcon } from '../components/icons/XIcon';

export interface User {
  id: string;
  email: string;
  username?: string;
  phone?: string;
  balance: number;
  isPaid: boolean;
  paymentStatus: 'pending' | 'verified' | 'rejected' | 'none';
  submittedTransactionId?: string | null;
  createdAt?: Timestamp;
  lastLoginAt?: Timestamp;
}

type PaymentStatusFilter = 'all' | 'pending' | 'verified' | 'rejected';

const PaymentStatusBadge: React.FC<{ status: User['paymentStatus'] }> = ({ status }) => (
    <span className={`relative inline-block px-3 py-1 font-semibold leading-tight ${
        status === 'verified' ? 'text-green-900 dark:text-green-100' :
        status === 'pending' ? 'text-yellow-900 dark:text-yellow-100' :
        status === 'rejected' ? 'text-red-900 dark:text-red-100' : 'text-gray-700 dark:text-gray-100'}`}>
      <span aria-hidden className={`absolute inset-0 ${
        status === 'verified' ? 'bg-green-200 dark:bg-green-700' :
        status === 'pending' ? 'bg-yellow-200 dark:bg-yellow-700' :
        status === 'rejected' ? 'bg-red-200 dark:bg-red-700' : 'bg-gray-200 dark:bg-gray-700'
      } opacity-50 rounded-full`}></span>
      <span className="relative capitalize">{status}</span>
    </span>
);

const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatusFilter>('all');
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});
  const { addToast } = useToast();
  const prevUsersRef = useRef<User[]>([]);
  const [highlightedUsers, setHighlightedUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      
      if (prevUsersRef.current.length > 0) {
        const changedUserIds = new Set<string>();
        usersData.forEach(newUser => {
          const oldUser = prevUsersRef.current.find(u => u.id === newUser.id);
          if (oldUser && (oldUser.balance !== newUser.balance || oldUser.paymentStatus !== newUser.paymentStatus)) {
            changedUserIds.add(newUser.id);
          }
        });

        if (changedUserIds.size > 0) {
          setHighlightedUsers(changedUserIds);
          const timer = setTimeout(() => {
            setHighlightedUsers(new Set());
          }, 2000); // Highlight for 2 seconds
          return () => clearTimeout(timer);
        }
      }
      
      setUsers(usersData);
      prevUsersRef.current = usersData;
      setLoading(false);
    }, (error) => {
      console.error("Error fetching users:", error);
      addToast('Error fetching users.', 'error');
      setLoading(false);
    });
    return () => unsubscribe();
  }, [addToast]);

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
    setActionLoading(prev => ({...prev, [`save_${updatedUser.id}`]: true}));
    try {
      const userRef = doc(db, 'users', updatedUser.id);
      await runTransaction(db, async (transaction) => {
          transaction.update(userRef, {
            username: updatedUser.username,
            phone: updatedUser.phone,
            balance: updatedUser.balance,
          });
      });
      addToast('User updated successfully!', 'success');
      handleCloseModal();
    } catch (error) {
      console.error('Error updating user:', error);
      addToast('Failed to update user.', 'error');
    } finally {
       setActionLoading(prev => ({...prev, [`save_${updatedUser.id}`]: false}));
    }
  };
  
  const handleVerifyPayment = async (userId: string) => {
    setActionLoading(prev => ({...prev, [`verify_${userId}`]: true}));
    try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, { isPaid: true, paymentStatus: 'verified' });
        addToast('Payment verified!', 'success');
    } catch (error) {
        console.error("Error verifying payment:", error);
        addToast('Failed to verify payment.', 'error');
    } finally {
        setActionLoading(prev => ({...prev, [`verify_${userId}`]: false}));
    }
  };

  const handleRejectPayment = async (userId: string) => {
    setActionLoading(prev => ({...prev, [`reject_${userId}`]: true}));
    try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, { isPaid: false, paymentStatus: 'rejected', submittedTransactionId: null });
        addToast('Payment rejected.', 'success');
    } catch (error) {
        console.error("Error rejecting payment:", error);
        addToast('Failed to reject payment.', 'error');
    } finally {
        setActionLoading(prev => ({...prev, [`reject_${userId}`]: false}));
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

      {/* Desktop Table View */}
      <div className="hidden md:block bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full leading-normal">
            <thead>
              <tr>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">User</th>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Balance</th>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Payment Status</th>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Registered On</th>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Last Login</th>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className={`${highlightedUsers.has(user.id) ? 'bg-indigo-100 dark:bg-indigo-900/30' : ''} transition-colors duration-1000`}>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 text-sm">
                    <p className="text-gray-900 dark:text-white whitespace-no-wrap font-semibold">{user.username || 'N/A'}</p>
                    <p className="text-gray-600 dark:text-gray-400 whitespace-no-wrap">{user.email}</p>
                     <p className="text-gray-600 dark:text-gray-400 whitespace-no-wrap">{user.phone || ''}</p>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 text-sm">
                    <p className="text-gray-900 dark:text-white whitespace-no-wrap">Rs {user.balance.toFixed(2)}</p>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 text-sm">
                    <PaymentStatusBadge status={user.paymentStatus} />
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 text-sm">
                    <p className="text-gray-900 dark:text-white whitespace-no-wrap">{user.createdAt ? user.createdAt.toDate().toLocaleDateString() : 'N/A'}</p>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 text-sm">
                    <p className="text-gray-900 dark:text-white whitespace-no-wrap">{user.lastLoginAt ? user.lastLoginAt.toDate().toLocaleString() : 'Never'}</p>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 text-sm">
                    <div className="flex items-center gap-3">
                        <button onClick={() => handleEditClick(user)} className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-200 font-medium" disabled={actionLoading[`save_${user.id}`]}>Edit</button>
                        {user.paymentStatus === 'pending' && (
                            <>
                            <button onClick={() => handleVerifyPayment(user.id)} className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-green-400 transition-colors" disabled={actionLoading[`verify_${user.id}`]}>
                              {actionLoading[`verify_${user.id}`] ? <Spinner /> : <CheckIcon className="w-4 h-4" />} Verify
                            </button>
                            <button onClick={() => handleRejectPayment(user.id)} className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-red-400 transition-colors" disabled={actionLoading[`reject_${user.id}`]}>
                               {actionLoading[`reject_${user.id}`] ? <Spinner /> : <XIcon className="w-4 h-4" />} Reject
                            </button>
                            </>
                        )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

       {/* Mobile Card View */}
      <div className="md:hidden grid grid-cols-1 gap-4">
        {filteredUsers.map(user => (
            <div key={user.id} className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 space-y-3 ${highlightedUsers.has(user.id) ? 'ring-2 ring-indigo-500' : ''} transition-all duration-1000`}>
                <div>
                    <p className="font-bold text-gray-900 dark:text-white">{user.username || 'N/A'}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{user.email}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{user.phone || ''}</p>
                </div>
                <div className="flex justify-between items-center text-sm">
                    <p className="text-gray-500 dark:text-gray-400">Balance:</p>
                    <p className="font-semibold text-gray-900 dark:text-white">Rs {user.balance.toFixed(2)}</p>
                </div>
                <div className="flex justify-between items-center text-sm">
                    <p className="text-gray-500 dark:text-gray-400">Payment Status:</p>
                    <PaymentStatusBadge status={user.paymentStatus} />
                </div>
                <div className="flex justify-between items-center text-sm">
                    <p className="text-gray-500 dark:text-gray-400">Registered:</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{user.createdAt ? user.createdAt.toDate().toLocaleDateString() : 'N/A'}</p>
                </div>
                <div className="flex justify-between items-center text-sm">
                    <p className="text-gray-500 dark:text-gray-400">Last Login:</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{user.lastLoginAt ? user.lastLoginAt.toDate().toLocaleString() : 'Never'}</p>
                </div>
                {user.paymentStatus === 'pending' && user.submittedTransactionId && (
                  <div className="text-sm border-t border-gray-200 dark:border-gray-700 pt-3">
                      <p className="text-gray-500 dark:text-gray-400">Submitted Txn ID:</p>
                      <p className="font-mono text-gray-800 dark:text-gray-200 break-all">{user.submittedTransactionId}</p>
                  </div>
                )}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex flex-col sm:flex-row items-center gap-2">
                    <button onClick={() => handleEditClick(user)} className="w-full justify-center flex py-2 px-4 rounded-md text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/50 hover:bg-indigo-200 dark:hover:bg-indigo-900" disabled={actionLoading[`save_${user.id}`]}>
                        Edit
                    </button>
                    {user.paymentStatus === 'pending' && (
                        <>
                        <button onClick={() => handleVerifyPayment(user.id)} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-green-400 transition-colors" disabled={actionLoading[`verify_${user.id}`]}>
                          {actionLoading[`verify_${user.id}`] ? <Spinner /> : <><CheckIcon className="w-4 h-4" /> Verify</>}
                        </button>
                        <button onClick={() => handleRejectPayment(user.id)} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-red-400 transition-colors" disabled={actionLoading[`reject_${user.id}`]}>
                           {actionLoading[`reject_${user.id}`] ? <Spinner /> : <><XIcon className="w-4 h-4" /> Reject</>}
                        </button>
                        </>
                    )}
                </div>
            </div>
        ))}
      </div>

      {isModalOpen && selectedUser && (
        <UserEditModal 
          user={selectedUser}
          onClose={handleCloseModal}
          onSave={handleSaveUser}
          isLoading={actionLoading[`save_${selectedUser.id}`]}
        />
      )}
    </div>
  );
};

export default UsersPage;