import React, { useState } from 'react';
import { collection, getDocs, doc, setDoc, addDoc, serverTimestamp, increment, updateDoc } from 'firebase/firestore';
import { get, ref, update, increment as rtdbIncrement } from 'firebase/database';
import { db, rtdb } from '../services/firebase';
import { Wrench, PlayCircle, Loader2 } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

interface UserData {
    id: string;
    status?: string;
    referredBy?: string | null;
    referrerUid?: string | null;
    referrerId?: string | null;
    invitedBy?: string | null;
    totalIndirectCommission?: number;
    name?: string;
    username?: string;
    displayName?: string;
    email?: string;
}

const MaintenancePage: React.FC = () => {
    const [logs, setLogs] = useState<{ id: number, text: string, type: 'info' | 'success' | 'warning' | 'error' }[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [allUsers, setAllUsers] = useState<UserData[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
    const [adjustment, setAdjustment] = useState({ amount: '', reason: '' });
    const { addToast } = useToast();

    // Load users on mount
    React.useEffect(() => {
        const fetchUsers = async () => {
            const allUsersMap = new Map<string, any>();
        
            // Fetch RTDB
            const rtdbSnap = await get(ref(rtdb, 'users'));
            const rtdbUsers = rtdbSnap.val() || {};
            Object.entries(rtdbUsers).forEach(([id, data]: [string, any]) => {
                allUsersMap.set(id, { id, ...data });
            });
            
            // Fetch FS
            const fsSnap = await getDocs(collection(db, 'users'));
            fsSnap.forEach(docSnap => {
                const data = docSnap.data();
                const existing = allUsersMap.get(docSnap.id) || { id: docSnap.id };
                allUsersMap.set(docSnap.id, { ...existing, ...data });
            });
            
            const loadedUsers = Array.from(allUsersMap.values()) as UserData[];
            setAllUsers(loadedUsers);
        };
        fetchUsers();
    }, []);

    const filteredUsers = allUsers.filter(u => 
        (u.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
         u.id.toLowerCase().includes(searchTerm.toLowerCase()))
    ).slice(0, 5);

    const addLog = (text: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
        setLogs(prev => [...prev, { id: Date.now() + Math.random(), text, type }]);
    };

    const handleManualAdjustment = async () => {
        if (!selectedUser || !adjustment.amount || !adjustment.reason) {
            addToast('Please select a user and fill all fields', 'error');
            return;
        }

        const amount = parseFloat(adjustment.amount);
        if (isNaN(amount)) {
            addToast('Invalid amount', 'error');
            return;
        }

        setIsRunning(true);
        addLog(`Manually adjusting ${amount} for ${selectedUser.id}...`, 'info');

        try {
            const userRef = doc(db, 'users', selectedUser.id);
            await setDoc(userRef, {
                balance: increment(amount),
                totalEarnings: increment(amount),
                totalIndirectCommission: increment(amount)
            }, { merge: true });

            await update(ref(rtdb, `users/${selectedUser.id}`), {
                balance: rtdbIncrement(amount),
                totalEarnings: rtdbIncrement(amount)
            });

            await addDoc(collection(db, 'earning_history'), {
                userId: selectedUser.id,
                amount: amount,
                source: 'indirect_invite_commission',
                description: `Manual Adjustment: ${adjustment.reason}`,
                timestamp: serverTimestamp()
            });

            addLog(`Successfully manually adjusted ${amount} for User ${selectedUser.name || selectedUser.id}`, 'success');
            setSelectedUser(null);
            setAdjustment({ amount: '', reason: '' });
            setSearchTerm('');
            addToast('Adjustment applied!', 'success');
        } catch (error) {
            addLog(`Manual adjustment failed: ${error}`, 'error');
            addToast('Manual adjustment failed', 'error');
        } finally {
            setIsRunning(false);
        }
    };

    const runDistribution = async () => {
        if (isRunning) return;
        setIsRunning(true);
        setLogs([]);
        addLog('Starting Audit...', 'info');
        
        try {
            // 1. Fetch all users from RTDB and Firestore
            const allUsersMap = new Map<string, any>();
        
            addLog('Fetching users from RTDB...', 'info');
            const rtdbSnap = await get(ref(rtdb, 'users'));
            const rtdbUsers = rtdbSnap.val() || {};
            Object.entries(rtdbUsers).forEach(([id, data]: [string, any]) => {
                allUsersMap.set(id, { id, ...data });
            });
            
            addLog('Fetching commission data from Firestore...', 'info');
            const fsSnap = await getDocs(collection(db, 'users'));
            fsSnap.forEach(docSnap => {
                const data = docSnap.data();
                const existing = allUsersMap.get(docSnap.id) || { id: docSnap.id };
                allUsersMap.set(docSnap.id, { ...existing, ...data });
            });
            
            const allUsers = Array.from(allUsersMap.values());
            addLog(`Analyzing ${allUsers.length} total users...`, 'info');

            // 2. Build explicit Referral Map (Child -> Parent)
            // We only care about active children for the bonus calculation
            const referralMap = new Map<string, string[]>(); // ParentID -> Array of Active Child IDs
            
            allUsers.forEach(user => {
              // DEBUG: Log a few users to see what fields they have
              if (Math.random() < 0.01) {
                  addLog(`Debug User ${user.id}: status=${user.status}, referredBy=${user.referredBy}, referrerUid=${user.referrerUid}, referrerId=${user.referrerId}, invitedBy=${user.invitedBy}`, 'info');
              }
              
              // Use all possible fields to find the referrer
              const referrer = user.referredBy || user.referrerUid || user.referrerId || user.invitedBy;
              
              if (referrer && user.status && user.status.toLowerCase() === 'active') {
                const parentId = referrer;
                if (!referralMap.has(parentId)) {
                  referralMap.set(parentId, []);
                }
                referralMap.get(parentId)!.push(user.id);
              }
            });

            let totalRecoveredAmount = 0;
            let usersFixed = 0;

            // 3. Process each user to find missing L2 commissions
            for (const user of allUsers) {
              // Level 1: Direct Active Referrals
              const level1ActiveIds = referralMap.get(user.id) || [];
              
              // Level 2: Sum of active children of Level 1 referrals
              let level2ActiveCount = 0;
              for (const l1Id of level1ActiveIds) {
                const l2ActiveIds = referralMap.get(l1Id) || [];
                level2ActiveCount += l2ActiveIds.length;
              }

              if (level2ActiveCount > 0) {
                const bonusRate = 10; // Rs. 10 per L2 active member
                const expectedTotalIndirect = level2ActiveCount * bonusRate;
                const currentStoredIndirect = user.totalIndirectCommission || 0;

                // 4. Check for discrepancy
                if (expectedTotalIndirect > currentStoredIndirect) {
                  const missingAmount = expectedTotalIndirect - currentStoredIndirect;
                  
                  addLog(`Fixing User: ${user.name || user.id}`, 'info');
                  addLog(`- Expected: ${expectedTotalIndirect}, Stored: ${currentStoredIndirect}. Adding: ${missingAmount}`, 'info');

                  // Update User balance and totals
                  const userRef = doc(db, 'users', user.id);
                  await setDoc(userRef, {
                    balance: increment(missingAmount),
                    totalEarnings: increment(missingAmount),
                    totalIndirectCommission: increment(missingAmount)
                  }, { merge: true });

                  // Add history entry
                  await addDoc(collection(db, 'earning_history'), {
                    userId: user.id,
                    amount: missingAmount,
                    source: 'indirect_invite_commission',
                    description: `Rs. ${missingAmount} Missing Indirect Team Income (Maintenance Correction)`,
                    timestamp: serverTimestamp()
                  });

                  totalRecoveredAmount += missingAmount;
                  usersFixed++;
                }
              }
            }

            addLog("Audit Completed!", 'success');
            addLog(`Total Users Fixed: ${usersFixed}`, 'success');
            addLog(`Total Amount Distributed: Rs. ${totalRecoveredAmount}`, 'success');
            
            addToast('Distribution script completed successfully!', 'success');
        } catch (error) {
            console.error("Critical Error during maintenance:", error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            addLog(`Error during execution: ${message}`, 'error');
            addToast('Distribution script failed.', 'error');
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                    <Wrench className="w-8 h-8 text-indigo-600" />
                    Maintenance System
                </h1>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                    System maintenance and administrative scripts for database corrections.
                </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden mb-6">
                <div className="p-6">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                        Level 2 Indirect Commission Distribution
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm max-w-3xl">
                        This script computes the proper Level 2 team size (active members referred by active direct referrals) 
                        for every active user. It calculates the expected indirect commission (Team Size × ₹10), compares it 
                        to their currently earned commission (`totalIndirectCommission`), and retroactively pays out any missing differences.
                    </p>

                    <button
                        onClick={runDistribution}
                        disabled={isRunning}
                        className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isRunning ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Processing Script...
                            </>
                        ) : (
                            <>
                                <PlayCircle className="w-5 h-5" />
                                Run Distribution
                            </>
                        )}
                    </button>
                </div>


            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Manual Commission Adjustment</h2>
                
                <div className="mb-4">
                    <input type="text" placeholder="Search User by Name or ID..." className="w-full p-3 bg-gray-50 dark:bg-slate-800 rounded-xl" value={searchTerm} onChange={e => {setSearchTerm(e.target.value); setSelectedUser(null);}} />
                    {searchTerm && !selectedUser && (
                        <div className="mt-2 bg-white dark:bg-slate-800 border rounded-xl shadow-lg">
                            {filteredUsers.map(u => (
                                <button key={u.id} className="w-full text-left p-3 hover:bg-gray-100 dark:hover:bg-slate-700 border-b last:border-0" onClick={() => {setSelectedUser(u); setSearchTerm(u.name || u.username || u.displayName || u.email || u.id);}}>
                                    <div className="font-bold">{u.name || u.username || u.displayName || u.email || 'No Name'}</div>
                                    <div className="text-xs text-gray-400">ID: {u.id}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input type="number" placeholder="Amount" className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl" value={adjustment.amount} onChange={e => setAdjustment({...adjustment, amount: e.target.value})} />
                    <input type="text" placeholder="Reason" className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl" value={adjustment.reason} onChange={e => setAdjustment({...adjustment, reason: e.target.value})} />
                </div>
                <button onClick={handleManualAdjustment} disabled={isRunning || !selectedUser} className="mt-4 px-6 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 disabled:opacity-50">Apply Adjustment</button>
            </div>
        </div>
    );
};

export default MaintenancePage;
