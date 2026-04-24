import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, orderBy, Timestamp, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, rtdb } from '../services/firebase';
import { ref, remove, get } from 'firebase/database';
import { User } from './UsersPage';
import { Task } from './SocialTasksPage';
import { ArrowRightIcon } from '../components/icons/ArrowRightIcon';
import { useToast } from '../contexts/ToastContext';
import ConfirmationModal from '../components/ConfirmationModal';

interface Transaction {
    id: string;
    type: 'Deposit' | 'Withdrawal';
    amount: number;
    status: string;
    createdAt: Date;
}

interface UserTaskSubmission {
    id: string;
    taskId: string;
    taskTitle?: string;
    status: 'submitted' | 'approved' | 'rejected';
    taskReward?: number;
}

const UserProfilePage: React.FC = () => {
    const { userId } = useParams<{ userId: string }>();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const [user, setUser] = useState<User | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [taskSubmissions, setTaskSubmissions] = useState<UserTaskSubmission[]>([]);
    const [loading, setLoading] = useState(true);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        const fetchUserData = async () => {
            if (!userId) return;
            setLoading(true);

            // Fetch User Details
            const userRef = doc(db, 'users', userId);
            const userSnap = await getDoc(userRef);
            let firestoreUser = userSnap.exists() ? { id: userSnap.id, ...userSnap.data() } as User : null;

            // Fetch RTDB User Details for absolute source of truth on balance
            const userRtdbRef = ref(rtdb, `users/${userId}`);
            const userRtdbSnap = await get(userRtdbRef);
            if (userRtdbSnap.exists()) {
                const rtdbData = userRtdbSnap.val();
                if (firestoreUser) {
                    firestoreUser = { ...firestoreUser, balance: rtdbData.balance || 0, status: rtdbData.status || firestoreUser.status };
                } else {
                    firestoreUser = { id: userId, balance: rtdbData.balance || 0, status: rtdbData.status } as User;
                }
            }

            if (firestoreUser) {
                setUser(firestoreUser);
            }

            // Fetch Transactions (Deposits & Withdrawals)
            const depositsQuery = query(collection(db, 'deposits'), where('userId', '==', userId));
            const withdrawalsQuery = query(collection(db, 'withdrawals'), where('userId', '==', userId));
            
            const processTransactions = (snapshot: any, type: 'Deposit' | 'Withdrawal'): Transaction[] => {
                return snapshot.docs.map((d: any) => {
                    const data = d.data();
                    let date: Date;
                    if (data.createdAt && typeof data.createdAt.toDate === 'function') {
                        date = data.createdAt.toDate();
                    } else if (data.createdAt) {
                        date = new Date(data.createdAt);
                        if (isNaN(date.getTime())) date = new Date(0); // Invalid date fallback
                    } else {
                        date = new Date(0); // Missing date fallback
                    }
                    return {
                        ...data,
                        id: d.id,
                        type,
                        createdAt: date,
                    } as Transaction;
                });
            };

            const [depositsSnap, withdrawalsSnap] = await Promise.all([getDocs(depositsQuery), getDocs(withdrawalsQuery)]);

            const userTransactions: Transaction[] = [
                ...processTransactions(depositsSnap, 'Deposit'),
                ...processTransactions(withdrawalsSnap, 'Withdrawal'),
            ];
            
            userTransactions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            setTransactions(userTransactions);

            // Fetch Task Submissions
            const submissionsQuery = query(collection(db, 'userTasks'), where('userId', '==', userId));
            const submissionsSnap = await getDocs(submissionsQuery);
            const subsData = submissionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserTaskSubmission));

            const enrichedSubs = await Promise.all(subsData.map(async sub => {
                const taskSnap = await getDoc(doc(db, 'tasks', sub.taskId));
                return { ...sub, taskTitle: taskSnap.exists() ? (taskSnap.data() as Task).title : 'Unknown Task', taskReward: taskSnap.exists() ? (taskSnap.data() as Task).reward : 0 };
            }));
            setTaskSubmissions(enrichedSubs);

            setLoading(false);
        };

        fetchUserData();
    }, [userId]);
    
    const handleDeleteUser = async () => {
        if (!userId) return;
        setIsDeleting(true);
        try {
            // 1. Delete from Firestore
            await deleteDoc(doc(db, 'users', userId));
            
            // 2. Delete from RTDB
            const userRef = ref(rtdb, 'users/' + userId);
            await remove(userRef);

            addToast('User data permanently deleted from all databases.', 'success');
            navigate('/users');
        } catch (error) {
            console.error("Error deleting user:", error);
            addToast('Failed to delete user.', 'error');
        } finally {
            setIsDeleting(false);
            setIsDeleteConfirmOpen(false);
        }
    };

    const handleToggleWithdrawUnlock = async () => {
        if (!userId || !user) return;
        setIsUpdating(true);
        try {
            const newValue = !user.manualWithdrawUnlock;
            await updateDoc(doc(db, 'users', userId), { manualWithdrawUnlock: newValue });
            setUser({ ...user, manualWithdrawUnlock: newValue });
            addToast(`Manual withdraw unlock ${newValue ? 'enabled' : 'disabled'} for user.`, 'success');
        } catch (error) {
            console.error("Error updating manual withdraw status:", error);
            addToast('Failed to update status.', 'error');
        } finally {
            setIsUpdating(false);
        }
    };

    const StatusBadge: React.FC<{status?: string}> = ({ status }) => {
        if (!status) return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">Unknown</span>;
        
        const lowerStatus = status.toLowerCase();
        const colors: {[key: string]: string} = {
            approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
            verified: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
            pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
            submitted: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
            rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
        };
        return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${colors[lowerStatus] || 'bg-gray-100 text-gray-800'}`}>{status}</span>
    }

    if (loading) return <div className="text-center mt-10">Loading user profile...</div>;
    if (!user) return <div className="text-center mt-10">User not found.</div>;

    return (
        <div className="container mx-auto">
            <Link to="/users" className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:underline mb-4">
                <ArrowRightIcon className="w-4 h-4 transform rotate-180" />
                Back to All Users
            </Link>
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">{user.username || 'User Profile'}</h1>
                    <p className="text-gray-500 dark:text-gray-400">{user.email}</p>
                </div>
                 <div className="flex gap-4">
                    <div className="text-right">
                        <p className="text-gray-500 dark:text-gray-400">Withdrawal Points</p>
                        <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{user.withdrawalPoints || 0}</p>
                    </div>
                    <div className="text-right flex flex-col items-end">
                        <p className="text-gray-500 dark:text-gray-400">Current Balance</p>
                        <p className="text-3xl font-bold text-green-600 dark:text-green-400 mb-2">Rs {(user.balance ?? 0).toFixed(2)}</p>
                        <Link to={`/earning-history/${user.id}`} className="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium hover:underline">
                            View Earning History &rarr;
                        </Link>
                    </div>
                 </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-lg">
                        <h2 className="text-xl font-semibold mb-4">User Details</h2>
                        <div className="space-y-2 text-sm">
                           <p><strong>Phone:</strong> {user.phone || 'N/A'}</p>
                           <p><strong>Joined:</strong> {user.createdAt?.toDate().toLocaleDateString() || 'N/A'}</p>
                           <p><strong>Payment Status:</strong> <StatusBadge status={user.paymentStatus} /></p>
                           <p><strong>Is Paid User:</strong> {user.isPaid ? 'Yes' : 'No'}</p>
                        </div>
                        
                        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800">
                           <div className="flex items-center justify-between">
                               <div>
                                   <p className="font-semibold text-sm">Manual Withdraw Unlock</p>
                                   <p className="text-xs text-gray-500 dark:text-gray-400">Allow withdrawal regardless of date rules.</p>
                               </div>
                               <button 
                                  onClick={handleToggleWithdrawUnlock}
                                  disabled={isUpdating}
                                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${user.manualWithdrawUnlock ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'} ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  role="switch"
                                  aria-checked={!!user.manualWithdrawUnlock}
                               >
                                  <span aria-hidden="true" className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${user.manualWithdrawUnlock ? 'translate-x-5' : 'translate-x-0'}`} />
                               </button>
                           </div>
                        </div>

                        <div className="mt-6 border-t border-gray-200 dark:border-slate-800 pt-4">
                            <h3 className="text-md font-semibold text-red-600 dark:text-red-400">Danger Zone</h3>
                            <p className="mt-1 mb-3 text-xs text-gray-500 dark:text-gray-400">
                                This will permanently delete the user's database record (profile, balance, etc.). It <strong>will not</strong> delete their login account, which must be managed from the Firebase Authentication console.
                            </p>
                            <button
                                onClick={() => setIsDeleteConfirmOpen(true)}
                                disabled={isDeleting}
                                className="w-full text-center px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:bg-red-400"
                            >
                                {isDeleting ? 'Deleting...' : 'Delete User Permanently'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-lg">
                        <h2 className="text-xl font-semibold mb-4">Transaction History</h2>
                        <ul className="divide-y divide-gray-200 dark:divide-slate-800">
                            {transactions.slice(0, 5).map(tx => (
                                <li key={tx.id} className="py-3 flex justify-between items-center">
                                    <div>
                                        <p className={`font-semibold ${tx.type === 'Deposit' ? 'text-green-600' : 'text-red-500'}`}>{tx.type}</p>
                                        <p className="text-xs text-gray-500">{tx.createdAt.toLocaleString()}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold">Rs {tx.amount.toFixed(2)}</p>
                                        <StatusBadge status={tx.status} />
                                    </div>
                                </li>
                            ))}
                             {transactions.length === 0 && <p className="text-center py-4 text-gray-500">No transactions found.</p>}
                        </ul>
                    </div>

                     <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-lg">
                        <h2 className="text-xl font-semibold mb-4">Task Submission History</h2>
                         <ul className="divide-y divide-gray-200 dark:divide-slate-800">
                            {taskSubmissions.slice(0, 5).map(sub => (
                                <li key={sub.id} className="py-3 flex justify-between items-center">
                                    <div>
                                        <p className="font-semibold">{sub.taskTitle}</p>
                                        <p className="text-xs text-gray-500">Reward: Rs {sub.taskReward?.toFixed(2)}</p>
                                    </div>
                                    <StatusBadge status={sub.status} />
                                </li>
                            ))}
                            {taskSubmissions.length === 0 && <p className="text-center py-4 text-gray-500">No task submissions found.</p>}
                        </ul>
                    </div>
                </div>
            </div>
            <ConfirmationModal
                isOpen={isDeleteConfirmOpen}
                onClose={() => setIsDeleteConfirmOpen(false)}
                onConfirm={handleDeleteUser}
                title="Delete User"
                message={`Are you sure you want to permanently delete ${user.email}? This action cannot be undone.`}
                confirmButtonText={isDeleting ? 'Deleting...' : 'Delete'}
                confirmButtonColor="bg-red-600 hover:bg-red-700"
            />
        </div>
    );
};

export default UserProfilePage;