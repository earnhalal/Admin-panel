import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, runTransaction, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { User } from './UsersPage';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';

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

const ReferralsPage: React.FC = () => {
    const [referrals, setReferrals] = useState<Referral[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<{ [key: string]: boolean }>({});
    const { addToast } = useToast();

    useEffect(() => {
        const q = query(collection(db, 'referrals'), where('status', '==', 'pending_bonus'));
        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const referralData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Referral));

            const enrichedData = await Promise.all(referralData.map(async (ref) => {
                const referrerRef = doc(db, 'users', ref.referrerId);
                const referredRef = doc(db, 'users', ref.referredId);
                const referrerSnap = await getDoc(referrerRef);
                const referredSnap = await getDoc(referredRef);
                return {
                    ...ref,
                    referrerEmail: referrerSnap.exists() ? (referrerSnap.data() as User).email : 'Unknown',
                    referredEmail: referredSnap.exists() ? (referredSnap.data() as User).email : 'Unknown',
                };
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
    
    const handleApproveBonus = async (referral: Referral) => {
        setActionLoading(prev => ({...prev, [referral.id]: true}));
        try {
            await runTransaction(db, async (transaction) => {
                const referrerRef = doc(db, 'users', referral.referrerId);
                const referralRef = doc(db, 'referrals', referral.id);
                
                const referrerDoc = await transaction.get(referrerRef);
                if (!referrerDoc.exists()) throw "Referrer document not found!";
                
                const newBalance = referrerDoc.data().balance + referral.bonusAmount;
                
                transaction.update(referrerRef, { balance: newBalance });
                transaction.update(referralRef, { status: 'approved' });
            });
            addToast('Referral bonus approved!', 'success');
        } catch (error) {
            console.error("Referral approval transaction failed:", error);
            addToast("Failed to approve referral bonus.", 'error');
        } finally {
            setActionLoading(prev => ({...prev, [referral.id]: false}));
        }
    };

    const handleRejectBonus = async (referralId: string) => {
        setActionLoading(prev => ({...prev, [referralId]: true}));
        try {
            const referralRef = doc(db, 'referrals', referralId);
            await updateDoc(referralRef, { status: 'rejected' });
            addToast('Referral bonus rejected.', 'success');
        } catch (error) {
            console.error("Error rejecting referral bonus:", error);
            addToast("Failed to reject referral bonus.", 'error');
        } finally {
            setActionLoading(prev => ({...prev, [referralId]: false}));
        }
    };

    if (loading) {
        return <div className="text-center mt-10">Loading pending referrals...</div>;
    }

    return (
        <div className="container mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">Manage Referral Bonuses</h1>
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full leading-normal">
                        <thead>
                            <tr>
                                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                    Referrer
                                </th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                    Referred User
                                </th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                    Bonus Amount
                                </th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {referrals.length > 0 ? referrals.map((ref) => (
                                <tr key={ref.id}>
                                    <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                                        <p className="text-gray-900 dark:text-white whitespace-no-wrap">{ref.referrerEmail}</p>
                                    </td>
                                    <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                                        <p className="text-gray-900 dark:text-white whitespace-no-wrap">{ref.referredEmail}</p>
                                    </td>
                                    <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                                        <p className="text-gray-900 dark:text-white whitespace-no-wrap">Rs {ref.bonusAmount.toFixed(2)}</p>
                                    </td>
                                    <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm space-x-2">
                                        <button onClick={() => handleApproveBonus(ref)} disabled={actionLoading[ref.id]} className="bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-3 rounded text-xs disabled:bg-gray-400 inline-flex items-center">
                                            {actionLoading[ref.id] && <Spinner />} Approve Bonus
                                        </button>
                                        <button onClick={() => handleRejectBonus(ref.id)} disabled={actionLoading[ref.id]} className="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded text-xs disabled:bg-gray-400 inline-flex items-center">
                                            {actionLoading[ref.id] && <Spinner />} Reject
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={4} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                        No pending referral bonuses found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ReferralsPage;