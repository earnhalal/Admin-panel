import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, runTransaction, getDoc, where, query } from 'firebase/firestore';
import { db } from '../services/firebase';
import TaskModal from '../components/TaskModal';
import { User } from './UsersPage';
import { useToast } from '../contexts/ToastContext';
import ConfirmationModal from '../components/ConfirmationModal';
import Spinner from '../components/Spinner';

export interface Task {
  id: string;
  title: string;
  description: string;
  reward: number;
  status: 'active' | 'inactive';
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submissions, setSubmissions] = useState<UserTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});
  const { addToast } = useToast();
  
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeTasks = onSnapshot(collection(db, 'tasks'), (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      setTasks(tasksData);
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

  const handleCloseModal = () => {
    setIsModalOpen(false);
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
    setIsConfirmOpen(true);
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
      setIsConfirmOpen(false);
      setTaskToDelete(null);
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Manage Tasks</h1>
        <button
          onClick={() => handleOpenModal()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200"
        >
          Create New Task
        </button>
      </div>
      {loading ? <p>Loading tasks...</p> : (
        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
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
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                    <p className="text-gray-900 dark:text-white whitespace-no-wrap font-semibold">{task.title}</p>
                    <p className="text-gray-600 dark:text-gray-400 whitespace-no-wrap mt-1">{task.description.substring(0, 50)}...</p>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                    <p className="text-gray-900 dark:text-white whitespace-no-wrap">Rs {task.reward.toFixed(2)}</p>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                    <span className={`capitalize px-2 py-1 text-xs font-semibold rounded-full ${task.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'}`}>{task.status}</span>
                  </td>
                  <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                    <button onClick={() => handleOpenModal(task)} className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-200 mr-4">Edit</button>
                    <button onClick={() => openDeleteConfirm(task.id)} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200 flex items-center" disabled={actionLoading[`delete_${task.id}`]}>
                        {actionLoading[`delete_${task.id}`] && <Spinner />} Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      <div className="mt-12">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Pending Task Submissions</h2>
        {loadingSubmissions ? <p>Loading submissions...</p> : (
            <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
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
                            {submissions.length > 0 ? submissions.map((sub) => (
                                <tr key={sub.id}>
                                    <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                                        <p className="text-gray-900 dark:text-white whitespace-no-wrap">{sub.userEmail}</p>
                                    </td>
                                    <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                                        <p className="text-gray-900 dark:text-white whitespace-no-wrap">{sub.taskTitle}</p>
                                        <p className="text-gray-600 dark:text-gray-400 whitespace-no-wrap">Reward: Rs {sub.taskReward?.toFixed(2)}</p>
                                    </td>
                                    <td className="px-5 py-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm space-x-2">
                                        <button onClick={() => handleApproveSubmission(sub)} disabled={actionLoading[sub.id]} className="bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-3 rounded text-xs disabled:bg-gray-400 inline-flex items-center">
                                            {actionLoading[sub.id] && <Spinner />} Approve
                                        </button>
                                        <button onClick={() => handleRejectSubmission(sub.id)} disabled={actionLoading[sub.id]} className="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded text-xs disabled:bg-gray-400 inline-flex items-center">
                                            {actionLoading[sub.id] && <Spinner />} Reject
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={3} className="text-center py-10 text-gray-500 dark:text-gray-400">No pending submissions.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
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
      <ConfirmationModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleDeleteTask}
        title="Delete Task"
        message="Are you sure you want to delete this task? This action cannot be undone."
      />
    </div>
  );
};

export default TasksPage;