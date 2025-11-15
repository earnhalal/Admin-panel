import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, runTransaction, getDoc, where, query, writeBatch, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import TaskModal from '../components/TaskModal';
import AiTaskModal from '../components/AiTaskModal';
import { User } from './UsersPage';
import { useToast } from '../contexts/ToastContext';
import ConfirmationModal from '../components/ConfirmationModal';
import Spinner from '../components/Spinner';
import { CheckIcon } from '../components/icons/CheckIcon';
import { XIcon } from '../components/icons/XIcon';
import { SparklesIcon } from '../components/icons/SparklesIcon';
import Pagination from '../components/Pagination';
import Checkbox from '../components/Checkbox';


export interface Task {
  id: string;
  title: string;
  description: string;
  reward: number;
  status: 'active' | 'inactive' | 'pending_approval';
  createdBy?: string;
  userEmail?: string;
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

const TasksPage: React.FC = () => {
  const [managedTasks, setManagedTasks] = useState<Task[]>([]);
  const [taskRequests, setTaskRequests] = useState<Task[]>([]);
  const [submissions, setSubmissions] = useState<UserTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});
  const { addToast } = useToast();
  
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);

  const [isRejectConfirmOpen, setIsRejectConfirmOpen] = useState(false);
  const [requestToReject, setRequestToReject] = useState<string | null>(null);

  // Pagination and sorting state
  const [currentSubmissionsPage, setCurrentSubmissionsPage] = useState(1);
  const [selectedSubmissions, setSelectedSubmissions] = useState<Set<string>>(new Set());
  const ITEMS_PER_PAGE = 10;


  useEffect(() => {
    // ... (existing useEffect for tasks and submissions)
    const unsubscribeTasks = onSnapshot(collection(db, 'tasks'), async (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      
      const requests = [];
      const managed = [];

      for (const task of tasksData) {
        if (task.status === 'pending_approval') {
          if (task.createdBy && !task.userEmail) {
            const userRef = doc(db, 'users', task.createdBy);
            const userSnap = await getDoc(userRef);
            task.userEmail = userSnap.exists() ? (userSnap.data() as User).email : 'Unknown User';
          }
          requests.push(task);
        } else if (task.status === 'active' || task.status === 'inactive') {
          managed.push(task);
        }
      }
      
      setTaskRequests(requests);
      setManagedTasks(managed);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching tasks:", error);
      addToast('Error fetching tasks.', 'error');
      setLoading(false);
    });

    const submissionsQuery = query(collection(db, 'userTasks'), where('status', '==', 'submitted'));
    const unsubscribeSubmissions = onSnapshot(submissionsQuery, async (snapshot) => {
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
        setLoadingSubmissions(false);
    }, (error) => {
      console.error("Error fetching submissions:", error);
      addToast('Error fetching submissions.', 'error');
      setLoadingSubmissions(false);
    });

    return () => {
        unsubscribeTasks();
        unsubscribeSubmissions();
    };
  }, [addToast]);

  const paginatedSubmissions = useMemo(() => {
    const startIndex = (currentSubmissionsPage - 1) * ITEMS_PER_PAGE;
    return submissions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [submissions, currentSubmissionsPage]);

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
  const handleSaveTask = async (task: Omit<Task, 'id'>) => {
    // ... (existing implementation)
  };
  const openDeleteConfirm = (id: string) => {
    setTaskToDelete(id);
    setIsDeleteConfirmOpen(true);
  };
  const handleDeleteTask = async () => {
    // ... (existing implementation)
  };
  const handleToggleStatus = async (task: Task) => {
    // ... (existing implementation)
  };
  
  const handleApproveRequest = async (task: Task) => {
    setActionLoading(prev => ({...prev, [task.id]: true}));
    try {
        await runTransaction(db, async (transaction) => {
            const settingsRef = doc(db, 'settings', 'global');
            const settingsDoc = await transaction.get(settingsRef);
            const listingFee = settingsDoc.exists() ? (settingsDoc.data().taskListingFee || 0) : 0;

            if (!task.createdBy) throw new Error("Task creator not found.");
            
            const userRef = doc(db, 'users', task.createdBy);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) throw new Error("Task creator not found.");
            if (userDoc.data().balance < listingFee) throw new Error("Creator has insufficient balance for listing fee.");

            const newBalance = userDoc.data().balance - listingFee;
            transaction.update(userRef, { balance: newBalance });

            const taskRef = doc(db, 'tasks', task.id);
            transaction.update(taskRef, { status: 'active' });

            if (listingFee > 0) {
                const revenueRef = collection(db, 'revenueTransactions');
                transaction.set(doc(revenueRef), {
                    adminFeeAmount: listingFee,
                    originalAmount: task.reward,
                    sourceUser: task.createdBy,
                    timestamp: Timestamp.now(),
                    transactionType: 'listing_fee',
                    relatedDocId: task.id,
                });
            }
        });
        addToast("Task request approved and listing fee charged.", "success");
    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        addToast(`Failed to approve task request: ${message}`, "error");
    } finally {
        setActionLoading(prev => ({...prev, [task.id]: false}));
    }
  };

  const openRejectConfirm = (id: string) => {
    setRequestToReject(id);
    setIsRejectConfirmOpen(true);
  };
  const handleRejectRequest = async () => {
    // ... (existing implementation)
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
    // ... (existing implementation)
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


  return (
    <div className="container mx-auto">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Manage Tasks</h1>
        <div className="flex flex-col sm:flex-row gap-2">
            <button
                onClick={handleOpenAiModal}
                className="inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200"
                >
                <SparklesIcon className="w-5 h-5" />
                Create with AI
            </button>
            <button
                onClick={() => handleOpenModal()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200"
            >
                Create New Task
            </button>
        </div>
      </div>
      
      {/* User Task Requests section */}
      {taskRequests.length > 0 && (
        <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">User Task Requests</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {taskRequests.map(task => (
                    <div key={task.id} className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow-md">
                        <h3 className="font-bold truncate">{task.title}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">By: {task.userEmail}</p>
                        <p className="text-sm my-2 line-clamp-2">{task.description}</p>
                        <div className="flex justify-between items-center mt-4">
                            <span className="font-bold text-indigo-600 dark:text-indigo-400">Rs {task.reward.toFixed(2)}</span>
                            <div className="flex gap-2">
                                <button onClick={() => handleApproveRequest(task)} className="p-2 bg-green-100 dark:bg-green-900/50 rounded-full"><CheckIcon className="w-4 h-4 text-green-600 dark:text-green-400"/></button>
                                <button onClick={() => openRejectConfirm(task.id)} className="p-2 bg-red-100 dark:bg-red-900/50 rounded-full"><XIcon className="w-4 h-4 text-red-600 dark:text-red-400" /></button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      )}
      
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Manage Live Tasks</h2>
      {loading ? <p>Loading tasks...</p> : managedTasks.length === 0 ? <p className="text-gray-500 dark:text-gray-400">No active or inactive tasks found.</p> :
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {managedTasks.map(task => (
                <div key={task.id} className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow-md flex flex-col">
                    <div className="flex-grow">
                        <div className="flex justify-between items-start">
                             <h3 className="font-bold text-lg mb-1">{task.title}</h3>
                             <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${task.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'}`}>{task.status}</span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">{task.description}</p>
                    </div>
                    <div className="mt-4 flex justify-between items-center">
                        <span className="font-bold text-xl text-indigo-600 dark:text-indigo-400">Rs {task.reward.toFixed(2)}</span>
                        <div className="flex gap-2">
                            <button onClick={() => handleToggleStatus(task)} className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">{task.status === 'active' ? 'Pause' : 'Activate'}</button>
                            <button onClick={() => handleOpenModal(task)} className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:underline">Edit</button>
                            <button onClick={() => openDeleteConfirm(task.id)} className="text-sm font-medium text-red-500 dark:text-red-400 hover:underline">Delete</button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
      }

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
                    {/* Desktop Table View */}
                    <div className="overflow-x-auto hidden md:block">
                        <table className="min-w-full leading-normal">
                            <thead>
                                <tr>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800">
                                        <Checkbox
                                            checked={selectedSubmissions.size === paginatedSubmissions.length && paginatedSubmissions.length > 0}
                                            onChange={handleSelectAllSubmissions}
                                            indeterminate={selectedSubmissions.size > 0 && selectedSubmissions.size < paginatedSubmissions.length}
                                        />
                                    </th>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">User</th>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Task</th>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedSubmissions.map((sub) => (
                                    <tr key={sub.id}>
                                        <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                                            <Checkbox
                                                checked={selectedSubmissions.has(sub.id)}
                                                onChange={() => handleSelectSubmission(sub.id)}
                                            />
                                        </td>
                                        <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                                            <p className="text-gray-900 dark:text-white whitespace-no-wrap">{sub.userEmail}</p>
                                        </td>
                                        <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                                            <p className="text-gray-900 dark:text-white whitespace-no-wrap">{sub.taskTitle}</p>
                                            <p className="text-gray-600 dark:text-gray-400 whitespace-no-wrap">Reward: Rs {sub.taskReward?.toFixed(2)}</p>
                                        </td>
                                        <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => handleApproveSubmission(sub)} disabled={actionLoading[sub.id]} className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-green-400 transition-colors">
                                                    {actionLoading[sub.id] ? <Spinner /> : <CheckIcon className="w-4 h-4" />}
                                                </button>
                                                <button onClick={() => handleRejectSubmission(sub.id)} disabled={actionLoading[sub.id]} className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-red-400 transition-colors">
                                                    {actionLoading[sub.id] ? <Spinner /> : <XIcon className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="md:hidden">
                        {paginatedSubmissions.map(sub => (
                             <div key={sub.id} className="p-4 border-b border-gray-200 dark:border-slate-800 flex items-start gap-4">
                                <Checkbox
                                    checked={selectedSubmissions.has(sub.id)}
                                    onChange={() => handleSelectSubmission(sub.id)}
                                    className="mt-1"
                                />
                                <div className="flex-1">
                                    <p className="font-semibold text-gray-900 dark:text-white">{sub.taskTitle}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">from {sub.userEmail}</p>
                                    <div className="mt-2 flex justify-between items-center">
                                        <p className="font-bold text-indigo-600 dark:text-indigo-400">Rs {sub.taskReward?.toFixed(2)}</p>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => handleApproveSubmission(sub)} disabled={actionLoading[sub.id]} className="p-2 bg-green-100 dark:bg-green-900/50 rounded-full"><CheckIcon className="w-4 h-4 text-green-600 dark:text-green-400"/></button>
                                            <button onClick={() => handleRejectSubmission(sub.id)} disabled={actionLoading[sub.id]} className="p-2 bg-red-100 dark:bg-red-900/50 rounded-full"><XIcon className="w-4 h-4 text-red-600 dark:text-red-400" /></button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <Pagination 
                        currentPage={currentSubmissionsPage}
                        totalPages={Math.ceil(submissions.length / ITEMS_PER_PAGE)}
                        onPageChange={setCurrentSubmissionsPage}
                    />
                </div>
            </>
        )}
      </div>

      {isModalOpen && ( <TaskModal task={selectedTask} onClose={handleCloseModal} onSave={handleSaveTask} isLoading={actionLoading['create'] || actionLoading['update']} /> )}
      {isAiModalOpen && ( <AiTaskModal onClose={handleCloseModal} onSave={handleSaveTask} /> )}
      <ConfirmationModal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} onConfirm={handleDeleteTask} title="Delete Task" message="Are you sure you want to delete this task? This action cannot be undone." />
      <ConfirmationModal isOpen={isRejectConfirmOpen} onClose={() => setIsRejectConfirmOpen(false)} onConfirm={handleRejectRequest} title="Reject Task Request" message="Are you sure you want to reject this task request? It will be permanently deleted." />
    </div>
  );
};

export default TasksPage;