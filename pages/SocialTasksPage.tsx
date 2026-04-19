import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, orderBy, where, getDoc, getDocs } from 'firebase/firestore';
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
    MessageCircle,
    Megaphone,
    Search,
    User as UserIcon,
    DollarSign,
    Target,
    Check,
    X,
    RefreshCcw
} from 'lucide-react';
import Spinner from '../components/Spinner';
import ConfirmationModal from '../components/ConfirmationModal';
import Pagination from '../components/Pagination';

export type TaskType = 'youtube' | 'instagram' | 'facebook' | 'twitter' | 'telegram' | 'other' | 'website';

export interface Task {
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
  userId?: string;
  orderId?: string;
}

export interface UserTask {
  id: string;
  userId: string;
  taskId: string;
  status: 'submitted' | 'approved' | 'rejected';
  submittedAt: Timestamp;
  taskTitle?: string;
  taskReward?: number;
  proofUrl?: string;
}

interface PromotionOrder {
  id: string;
  userId: string;
  title: string;
  description: string;
  reward: number;
  link: string;
  platform: string;
  totalLimit: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Timestamp;
  userName?: string;
  userEmail?: string;
}

const PLATFORM_ICONS = {
  youtube: <Youtube className="text-red-600" size={20} />,
  instagram: <Instagram className="text-pink-500" size={20} />,
  facebook: <Facebook className="text-blue-600" size={20} />,
  twitter: <Twitter className="text-sky-500" size={20} />,
  telegram: <MessageCircle className="text-blue-400" size={20} />,
  other: <Globe className="text-gray-500" size={20} />,
  website: <Globe className="text-indigo-500" size={20} />
};

const SocialTasksPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'existing' | 'requests'>('existing');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [orders, setOrders] = useState<PromotionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});
  const [saveLoading, setSaveLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  
  const { addToast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    platform: 'youtube' as TaskType,
    reward: 0.20,
    link: '',
    status: 'active' as 'active' | 'inactive',
    totalLimit: 100,
    views: 0
  });

  useEffect(() => {
    setLoading(true);
    // 1. Fetch Existing Social Tasks
    const tasksQuery = query(collection(db, 'social_tasks'), orderBy('createdAt', 'desc'));
    const unsubscribeTasks = onSnapshot(tasksQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => {
          const d = doc.data();
          return { 
              id: doc.id, 
              ...d,
              reward: d.reward !== undefined ? d.reward : (d.amount !== undefined ? d.amount : 0)
          } as Task;
      });
      setTasks(data);
      if (activeTab === 'existing') setLoading(false);
    }, (error) => {
      console.error("Error fetching social tasks:", error);
      addToast("Failed to fetch social tasks.", "error");
    });

    // 2. Fetch Pending Promotion Orders
    const ordersQuery = query(collection(db, 'promotion_orders'), where('status', '==', 'pending'));
    const unsubscribeOrders = onSnapshot(ordersQuery, async (snapshot) => {
      try {
        const ordersData = snapshot.docs.map(doc => {
            const data = doc.data();
            return { 
                id: doc.id, 
                ...data,
                // Ensure reward is mapped from amount if reward is missing
                reward: data.reward !== undefined ? data.reward : (data.amount !== undefined ? data.amount : 0)
            } as any;
        });
        
        // Sort manually to avoid composite index requirement
        ordersData.sort((a, b) => {
          const timeA = a.createdAt?.toMillis() || 0;
          const timeB = b.createdAt?.toMillis() || 0;
          return timeB - timeA;
        });
        
        const enrichedOrders = await Promise.all(ordersData.map(async (order) => {
            let userName = order.userName;
            let userEmail = order.userEmail;
            
            if (!userName || !userEmail) {
                const userRef = doc(db, 'users', order.userId);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    const userData = userSnap.data();
                    userName = userName || userData.username || userData.name || 'Anonymous';
                    userEmail = userEmail || userData.email || 'N/A';
                }
            }

            return {
                ...order,
                userName: userName || 'Anonymous',
                userEmail: userEmail || 'N/A',
            } as PromotionOrder;
        }));
        
        setOrders(enrichedOrders);
        if (activeTab === 'requests') setLoading(false);
      } catch (error) {
          console.error("Error processing orders:", error);
      } finally {
          setLoading(false);
      }
    }, (error) => {
      console.error("Error fetching orders:", error);
      setLoading(false);
    });

    return () => {
      unsubscribeTasks();
      unsubscribeOrders();
    };
  }, [addToast, activeTab]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => 
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.platform.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [tasks, searchTerm]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => 
      order.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.title?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [orders, searchTerm]);

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
    setSaveLoading(true);
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
      setSaveLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!taskToDelete) return;
    setSaveLoading(true);
    try {
      await deleteDoc(doc(db, 'social_tasks', taskToDelete));
      addToast("Social task deleted.", "success");
      setIsDeleteConfirmOpen(false);
    } catch (error) {
      addToast("Failed to delete.", "error");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleApproveOrder = async (order: PromotionOrder) => {
    setActionLoading(prev => ({...prev, [order.id]: true}));
    try {
        await addDoc(collection(db, 'social_tasks'), {
            title: order.title || 'Untitled',
            description: order.description || '',
            platform: (order.platform as TaskType) || 'other',
            reward: order.reward || 0.20,
            link: order.link || '',
            totalLimit: order.totalLimit || 100,
            views: 0,
            status: 'active',
            createdAt: Timestamp.now(),
            orderId: order.id,
            userId: order.userId
        });

        await updateDoc(doc(db, 'promotion_orders', order.id), {
            status: 'approved',
            approvedAt: Timestamp.now()
        });

        addToast("Promotion approved and added to tasks!", "success");
    } catch (error: any) {
        addToast(`Approval failed: ${error.message}`, "error");
    } finally {
        setActionLoading(prev => ({...prev, [order.id]: false}));
    }
  };

  const handleRejectOrder = async (orderId: string) => {
    setActionLoading(prev => ({...prev, [orderId]: true}));
    try {
        await updateDoc(doc(db, 'promotion_orders', orderId), { 
            status: 'rejected',
            rejectedAt: Timestamp.now()
        });
        addToast("Order rejected.", "success");
    } catch (error) {
        addToast("Failed to reject.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [orderId]: false}));
    }
  };

  const handleSyncData = async () => {
    setActionLoading(prev => ({...prev, 'sync': true}));
    try {
        // 1. Sync social_tasks
        const tasksSnap = await getDocs(collection(db, 'social_tasks'));
        for (const d of tasksSnap.docs) {
            const data = d.data();
            let finalReward = data.reward;

            // If reward is missing but amount exists
            if (data.reward === undefined && data.amount !== undefined) {
                finalReward = data.amount;
            }

            // Cross-check with original order if reward is still missing or default
            if ((finalReward === undefined || finalReward === 0 || finalReward === 0.20) && data.orderId) {
                const orderRef = doc(db, 'promotion_orders', data.orderId);
                const orderSnap = await getDoc(orderRef);
                if (orderSnap.exists()) {
                    const orderData = orderSnap.data();
                    const orderReward = orderData.reward !== undefined ? orderData.reward : orderData.amount;
                    if (orderReward !== undefined && orderReward !== finalReward) {
                        finalReward = orderReward;
                    }
                }
            }

            if (finalReward !== undefined && finalReward !== data.reward) {
                await updateDoc(doc(db, 'social_tasks', d.id), { reward: finalReward });
            }
        }

        // 2. Sync promotion_orders
        const ordersSnap = await getDocs(collection(db, 'promotion_orders'));
        for (const d of ordersSnap.docs) {
            const data = d.data();
            if (data.amount !== undefined && data.reward === undefined) {
                await updateDoc(doc(db, 'promotion_orders', d.id), { reward: data.amount });
            }
        }
        
        addToast("Data synced successfully!", "success");
    } catch (error) {
        addToast("Sync failed.", "error");
    } finally {
        setActionLoading(prev => ({...prev, 'sync': false}));
    }
  };

  if (loading) return <div className="flex justify-center items-center min-h-[400px]"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Globe className="text-indigo-500" /> Social Tasks
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage engagement tasks and user promotion requests</p>
        </div>
        <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSyncData}
              disabled={actionLoading['sync']}
              className="inline-flex items-center justify-center gap-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 font-bold py-2.5 px-4 rounded-xl transition-all shadow-sm hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              {actionLoading['sync'] ? <Spinner size="sm" /> : <RefreshCcw size={18} />}
              <span className="hidden sm:inline">Sync Data</span>
            </button>
            <button
              onClick={() => handleOpenModal()}
              className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-indigo-600/20"
            >
              <Plus size={20} /> Create Social Task
            </button>
        </div>
      </div>

      <div className="flex border-b border-gray-100 dark:border-slate-800">
          <button 
            onClick={() => setActiveTab('existing')}
            className={`px-6 py-3 font-bold text-sm transition-colors border-b-2 ${activeTab === 'existing' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
              Existing Tasks ({tasks.length})
          </button>
          <button 
            onClick={() => setActiveTab('requests')}
            className={`px-6 py-3 font-bold text-sm transition-colors border-b-2 ${activeTab === 'requests' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'} flex items-center gap-2`}
          >
              User Requests {orders.length > 0 && <span className="w-5 h-5 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full pulse">{orders.length}</span>}
          </button>
      </div>

      <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder={activeTab === 'existing' ? "Search tasks..." : "Search user requests..."}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
      </div>

      {activeTab === 'existing' ? (
          tasks.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-gray-100 dark:border-slate-800">
              <Globe className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">No social tasks yet</h3>
              <p className="text-gray-500 dark:text-gray-400">Start by creating your first social engagement task.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTasks.map((task) => (
                <div key={task.id} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                   <div className="p-6 flex-grow">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-gray-50 dark:bg-slate-800 rounded-lg">
                          {PLATFORM_ICONS[task.platform] || PLATFORM_ICONS['other']}
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
                    
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 line-clamp-1">{task.title}</h3>
                    
                    <div className="space-y-3 mt-4 text-sm font-medium">
                      <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800/50">
                        <span className="text-xs text-gray-500">Progress</span>
                        <div className="flex items-center gap-2">
                            <span className="text-gray-900 dark:text-white">
                                {task.views || 0} / {task.totalLimit || '∞'}
                            </span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800/50">
                        <span className="text-xs text-gray-500">Reward</span>
                        <span className="font-bold text-emerald-600">Rs {task.reward}</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800/50">
                        <span className="text-xs text-gray-500">Status</span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${task.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'}`}>
                          {task.status}
                        </span>
                      </div>
                       <div className="flex justify-between items-center py-2">
                        <span className="text-xs text-gray-500">Date</span>
                        <span className="text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1 font-normal">
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
                      className="w-full py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 text-xs font-bold hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                    >
                      <ExternalLink size={14} /> Open Link
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )
      ) : (
          orders.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-gray-100 dark:border-slate-800">
                <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">No pending requests</h3>
                <p className="text-gray-500 dark:text-gray-400">User promotion requests will appear here for approval.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredOrders.map((order) => (
                    <div key={order.id} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden flex flex-col hover:border-indigo-200 transition-all">
                        <div className="p-6 flex-grow">
                             <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/40 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                    <UserIcon size={20} />
                                </div>
                                <div className="overflow-hidden">
                                    <h3 className="font-bold text-gray-900 dark:text-white truncate">{order.userName}</h3>
                                    <p className="text-[10px] text-gray-500 font-mono truncate">{order.userId}</p>
                                </div>
                            </div>
                            
                            <h3 className="font-bold text-gray-900 dark:text-white mb-2 line-clamp-1">{order.title}</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-4 h-8">{order.description}</p>

                            <div className="space-y-2 border-t border-gray-50 dark:border-slate-800 pt-3 mt-auto">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] text-gray-500 uppercase flex items-center gap-1 font-bold"><DollarSign size={10} /> Reward</span>
                                    <span className="text-xs font-bold text-green-600">Rs {order.reward}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] text-gray-500 uppercase flex items-center gap-1 font-bold"><Target size={10} /> Limit</span>
                                    <span className="text-xs font-bold text-indigo-600">{order.totalLimit}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] text-gray-500 uppercase flex items-center gap-1 font-bold"><Globe size={10} /> Platform</span>
                                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase">{order.platform}</span>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex gap-2">
                             <button 
                                onClick={() => handleRejectOrder(order.id)}
                                disabled={actionLoading[order.id]}
                                className="flex-1 py-2 rounded-xl border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-[11px] font-bold hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors flex items-center justify-center gap-1"
                            >
                                {actionLoading[order.id] ? <Spinner size="sm" /> : <><X size={14} /> Reject</>}
                            </button>
                            <button 
                                onClick={() => handleApproveOrder(order)}
                                disabled={actionLoading[order.id]}
                                className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1 shadow-lg shadow-emerald-600/20"
                            >
                                {actionLoading[order.id] ? <Spinner size="sm" /> : <><Check size={14} /> Approve</>}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
          )
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-bold uppercase text-[10px]">Task Title</label>
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-bold uppercase text-[10px]">Description</label>
                <textarea
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px]"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Describe the task steps..."
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-bold uppercase text-[10px]">Platform</label>
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
                    <option value="website">Website</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-bold uppercase text-[10px]">Reward (Rs)</label>
                  <input
                    type="number"
                    required
                    min="0.20"
                    step="0.01"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-green-600"
                    value={formData.reward}
                    onChange={(e) => setFormData({...formData, reward: Number(e.target.value)})}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-bold uppercase text-[10px]">Limit (Views)</label>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-bold uppercase text-[10px]">Status</label>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 font-bold uppercase text-[10px]">Link</label>
                  <input
                    type="url"
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-indigo-500"
                    value={formData.link}
                    onChange={(e) => setFormData({...formData, link: e.target.value})}
                    placeholder="https://..."
                  />
                </div>
              
              <button
                type="submit"
                disabled={saveLoading}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saveLoading ? <Spinner size="sm" /> : <><CheckCircle2 size={20} /> Save Social Task</>}
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
        message="Are you sure? This will permanently remove this social task."
      />
    </div>
  );
};

export default SocialTasksPage;
