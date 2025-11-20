import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, runTransaction, getDoc, where, query, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import TaskModal from '../components/TaskModal';
import AiTaskModal from '../components/AiTaskModal';
import { User } from './UsersPage';
import { useToast } from '../contexts/ToastContext';
import ConfirmationModal from '../components/ConfirmationModal';
import Spinner from '../components/Spinner';
import Pagination from '../components/Pagination';
import Checkbox from '../components/Checkbox';
import RejectionModal from '../components/RejectionModal';
import { decideTaskCreationRequest } from '../services/aiService';
import { 
    Check, 
    X, 
    Sparkles, 
    Youtube, 
    Instagram, 
    Facebook, 
    Globe, 
    Link as LinkIcon, 
    ChevronDown 
} from 'lucide-react';

export type TaskType = 'youtube' | 'instagram' | 'facebook' | 'website' | 'other';

export interface Task {
  id: string;
  title: string;
  description: string;
  reward: number;
  status: 'approved' | 'active' | 'inactive' | 'pending' | 'rejected'; // 'active' for backward compatibility
  createdBy?: string;
  userEmail?: string;
  taskType?: TaskType;
  taskUrl?: string;
  rejectionReason?: string;
  createdAt?: Timestamp;
  submittedAt?: Timestamp; // For user-submitted tasks
}

export interface UserTask {
    id: string;
    userId: string;
    taskId: string;
    status: 'submitted' | 'approved' | 'rejected';
    userEmail?: string;
    taskTitle?: string;
    taskReward?: number;
}

const TASK_TYPE_ICONS: { [key in TaskType]: React.ReactNode } = {
    youtube: <Youtube className="w-5 h-5 text-red-600" />,
    instagram: <Instagram className="w-5 h-5 text-pink-500" />,
    facebook: <Facebook className="w-5 h-5 text-blue-600" />,
    website: <Globe className="w-5 h-5 text-gray-500" />,
    other: <LinkIcon className="w-5 h-5 text-gray-500" />,
};

const TasksPage: React.FC = () => {
  const [managedTasks, setManagedTasks] = useState<Task[]>([]);
  const [taskRequests, setTaskRequests] = useState<Task[]>([]);
  const [submissions, setSubmissions] = useState<UserTask[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingManaged, setLoadingManaged] = useState(true);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});
  const { addToast } = useToast();
  
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);

  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [requestToReject, setRequestToReject] = useState<string | null>(null);

  const [taskListingFee, setTaskListingFee] = useState(0);

  // Pagination and sorting state
  const [currentSubmissionsPage, setCurrentSubmissionsPage] = useState(1);
  const [selectedSubmissions, setSelectedSubmissions] = useState<Set<string>>(new Set());
  const ITEMS_PER_PAGE = 10;
  
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  
  // New state for AI review
  const [isAiReviewing, setIsAiReviewing] = useState(false);
  const [aiReviewLogs, setAiReviewLogs] = useState<string[]>([]);
  const [aiReviewStats, setAiReviewStats] = useState({ processed: 0, approved: 0, rejected: 0, failed: 0 });


  const handleToggleExpand = (taskId: string) => {
    setExpandedRequestId(prevId => (prevId === taskId ? null : taskId));
  };


  const formatDate = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return 'N/A';
    return timestamp.toDate().toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
  };

  useEffect(() => {
    const settingsRef = doc(db, 'settings', 'global');
    const unsubscribeSettings = onSnapshot(settingsRef, (docSnap) => {
        if (docSnap.exists()) {
            setTaskListingFee(docSnap.data().taskListingFee || 0);
        }
    });
    return () => unsubscribeSettings();
  }, []);


  useEffect(() => {
    // Listener for Task Requests (pending)
    const requestsQuery = query(collection(db, 'tasks'), where('status', '==', 'pending'));
    const unsubscribeRequests = onSnapshot(requestsQuery, async (snapshot) => {
      setLoadingRequests(true); // Reset loading state on new snapshot
      try {
        const requestsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
        
        const enrichedRequests = await Promise.all(requestsData.map(async (task) => {
          if (task.createdBy && !task.userEmail) {
            try {
              const userRef = doc(db, 'users', task.createdBy);
              const userSnap = await getDoc(userRef);
              task.userEmail = userSnap.exists() ? (userSnap.data() as User).email : 'Unknown User';
            } catch (enrichError) {
               console.error(`Failed to fetch user email for task ${task.id}:`, enrichError);
               task.userEmail = 'Error fetching user';
            }
          }
          return task;
        }));

        // Sort client-side for robustness, prioritizing submittedAt
        enrichedRequests.sort((a, b) => {
            const timeA = a.submittedAt?.toMillis() || a.createdAt?.toMillis() || 0;
            const timeB = b.submittedAt?.toMillis() || b.createdAt?.toMillis() || 0;
            return timeB - timeA; // Descending order
        });

        setTaskRequests(enrichedRequests);
      } catch (processingError) {
        console.error("Error processing task request data:", processingError);
        addToast('Error processing task requests.', 'error');
      } finally {
        setLoadingRequests(false);
      }
    }, (error) => {
      console.error("Error fetching task requests:", error);
      addToast('Error fetching task requests.', 'error');
      setLoadingRequests(false);
    });


    // Listener for Managed Tasks (approved/active/inactive/rejected)
    const managedQuery = query(collection(db, 'tasks'), where('status', 'in', ['approved', 'active', 'inactive', 'rejected']));
    const unsubscribeManaged = onSnapshot(managedQuery, (snapshot) => {
      try {
        const managedData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
        setManagedTasks(managedData);
      } catch (error) {
        console.error("Error processing managed tasks:", error);
        addToast('Error processing managed tasks.', 'error');
      } finally {
        setLoadingManaged(false);
      }
    }, (error) => {
        console.error("Error fetching managed tasks:", error);
        addToast('Error fetching managed tasks.', 'error');
        setLoadingManaged(false);
    });
    
    // Listener for Submissions
    const submissionsQuery = query(collection(db, 'userTasks'), where('status', '==', 'submitted'));
    const unsubscribeSubmissions = onSnapshot(submissionsQuery, async (snapshot) => {
      try {
        const subsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserTask));
        
        const enrichedSubs = await Promise.all(subsData.map(async (sub) => {
            const taskRef = doc(db, 'tasks', sub.taskId);
            const userRef = doc(db, 'users', sub.userId);
            const taskSnap = await getDoc(taskRef);
            const userSnap = await getDoc(userRef);
            return {
                ...sub,
                taskTitle: taskSnap.exists() ? (taskSnap.data() as Task).title : 'Unknown Task',
                userEmail: userSnap.exists() ? (userSnap.data() as User).email : 'Unknown User',
                taskReward: taskSnap.exists() ? (taskSnap.data() as Task).reward : 0,
            };
        }));
        setSubmissions(enrichedSubs);
      } catch (error) {
          console.error("Error processing submissions:", error);
          addToast('Error fetching submissions.', 'error');
      } finally {
        setLoadingSubmissions(false);
      }
    }, (error) => {
      console.error("Error fetching submissions:", error);
      addToast('Error fetching submissions.', 'error');
      setLoadingSubmissions(false);
    });

    return () => {
        unsubscribeRequests();
        unsubscribeManaged();
        unsubscribeSubmissions();
    };
}, [addToast]);

  const paginatedSubmissions = useMemo(() => {
    const startIndex = (currentSubmissionsPage - 1) * ITEMS_PER_PAGE;
    return submissions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [submissions, currentSubmissionsPage]);
  
  const { liveTasks, taskHistory } = useMemo(() => {
    const live = managedTasks.filter(t => t.status === 'approved' || t.status === 'active');
    const history = managedTasks.filter(t => t.status === 'inactive' || t.status === 'rejected');
    return { liveTasks: live, taskHistory: history };
  }, [managedTasks]);


  // Handlers
  const handleOpenModal = (task: Task | null = null) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };
  
  const handleOpenAiModal = () => setIsAiModalOpen(true);
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setIsAiModalOpen(false);
    setSelectedTask(null);
  };
  const handleSaveTask = async (taskData: Omit<Task, 'id'>) => {
    const action = selectedTask ? 'update' : 'create';
    setActionLoading(prev => ({...prev, [action]: true}));
    try {
        if (selectedTask) {
            const taskRef = doc(db, 'tasks', selectedTask.id);
            await updateDoc(taskRef, taskData);
            addToast("Task updated successfully!", "success");
        } else {
            await addDoc(collection(db, 'tasks'), {
                ...taskData,
                status: taskData.status || 'approved', // Default status for new tasks
            });
            addToast("Task created successfully!", "success");
        }
        handleCloseModal();
    } catch (error) {
        addToast(`Failed to ${action} task.`, "error");
    } finally {
        setActionLoading(prev => ({...prev, [action]: false}));
    }
  };
  const openDeleteConfirm = (id: string) => {
    setTaskToDelete(id);
    setIsDeleteConfirmOpen(true);
  };
  const handleDeleteTask = async () => {
    if (!taskToDelete) return;
    setActionLoading(prev => ({...prev, [taskToDelete]: true}));
    try {
        await deleteDoc(doc(db, 'tasks', taskToDelete));
        addToast("Task deleted successfully.", "success");
    } catch (error) {
        addToast("Failed to delete task.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [taskToDelete]: false}));
        setIsDeleteConfirmOpen(false);
        setTaskToDelete(null);
    }
  };
  const handleToggleStatus = async (task: Task) => {
    setActionLoading(prev => ({...prev, [`toggle_${task.id}`]: true}));
    try {
        const taskRef = doc(db, 'tasks', task.id);
        const newStatus = (task.status === 'active' || task.status === 'approved') ? 'inactive' : 'approved';
        await updateDoc(taskRef, { status: newStatus });
        addToast(`Task status changed to ${newStatus}.`, "success");
    } catch (error) {
        addToast("Failed to change task status.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [`toggle_${task.id}`]: false}));
    }
  };
  
  const handleApproveRequest = async (task: Task) => {
    setActionLoading(prev => ({...prev, [task.id]: true}));
    try {
        await runTransaction(db, async (transaction) => {
            const totalCost = task.reward + taskListingFee;

            if (!task.createdBy) throw new Error("Task creator not found.");
            
            const userRef = doc(db, 'users', task.createdBy);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) throw new Error("Task creator not found.");

            if (userDoc.data().balance < totalCost) {
                throw new Error("Creator has insufficient balance for reward + listing fee.");
            }

            const newBalance = userDoc.data().balance - totalCost;
            transaction.update(userRef, { balance: newBalance });

            const taskRef = doc(db, 'tasks', task.id);
            transaction.update(taskRef, { status: 'approved' });

            if (taskListingFee > 0) {
                const revenueRef = collection(db, 'revenueTransactions');
                transaction.set(doc(revenueRef), {
                    adminFeeAmount: taskListingFee,
                    originalAmount: task.reward,
                    sourceUser: task.createdBy,
                    timestamp: Timestamp.now(),
                    transactionType: 'listing_fee',
                    relatedDocId: task.id,
                });
            }
        });
        addToast("Task request approved and funds deducted.", "success");
    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        addToast(`Failed to approve task request: ${message}`, "error");
        // re-throw to be caught by AI handler
        throw error;
    } finally {
        setActionLoading(prev => ({...prev, [task.id]: false}));
    }
  };

  const openRejectModal = (id: string) => {
    setRequestToReject(id);
    setIsRejectModalOpen(true);
  };
  const handleRejectRequest = async (reason: string) => {
    if (!requestToReject) return;
    setActionLoading(prev => ({...prev, [requestToReject]: true}));
    try {
        const taskRef = doc(db, 'tasks', requestToReject);
        await updateDoc(taskRef, {
            status: 'rejected',
            rejectionReason: reason || 'Rejected by admin'
        });
        addToast("Task request rejected.", "success");
    } catch (error) {
        addToast("Failed to reject request.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [requestToReject]: false}));
        setIsRejectModalOpen(false);
        setRequestToReject(null);
    }
  };
  
  const handleApproveSubmission = async (submission: UserTask) => {
    setActionLoading(prev => ({...prev, [submission.id]: true}));
    try {
        await runTransaction(db, async (transaction) => {
            const settingsRef = doc(db, 'settings', 'global');
            const settingsDoc = await transaction.get(settingsRef);
            const commissionRate = settingsDoc.exists() ? (settingsDoc.data().taskCommissionRate || 0) : 0;
            
            const reward = submission.taskReward || 0;
            const commission = (reward * commissionRate) / 100;
            const netReward = reward - commission;

            const userRef = doc(db, 'users', submission.userId);
            const submissionRef = doc(db, 'userTasks', submission.id);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) throw new Error("User document not found!");
            
            const newBalance = userDoc.data().balance + netReward;
            transaction.update(userRef, { balance: newBalance });
            transaction.update(submissionRef, { status: 'approved' });

             if (commission > 0) {
                const revenueRef = collection(db, 'revenueTransactions');
                transaction.set(doc(revenueRef), {
                    adminFeeAmount: commission,
                    originalAmount: reward,
                    sourceUser: submission.userId,
                    timestamp: Timestamp.now(),
                    transactionType: 'task_commission',
                    relatedDocId: submission.id,
                });
            }
        });
        addToast("Submission approved successfully!", "success");
    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        addToast(`Approval failed: ${message}`, "error");
    } finally {
        setActionLoading(prev => ({...prev, [submission.id]: false}));
    }
  };
  const handleRejectSubmission = async (submissionId: string) => {
    setActionLoading(prev => ({...prev, [submissionId]: true}));
    try {
        const submissionRef = doc(db, 'userTasks', submissionId);
        await updateDoc(submissionRef, { status: 'rejected' });
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

  const handleSelectAllSubmissions = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.checked) {
          setSelectedSubmissions(new Set(paginatedSubmissions.map(s => s.id)));
      } else {
          setSelectedSubmissions(new Set());
      }
  };
  
  const handleBulkSubmissionAction = async (action: 'approve' | 'reject') => {
      setActionLoading({ ...actionLoading, bulkSubmissions: true });
      const updates: Promise<void>[] = [];

      for (const subId of selectedSubmissions) {
          const submission = submissions.find(s => s.id === subId);
          if (!submission) continue;

          if (action === 'approve') {
              updates.push(handleApproveSubmission(submission));
          } else {
              const submissionRef = doc(db, 'userTasks', subId);
              updates.push(updateDoc(submissionRef, { status: 'rejected' }));
          }
      }
      
      try {
          await Promise.all(updates);
          addToast(`Successfully ${action}d ${selectedSubmissions.size} submissions.`, 'success');
          setSelectedSubmissions(new Set());
      } catch (error) {
           addToast(`Failed to bulk ${action} submissions.`, 'error');
      } finally {
          setActionLoading({ ...actionLoading, bulkSubmissions: false });
      }
  };

  const handleAiReviewRequests = async () => {
    setIsAiReviewing(true);
    setAiReviewLogs(['▶️ Starting AI review for pending task requests...']);
    setAiReviewStats({ processed: 0, approved: 0, rejected: 0, failed: 0 });

    const pendingTasks = taskRequests.filter(t => t.status === 'pending');

    if (pendingTasks.length === 0) {
        setAiReviewLogs(prev => [...prev, '✅ No pending requests to review.']);
        setIsAiReviewing(false);
        return;
    }

    setAiReviewLogs(prev => [...prev, `🔍 Found ${pendingTasks.length} pending request(s).`]);

    for (const task of pendingTasks) {
        try {
            setAiReviewStats(prev => ({ ...prev, processed: prev.processed + 1 }));
            setAiReviewLogs(prev => [...prev, `🤔 Analyzing task "${task.title}"...`]);

            const { decision, reason } = await decideTaskCreationRequest(task);
            setAiReviewLogs(prev => [...prev, `💡 AI decision: ${decision}. Reason: ${reason}`]);

            if (decision === 'APPROVE') {
                await handleApproveRequest(task);
                setAiReviewStats(prev => ({ ...prev, approved: prev.approved + 1 }));
                setAiReviewLogs(prev => [...prev, `[SUCCESS] Approved task "${task.title}".`]);
            } else { // REJECT
                const taskRef = doc(db, 'tasks', task.id);
                await updateDoc(taskRef, {
                    status: 'rejected',
                    rejectionReason: `AI: ${reason}`
                });
                addToast(`Task "${task.title}" rejected by AI.`, 'info');
                setAiReviewStats(prev => ({ ...prev, rejected: prev.rejected + 1 }));
                setAiReviewLogs(prev => [...prev, `[REJECTED] Rejected task "${task.title}".`]);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "An unknown error occurred.";
            setAiReviewStats(prev => ({ ...prev, failed: prev.failed + 1 }));
            setAiReviewLogs(prev => [...prev, `[FAIL] Error processing "${task.title}": ${message}`]);
            console.error(`Error during AI review for task ${task.id}:`, error);
        }
    }

    addToast('AI task request review complete!', 'success');
    setAiReviewLogs(prev => [...prev, '🏁 Review complete.']);
    setIsAiReviewing(false);
  };


  return (
    <div className="container mx-auto">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Manage Tasks</h1>
        <div className="flex flex-col sm:flex-row gap-2">
            <button
                onClick={handleOpenAiModal}
                className="inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-xl transition-colors duration-200 shadow-lg shadow-purple-500/30"
                >
                <Sparkles className="w-5 h-5" />
                Create with AI
            </button>
            <button
                onClick={() => handleOpenModal()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-xl transition-colors duration-200 shadow-lg shadow-indigo-500/30"
            >
                Create New Task
            </button>
        </div>
      </div>
      
      {/* User Task Requests section */}
      <div className="mb-12">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">User Task Requests</h2>
            <button
                onClick={handleAiReviewRequests}
                disabled={isAiReviewing || taskRequests.length === 0}
                className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-xl transition-colors duration-200 disabled:bg-indigo-400 shadow-lg shadow-indigo-500/30"
            >
                {isAiReviewing ? <Spinner /> : <Sparkles className="w-5 h-5" />}
                Run AI Review
            </button>
        </div>

        {isAiReviewing && (
            <div className="mb-6 bg-white dark:bg-slate-900 rounded-xl shadow-lg p-4">
                <div className="text-sm font-medium mb-2 text-center sm:text-left text-gray-500 dark:text-gray-300">
                    Processed: <span className="font-bold">{aiReviewStats.processed}</span> | 
                    Approved: <span className="font-bold text-green-600 dark:text-green-400">{aiReviewStats.approved}</span> | 
                    Rejected: <span className="font-bold text-red-600 dark:text-red-400">{aiReviewStats.rejected}</span> |
                    Failed: <span className="font-bold text-yellow-600 dark:text-yellow-400">{aiReviewStats.failed}</span>
                </div>
                <div className="bg-gray-100 dark:bg-slate-800 rounded-lg p-4 max-h-48 overflow-y-auto">
                    <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">{aiReviewLogs.join('\n')}</pre>
                </div>
            </div>
        )}

        {loadingRequests ? <p>Loading requests...</p> : taskRequests.length === 0 ? <p className="text-center py-10 text-gray-500 dark:text-gray-400">No pending task requests.</p> : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {taskRequests.map(task => {
                    const isExpanded = expandedRequestId === task.id;
                    return (
                        <div key={task.id} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 hover:shadow-md transition-all duration-200 flex flex-col">
                            <div className="p-6 flex-grow cursor-pointer" onClick={() => handleToggleExpand(task.id)}>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{task.userEmail || 'N/A'}</p>
                                        <h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">{task.title}</h3>
                                    </div>
                                    <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-300 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                                </div>
                                <p className={`text-sm text-gray-600 dark:text-gray-400 ${!isExpanded ? 'line-clamp-3' : ''}`}>{task.description}</p>
                                
                                <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isExpanded ? 'max-h-24 opacity-100 pt-4' : 'max-h-0 opacity-0'}`}>
                                    {task.taskUrl && (
                                        <div>
                                            <h4 className="font-semibold text-sm mb-1 text-gray-700 dark:text-gray-300">Task URL</h4>
                                            <a 
                                                href={task.taskUrl} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="text-indigo-500 hover:underline break-all text-sm"
                                            >
                                                {task.taskUrl}
                                            </a>
                                        </div>
                                    )}
                                </div>
                                
                                <p className="text-xs text-gray-400 mt-4 pt-4 border-t border-gray-100 dark:border-slate-800">Submitted: {formatDate(task.submittedAt || task.createdAt)}</p>
                            </div>
                            <div className="bg-gray-50 dark:bg-slate-800/50 p-4 space-y-2 text-sm mt-auto border-t border-gray-100 dark:border-slate-800">
                               <div className="flex justify-between items-center text-gray-600 dark:text-gray-300">
                                    <span>Task Reward</span>
                                    <span className="font-semibold">Rs {task.reward.toFixed(2)}</span>
                               </div>
                               <div className="flex justify-between items-center text-gray-600 dark:text-gray-300">
                                    <span>Listing Fee</span>
                                    <span className="font-semibold">Rs {taskListingFee.toFixed(2)}</span>
                               </div>
                               <div className="flex justify-between items-center font-bold text-emerald-600 dark:text-emerald-400 pt-2 border-t border-gray-200 dark:border-slate-700">
                                    <span>Total Cost to User</span>
                                    <span>Rs {(task.reward + taskListingFee).toFixed(2)}</span>
                               </div>
                            </div>
                            <div className="p-4 flex gap-2">
                                 <button onClick={() => handleApproveRequest(task)} disabled={actionLoading[task.id]} className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:bg-emerald-400 transition-colors">Approve</button>
                                 <button onClick={() => openRejectModal(task.id)} disabled={actionLoading[task.id]} className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-700 disabled:bg-rose-400 transition-colors">Reject</button>
                            </div>
                        </div>
                    );
                })}
            </div>
        )}
      </div>

      <div className="mb-12">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Live Tasks</h2>
        {loadingManaged ? <p>Loading tasks...</p> : liveTasks.length === 0 ? <p className="text-center py-10 text-gray-500 dark:text-gray-400">No live tasks found.</p> :
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {liveTasks.map(task => (
                  <div key={task.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 flex flex-col hover:shadow-md transition-all">
                      <div className="flex-grow">
                          <div className="flex justify-between items-start mb-2">
                              <h3 className="font-bold text-lg text-gray-900 dark:text-white">{task.title}</h3>
                              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">Live</span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">{task.description}</p>
                      </div>
                      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800 flex justify-between items-center">
                          <span className="font-bold text-xl text-emerald-600 dark:text-emerald-400">Rs {task.reward.toFixed(2)}</span>
                          <div className="flex gap-3">
                              <button onClick={() => handleToggleStatus(task)} className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800">Pause</button>
                              <button onClick={() => handleOpenModal(task)} className="text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">Edit</button>
                              <button onClick={() => openDeleteConfirm(task.id)} className="text-sm font-semibold text-rose-500 dark:text-rose-400 hover:text-rose-700">Delete</button>
                          </div>
                      </div>
                  </div>
              ))}
          </div>
        }
      </div>

      <div className="mb-12">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Task History (Inactive/Rejected)</h2>
        {loadingManaged ? <p>Loading history...</p> : taskHistory.length === 0 ? <p className="text-center py-10 text-gray-500 dark:text-gray-400">No historical tasks found.</p> :
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {taskHistory.map(task => (
                  <div key={task.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 flex flex-col opacity-75 hover:opacity-100 transition-opacity">
                      <div className="flex-grow">
                          <div className="flex justify-between items-start mb-2">
                              <h3 className="font-bold text-lg text-gray-900 dark:text-white">{task.title}</h3>
                              <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${task.status === 'rejected' ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'}`}>{task.status}</span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">{task.description}</p>
                          {task.rejectionReason && <p className="text-xs text-rose-500 font-medium mt-2">Reason: {task.rejectionReason}</p>}
                      </div>
                      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800 flex justify-between items-center">
                          <span className="font-bold text-xl text-gray-600 dark:text-gray-400">Rs {task.reward.toFixed(2)}</span>
                          <div className="flex gap-3">
                              {task.status === 'inactive' && <button onClick={() => handleToggleStatus(task)} className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-800">Activate</button>}
                              <button onClick={() => openDeleteConfirm(task.id)} className="text-sm font-semibold text-rose-500 dark:text-rose-400 hover:text-rose-700">Delete</button>
                          </div>
                      </div>
                  </div>
              ))}
          </div>
        }
      </div>


      <div className="mt-12">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Pending Task Submissions</h2>
        {selectedSubmissions.size > 0 && (
            <div className="mb-4 bg-indigo-100 dark:bg-indigo-900/50 p-3 rounded-lg flex items-center justify-between">
                <span className="text-sm font-medium text-indigo-800 dark:text-indigo-200">{selectedSubmissions.size} submission(s) selected</span>
                <div className="flex gap-2">
                    <button onClick={() => handleBulkSubmissionAction('approve')} className="px-3 py-1 text-xs font-semibold text-white bg-green-600 rounded-md hover:bg-green-700" disabled={actionLoading.bulkSubmissions}>Approve</button>
                    <button onClick={() => handleBulkSubmissionAction('reject')} className="px-3 py-1 text-xs font-semibold text-white bg-red-600 rounded-md hover:bg-red-700" disabled={actionLoading.bulkSubmissions}>Reject</button>
                </div>
            </div>
        )}

        {loadingSubmissions ? <p>Loading submissions...</p> : (
            submissions.length === 0 
            ? <p className="text-center py-10 text-gray-500 dark:text-gray-400">No pending submissions.</p>
            : <>
                <div className="bg-white dark:bg-slate-900 shadow-md rounded-lg overflow-hidden">
                    <div className="overflow-x-auto hidden md:block">
                        <table className="min-w-full leading-normal">
                            <thead>
                                <tr>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800">
                                        <Checkbox checked={selectedSubmissions.size === paginatedSubmissions.length && paginatedSubmissions.length > 0} onChange={handleSelectAllSubmissions} indeterminate={selectedSubmissions.size > 0 && selectedSubmissions.size < paginatedSubmissions.length} />
                                    </th>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">User</th>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Task</th>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedSubmissions.map((sub) => (
                                    <tr key={sub.id}>
                                        <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm"><Checkbox checked={selectedSubmissions.has(sub.id)} onChange={() => handleSelectSubmission(sub.id)} /></td>
                                        <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm"><p className="text-gray-900 dark:text-white whitespace-no-wrap">{sub.userEmail}</p></td>
                                        <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm"><p className="text-gray-900 dark:text-white whitespace-no-wrap">{sub.taskTitle}</p><p className="text-gray-600 dark:text-gray-400 whitespace-no-wrap">Reward: Rs {sub.taskReward?.toFixed(2)}</p></td>
                                        <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm"><div className="flex items-center gap-2"><button onClick={() => handleApproveSubmission(sub)} disabled={actionLoading[sub.id]} className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:bg-emerald-400 transition-colors">{actionLoading[sub.id] ? <Spinner /> : <Check className="w-4 h-4" />}</button><button onClick={() => handleRejectSubmission(sub.id)} disabled={actionLoading[sub.id]} className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-rose-600 rounded-md hover:bg-rose-700 disabled:bg-rose-400 transition-colors">{actionLoading[sub.id] ? <Spinner /> : <X className="w-4 h-4" />}</button></div></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="md:hidden">
                        {paginatedSubmissions.map(sub => ( <div key={sub.id} className="p-4 border-b border-gray-200 dark:border-slate-800 flex items-start gap-4"><Checkbox checked={selectedSubmissions.has(sub.id)} onChange={() => handleSelectSubmission(sub.id)} className="mt-1" /><div className="flex-1"><p className="font-semibold text-gray-900 dark:text-white">{sub.taskTitle}</p><p className="text-sm text-gray-500 dark:text-gray-400">from {sub.userEmail}</p><div className="mt-2 flex justify-between items-center"><p className="font-bold text-indigo-600 dark:text-indigo-400">Rs {sub.taskReward?.toFixed(2)}</p><div className="flex items-center gap-2"><button onClick={() => handleApproveSubmission(sub)} disabled={actionLoading[sub.id]} className="p-2 bg-green-100 dark:bg-green-900/50 rounded-full"><Check className="w-4 h-4 text-green-600 dark:text-green-400"/></button><button onClick={() => handleRejectSubmission(sub.id)} disabled={actionLoading[sub.id]} className="p-2 bg-red-100 dark:bg-red-900/50 rounded-full"><X className="w-4 h-4 text-red-600 dark:text-red-400" /></button></div></div></div></div>))}
                    </div>
                    <Pagination currentPage={currentSubmissionsPage} totalPages={Math.ceil(submissions.length / ITEMS_PER_PAGE)} onPageChange={setCurrentSubmissionsPage} />
                </div>
            </>
        )}
      </div>

      {isModalOpen && ( <TaskModal task={selectedTask} onClose={handleCloseModal} onSave={handleSaveTask} isLoading={actionLoading['create'] || actionLoading['update']} /> )}
      {isAiModalOpen && ( <AiTaskModal onClose={handleCloseModal} onSave={handleSaveTask} /> )}
      <ConfirmationModal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} onConfirm={handleDeleteTask} title="Delete Task" message="Are you sure you want to delete this task? This action cannot be undone." />
      <RejectionModal isOpen={isRejectModalOpen} onClose={() => setIsRejectModalOpen(false)} onConfirm={handleRejectRequest} title="Reject Task Request" isLoading={requestToReject ? actionLoading[requestToReject] : false} />
    </div>
  );
};

export default TasksPage;