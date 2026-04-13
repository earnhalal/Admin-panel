import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useToast } from '../contexts/ToastContext';
import { 
    Megaphone, 
    Plus, 
    Trash2, 
    ExternalLink, 
    Clock, 
    CheckCircle2, 
    XCircle,
    Edit3
} from 'lucide-react';
import Spinner from '../components/Spinner';
import ConfirmationModal from '../components/ConfirmationModal';

interface Promotion {
  id: string;
  title: string;
  description: string;
  reward: number;
  link: string;
  status: 'active' | 'inactive';
  createdAt: Timestamp;
}

const PromotionsPage: React.FC = () => {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPromotion, setSelectedPromotion] = useState<Promotion | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [promoToDelete, setPromoToDelete] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const { addToast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    reward: 0,
    link: '',
    status: 'active' as 'active' | 'inactive'
  });

  useEffect(() => {
    const q = query(collection(db, 'promotions'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promotion));
      setPromotions(data);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching promotions:", error);
      addToast("Failed to fetch promotions.", "error");
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleOpenModal = (promo: Promotion | null = null) => {
    if (promo) {
      setSelectedPromotion(promo);
      setFormData({
        title: promo.title,
        description: promo.description,
        reward: promo.reward,
        link: promo.link,
        status: promo.status
      });
    } else {
      setSelectedPromotion(null);
      setFormData({
        title: '',
        description: '',
        reward: 0,
        link: '',
        status: 'active'
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      if (selectedPromotion) {
        await updateDoc(doc(db, 'promotions', selectedPromotion.id), formData);
        addToast("Promotion updated successfully!", "success");
      } else {
        await addDoc(collection(db, 'promotions'), {
          ...formData,
          createdAt: Timestamp.now()
        });
        addToast("Promotion created successfully!", "success");
      }
      setIsModalOpen(false);
    } catch (error) {
      addToast("Failed to save promotion.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!promoToDelete) return;
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, 'promotions', promoToDelete));
      addToast("Promotion deleted.", "success");
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
            <Megaphone className="text-indigo-500" /> Promotions Management
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Create and manage promotional tasks for users</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-indigo-600/20"
        >
          <Plus size={20} /> Create Promotion
        </button>
      </div>

      {promotions.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-gray-100 dark:border-slate-800">
          <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">No promotions yet</h3>
          <p className="text-gray-500 dark:text-gray-400">Start by creating your first promotional task.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {promotions.map((promo) => (
            <div key={promo.id} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
              <div className="p-6 flex-grow">
                <div className="flex justify-between items-start mb-4">
                  <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${promo.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {promo.status}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleOpenModal(promo)} className="p-2 text-gray-400 hover:text-indigo-500 transition-colors">
                      <Edit3 size={18} />
                    </button>
                    <button onClick={() => { setPromoToDelete(promo.id); setIsDeleteConfirmOpen(true); }} className="p-2 text-gray-400 hover:text-rose-500 transition-colors">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{promo.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3 mb-4">{promo.description}</p>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                    <span className="text-xs text-gray-500">Reward</span>
                    <span className="text-sm font-bold text-green-600">Rs {promo.reward}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                    <span className="text-xs text-gray-500">Created</span>
                    <span className="text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1">
                      <Clock size={12} /> {promo.createdAt?.toDate().toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800">
                <a 
                  href={promo.link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 text-sm font-bold hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                >
                  <ExternalLink size={16} /> View Link
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
                {selectedPromotion ? 'Edit Promotion' : 'New Promotion'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  placeholder="e.g. Join our Telegram Channel"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea
                  required
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Describe the task..."
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reward (Rs)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={formData.reward}
                    onChange={(e) => setFormData({...formData, reward: Number(e.target.value)})}
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
                {actionLoading ? <Spinner size="sm" /> : <><CheckCircle2 size={20} /> Save Promotion</>}
              </button>
            </form>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Delete Promotion"
        message="Are you sure you want to delete this promotion? This action cannot be undone."
      />
    </div>
  );
};

export default PromotionsPage;
