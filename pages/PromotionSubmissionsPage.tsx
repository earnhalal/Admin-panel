import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc, getDoc, query, where, Timestamp, runTransaction } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';
import Pagination from '../components/Pagination';
import Checkbox from '../components/Checkbox';
import { 
    Check, 
    X, 
    Search, 
    ArrowLeft, 
    Megaphone, 
    User as UserIcon, 
    ExternalLink,
    Clock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PromotionSubmission {
  id: string;
  userId: string;
  promotionId: string;
  promotionTitle: string;
  userName: string;
  userEmail: string;
  proof: string;
  status: 'pending' | 'approved' | 'rejected';
  reward: number;
  submittedAt: Timestamp;
}

const PromotionSubmissionsPage: React.FC = () => {
  const [submissions, setSubmissions] = useState<PromotionSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSubmissions, setSelectedSubmissions] = useState<Set<string>>(new Set());
  const ITEMS_PER_PAGE = 10;
  const { addToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(collection(db, 'promotion_submissions'), where('status', '==', 'pending'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        const subsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        
        const enrichedSubs = await Promise.all(subsData.map(async (sub) => {
            // If user data isn't in the submission, fetch it
            let userName = sub.userName;
            let userEmail = sub.userEmail;
            
            if (!userName || !userEmail) {
                const userRef = doc(db, 'users', sub.userId);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    const userData = userSnap.data();
                    userName = userName || userData.username || userData.name || 'Anonymous';
                    userEmail = userEmail || userData.email || 'N/A';
                }
            }

            return {
                ...sub,
                userName: userName || 'Anonymous',
                userEmail: userEmail || 'N/A',
            } as PromotionSubmission;
        }));
        
        // Sort by submittedAt descending
        enrichedSubs.sort((a, b) => b.submittedAt?.toMillis() - a.submittedAt?.toMillis());
        
        setSubmissions(enrichedSubs);
      } catch (error) {
          console.error("Error processing submissions:", error);
          addToast('Error fetching submissions.', 'error');
      } finally {
        setLoading(false);
      }
    }, (error) => {
      console.error("Error fetching submissions:", error);
      addToast('Error fetching submissions.', 'error');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [addToast]);

  const filteredSubmissions = useMemo(() => {
    return submissions.filter(sub => 
      sub.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.promotionTitle.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [submissions, searchTerm]);

  const paginatedSubmissions = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredSubmissions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredSubmissions, currentPage]);

  const handleApprove = async (submission: PromotionSubmission) => {
    setActionLoading(prev => ({...prev, [submission.id]: true}));
    try {
        await runTransaction(db, async (transaction) => {
            const userRef = doc(db, 'users', submission.userId);
            const submissionRef = doc(db, 'promotion_submissions', submission.id);
            
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) throw new Error("User document not found!");
            
            const currentBalance = userDoc.data().balance || 0;
            const newBalance = currentBalance + submission.reward;
            
            transaction.update(userRef, { balance: newBalance });
            transaction.update(submissionRef, { 
                status: 'approved',
                approvedAt: Timestamp.now()
            });
        });
        addToast("Submission approved and reward added!", "success");
    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        addToast(`Approval failed: ${message}`, "error");
    } finally {
        setActionLoading(prev => ({...prev, [submission.id]: false}));
    }
  };

  const handleReject = async (submissionId: string) => {
    setActionLoading(prev => ({...prev, [submissionId]: true}));
    try {
        const submissionRef = doc(db, 'promotion_submissions', submissionId);
        await updateDoc(submissionRef, { 
            status: 'rejected',
            rejectedAt: Timestamp.now()
        });
        addToast("Submission rejected.", "success");
    } catch (error) {
        addToast("Failed to reject submission.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [submissionId]: false}));
    }
  };

  const handleSelectSubmission = (subId: string) => {
      setSelectedSubmissions(prev => {
          const newSet = new Set(prev);
          if (newSet.has(subId)) newSet.delete(subId);
          else newSet.add(subId);
          return newSet;
      });
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.checked) {
          setSelectedSubmissions(new Set(paginatedSubmissions.map(s => s.id)));
      } else {
          setSelectedSubmissions(new Set());
      }
  };

  const handleBulkAction = async (action: 'approve' | 'reject') => {
      setActionLoading(prev => ({ ...prev, bulk: true }));
      const updates: Promise<void>[] = [];

      for (const subId of selectedSubmissions) {
          const submission = submissions.find(s => s.id === subId);
          if (!submission) continue;

          if (action === 'approve') {
              updates.push(handleApprove(submission));
          } else {
              updates.push(handleReject(subId));
          }
      }
      
      try {
          await Promise.all(updates);
          addToast(`Successfully ${action}d ${selectedSubmissions.size} submissions.`, 'success');
          setSelectedSubmissions(new Set());
      } catch (error) {
           addToast(`Failed to bulk ${action} submissions.`, 'error');
      } finally {
          setActionLoading(prev => ({ ...prev, bulk: false }));
      }
  };

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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Megaphone className="text-indigo-500" /> Promotion Requests
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Review and approve user promotion submissions</p>
        </div>
      </div>

      <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by User, Email or Promotion Title..."
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
      </div>

      {selectedSubmissions.size > 0 && (
          <div className="bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3 rounded-xl border border-indigo-100 dark:border-indigo-800 flex items-center justify-between">
              <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400">{selectedSubmissions.size} Selected</span>
              <div className="flex gap-3">
                  <button 
                    onClick={() => handleBulkAction('approve')} 
                    disabled={actionLoading.bulk}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50"
                  >
                    Approve All
                  </button>
                  <button 
                    onClick={() => handleBulkAction('reject')} 
                    disabled={actionLoading.bulk}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors shadow-sm disabled:opacity-50"
                  >
                    Reject All
                  </button>
              </div>
          </div>
      )}

      {paginatedSubmissions.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-gray-100 dark:border-slate-800">
              <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">No pending requests</h3>
              <p className="text-gray-500 dark:text-gray-400">There are no pending promotion submissions to review.</p>
          </div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedSubmissions.map((sub) => (
                  <div key={sub.id} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                      <div className="p-6 flex-grow">
                          <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                      <UserIcon size={20} />
                                  </div>
                                  <div className="overflow-hidden">
                                      <h3 className="font-bold text-gray-900 dark:text-white truncate">{sub.userName}</h3>
                                      <p className="text-xs text-indigo-600 dark:text-indigo-400 truncate">{sub.userEmail}</p>
                                  </div>
                              </div>
                              <Checkbox checked={selectedSubmissions.has(sub.id)} onChange={() => handleSelectSubmission(sub.id)} />
                          </div>
                          
                          <div className="space-y-3">
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500">Promotion</span>
                                  <span className="text-sm font-bold text-gray-900 dark:text-white truncate max-w-[150px]">{sub.promotionTitle}</span>
                              </div>
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500">Reward</span>
                                  <span className="text-sm font-bold text-green-600">Rs {sub.reward}</span>
                              </div>
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={14} /> Submitted</span>
                                  <span className="text-xs text-gray-700 dark:text-gray-300">
                                      {sub.submittedAt?.toDate().toLocaleString()}
                                  </span>
                              </div>
                              <div className="pt-2">
                                  <span className="text-xs text-gray-500 block mb-1">Proof / Link</span>
                                  <div className="bg-gray-50 dark:bg-slate-800 p-2 rounded-lg text-xs font-mono text-indigo-600 dark:text-indigo-400 break-all border border-gray-100 dark:border-slate-700">
                                      {sub.proof ? (
                                          <a href={sub.proof} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                                              {sub.proof} <ExternalLink size={12} />
                                          </a>
                                      ) : 'No proof provided'}
                                  </div>
                              </div>
                          </div>
                      </div>
                      
                      <div className="p-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex gap-3">
                          <button 
                              onClick={() => handleReject(sub.id)}
                              disabled={actionLoading[sub.id]}
                              className="flex-1 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-sm font-bold hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors flex items-center justify-center gap-2"
                          >
                              {actionLoading[sub.id] ? <Spinner size="sm" /> : <><X size={16} /> Reject</>}
                          </button>
                          <button 
                              onClick={() => handleApprove(sub)}
                              disabled={actionLoading[sub.id]}
                              className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-green-600/20"
                          >
                              {actionLoading[sub.id] ? <Spinner size="sm" /> : <><Check size={16} /> Approve</>}
                          </button>
                      </div>
                  </div>
              ))}
          </div>
      )}
      
      {filteredSubmissions.length > ITEMS_PER_PAGE && (
          <Pagination 
            currentPage={currentPage} 
            totalPages={Math.ceil(filteredSubmissions.length / ITEMS_PER_PAGE)} 
            onPageChange={setCurrentPage} 
          />
      )}
    </div>
  );
};

export default PromotionSubmissionsPage;
