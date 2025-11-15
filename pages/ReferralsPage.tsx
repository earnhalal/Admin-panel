import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, runTransaction, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebase';
import { User } from './UsersPage';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';
import { CheckIcon } from '../components/icons/CheckIcon';
import { XIcon } from '../components/icons/XIcon';
import Pagination from '../components/Pagination';
import Checkbox from '../components/Checkbox';

interface Referral {
    id: string;
    referrerId: string;
    referredId: string;
    status: 'pending_bonus' | 'approved' | 'rejected';
    bonusAmount: number;
    createdAt: Timestamp;
    referrerEmail?: string;
    referredEmail?: string;
}

type SortConfig = { key: keyof Referral; direction: 'ascending' | 'descending' } | null;

const ReferralsPage: React.FC = () => {
    const [referrals, setReferrals] = useState<Referral[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<{ [key: string]: boolean }>({});
    const { addToast } = useToast();

    // New state for advanced features
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'createdAt', direction: 'descending' });
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedReferrals, setSelectedReferrals] = useState<Set<string>>(new Set());
    const ITEMS_PER_PAGE = 10;


    useEffect(() => {
        const q = query(collection(db, 'referrals'), where('status', '==', 'pending_bonus'));
        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const referralData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Referral));
            const enrichedData = await Promise.all(referralData.map(async (ref) => {
                const referrerSnap = await getDoc(doc(db, 'users', ref.referrerId));
                const referredSnap = await getDoc(doc(db, 'users', ref.referredId));
                return { ...ref, referrerEmail: referrerSnap.exists() ? (referrerSnap.data() as User).email : 'Unknown', referredEmail: referredSnap.exists() ? (referredSnap.data() as User).email : 'Unknown' };
            }));
            setReferrals(enrichedData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching referrals:", error);
            addToast('Error fetching referrals.', 'error');
            setLoading(false);
        });
        return () => unsubscribe();
    }, [addToast]);

    const sortedReferrals = useMemo(() => {
        let sortableItems = [...referrals];
        if (sortConfig) {
            sortableItems.sort((a, b) => {
                if (a[sortConfig.key]! < b[sortConfig.key]!) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (a[sortConfig.key]! > b[sortConfig.key]!) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [referrals, sortConfig]);

    const paginatedReferrals = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return sortedReferrals.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [sortedReferrals, currentPage]);

    const requestSort = (key: keyof Referral) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const handleSelectReferral = (id: string) => {
        setSelectedReferrals(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedReferrals(new Set(paginatedReferrals.map(r => r.id)));
        } else {
            setSelectedReferrals(new Set());
        }
    };
    
    const handleApproveBonus = async (referral: Referral) => {
        // ... (existing implementation)
    };

    const handleRejectBonus = async (referralId: string) => {
        // ... (existing implementation)
    };

    const handleBulkAction = async (action: 'approve' | 'reject') => {
        if (selectedReferrals.size === 0) return;
        setActionLoading({ ...actionLoading, bulk: true });

        const updates: Promise<void>[] = [];
        for (const refId of selectedReferrals) {
            const referral = referrals.find(r => r.id === refId);
            if (!referral) continue;
            
            if (action === 'approve') {
                updates.push(handleApproveBonus(referral));
            } else {
                updates.push(handleRejectBonus(refId));
            }
        }
        
        try {
            await Promise.all(updates);
            addToast(`Successfully ${action}d ${selectedReferrals.size} referrals.`, 'success');
            setSelectedReferrals(new Set());
        } catch (error) {
            addToast(`Bulk ${action} failed.`, 'error');
        } finally {
            setActionLoading({ ...actionLoading, bulk: false });
        }
    };

    if (loading) return <div className="text-center mt-10">Loading...</div>;

    return (
        <div className="container mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">Manage Referral Bonuses</h1>
            
            {selectedReferrals.size > 0 && (
                <div className="mb-4 bg-indigo-100 dark:bg-indigo-900/50 p-3 rounded-lg flex items-center justify-between">
                    <span className="text-sm font-medium text-indigo-800 dark:text-indigo-200">{selectedReferrals.size} referral(s) selected</span>
                    <div className="flex gap-2">
                        <button onClick={() => handleBulkAction('approve')} className="px-3 py-1 text-xs font-semibold text-white bg-green-600 rounded-md hover:bg-green-700" disabled={actionLoading.bulk}>Approve</button>
                        <button onClick={() => handleBulkAction('reject')} className="px-3 py-1 text-xs font-semibold text-white bg-red-600 rounded-md hover:bg-red-700" disabled={actionLoading.bulk}>Reject</button>
                    </div>
                </div>
            )}
            
            {referrals.length === 0 ? (
                 <p className="text-center py-10 text-gray-500 dark:text-gray-400">No pending referral bonuses.</p>
            ) : (
            <div className="bg-white dark:bg-slate-900 shadow-md rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full leading-normal">
                        <thead>
                            <tr>
                                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800">
                                    <Checkbox
                                        checked={selectedReferrals.size === paginatedReferrals.length && paginatedReferrals.length > 0}
                                        onChange={handleSelectAll}
                                        indeterminate={selectedReferrals.size > 0 && selectedReferrals.size < paginatedReferrals.length}
                                    />
                                </th>
                                <th onClick={() => requestSort('referrerEmail')} className="cursor-pointer px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Referrer</th>
                                <th onClick={() => requestSort('referredEmail')} className="cursor-pointer px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Referred User</th>
                                <th onClick={() => requestSort('bonusAmount')} className="cursor-pointer px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Bonus</th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedReferrals.map((ref) => (
                                <tr key={ref.id}>
                                    <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                                        <Checkbox checked={selectedReferrals.has(ref.id)} onChange={() => handleSelectReferral(ref.id)} />
                                    </td>
                                    <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">{ref.referrerEmail}</td>
                                    <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">{ref.referredEmail}</td>
                                    <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">Rs {ref.bonusAmount.toFixed(2)}</td>
                                    <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => handleApproveBonus(ref)} disabled={actionLoading[ref.id]} className="p-1.5 bg-green-600 text-white rounded-md hover:bg-green-700"><CheckIcon className="w-4 h-4"/></button>
                                            <button onClick={() => handleRejectBonus(ref.id)} disabled={actionLoading[ref.id]} className="p-1.5 bg-red-600 text-white rounded-md hover:bg-red-700"><XIcon className="w-4 h-4"/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Pagination
                    currentPage={currentPage}
                    totalPages={Math.ceil(sortedReferrals.length / ITEMS_PER_PAGE)}
                    onPageChange={setCurrentPage}
                />
            </div>
            )}
        </div>
    );
};

export default ReferralsPage;