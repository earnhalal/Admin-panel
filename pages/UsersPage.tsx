import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc, runTransaction, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebase';
import UserEditModal from '../components/UserEditModal';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';
import { Check, X, MoreHorizontal, Search, Filter } from 'lucide-react';
import Pagination from '../components/Pagination';
import Checkbox from '../components/Checkbox';
import { Link } from 'react-router-dom';

export interface User {
  id: string;
  email: string;
  username?: string;
  phone?: string;
  balance: number;
  isPaid: boolean;
  paymentStatus: 'pending' | 'verified' | 'rejected' | 'none';
  submittedTransactionId?: string | null;
  createdAt?: any;
  lastLoginAt?: any;
  withdrawalPoints?: number;
}

type PaymentStatusFilter = 'all' | 'pending' | 'verified' | 'rejected';
type SortConfig = { key: keyof User; direction: 'ascending' | 'descending' } | null;

const PaymentStatusBadge: React.FC<{ status: User['paymentStatus'] }> = ({ status }) => (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold capitalize
        ${status === 'verified' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' :
          status === 'pending' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
          status === 'rejected' ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400' : 
          'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400'}`}>
      {status}
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
    setActionLoading(prev => ({...prev, [`save_${updatedUser.id}`]: true}));
    try {
        const userRef = doc(db, 'users', updatedUser.id);
        const { id, ...dataToSave } = updatedUser;
        await updateDoc(userRef, dataToSave);
        addToast("User updated successfully!", "success");
        handleCloseModal();
    } catch (error) {
        addToast("Failed to update user.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [`save_${updatedUser.id}`]: false}));
    }
  };
  
  const handleVerifyPayment = async (userId: string) => {
    setActionLoading(prev => ({...prev, [`verify_${userId}`]: true}));
    try {
        await runTransaction(db, async (transaction) => {
            const userRef = doc(db, "users", userId);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) throw "User not found";
            
            transaction.update(userRef, { isPaid: true, paymentStatus: 'verified' });
        });
        addToast("Payment verified!", "success");
    } catch(error) {
        addToast("Failed to verify payment.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [`verify_${userId}`]: false}));
    }
  };

  const handleRejectPayment = async (userId: string) => {
    setActionLoading(prev => ({...prev, [`reject_${userId}`]: true}));
    try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
            isPaid: false,
            paymentStatus: 'rejected',
            submittedTransactionId: null
        });
        addToast("Payment rejected.", "success");
    } catch (error) {
        addToast("Failed to reject payment.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [`reject_${userId}`]: false}));
    }
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

    sortableUsers = sortableUsers.filter(user => {
        if (paymentFilter !== 'all' && user.paymentStatus !== paymentFilter) return false;
        const term = searchTerm.toLowerCase();
        return (user.email?.toLowerCase().includes(term) || user.username?.toLowerCase().includes(term));
    });

    if (sortConfig !== null) {
      sortableUsers.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue === undefined || aValue === null) return 1;
        if (bValue === undefined || bValue === null) return -1;
        
        let comparison = 0;
        if (aValue > bValue) comparison = 1;
        else if (aValue < bValue) comparison = -1;
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
        if (newSet.has(userId)) newSet.delete(userId);
        else newSet.add(userId);
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

  if (loading) return <div className="flex justify-center items-center min-h-[400px]"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
        
        {selectedUsers.size > 0 && (
            <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2 rounded-xl border border-emerald-100 dark:border-emerald-800">
                <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{selectedUsers.size} Selected</span>
                <div className="h-4 w-px bg-emerald-200 dark:bg-emerald-700"></div>
                <button onClick={() => handleBulkAction('verify')} className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 disabled:opacity-50" disabled={actionLoading.bulk}>Verify</button>
                <button onClick={() => handleBulkAction('reject')} className="text-xs font-semibold text-rose-600 hover:text-rose-800 disabled:opacity-50" disabled={actionLoading.bulk}>Reject</button>
            </div>
        )}
      </div>
      
      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
            type="text"
            placeholder="Search users..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
        <div className="relative min-w-[200px]">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 appearance-none"
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value as PaymentStatusFilter)}
            >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="verified">Verified</option>
                <option value="rejected">Rejected</option>
            </select>
        </div>
      </div>

      {/* Desktop Table (Hidden on Mobile) */}
      <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-800">
            <tr>
              <th className="px-6 py-4 w-10">
                  <Checkbox
                      checked={selectedUsers.size === paginatedUsers.length && paginatedUsers.length > 0}
                      onChange={handleSelectAll}
                      indeterminate={selectedUsers.size > 0 && selectedUsers.size < paginatedUsers.length}
                  />
              </th>
              <th onClick={() => requestSort('username')} className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-emerald-600">User</th>
              <th onClick={() => requestSort('balance')} className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-emerald-600">Balance</th>
              <th onClick={() => requestSort('paymentStatus')} className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-emerald-600">Status</th>
              <th onClick={() => requestSort('createdAt')} className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-emerald-600">Joined</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
            {paginatedUsers.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-4">
                  <Checkbox
                      checked={selectedUsers.has(user.id)}
                      onChange={() => handleSelectUser(user.id)}
                  />
                </td>
                <td className="px-6 py-4">
                  <Link to={`/users/${user.id}`} className="block">
                      <span className="block text-sm font-bold text-gray-900 dark:text-white hover:text-emerald-600">{user.username || 'Anonymous'}</span>
                      <span className="block text-xs text-gray-500">{user.email}</span>
                  </Link>
                </td>
                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                  Rs {user.balance.toFixed(2)}
                </td>
                <td className="px-6 py-4">
                  <PaymentStatusBadge status={user.paymentStatus} />
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {user.createdAt ? user.createdAt.toDate().toLocaleDateString() : 'N/A'}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleEditClick(user)} className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-700 rounded-lg transition-colors" disabled={actionLoading[`save_${user.id}`]}>
                          <MoreHorizontal size={18} />
                      </button>
                      {user.paymentStatus === 'pending' && (
                          <>
                          <button onClick={() => handleVerifyPayment(user.id)} className="p-2 bg-emerald-100 text-emerald-600 hover:bg-emerald-200 rounded-lg" disabled={actionLoading[`verify_${user.id}`]}>
                            {actionLoading[`verify_${user.id}`] ? <Spinner /> : <Check size={16} />}
                          </button>
                          <button onClick={() => handleRejectPayment(user.id)} className="p-2 bg-rose-100 text-rose-600 hover:bg-rose-200 rounded-lg" disabled={actionLoading[`reject_${user.id}`]}>
                             {actionLoading[`reject_${user.id}`] ? <Spinner /> : <X size={16} />}
                          </button>
                          </>
                      )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination 
            currentPage={currentPage}
            totalPages={Math.ceil(sortedAndFilteredUsers.length / ITEMS_PER_PAGE)}
            onPageChange={setCurrentPage}
        />
      </div>

      {/* Mobile Card List (Visible on Mobile) */}
      <div className="md:hidden space-y-3">
          {paginatedUsers.map(user => (
              <div key={user.id} className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800">
                  <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                           <Checkbox
                              checked={selectedUsers.has(user.id)}
                              onChange={() => handleSelectUser(user.id)}
                          />
                          <div>
                              <Link to={`/users/${user.id}`} className="font-bold text-gray-900 dark:text-white text-lg">{user.username || 'Anonymous'}</Link>
                              <p className="text-xs text-gray-500">{user.email}</p>
                          </div>
                      </div>
                      <PaymentStatusBadge status={user.paymentStatus} />
                  </div>
                  
                  <div className="flex justify-between items-center py-2 border-t border-gray-50 dark:border-slate-800">
                      <span className="text-sm text-gray-500">Balance</span>
                      <span className="font-bold text-gray-900 dark:text-white">Rs {user.balance.toFixed(2)}</span>
                  </div>

                  <div className="flex gap-2 mt-3">
                      <button onClick={() => handleEditClick(user)} className="flex-1 py-2 text-sm font-medium text-gray-700 bg-gray-100 dark:bg-slate-800 dark:text-gray-300 rounded-xl hover:bg-gray-200 transition-colors">Edit</button>
                      {user.paymentStatus === 'pending' && (
                          <>
                            <button onClick={() => handleVerifyPayment(user.id)} className="flex-1 py-2 flex justify-center items-center bg-emerald-100 text-emerald-700 font-bold rounded-xl">
                                {actionLoading[`verify_${user.id}`] ? <Spinner /> : 'Verify'}
                            </button>
                            <button onClick={() => handleRejectPayment(user.id)} className="flex-1 py-2 flex justify-center items-center bg-rose-100 text-rose-700 font-bold rounded-xl">
                                {actionLoading[`reject_${user.id}`] ? <Spinner /> : 'Reject'}
                            </button>
                          </>
                      )}
                  </div>
              </div>
          ))}
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