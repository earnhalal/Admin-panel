import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, orderBy, Timestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { User } from './UsersPage';
import { Task } from './TasksPage';
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
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        const fetchUserData = async () => {
            if (!userId) return;
            setLoading(true);

            // Fetch User Details
            const userRef = doc(db, 'users', userId);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                setUser({ id: userSnap.id, ...userSnap.data() } as User);
            }

            // Fetch Transactions (Deposits & Withdrawals)
            const depositsQuery = query(collection(db, 'deposit_requests'), where('userId', '==', userId), orderBy('createdAt', 'desc'));
            const withdrawalsQuery = query(collection(db, 'withdrawal_requests'), where('userId', '==', userId), orderBy('createdAt', 'desc'));
            
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
            await deleteDoc(doc(db, 'users', userId));
            addToast('User data permanently deleted.', 'success');
            navigate('/users');
        } catch (error) {
            console.error("Error deleting user:", error);
            addToast('Failed to delete user.', 'error');
        } finally {
            setIsDeleting(false);
            setIsDeleteConfirmOpen(false);
        }
    };

    const StatusBadge: React.FC<{status: string}> = ({ status }) => {
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
                    <div className="text-right">
                        <p className="text-gray-500 dark:text-gray-400">Current Balance</p>
                        <p className="text-3xl font-bold text-green-600 dark:text-green-400">Rs {user.balance.toFixed(2)}</p>
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