import React, { useState, useEffect, useMemo } from 'react';
import { db, rtdb } from '../services/firebase';
import { ref, onValue, set, remove, get, update, serverTimestamp, increment as rtdbIncrement } from 'firebase/database';
import { doc, updateDoc, setDoc, collection, query, where, onSnapshot, Timestamp, getDoc, increment, addDoc, getDocs } from 'firebase/firestore';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';
import { Check, X, User as UserIcon, CreditCard, Calendar, Search, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PendingRequest {
  id: string;
  userId: string;
  amount: number;
  transactionId: string;
  userEmail?: string;
  userName?: string;
  phoneNumber?: string;
  method?: string;
  createdAt?: number;
}

const JoiningApprovalsPage: React.FC = () => {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});
  const { addToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    
    // 1. Listen to RTDB for pending_requests
    const pendingRef = ref(rtdb, 'pending_requests');
    const unsubRTDB = onValue(pendingRef, async (snapshot) => {
        const data = snapshot.val();
        const rtdbList: PendingRequest[] = [];
        if (data) {
            const promises = Object.entries(data).map(async ([key, value]: [string, any]) => {
                const userRef = ref(rtdb, 'users/' + key);
                const userSnap = await get(userRef);
                const userData = userSnap.val() || {};
                return {
                    id: key,
                    userId: key,
                    ...value,
                    userName: userData.username || userData.name || userData.displayName || value.userName || 'Anonymous',
                    createdAt: value.createdAt || userData.createdAt || null,
                    source: 'rtdb'
                } as PendingRequest;
            });
            rtdbList.push(...await Promise.all(promises));
        }
        setRequests(prev => {
            const firestoreOnly = prev.filter(r => (r as any).source === 'firestore');
            return [...rtdbList, ...firestoreOnly];
        });
        setLoading(false);
    });

    // 2. Listen to Firestore for deposits with type 'activation'
    const depositsRef = collection(db, 'deposits');
    const q = query(depositsRef, where('type', '==', 'activation'));
    
    const unsubFirestore = onSnapshot(q, async (snapshot) => {
        const fsList: PendingRequest[] = [];
        const userIds = new Set<string>();
        
        // Filter status client-side to avoid composite index requirement
        const pendingDocs = snapshot.docs.filter(doc => {
            const status = (doc.data().status || '').toLowerCase();
            return status === 'pending';
        });

        pendingDocs.forEach(doc => {
            if (doc.data().userId) userIds.add(doc.data().userId);
        });

        const userMap: {[key: string]: any} = {};
        if (userIds.size > 0) {
            const userPromises = Array.from(userIds).map(uid => get(ref(rtdb, `users/${uid}`)));
            const userSnaps = await Promise.all(userPromises);
            userSnaps.forEach((snap, idx) => {
                userMap[Array.from(userIds)[idx]] = snap.val() || {};
            });
        }

        pendingDocs.forEach(doc => {
            const data = doc.data();
            const userData = userMap[data.userId] || {};
            fsList.push({
                id: doc.id,
                userId: data.userId,
                amount: data.amount,
                transactionId: data.transactionId || data.txnId || 'N/A',
                userEmail: userData.email || data.userEmail || 'N/A',
                userName: userData.username || userData.name || data.userName || 'Anonymous',
                phoneNumber: userData.phoneNumber || data.phoneNumber || 'N/A',
                method: data.method || data.paymentMethod || 'N/A',
                createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt,
                source: 'firestore'
            } as any);
        });

        setRequests(prev => {
            const rtdbOnly = prev.filter(r => (r as any).source === 'rtdb');
            return [...rtdbOnly, ...fsList];
        });
    });

    return () => {
        unsubRTDB();
        unsubFirestore();
    };
  }, [addToast]);

  const handleApprove = async (request: PendingRequest) => {
    const { userId, id } = request;
    const isFirestore = (request as any).source === 'firestore';
    setActionLoading(prev => ({...prev, [id]: true}));
    try {
        // 1. Update status in RTDB
        const userRtdbRef = ref(rtdb, 'users/' + userId);
        await update(userRtdbRef, {
            status: 'active',
            feeStatus: 'paid',
            isActivated: true,
            isPaid: true,
            paymentStatus: 'verified'
        });
        
        // 2. Update Firestore if exists
        try {
            const userFsRef = doc(db, 'users', userId);
            await updateDoc(userFsRef, {
                status: 'active',
                isActivated: true,
                isPaid: true,
                paymentStatus: 'verified'
            });
        } catch (e) {}

        // 3. Referral Tracking
        const userSnap = await get(userRtdbRef);
        const userData = userSnap.val() || {};
        
        const sanitizeReferrer = (raw: any) => {
            if (!raw) return null;
            if (typeof raw !== 'string') {
                return raw.uid || raw.id || raw.username || null;
            }
            const str = raw.trim();
            // Handle URL-like strings: extract ref/code or =code
            if (str.includes('ref/')) {
                return str.split('ref/')[1].trim();
            }
            if (str.includes('=')) {
                return str.split('=')[1].trim();
            }
            return str;
        };

        const extractReferrerUid = (data: any) => {
            if (!data) return null;
            const raw = data.referredBy || data.referrerUid || data.referrerId || data.invitedBy;
            return sanitizeReferrer(raw);
        };

        const resolveReferrerUid = async (uidOrUsername: string) => {
            if (!uidOrUsername) return null;
            const cleanId = uidOrUsername.trim();
            console.log(`Debug: Resolving UID for input: "${cleanId}"`);
            
            // 1. Search RTDB for a user whose 'username' matches cleanId (Most likely case)
            console.log(`Debug: Searching all RTDB users for username: ${cleanId}`);
            const allUsersSnap = await get(ref(rtdb, 'users'));
            if (allUsersSnap.exists()) {
                const users = allUsersSnap.val();
                for (const uid in users) {
                    const u = users[uid];
                    // Check if this record has the matching username
                    if (u.username === cleanId || 
                        u.username?.toLowerCase() === cleanId.toLowerCase() ||
                        u.code === cleanId) {
                        console.log(`Debug: MATCH FOUND! Username "${cleanId}" belongs to UID: ${uid}`);
                        return uid; // Found the real UID
                    }
                }
            }
            
            // 2. If no username match, check if cleanId itself is a direct UID
            // Only if it looks like a UID (usually long string) or we have no other choice
            const rtdbUserSnap = await get(ref(rtdb, 'users/' + cleanId));
            if (rtdbUserSnap.exists()) {
                const data = rtdbUserSnap.val();
                // Check if it's a real user object or just a leftover/wrong node
                if (data.uid || data.email || data.username) {
                    console.log(`Debug: Found as direct UID with valid data: ${cleanId}`);
                    return cleanId;
                }
            }

            // 3. Fallback to Firestore (as backup)
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where("username", "==", cleanId));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                const fId = querySnapshot.docs[0].id;
                console.log(`Debug: Found UID in Firestore: ${fId}`);
                return fId;
            }
            
            console.log(`Debug: WARNING - No match found. Falling back to input: ${cleanId}`);
            return cleanId;
        };

        let rawReferrer = extractReferrerUid(userData);
        
        // Try Firestore if not in RTDB
        if (!rawReferrer) {
            try {
                const userFsSnap = await getDoc(doc(db, 'users', userId));
                if (userFsSnap.exists()) {
                    rawReferrer = extractReferrerUid(userFsSnap.data() || {});
                }
            } catch (e) {}
        }
        
        let referrerUid = rawReferrer ? await resolveReferrerUid(rawReferrer) : null;
        
        if (referrerUid) {
            const rewardAmount = 100;
            const invitePath = `invites/${referrerUid}/history/${userId}`;
            
            // Double-credit protection: Check if already paid
            const inviteSnap = await get(ref(rtdb, invitePath));
            if (inviteSnap.exists() && inviteSnap.val().status === 'paid') {
                console.log(`Debug: Referral ${userId} already paid in RTDB, skipping double credit.`);
            } else {
                // 1. RTDB Referral Status Update
                console.log(`Debug: referrerUid is: ${referrerUid}, userId is: ${userId}`);
                console.log(`Debug: Updating path: ${invitePath}`);
                await update(ref(rtdb, invitePath), { 
                    status: 'paid',
                    paidAt: serverTimestamp(),
                    commission: rewardAmount
                });
                console.log(`Debug: Update successful for path: ${invitePath}`);
                
                // Get previous balance before update
                const referrerRtdbRef = ref(rtdb, `users/${referrerUid}`);
                const referrerSnap = await get(referrerRtdbRef);
                const prevBalance = referrerSnap.exists() ? (referrerSnap.val().balance || 0) : 0;
                const newBalance = prevBalance + rewardAmount;

                // 2. RTDB Stats Update
                console.log(`Debug: Updating RTDB stats for referrer: ${referrerUid}, adding ${rewardAmount} to balance`);
                await update(ref(rtdb, `users/${referrerUid}`), {
                    balance: rtdbIncrement(rewardAmount),
                    totalEarnings: rtdbIncrement(rewardAmount),
                    inviteCount: rtdbIncrement(1),
                    activeMembers: rtdbIncrement(1),
                    totalCommission: rtdbIncrement(rewardAmount)
                });
                console.log(`Debug: RTDB stats update initiated for ${referrerUid}`);

                // 3. Firestore Stats Update (Sync)
                try {
                    const inviterRef = doc(db, 'users', referrerUid);
                    await updateDoc(inviterRef, { 
                        balance: increment(rewardAmount),
                        totalEarnings: increment(rewardAmount),
                        'referralStats.activeMembers': increment(1),
                        'referralStats.totalCommission': increment(rewardAmount)
                    });
                } catch (e) {
                   // Ignore if inviter is only in RTDB
                }

                // 4. Earning History in Firestore
                try {
                    await addDoc(collection(db, 'earning_history'), {
                        userId: referrerUid,
                        amount: rewardAmount,
                        source: 'Referral Bonus',
                        description: 'Bonus for referring a new user',
                        timestamp: Timestamp.now(),
                        previousBalance: prevBalance,
                        newBalance: newBalance
                    });
                } catch (e) {}
            }
        }

        // 4. Move to approved_history
        const approvedData = { ...request, approvedAt: Date.now() };
        await set(ref(rtdb, 'approved_history/' + id), approvedData);

        // 5. Remove from source
        if (isFirestore) {
            await updateDoc(doc(db, 'deposits', id), { status: 'approved', approvedAt: Timestamp.now() });
        } else {
            await remove(ref(rtdb, 'pending_requests/' + id));
        }
        
        addToast("Account activated successfully!", "success");
    } catch(error) {
        addToast("Failed to approve account.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [id]: false}));
    }
  };

  const handleReject = async (request: PendingRequest) => {
    const { id } = request;
    const isFirestore = (request as any).source === 'firestore';
    setActionLoading(prev => ({...prev, [id]: true}));
    try {
        const rejectedData = { ...request, rejectedAt: Date.now() };
        await set(ref(rtdb, 'rejected_history/' + id), rejectedData);

        if (isFirestore) {
            await updateDoc(doc(db, 'deposits', id), { status: 'rejected', rejectedAt: Timestamp.now() });
        } else {
            await remove(ref(rtdb, 'pending_requests/' + id));
        }
        
        addToast("Request rejected.", "success");
    } catch (error) {
        addToast("Failed to reject request.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [id]: false}));
    }
  };

  const filteredRequests = useMemo(() => {
    return requests
      .filter(req => 
        req.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.userEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.phoneNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.transactionId?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => {
        const dateA = a.createdAt ? (typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt).getTime()) : 0;
        const dateB = b.createdAt ? (typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt).getTime()) : 0;
        return dateB - dateA;
      });
  }, [requests, searchTerm]);

  if (loading) return <div className="flex justify-center items-center min-h-[400px]"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-gray-500"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Joining Approvals</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Manage account activation requests (Realtime Database)</p>
        </div>
      </div>

      <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by User ID, Name or Transaction ID..."
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
      </div>

      {filteredRequests.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-gray-100 dark:border-slate-800">
              <div className="w-16 h-16 bg-gray-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CreditCard className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">No Pending Requests</h3>
              <p className="text-gray-500 dark:text-gray-400">All caught up! No pending activation requests found.</p>
          </div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredRequests.map((req) => (
                  <div key={req.id} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                      <div className="p-6 flex-grow">
                          <div className="flex items-center gap-3 mb-4">
                              <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                  <UserIcon size={20} />
                              </div>
                              <div className="overflow-hidden">
                                  <h3 className="font-bold text-gray-900 dark:text-white truncate">{req.userName || 'Anonymous'}</h3>
                                  <p className="text-xs text-indigo-600 dark:text-indigo-400 truncate">{req.userEmail || 'No Email'}</p>
                              </div>
                          </div>
                          
                          <div className="space-y-3">
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1">Phone</span>
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">{req.phoneNumber || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1"><CreditCard size={14} /> Amount</span>
                                  <span className="text-sm font-bold text-green-600">Rs {req.amount}</span>
                              </div>
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1"><CreditCard size={14} /> Method</span>
                                  <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{req.method || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1"><Calendar size={14} /> Date</span>
                                  <span className="text-sm text-gray-700 dark:text-gray-300">
                                      {req.createdAt ? new Date(req.createdAt).toLocaleString() : 'N/A'}
                                  </span>
                              </div>
                              <div className="pt-2">
                                  <span className="text-xs text-gray-500 block mb-1">Transaction ID</span>
                                  <div className="bg-gray-50 dark:bg-slate-800 p-2 rounded-lg text-xs font-mono text-gray-700 dark:text-gray-300 break-all border border-gray-100 dark:border-slate-700">
                                      {req.transactionId || 'No ID provided'}
                                  </div>
                              </div>
                          </div>
                      </div>
                      
                      <div className="p-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex gap-3">
                          <button 
                            onClick={() => handleReject(req)}
                            disabled={actionLoading[req.userId]}
                            className="flex-1 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-sm font-bold hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors flex items-center justify-center gap-2"
                          >
                              {actionLoading[req.userId] ? <Spinner size="sm" /> : <><X size={16} /> Reject</>}
                          </button>
                          <button 
                            onClick={() => handleApprove(req)}
                            disabled={actionLoading[req.userId]}
                            className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-green-600/20"
                          >
                              {actionLoading[req.userId] ? <Spinner size="sm" /> : <><Check size={16} /> Approve</>}
                          </button>
                      </div>
                  </div>
              ))}
          </div>
      )}
    </div>
  );
};

export default JoiningApprovalsPage;
