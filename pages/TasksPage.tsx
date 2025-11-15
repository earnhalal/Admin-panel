import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, runTransaction, getDoc, where, query } from 'firebase/firestore';
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

  useEffect(() => {
    const unsubscribeTasks = onSnapshot(collection(db, 'tasks'), async (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      
      const requests = [];
      const managed = [];

      for (const task of tasksData) {
        if (task.status === 'pending_approval') {
          // Enrich request with user email if not present
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

  const handleOpenModal = (task: Task | null = null) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };
  
  const handleOpenAiModal = () => {
    setIsAiModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setIsAiModalOpen(false);
    setSelectedTask(null);
  };

  const handleSaveTask = async (task: Omit<Task, 'id'>) => {
    const action = selectedTask ? 'update' : 'create';
    setActionLoading(prev => ({ ...prev, [action]: true }));
    try {
      if (selectedTask) {
        const taskRef = doc(db, 'tasks', selectedTask.id);
        await updateDoc(taskRef, task);
        addToast('Task updated successfully!', 'success');
      } else {
        await addDoc(collection(db, 'tasks'), task);
        addToast('Task created successfully!', 'success');
      }
      handleCloseModal();
    } catch (error) {
      console.error('Error saving task:', error);
      addToast(`Error saving task.`, 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [action]: false }));
    }
  };
  
  const openDeleteConfirm = (id: string) => {
    setTaskToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const handleDeleteTask = async () => {
    if (!taskToDelete) return;
    setActionLoading(prev => ({ ...prev, [`delete_${taskToDelete}`]: true }));
    try {
      await deleteDoc(doc(db, 'tasks', taskToDelete));
      addToast('Task deleted successfully.', 'success');
    } catch (error) {
      console.error('Error deleting task:', error);
      addToast('Error deleting task.', 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [`delete_${taskToDelete}`]: false }));
      setIsDeleteConfirmOpen(false);
      setTaskToDelete(null);
    }
  };

  const handleToggleStatus = async (task: Task) => {
    const newStatus = task.status === 'active' ? 'inactive' : 'active';
    setActionLoading(prev => ({...prev, [`toggle_${task.id}`]: true}));
    try {
        const taskRef = doc(db, 'tasks', task.id);
        await updateDoc(taskRef, { status: newStatus });
        addToast(`Task status updated to ${newStatus}.`, 'success');
    } catch (error) {
        console.error('Error toggling task status:', error);
        addToast('Failed to update task status.', 'error');
    } finally {
        setActionLoading(prev => ({...prev, [`toggle_${task.id}`]: false}));
    }
  };

  const handleApproveRequest = async (taskId: string) => {
    setActionLoading(prev => ({...prev, [`approve_${taskId}`]: true}));
    try {
        const taskRef = doc(db, 'tasks', taskId);
        await updateDoc(taskRef, { status: 'active' });
        addToast('Task request approved and is now live.', 'success');
    } catch(e) {
        console.error("Error approving task request:", e);
        addToast('Failed to approve task request.', 'error');
    } finally {
        setActionLoading(prev => ({...prev, [`approve_${taskId}`]: false}));
    }
  };

  const openRejectConfirm = (id: string) => {
    setRequestToReject(id);
    setIsRejectConfirmOpen(true);
  };

  const handleRejectRequest = async () => {
    if (!requestToReject) return;
    setActionLoading(prev => ({...prev, [`reject_${requestToReject}`]: true}));
    try {
        await deleteDoc(doc(db, 'tasks', requestToReject));
        addToast('Task request rejected and removed.', 'success');
    } catch (e) {
        console.error("Error rejecting task request:", e);
        addToast('Failed to reject task request.', 'error');
    } finally {
        setActionLoading(prev => ({...prev, [`reject_${requestToReject}`]: false}));
        setIsRejectConfirmOpen(false);
        setRequestToReject(null);
    }
  };
  
  const handleApproveSubmission = async (submission: UserTask) => {
    setActionLoading(prev => ({...prev, [submission.id]: true}));
    try {
        await runTransaction(db, async (transaction) => {
            const userRef = doc(db, 'users', submission.userId);
            const submissionRef = doc(db, 'userTasks', submission.id);

            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) throw "User document not found!";
            
            const newBalance = userDoc.data().balance + (submission.taskReward || 0);
            
            transaction.update(userRef, { balance: newBalance });
            transaction.update(submissionRef, { status: 'approved' });
        });
        addToast('Submission approved!', 'success');
    } catch (error) {
        console.error("Transaction failed: ", error);
        addToast('Approval failed.', 'error');
    } finally {
        setActionLoading(prev => ({...prev, [submission.id]: false}));
    }
  };

  const handleRejectSubmission = async (submissionId: string) => {
      setActionLoading(prev => ({...prev, [submissionId]: true}));
      try {
          const submissionRef = doc(db, 'userTasks', submissionId);
          await updateDoc(submissionRef, { status: 'rejected' });
          addToast('Submission rejected.', 'success');
      } catch (error) {
          console.error("Error rejecting submission: ", error);
          addToast('Rejection failed.', 'error');
      } finally {
          setActionLoading(prev => ({...prev, [submissionId]: false}));
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
      
      {/* User Task Requests */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">User Task Requests</h2>
        {loading ? <p>Loading requests...</p> : taskRequests.length === 0 ? (
            <p className="text-center py-10 text-gray-500 dark:text-gray-400">No pending task requests from users.</p>
        ) : (
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full leading-normal">
                         <thead>
                            <tr>
                                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Task Details</th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Reward</th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Submitted By</th>
                                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {taskRequests.map((req) => (
                                <tr key={req.id}>
                                    <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 text-sm">
                                        <p className="font-semibold text-gray-900 dark:text-white">{req.title}</p>
                                        <p className="text-gray-600 dark:text-gray-400">{req.description.substring(0, 50)}...</p>
                                    </td>
                                    <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 text-sm">
                                        <p className="text-gray-900 dark:text-white">Rs {req.reward.toFixed(2)}</p>
                                    </td>
                                     <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 text-sm">
                                        <p className="text-gray-900 dark:text-white">{req.userEmail || 'N/A'}</p>
                                    </td>
                                    <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 text-sm">
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => handleApproveRequest(req.id)} disabled={actionLoading[`approve_${req.id}`]} className="inline-flex items-center justify-center gap-1 text-white bg-green-600 hover:bg-green-700 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:bg-green-400">
                                                {actionLoading[`approve_${req.id}`] ? <Spinner /> : <CheckIcon className="w-4 h-4" />} Approve
                                            </button>
                                            <button onClick={() => openRejectConfirm(req.id)} disabled={actionLoading[`reject_${req.id}`]} className="inline-flex items-center justify-center gap-1 text-white bg-red-600 hover:bg-red-700 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:bg-red-400">
                                                {actionLoading[`reject_${req.id}`] ? <Spinner /> : <XIcon className="w-4 h-4" />} Reject
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
      </div>

      <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Manage Live Tasks</h2>
      {loading ? <p>Loading tasks...</p> : managedTasks.length === 0 ? (
          <p className="text-center py-10 text-gray-500 dark:text-gray-400">No active or inactive tasks found.</p>
      ) : (
        <>
        {/* Desktop Task Table */}
        <div className="hidden md:block bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full leading-normal">
            <thead>
              <tr>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Title</th>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Reward</th>
                 <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {managedTasks.map((task) => (
                <tr key={task.id}>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                    <p className="text-gray-900 dark:text-white whitespace-no-wrap font-semibold">{task.title}</p>
                    <p className="text-gray-600 dark:text-gray-400 whitespace-no-wrap mt-1">{task.description.substring(0, 50)}...</p>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                    <p className="text-gray-900 dark:text-white whitespace-no-wrap">Rs {task.reward.toFixed(2)}</p>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                    <span className={`capitalize px-2 py-1 text-xs font-semibold rounded-full ${task.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'}`}>{task.status}</span>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                    <div className="flex items-center gap-2">
                        <button onClick={() => handleOpenModal(task)} className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-200 font-medium text-xs py-1 px-2 rounded-md bg-indigo-50 dark:bg-indigo-900/50">Edit</button>
                        <button 
                            onClick={() => handleToggleStatus(task)} 
                            className={`font-medium text-xs py-1 px-2 rounded-md ${task.status === 'active' ? 'bg-yellow-50 dark:bg-yellow-900/50 text-yellow-600 hover:text-yellow-900 dark:text-yellow-400 dark:hover:text-yellow-200' : 'bg-green-50 dark:bg-green-900/50 text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-200'}`}
                            disabled={actionLoading[`toggle_${task.id}`]}
                        >
                           {actionLoading[`toggle_${task.id}`] ? <Spinner/> : (task.status === 'active' ? 'Pause' : 'Activate')}
                        </button>
                        <button onClick={() => openDeleteConfirm(task.id)} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200 font-medium text-xs py-1 px-2 rounded-md bg-red-50 dark:bg-red-900/50" disabled={actionLoading[`delete_${task.id}`]}>
                            {actionLoading[`delete_${task.id}`] ? <Spinner /> : 'Delete'}
                        </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
        {/* Mobile Task Cards */}
        <div className="md:hidden grid grid-cols-1 gap-4">
            {managedTasks.map(task => (
                <div key={task.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 space-y-3">
                    <div>
                        <p className="font-bold text-gray-900 dark:text-white">{task.title}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{task.description}</p>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <p className="text-gray-500 dark:text-gray-400">Reward:</p>
                        <p className="font-semibold text-gray-900 dark:text-white">Rs {task.reward.toFixed(2)}</p>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <p className="text-gray-500 dark:text-gray-400">Status:</p>
                        <span className={`capitalize px-2 py-1 text-xs font-semibold rounded-full ${task.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'}`}>{task.status}</span>
                    </div>
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex items-center gap-2">
                         <button onClick={() => handleOpenModal(task)} className="flex-1 text-center py-2 px-4 rounded-md text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/50 hover:bg-indigo-200 dark:hover:bg-indigo-900">Edit</button>
                         <button 
                            onClick={() => handleToggleStatus(task)}
                            className={`flex-1 text-center py-2 px-4 rounded-md text-sm font-medium ${task.status === 'active' ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300' : 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'}`}
                            disabled={actionLoading[`toggle_${task.id}`]}
                         >
                            {actionLoading[`toggle_${task.id}`] ? <Spinner/> : (task.status === 'active' ? 'Pause' : 'Activate')}
                         </button>
                         <button onClick={() => openDeleteConfirm(task.id)} className="flex-1 text-center py-2 px-4 rounded-md text-sm font-medium text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-900" disabled={actionLoading[`delete_${task.id}`]}>
                            {actionLoading[`delete_${task.id}`] ? <Spinner /> : 'Delete'}
                        </button>
                    </div>
                </div>
            ))}
        </div>
        </>
      )}

      <div className="mt-12">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Pending Task Submissions</h2>
        {loadingSubmissions ? <p>Loading submissions...</p> : (
            submissions.length === 0 
            ? <p className="text-center py-10 text-gray-500 dark:text-gray-400">No pending submissions.</p>
            : <>
                {/* Desktop Submissions Table */}
                <div className="hidden md:block bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full leading-normal">
                            <thead>
                                <tr>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">User</th>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Task</th>
                                    <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {submissions.map((sub) => (
                                    <tr key={sub.id}>
                                        <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                                            <p className="text-gray-900 dark:text-white whitespace-no-wrap">{sub.userEmail}</p>
                                        </td>
                                        <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                                            <p className="text-gray-900 dark:text-white whitespace-no-wrap">{sub.taskTitle}</p>
                                            <p className="text-gray-600 dark:text-gray-400 whitespace-no-wrap">Reward: Rs {sub.taskReward?.toFixed(2)}</p>
                                        </td>
                                        <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => handleApproveSubmission(sub)} disabled={actionLoading[sub.id]} className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-green-400 transition-colors">
                                                    {actionLoading[sub.id] ? <Spinner /> : <CheckIcon className="w-4 h-4" />} Approve
                                                </button>
                                                <button onClick={() => handleRejectSubmission(sub.id)} disabled={actionLoading[sub.id]} className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-red-400 transition-colors">
                                                    {actionLoading[sub.id] ? <Spinner /> : <XIcon className="w-4 h-4" />} Reject
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                {/* Mobile Submissions Cards */}
                <div className="md:hidden grid grid-cols-1 gap-4">
                    {submissions.map(sub => (
                        <div key={sub.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 space-y-3">
                             <div>
                                <p className="text-sm text-gray-500 dark:text-gray-400">User</p>
                                <p className="font-semibold text-gray-900 dark:text-white">{sub.userEmail}</p>
                            </div>
                             <div>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Task</p>
                                <p className="font-semibold text-gray-900 dark:text-white">{sub.taskTitle}</p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Reward: Rs {sub.taskReward?.toFixed(2)}</p>
                            </div>
                            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex items-center gap-2">
                                <button onClick={() => handleApproveSubmission(sub)} disabled={actionLoading[sub.id]} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-green-400 transition-colors">
                                    {actionLoading[sub.id] ? <Spinner /> : <><CheckIcon className="w-4 h-4" /> Approve</>}
                                </button>
                                <button onClick={() => handleRejectSubmission(sub.id)} disabled={actionLoading[sub.id]} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-red-400 transition-colors">
                                    {actionLoading[sub.id] ? <Spinner /> : <><XIcon className="w-4 h-4" /> Reject</>}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </>
        )}
      </div>

      {isModalOpen && (
        <TaskModal
          task={selectedTask}
          onClose={handleCloseModal}
          onSave={handleSaveTask}
          isLoading={actionLoading['create'] || actionLoading['update']}
        />
      )}
      {isAiModalOpen && (
        <AiTaskModal
            onClose={handleCloseModal}
            onSave={handleSaveTask}
        />
      )}
      <ConfirmationModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleDeleteTask}
        title="Delete Task"
        message="Are you sure you want to delete this task? This action cannot be undone."
      />
       <ConfirmationModal
        isOpen={isRejectConfirmOpen}
        onClose={() => setIsRejectConfirmOpen(false)}
        onConfirm={handleRejectRequest}
        title="Reject Task Request"
        message="Are you sure you want to reject this task request? It will be permanently deleted."
      />
    </div>
  );
};

export default TasksPage;