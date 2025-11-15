import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, onSnapshot, doc, updateDoc, runTransaction, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebase';
import UserEditModal from '../components/UserEditModal';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';
import { CheckIcon } from '../components/icons/CheckIcon';
import { XIcon } from '../components/icons/XIcon';
import Pagination from '../components/Pagination';
import Checkbox from '../components/Checkbox';

// Existing interfaces...
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
type SortConfig = { key: keyof User; direction: 'ascending' | 'descending' } | null;


const PaymentStatusBadge: React.FC<{ status: User['paymentStatus'] }> = ({ status }) => (
    <span className={`relative inline-block px-3 py-1 font-semibold leading-tight ${
        status === 'verified' ? 'text-green-900 dark:text-green-100' :
        status === 'pending' ? 'text-yellow-900 dark:text-yellow-100' :
        status === 'rejected' ? 'text-red-900 dark:text-red-100' : 'text-gray-700 dark:text-gray-100'}`}>
      <span aria-hidden className={`absolute inset-0 ${
        status === 'verified' ? 'bg-green-200 dark:bg-green-700' :
        status === 'pending' ? 'bg-yellow-200 dark:bg-yellow-700' :
        status === 'rejected' ? 'bg-red-200 dark:bg-red-700' : 'bg-slate-200 dark:bg-slate-700'
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
  
  // New state for advanced features
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'createdAt', direction: 'descending' });
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      setUsers(usersData);
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
    // ... (existing implementation)
  };
  
  const handleVerifyPayment = async (userId: string) => {
    // ... (existing implementation)
  };

  const handleRejectPayment = async (userId: string) => {
    // ... (existing implementation)
  };
  
  const handleBulkAction = async (action: 'verify' | 'reject') => {
      setActionLoading({ ...actionLoading, bulk: true });
      const batch = writeBatch(db);
      selectedUsers.forEach(userId => {
          const userRef = doc(db, 'users', userId);
          if (action === 'verify') {
              batch.update(userRef, { isPaid: true, paymentStatus: 'verified' });
          } else {
              batch.update(userRef, { isPaid: false, paymentStatus: 'rejected', submittedTransactionId: null });
          }
      });
      try {
          await batch.commit();
          addToast(`Successfully ${action === 'verify' ? 'verified' : 'rejected'} ${selectedUsers.size} users.`, 'success');
          setSelectedUsers(new Set());
      } catch (error) {
          console.error(`Error performing bulk ${action}:`, error);
          addToast(`Failed to perform bulk ${action}.`, 'error');
      } finally {
          setActionLoading({ ...actionLoading, bulk: false });
      }
  };


  const sortedAndFilteredUsers = useMemo(() => {
    let sortableUsers = [...users];

    // Filtering
    sortableUsers = sortableUsers.filter(user => {
        if (paymentFilter !== 'all' && user.paymentStatus !== paymentFilter) return false;
        const term = searchTerm.toLowerCase();
        return (user.email?.toLowerCase().includes(term) || user.username?.toLowerCase().includes(term));
    });

    // Sorting
    if (sortConfig !== null) {
      sortableUsers.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue === undefined || aValue === null) return 1;
        if (bValue === undefined || bValue === null) return -1;
        
        let comparison = 0;
        if (aValue > bValue) {
          comparison = 1;
        } else if (aValue < bValue) {
          comparison = -1;
        }
        return sortConfig.direction === 'ascending' ? comparison : -comparison;
      });
    }

    return sortableUsers;
  }, [users, searchTerm, paymentFilter, sortConfig]);

  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedAndFilteredUsers.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [sortedAndFilteredUsers, currentPage]);

  const requestSort = (key: keyof User) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const handleSelectUser = (userId: string) => {
    setSelectedUsers(prev => {
        const newSet = new Set(prev);
        if (newSet.has(userId)) {
            newSet.delete(userId);
        } else {
            newSet.add(userId);
        }
        return newSet;
    });
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
        setSelectedUsers(new Set(paginatedUsers.map(u => u.id)));
    } else {
        setSelectedUsers(new Set());
    }
  };


  if (loading) return <div className="text-center mt-10">Loading users...</div>;

  return (
    <div className="container mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">Manage Users</h1>
      
      <div className="mb-4 flex flex-col md:flex-row gap-4">
        <input
          type="text"
          placeholder="Search by username or email..."
          className="flex-grow p-2 border rounded-lg bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select
            className="p-2 border rounded-lg bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value as PaymentStatusFilter)}
        >
            <option value="all">All Payment Statuses</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
        </select>
      </div>

      {selectedUsers.size > 0 && (
        <div className="mb-4 bg-indigo-100 dark:bg-indigo-900/50 p-3 rounded-lg flex items-center justify-between">
            <span className="text-sm font-medium text-indigo-800 dark:text-indigo-200">{selectedUsers.size} user(s) selected</span>
            <div className="flex gap-2">
                <button onClick={() => handleBulkAction('verify')} className="px-3 py-1 text-xs font-semibold text-white bg-green-600 rounded-md hover:bg-green-700" disabled={actionLoading.bulk}>Verify</button>
                <button onClick={() => handleBulkAction('reject')} className="px-3 py-1 text-xs font-semibold text-white bg-red-600 rounded-md hover:bg-red-700" disabled={actionLoading.bulk}>Reject</button>
            </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full leading-normal">
            <thead>
              <tr>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800">
                    <Checkbox
                        checked={selectedUsers.size === paginatedUsers.length && paginatedUsers.length > 0}
                        onChange={handleSelectAll}
                        indeterminate={selectedUsers.size > 0 && selectedUsers.size < paginatedUsers.length}
                    />
                </th>
                {/* Add onClick handlers for sorting */}
                <th onClick={() => requestSort('username')} className="cursor-pointer px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">User</th>
                <th onClick={() => requestSort('balance')} className="cursor-pointer px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Balance</th>
                <th onClick={() => requestSort('paymentStatus')} className="cursor-pointer px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Payment Status</th>
                <th onClick={() => requestSort('createdAt')} className="cursor-pointer px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Registered On</th>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.map((user) => (
                <tr key={user.id}>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                    <Checkbox
                        checked={selectedUsers.has(user.id)}
                        onChange={() => handleSelectUser(user.id)}
                    />
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                    <p className="text-gray-900 dark:text-white whitespace-no-wrap font-semibold">{user.username || 'N/A'}</p>
                    <p className="text-gray-600 dark:text-gray-400 whitespace-no-wrap">{user.email}</p>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                    <p className="text-gray-900 dark:text-white whitespace-no-wrap">Rs {user.balance.toFixed(2)}</p>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                    <PaymentStatusBadge status={user.paymentStatus} />
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                    <p className="text-gray-900 dark:text-white whitespace-no-wrap">{user.createdAt ? user.createdAt.toDate().toLocaleDateString() : 'N/A'}</p>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                    <div className="flex items-center gap-3">
                        <button onClick={() => handleEditClick(user)} className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-200 font-medium" disabled={actionLoading[`save_${user.id}`]}>Edit</button>
                        {user.paymentStatus === 'pending' && (
                            <>
                            <button onClick={() => handleVerifyPayment(user.id)} className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-green-400 transition-colors" disabled={actionLoading[`verify_${user.id}`]}>
                              {actionLoading[`verify_${user.id}`] ? <Spinner /> : <CheckIcon className="w-4 h-4" />}
                            </button>
                            <button onClick={() => handleRejectPayment(user.id)} className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-red-400 transition-colors" disabled={actionLoading[`reject_${user.id}`]}>
                               {actionLoading[`reject_${user.id}`] ? <Spinner /> : <XIcon className="w-4 h-4" />}
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
        <Pagination 
            currentPage={currentPage}
            totalPages={Math.ceil(sortedAndFilteredUsers.length / ITEMS_PER_PAGE)}
            onPageChange={setCurrentPage}
        />
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