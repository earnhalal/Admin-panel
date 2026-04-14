import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useToast } from '../contexts/ToastContext';
import { 
    Globe, 
    Plus, 
    Trash2, 
    ExternalLink, 
    Clock, 
    CheckCircle2, 
    XCircle,
    Edit3,
    Youtube,
    Instagram,
    Facebook,
    Twitter,
    MessageCircle
} from 'lucide-react';
import Spinner from '../components/Spinner';
import ConfirmationModal from '../components/ConfirmationModal';

export type TaskType = 'youtube' | 'instagram' | 'facebook' | 'twitter' | 'telegram' | 'other' | 'website';

interface Task {
  id: string;
  title: string;
  description?: string;
  platform: TaskType;
  reward: number;
  link: string;
  status: 'active' | 'inactive';
  createdAt: Timestamp;
  views: number;
  totalLimit: number;
}

interface UserTask {
  id: string;
  userId: string;
  taskId: string;
  status: 'submitted' | 'approved' | 'rejected';
  submittedAt: Timestamp;
  taskTitle?: string;
  taskReward?: number;
  proofUrl?: string;
}

export type { Task, UserTask };

const PLATFORM_ICONS = {
  youtube: <Youtube className="text-red-600" size={20} />,
  instagram: <Instagram className="text-pink-500" size={20} />,
  facebook: <Facebook className="text-blue-600" size={20} />,
  twitter: <Twitter className="text-sky-500" size={20} />,
  telegram: <MessageCircle className="text-blue-400" size={20} />,
  other: <Globe className="text-gray-500" size={20} />
};

const SocialTasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const { addToast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    platform: 'youtube' as Task['platform'],
    reward: 0.20,
    link: '',
    status: 'active' as 'active' | 'inactive',
    totalLimit: 100,
    views: 0
  });

  useEffect(() => {
    const q = query(collection(db, 'social_tasks'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      setTasks(data);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching social tasks:", error);
      addToast("Failed to fetch social tasks.", "error");
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleOpenModal = (task: Task | null = null) => {
    if (task) {
      setSelectedTask(task);
      setFormData({
        title: task.title,
        description: task.description || '',
        platform: task.platform,
        reward: task.reward,
        link: task.link,
        status: task.status,
        totalLimit: task.totalLimit || 0,
        views: task.views || 0
      });
    } else {
      setSelectedTask(null);
      setFormData({
        title: '',
        description: '',
        platform: 'youtube',
        reward: 0.20,
        link: '',
        status: 'active',
        totalLimit: 100,
        views: 0
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.reward < 0.20) {
        addToast("Minimum reward must be 0.20", "error");
        return;
    }
    setActionLoading(true);
    try {
      if (selectedTask) {
        await updateDoc(doc(db, 'social_tasks', selectedTask.id), formData);
        addToast("Social task updated successfully!", "success");
      } else {
        await addDoc(collection(db, 'social_tasks'), {
          ...formData,
          createdAt: Timestamp.now()
        });
        addToast("Social task created successfully!", "success");
      }
      setIsModalOpen(false);
    } catch (error) {
      addToast("Failed to save social task.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!taskToDelete) return;
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, 'social_tasks', taskToDelete));
      addToast("Social task deleted.", "success");
      setIsDeleteConfirmOpen(false);
    } catch (error) {
      addToast("Failed to delete.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="flex justify-center items-center min-h-[400px]"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Globe className="text-indigo-500" /> Social Tasks Management
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage social media engagement tasks for users</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-indigo-600/20"
        >
          <Plus size={20} /> Create Social Task
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-gray-100 dark:border-slate-800">
          <Globe className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">No social tasks yet</h3>
          <p className="text-gray-500 dark:text-gray-400">Start by creating your first social engagement task.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tasks.map((task) => (
            <div key={task.id} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
              <div className="p-6 flex-grow">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-gray-50 dark:bg-slate-800 rounded-lg">
                      {PLATFORM_ICONS[task.platform]}
                    </div>
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{task.platform}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleOpenModal(task)} className="p-2 text-gray-400 hover:text-indigo-500 transition-colors">
                      <Edit3 size={18} />
                    </button>
                    <button onClick={() => { setTaskToDelete(task.id); setIsDeleteConfirmOpen(true); }} className="p-2 text-gray-400 hover:text-rose-500 transition-colors">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{task.title}</h3>
                
                <div className="space-y-3 mt-4">
                  <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                    <span className="text-xs text-gray-500">Progress</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                        {task.views || 0} / {task.totalLimit || '∞'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                    <span className="text-xs text-gray-500">Remaining</span>
                    <span className="text-sm font-bold text-amber-600">
                        {Math.max(0, (task.totalLimit || 0) - (task.views || 0))}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                    <span className="text-xs text-gray-500">Reward</span>
                    <span className="text-sm font-bold text-indigo-600">Rs {task.reward}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                    <span className="text-xs text-gray-500">Status</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${task.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {task.status}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                    <span className="text-xs text-gray-500">Created</span>
                    <span className="text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1">
                      <Clock size={12} /> {task.createdAt?.toDate().toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800">
                <a 
                  href={task.link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 text-sm font-bold hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                >
                  <ExternalLink size={16} /> Open Platform
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {selectedTask ? 'Edit Social Task' : 'New Social Task'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Task Title</label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  placeholder="e.g. Subscribe to our Channel"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px]"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Describe the task steps..."
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Platform</label>
                  <select
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={formData.platform}
                    onChange={(e) => setFormData({...formData, platform: e.target.value as any})}
                  >
                    <option value="youtube">YouTube</option>
                    <option value="instagram">Instagram</option>
                    <option value="facebook">Facebook</option>
                    <option value="twitter">Twitter</option>
                    <option value="telegram">Telegram</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reward (Rs) - Min 0.20</label>
                  <input
                    type="number"
                    required
                    min="0.20"
                    step="0.01"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={formData.reward}
                    onChange={(e) => setFormData({...formData, reward: Number(e.target.value)})}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Total Limit (Views)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={formData.totalLimit}
                    onChange={(e) => setFormData({...formData, totalLimit: Number(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                  <select
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Link</label>
                  <input
                    type="url"
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={formData.link}
                    onChange={(e) => setFormData({...formData, link: e.target.value})}
                    placeholder="https://..."
                  />
                </div>
              
              <button
                type="submit"
                disabled={actionLoading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading ? <Spinner size="sm" /> : <><CheckCircle2 size={20} /> Save Social Task</>}
              </button>
            </form>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Delete Social Task"
        message="Are you sure you want to delete this social task? This action cannot be undone."
      />
    </div>
  );
};

export default SocialTasksPage;
