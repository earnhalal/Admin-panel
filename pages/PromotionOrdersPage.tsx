import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc, getDoc, query, where, Timestamp, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';
import Pagination from '../components/Pagination';
import { 
    Check, 
    X, 
    Search, 
    ArrowLeft, 
    Megaphone, 
    User as UserIcon, 
    ExternalLink,
    Clock,
    DollarSign,
    Target
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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

const PromotionOrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<PromotionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const { addToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(collection(db, 'promotion_orders'), where('status', '==', 'pending'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        
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
        
        enrichedOrders.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
        setOrders(enrichedOrders);
      } catch (error) {
          console.error("Error processing orders:", error);
          addToast('Error fetching promotion orders.', 'error');
      } finally {
        setLoading(false);
      }
    }, (error) => {
      console.error("Error fetching orders:", error);
      addToast('Error fetching promotion orders.', 'error');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [addToast]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => 
      order.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.userEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.title?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [orders, searchTerm]);

  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredOrders.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredOrders, currentPage]);

  const handleApprove = async (order: PromotionOrder) => {
    setActionLoading(prev => ({...prev, [order.id]: true}));
    try {
        // 1. Create Social Task
        await addDoc(collection(db, 'social_tasks'), {
            title: order.title,
            description: order.description || '',
            platform: order.platform || 'other',
            reward: order.reward || 0.20,
            link: order.link,
            totalLimit: order.totalLimit || 100,
            views: 0,
            status: 'active',
            createdAt: Timestamp.now(),
            orderId: order.id,
            userId: order.userId
        });

        // 2. Update Order Status
        await updateDoc(doc(db, 'promotion_orders', order.id), {
            status: 'approved',
            approvedAt: Timestamp.now()
        });

        addToast("Order approved and moved to Social Tasks!", "success");
    } catch (error) {
        addToast("Failed to approve order.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [order.id]: false}));
    }
  };

  const handleReject = async (orderId: string) => {
    setActionLoading(prev => ({...prev, [orderId]: true}));
    try {
        await updateDoc(doc(db, 'promotion_orders', orderId), { 
            status: 'rejected',
            rejectedAt: Timestamp.now()
        });
        addToast("Order rejected.", "success");
    } catch (error) {
        addToast("Failed to reject order.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [orderId]: false}));
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
                <Megaphone className="text-indigo-500" /> Promotion Orders
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Review and approve user promotion requests to become social tasks</p>
        </div>
      </div>

      <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by User, Email or Title..."
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
      </div>

      {paginatedOrders.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-gray-100 dark:border-slate-800">
              <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">No pending orders</h3>
              <p className="text-gray-500 dark:text-gray-400">There are no pending promotion orders to review.</p>
          </div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedOrders.map((order) => (
                  <div key={order.id} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                      <div className="p-6 flex-grow">
                          <div className="flex items-center gap-3 mb-4">
                              <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                  <UserIcon size={20} />
                              </div>
                              <div className="overflow-hidden">
                                  <h3 className="font-bold text-gray-900 dark:text-white truncate">{order.userName}</h3>
                                  <p className="text-xs text-indigo-600 dark:text-indigo-400 truncate">{order.userEmail}</p>
                              </div>
                          </div>
                          
                          <h3 className="font-bold text-gray-900 dark:text-white mb-2">{order.title}</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-4">{order.description}</p>

                          <div className="space-y-3">
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1"><DollarSign size={14} /> Reward</span>
                                  <span className="text-sm font-bold text-green-600">Rs {order.reward}</span>
                              </div>
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1"><Target size={14} /> Limit</span>
                                  <span className="text-sm font-bold text-indigo-600">{order.totalLimit} Views</span>
                              </div>
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={14} /> Ordered</span>
                                  <span className="text-xs text-gray-700 dark:text-gray-300">
                                      {order.createdAt?.toDate().toLocaleString()}
                                  </span>
                              </div>
                              <div className="pt-2">
                                  <span className="text-xs text-gray-500 block mb-1">Link</span>
                                  <div className="bg-gray-50 dark:bg-slate-800 p-2 rounded-lg text-xs font-mono text-indigo-600 dark:text-indigo-400 break-all border border-gray-100 dark:border-slate-700">
                                      <a href={order.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                                          {order.link} <ExternalLink size={12} />
                                      </a>
                                  </div>
                              </div>
                          </div>
                      </div>
                      
                      <div className="p-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex gap-3">
                          <button 
                              onClick={() => handleReject(order.id)}
                              disabled={actionLoading[order.id]}
                              className="flex-1 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-sm font-bold hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors flex items-center justify-center gap-2"
                          >
                              {actionLoading[order.id] ? <Spinner size="sm" /> : <><X size={16} /> Reject</>}
                          </button>
                          <button 
                              onClick={() => handleApprove(order)}
                              disabled={actionLoading[order.id]}
                              className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-green-600/20"
                          >
                              {actionLoading[order.id] ? <Spinner size="sm" /> : <><Check size={16} /> Approve</>}
                          </button>
                      </div>
                  </div>
              ))}
          </div>
      )}
      
      {filteredOrders.length > ITEMS_PER_PAGE && (
          <Pagination 
            currentPage={currentPage} 
            totalPages={Math.ceil(filteredOrders.length / ITEMS_PER_PAGE)} 
            onPageChange={setCurrentPage} 
          />
      )}
    </div>
  );
};

export default PromotionOrdersPage;
