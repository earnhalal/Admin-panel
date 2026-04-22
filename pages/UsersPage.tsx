import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc, setDoc, runTransaction, writeBatch, getDoc, increment, addDoc, Timestamp, getDocs } from 'firebase/firestore';
import { db, rtdb } from '../services/firebase';
import { ref, update, set, onValue, get } from 'firebase/database';
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
  isActivated?: boolean;
  status?: 'active' | 'pending' | 'blocked';
  paymentStatus: 'pending' | 'verified' | 'rejected' | 'none';
  submittedTransactionId?: string | null;
  createdAt?: any;
  lastLoginAt?: any;
  withdrawalPoints?: number;
  manualWithdrawUnlock?: boolean;
}

type PaymentStatusFilter = 'all' | 'pending' | 'verified' | 'rejected';
type SortConfig = { key: keyof User; direction: 'ascending' | 'descending' } | null;

const PaymentStatusBadge: React.FC<{ status: User['paymentStatus'] }> = ({ status }) => (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold capitalize
        ${status === 'verified' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
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
  const [isSyncingReferrals, setIsSyncingReferrals] = useState(false);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setLoading(true);
    
    // 1. Listen to RTDB users as the primary source of truth for the list
    const rtdbUsersRef = ref(rtdb, 'users');
    const unsubscribeRTDB = onValue(rtdbUsersRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const rtdbUsers = Object.entries(data).map(([id, value]: [string, any]) => ({
                id,
                isPaid: false,
                paymentStatus: 'none',
                ...value,
                // Ensure balance is a number
                balance: Number(value.balance) || 0
            } as User));
            
            setUsers(prev => {
                // Merge RTDB users with existing Firestore data
                return rtdbUsers.map(rUser => {
                    const existing = prev.find(u => u.id === rUser.id);
                    return { ...existing, ...rUser };
                });
            });
            setLoading(false);
        } else {
            setUsers([]);
            setLoading(false);
        }
    }, (error) => {
        console.error("Error fetching users from RTDB:", error);
        addToast('Error fetching users from RTDB.', 'error');
        setLoading(false);
    });

    // 2. Listen to Firestore users for profile enrichment (email, username, etc.)
    const firestoreUsersRef = collection(db, 'users');
    const unsubscribeFirestore = onSnapshot(firestoreUsersRef, (snapshot) => {
        const firestoreData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as User));
        
        setUsers(prev => {
            return prev.map(u => {
                const fUser = firestoreData.find(fu => fu.id === u.id);
                if (fUser) {
                    return { ...u, ...fUser, balance: u.balance, status: u.status }; // RTDB balance/status takes precedence
                }
                return u;
            });
        });
    }, (error) => {
        console.error("Error fetching users from Firestore:", error);
    });

    return () => {
        unsubscribeFirestore();
        unsubscribeRTDB();
    };
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
        // 1. Update Firestore
        const userRef = doc(db, 'users', updatedUser.id);
        const { id, ...dataToSave } = updatedUser;
        await updateDoc(userRef, dataToSave);

        // 2. Update RTDB
        const rtdbUserRef = ref(rtdb, 'users/' + updatedUser.id);
        await update(rtdbUserRef, {
            balance: updatedUser.balance,
            status: updatedUser.status,
            username: updatedUser.username,
            phone: updatedUser.phone,
            withdrawalPoints: updatedUser.withdrawalPoints,
            isActivated: updatedUser.isActivated
        });

        addToast("User updated successfully in both databases!", "success");
        handleCloseModal();
    } catch (error) {
        console.error("Update error:", error);
        addToast("Failed to update user.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [`save_${updatedUser.id}`]: false}));
    }
  };
  
  const handleVerifyPayment = async (userId: string) => {
    setActionLoading(prev => ({...prev, [`verify_${userId}`]: true}));
    try {
        // 1. Update Firestore
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, { 
            isPaid: true, 
            paymentStatus: 'verified',
            isActivated: true,
            status: 'active'
        });
        
        // 2. Update RTDB status
        const userStatusRef = ref(rtdb, 'users/' + userId);
        await update(userStatusRef, { 
            status: 'active',
            isActivated: true,
            isPaid: true,
            paymentStatus: 'verified'
        });

        // 3. Referral Tracking
        const userSnap = await get(userStatusRef);
        const userData = userSnap.val();
        
        let referrerUid = userData?.referredBy || userData?.referrerUid || userData?.referrerId;
        
        if (!referrerUid) {
            try {
                const userFsSnap = await getDoc(doc(db, 'users', userId));
                if (userFsSnap.exists()) {
                    const fsData = userFsSnap.data();
                    referrerUid = fsData.referredBy || fsData.referrerUid || fsData.referrerId;
                }
            } catch (e) {}
        }
        
        if (referrerUid) {
            const rewardAmount = 125;
            
            // 1. RTDB Updates
            await update(ref(rtdb, `invites/${referrerUid}/history/${userId}`), { 
                status: 'paid',
                paidAt: Date.now(),
                commission: rewardAmount
            });
            
            const balanceRef = ref(rtdb, `users/${referrerUid}/balance`);
            const balanceSnap = await get(balanceRef);
            const currentBalance = balanceSnap.val() || 0;
            const newBalance = currentBalance + rewardAmount;
            await set(balanceRef, newBalance);

            const earningsRef = ref(rtdb, `users/${referrerUid}/totalEarnings`);
            const earningsSnap = await get(earningsRef);
            const currentEarnings = earningsSnap.val() || 0;
            await set(earningsRef, currentEarnings + rewardAmount);
            
            const countRef = ref(rtdb, `users/${referrerUid}/inviteCount`);
            const countSnap = await get(countRef);
            const currentCount = countSnap.val() || 0;
            await set(countRef, currentCount + 1);

            const activeMembersRef = ref(rtdb, `users/${referrerUid}/activeMembers`);
            const activeMembersSnap = await get(activeMembersRef);
            const currentActiveMembers = activeMembersSnap.val() || 0;
            await set(activeMembersRef, currentActiveMembers + 1);

            // 2. Firestore Updates
            try {
                // Update inviter's balance and referralStats in Firestore
                const inviterRef = doc(db, 'users', referrerUid);
                await updateDoc(inviterRef, { 
                    balance: newBalance, // Sync balance
                    'referralStats.activeMembers': increment(1),
                    'referralStats.totalCommission': increment(rewardAmount)
                });
            } catch (e) {
               console.error('Failed to update inviter firestore stats', e)
            }
            
            try {
                // Update 'referrals' subcollection in Firestore
                const referralRecordRef = doc(db, 'users', referrerUid, 'referrals', userId);
                await setDoc(referralRecordRef, {
                    status: 'paid',
                    paidAt: Timestamp.now()
                }, { merge: true });
            } catch (e) {
               console.error('Failed to update referrals subcollection', e)
            }
            
            try {
                // Add to earning_history for the inviter
                await addDoc(collection(db, 'earning_history'), {
                    userId: referrerUid,
                    amount: rewardAmount,
                    source: 'Referral Bonus',
                    description: `Bonus for referring user ${userData?.username || 'New User'}`,
                    timestamp: Timestamp.now()
                });
            } catch (e) {
               console.error('Failed to add earning_history', e)
            }
        }
        
        addToast("Payment verified and referral processed!", "success");
    } catch(error) {
        console.error("Verification error:", error);
        addToast("Failed to verify payment.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [`verify_${userId}`]: false}));
    }
  };

  const handleRejectPayment = async (userId: string) => {
    setActionLoading(prev => ({...prev, [`reject_${userId}`]: true}));
    try {
        // 1. Update Firestore
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
            isPaid: false,
            paymentStatus: 'rejected',
            submittedTransactionId: null
        });

        // 2. Update RTDB
        const rtdbUserRef = ref(rtdb, 'users/' + userId);
        await update(rtdbUserRef, {
            paymentStatus: 'rejected',
            isPaid: false
        });

        addToast("Payment rejected.", "success");
    } catch (error) {
        addToast("Failed to reject payment.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [`reject_${userId}`]: false}));
    }
  };
  
  const handleSyncOldReferrals = async () => {
      setIsSyncingReferrals(true);
      addToast("Starting sync process... please wait.", 'info');
      
      let fixedCount = 0;
      
      try {
          // 1. Fetch from RTDB (Main source for old legacy users)
          const rtdbUsersSnap = await get(ref(rtdb, 'users'));
          const rtdbUsers = rtdbUsersSnap.val() || {};
          
          for (const [userId, rData] of Object.entries<any>(rtdbUsers)) {
              // Check if user is approved in RTDB
              const isApproved = rData.isPaid || rData.isActivated || rData.status === 'active' || rData.paymentStatus === 'verified' || rData.feeStatus === 'paid';
              if (!isApproved) continue;

              const referrerUid = rData.referredBy || rData.referrerUid || rData.referrerId;
              
              if (referrerUid) {
                  let alreadyPaid = false;
                  
                  // Check RTDB invites history FIRST (where old bonuses were tracked)
                  const rtdbInviteSnap = await get(ref(rtdb, `invites/${referrerUid}/history/${userId}`));
                  const rtdbInviteData = rtdbInviteSnap.val();
                  if (rtdbInviteData && rtdbInviteData.status === 'paid') {
                      alreadyPaid = true;
                  }

                  // Check Firestore subcollection if not paid in RTDB
                  const referralRecordRef = doc(db, 'users', referrerUid, 'referrals', userId);
                  if (!alreadyPaid) {
                      const referralSnap = await getDoc(referralRecordRef);
                      if (referralSnap.exists() && referralSnap.data()?.status === 'paid') {
                          alreadyPaid = true;
                      }
                  }

                  // If they have never been paid, award the bonus!
                  if (!alreadyPaid) {
                      try {
                          const rewardAmount = 125;
                  
                          // 1. RTDB Updates
                          await update(ref(rtdb, `invites/${referrerUid}/history/${userId}`), { 
                              status: 'paid',
                              paidAt: Date.now(),
                              commission: rewardAmount
                          });
                          
                          const balanceRef = ref(rtdb, `users/${referrerUid}/balance`);
                          const balanceSnap = await get(balanceRef);
                          const currentBalance = balanceSnap.val() || 0;
                          const newBalance = currentBalance + rewardAmount;
                          await set(balanceRef, newBalance);

                          const earningsRef = ref(rtdb, `users/${referrerUid}/totalEarnings`);
                          const earningsSnap = await get(earningsRef);
                          const currentEarnings = earningsSnap.val() || 0;
                          await set(earningsRef, currentEarnings + rewardAmount);
                          
                          const countRef = ref(rtdb, `users/${referrerUid}/inviteCount`);
                          const countSnap = await get(countRef);
                          const currentCount = countSnap.val() || 0;
                          await set(countRef, currentCount + 1);

                          const activeMembersRef = ref(rtdb, `users/${referrerUid}/activeMembers`);
                          const activeMembersSnap = await get(activeMembersRef);
                          const currentActiveMembers = activeMembersSnap.val() || 0;
                          await set(activeMembersRef, currentActiveMembers + 1);

                          // 2. Firestore Updates
                          try {
                              const inviterRef = doc(db, 'users', referrerUid);
                              await updateDoc(inviterRef, { 
                                  balance: newBalance,
                                  'referralStats.activeMembers': increment(1),
                                  'referralStats.totalCommission': increment(rewardAmount)
                              });
                          } catch (e) {
                              // It's okay if inviter doc doesn't exist in Firestore for very old users
                          }
                          
                          try {
                              await setDoc(referralRecordRef, {
                                  status: 'paid',
                                  paidAt: Timestamp.now()
                              }, { merge: true });
                          } catch (e) {}
                          
                          try {
                              await addDoc(collection(db, 'earning_history'), {
                                  userId: referrerUid,
                                  amount: rewardAmount,
                                  source: 'Referral Bonus',
                                  description: `Retroactive bonus for referring user ${rData.username || rData.name || 'Old User'}`,
                                  timestamp: Timestamp.now()
                              });
                          } catch (e) {}

                          fixedCount++;
                      } catch (innerError) {
                          console.error("Error patching user", userId, innerError);
                      }
                  }
              }
          }
          addToast(`Sync complete! ${fixedCount} missing referral bonuses were awarded.`, 'success');
      } catch (e) {
          console.error(e);
          addToast("Error syncing old referrals. Check system logs.", 'error');
      } finally {
          setIsSyncingReferrals(false);
      }
  };

  const handleBulkAction = async (action: 'verify' | 'reject') => {
      setActionLoading({ ...actionLoading, bulk: true });
      const batch = writeBatch(db);
      selectedUsers.forEach(userId => {
          const userRef = doc(db, 'users', userId);
          if (action === 'verify') {
              batch.update(userRef, { 
                  isPaid: true, 
                  paymentStatus: 'verified',
                  isActivated: true,
                  status: 'active'
              });
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
        
        <div className="flex items-center gap-3">
            <button 
                onClick={handleSyncOldReferrals}
                disabled={isSyncingReferrals}
                className="inline-flex items-center justify-center gap-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 font-bold py-2 px-4 rounded-xl transition-all shadow-sm hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 text-sm"
            >
                {isSyncingReferrals ? <Spinner size="sm" /> : <span>🔄</span>}
                Sync Old Referrals
            </button>

            {selectedUsers.size > 0 && (
                <div className="flex items-center gap-3 bg-indigo-50 dark:bg-indigo-900/20 px-4 py-2 rounded-xl border border-indigo-100 dark:border-indigo-800">
                    <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400">{selectedUsers.size} Selected</span>
                    <div className="h-4 w-px bg-indigo-200 dark:bg-indigo-700"></div>
                    <button onClick={() => handleBulkAction('verify')} className="text-xs font-semibold text-green-600 hover:text-green-800 disabled:opacity-50" disabled={actionLoading.bulk}>Verify</button>
                    <button onClick={() => handleBulkAction('reject')} className="text-xs font-semibold text-rose-600 hover:text-rose-800 disabled:opacity-50" disabled={actionLoading.bulk}>Reject</button>
                </div>
            )}
        </div>
      </div>
      
      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
            type="text"
            placeholder="Search users..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
        <div className="relative min-w-[200px]">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 appearance-none"
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
              <th onClick={() => requestSort('username')} className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-indigo-600">User</th>
              <th onClick={() => requestSort('balance')} className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-indigo-600">Balance</th>
              <th onClick={() => requestSort('paymentStatus')} className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-indigo-600">Status</th>
              <th onClick={() => requestSort('createdAt')} className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-indigo-600">Joined</th>
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
                      <span className="block text-sm font-bold text-gray-900 dark:text-white hover:text-indigo-600">{user.username || 'Anonymous'}</span>
                      <span className="block text-xs text-gray-500">{user.email}</span>
                  </Link>
                </td>
                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                  Rs {(user.balance ?? 0).toFixed(2)}
                </td>
                <td className="px-6 py-4">
                  <PaymentStatusBadge status={user.paymentStatus} />
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {user.createdAt ? user.createdAt.toDate().toLocaleDateString() : 'N/A'}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleEditClick(user)} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-700 rounded-lg transition-colors" disabled={actionLoading[`save_${user.id}`]}>
                          <MoreHorizontal size={18} />
                      </button>
                      {user.paymentStatus === 'pending' && (
                          <>
                          <button onClick={() => handleVerifyPayment(user.id)} className="p-2 bg-green-100 text-green-600 hover:bg-green-200 rounded-lg" disabled={actionLoading[`verify_${user.id}`]}>
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
                      <span className="font-bold text-gray-900 dark:text-white">Rs {(user.balance ?? 0).toFixed(2)}</span>
                  </div>

                  <div className="flex gap-2 mt-3">
                      <button onClick={() => handleEditClick(user)} className="flex-1 py-2 text-sm font-medium text-gray-700 bg-gray-100 dark:bg-slate-800 dark:text-gray-300 rounded-xl hover:bg-gray-200 transition-colors">Edit</button>
                      {user.paymentStatus === 'pending' && (
                          <>
                            <button onClick={() => handleVerifyPayment(user.id)} className="flex-1 py-2 flex justify-center items-center bg-green-100 text-green-700 font-bold rounded-xl">
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