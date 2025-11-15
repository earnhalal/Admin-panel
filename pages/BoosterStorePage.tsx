import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, runTransaction, Timestamp, addDoc, updateDoc, deleteDoc, getDoc, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useToast } from '../contexts/ToastContext';
import { User } from './UsersPage';
import BoosterModal from '../components/BoosterModal';
import ConfirmationModal from '../components/ConfirmationModal';
import Pagination from '../components/Pagination';
import Checkbox from '../components/Checkbox';
import { CheckIcon } from '../components/icons/CheckIcon';
import { XIcon } from '../components/icons/XIcon';

export interface Booster {
    id: string;
    name: string;
    price: number;
    description: string;
    benefits: {
        activateAccount?: boolean;
        withdrawalPoints?: number;
    }
}

interface PurchaseRequest {
    id: string;
    userId: string;
    boosterId: string;
    boosterName: string;
    price: number;
    status: 'pending' | 'approved' | 'rejected';
    requestedAt: Timestamp;
    userEmail?: string;
    transactionId: string;
}

const BoosterStorePage: React.FC = () => {
    const [boosters, setBoosters] = useState<Booster[]>([]);
    const [requests, setRequests] = useState<PurchaseRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const { addToast } = useToast();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedBooster, setSelectedBooster] = useState<Booster | null>(null);
    const [actionLoading, setActionLoading] = useState<{[key:string]: boolean}>({});

    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [boosterToDelete, setBoosterToDelete] = useState<string | null>(null);
    
    // Pagination and Bulk actions
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
    const ITEMS_PER_PAGE = 5;

    useEffect(() => {
        const unsubBoosters = onSnapshot(collection(db, 'boosters'), (snapshot) => {
            setBoosters(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booster)));
            setLoading(false);
        });

        const unsubRequests = onSnapshot(query(collection(db, 'boosterPurchases'), where('status', '==', 'pending')), async (snapshot) => {
            const reqData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseRequest));
            const enrichedData = await Promise.all(reqData.map(async (req) => {
                const userSnap = await getDoc(doc(db, 'users', req.userId));
                return {...req, userEmail: userSnap.exists() ? (userSnap.data() as User).email : 'Unknown'};
            }));
            setRequests(enrichedData);
        });

        return () => {
            unsubBoosters();
            unsubRequests();
        };
    }, []);
    
    const paginatedRequests = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return requests.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [requests, currentPage]);

    const handleSaveBooster = async (booster: Omit<Booster, 'id'>) => {
        setActionLoading({ ...actionLoading, save: true });
        try {
            if (selectedBooster) {
                await updateDoc(doc(db, 'boosters', selectedBooster.id), booster);
                addToast('Booster updated successfully!', 'success');
            } else {
                await addDoc(collection(db, 'boosters'), booster);
                addToast('Booster created successfully!', 'success');
            }
            setIsModalOpen(false);
        } catch (error) {
            addToast('Failed to save booster.', 'error');
        } finally {
            setActionLoading({ ...actionLoading, save: false });
        }
    };
    
    const handleDeleteBooster = async () => {
        if (!boosterToDelete) return;
        setActionLoading({ ...actionLoading, [boosterToDelete]: true });
        try {
            await deleteDoc(doc(db, 'boosters', boosterToDelete));
            addToast('Booster deleted.', 'success');
        } catch (error) {
            addToast('Failed to delete booster.', 'error');
        } finally {
            setActionLoading({ ...actionLoading, [boosterToDelete]: false });
            setIsDeleteConfirmOpen(false);
        }
    };

    const handleApproveRequest = async (request: PurchaseRequest) => {
        setActionLoading(prev => ({ ...prev, [request.id]: true }));
        try {
            const booster = boosters.find(b => b.id === request.boosterId);
            if (!booster) throw new Error('Booster associated with request not found.');

            await runTransaction(db, async (transaction) => {
                const userRef = doc(db, 'users', request.userId);
                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists()) throw new Error('User not found.');

                const updates: {[key: string]: any} = {};
                if (booster.benefits.activateAccount) {
                    updates.isPaid = true;
                    updates.paymentStatus = 'verified';
                }
                if (booster.benefits.withdrawalPoints) {
                    updates.withdrawalPoints = (userDoc.data().withdrawalPoints || 0) + booster.benefits.withdrawalPoints;
                }
                
                transaction.update(userRef, updates);
                transaction.update(doc(db, 'boosterPurchases', request.id), { status: 'approved' });

                const revenueRef = collection(db, 'revenueTransactions');
                transaction.set(doc(revenueRef), {
                    adminFeeAmount: request.price,
                    originalAmount: request.price,
                    sourceUser: request.userId,
                    timestamp: Timestamp.now(),
                    transactionType: 'booster_purchase',
                    relatedDocId: request.id,
                });
            });
            addToast('Purchase approved and benefits applied!', 'success');
        } catch (error) {
            const msg = error instanceof Error ? error.message : "An unknown error occurred.";
            addToast(`Failed to approve: ${msg}`, 'error');
        } finally {
            setActionLoading(prev => ({ ...prev, [request.id]: false }));
        }
    };

    const handleRejectRequest = async (id: string) => {
        setActionLoading(prev => ({ ...prev, [id]: true }));
        try {
            await updateDoc(doc(db, 'boosterPurchases', id), { status: 'rejected' });
            addToast('Purchase rejected.', 'success');
        } catch (error) {
             addToast('Failed to reject purchase.', 'error');
        } finally {
            setActionLoading(prev => ({ ...prev, [id]: false }));
        }
    };

    const handleSelectRequest = (id: string) => {
      setSelectedRequests(prev => {
          const newSet = new Set(prev);
          if (newSet.has(id)) newSet.delete(id);
          else newSet.add(id);
          return newSet;
      });
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedRequests(new Set(paginatedRequests.map(r => r.id)));
        } else {
            setSelectedRequests(new Set());
        }
    };

    const handleBulkAction = async (action: 'approve' | 'reject') => {
        setActionLoading({ ...actionLoading, bulk: true });
        const updates: Promise<void>[] = [];
        for (const reqId of selectedRequests) {
            const request = requests.find(r => r.id === reqId);
            if (!request) continue;
            if (action === 'approve') {
                updates.push(handleApproveRequest(request));
            } else {
                updates.push(handleRejectRequest(reqId));
            }
        }
        try {
            await Promise.all(updates);
            addToast(`Successfully ${action}d ${selectedRequests.size} requests.`, 'success');
            setSelectedRequests(new Set());
        } catch (error) {
            addToast(`Bulk ${action} failed.`, 'error');
        } finally {
            setActionLoading({ ...actionLoading, bulk: false });
        }
    };


    return (
        <div className="container mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Booster Store</h1>
                <button onClick={() => { setSelectedBooster(null); setIsModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg">
                    Create Booster
                </button>
            </div>
            
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Manage Boosters</h2>
             {loading ? <p>Loading boosters...</p> : boosters.length === 0 ? <p className="text-gray-500">No boosters created yet.</p> :
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
                    {boosters.map(booster => (
                        <div key={booster.id} className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow-md flex flex-col">
                            <div className="flex-grow">
                                <h3 className="font-bold text-lg">{booster.name}</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{booster.description}</p>
                                <div className="text-sm mt-2 space-y-1">
                                    {booster.benefits.activateAccount && <p className="text-green-600 dark:text-green-400 font-medium">✓ Activates Account</p>}
                                    {booster.benefits.withdrawalPoints && <p className="text-purple-600 dark:text-purple-400 font-medium">+ {booster.benefits.withdrawalPoints} Withdrawal Points</p>}
                                </div>
                            </div>
                            <div className="mt-4 flex justify-between items-center">
                                <span className="font-bold text-xl text-indigo-600 dark:text-indigo-400">Rs {booster.price.toFixed(2)}</span>
                                <div className="flex gap-2">
                                    <button onClick={() => { setSelectedBooster(booster); setIsModalOpen(true); }} className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:underline">Edit</button>
                                    <button onClick={() => { setBoosterToDelete(booster.id); setIsDeleteConfirmOpen(true); }} className="text-sm font-medium text-red-500 dark:text-red-400 hover:underline">Delete</button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            }

            <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Purchase Requests</h2>
            {selectedRequests.size > 0 && (
                <div className="mb-4 bg-indigo-100 dark:bg-indigo-900/50 p-3 rounded-lg flex items-center justify-between">
                    <span className="text-sm font-medium text-indigo-800 dark:text-indigo-200">{selectedRequests.size} request(s) selected</span>
                    <div className="flex gap-2">
                        <button onClick={() => handleBulkAction('approve')} className="px-3 py-1 text-xs font-semibold text-white bg-green-600 rounded-md hover:bg-green-700" disabled={actionLoading.bulk}>Approve</button>
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
                                        checked={selectedRequests.size === paginatedRequests.length && paginatedRequests.length > 0}
                                        onChange={handleSelectAll}
                                        indeterminate={selectedRequests.size > 0 && selectedRequests.size < paginatedRequests.length}
                                    />
                                </th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">User</th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Booster</th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Price</th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedRequests.map(req => (
                                <tr key={req.id}>
                                    <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm"><Checkbox checked={selectedRequests.has(req.id)} onChange={() => handleSelectRequest(req.id)} /></td>
                                    <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">{req.userEmail}</td>
                                    <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">{req.boosterName}</td>
                                    <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">Rs {req.price.toFixed(2)}</td>
                                    <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm"><div className="flex items-center gap-2"><button onClick={() => handleApproveRequest(req)} disabled={actionLoading[req.id]} className="p-2 bg-green-100 dark:bg-green-900/50 rounded-full"><CheckIcon className="w-4 h-4 text-green-600 dark:text-green-400"/></button><button onClick={() => handleRejectRequest(req.id)} disabled={actionLoading[req.id]} className="p-2 bg-red-100 dark:bg-red-900/50 rounded-full"><XIcon className="w-4 h-4 text-red-600 dark:text-red-400" /></button></div></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                 <Pagination currentPage={currentPage} totalPages={Math.ceil(requests.length / ITEMS_PER_PAGE)} onPageChange={setCurrentPage} />
            </div>

            {isModalOpen && <BoosterModal booster={selectedBooster} onClose={() => setIsModalOpen(false)} onSave={handleSaveBooster} isLoading={actionLoading.save} />}
            <ConfirmationModal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} onConfirm={handleDeleteBooster} title="Delete Booster" message="Are you sure you want to delete this booster? This cannot be undone." />
        </div>
    );
};

export default BoosterStorePage;
