import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useToast } from '../contexts/ToastContext';
import VideoAdModal from '../components/VideoAdModal';
import ConfirmationModal from '../components/ConfirmationModal';
import Spinner from '../components/Spinner';
import { PlayCircle, Trash2, Edit, Eye, Clock } from 'lucide-react';

export interface VideoAd {
  id: string;
  title: string;
  description: string;
  rewardAmount: number;
  duration: number; // in seconds
  network: 'HilltopAds' | 'AdMob' | 'Custom';
  config: {
    zoneId?: string;
    scriptUrl?: string;
    adUnitId?: string;
  };
  embedCode?: string;
  maxViews: number;
  expiryDate: Timestamp;
  isActive: boolean;
  viewsCount: number;
  createdAt: Timestamp;
}

const VideoAdsPage: React.FC = () => {
  const [ads, setAds] = useState<VideoAd[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAd, setSelectedAd] = useState<VideoAd | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [adToDelete, setAdToDelete] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'video_ads'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const adsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VideoAd));
      setAds(adsData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching video ads:", error);
      addToast('Error fetching video ads', 'error');
      setLoading(false);
    });
    return () => unsubscribe();
  }, [addToast]);

  const handleOpenModal = (ad: VideoAd | null = null) => {
    setSelectedAd(ad);
    setIsModalOpen(true);
  };

  const handleSaveAd = async (adData: Omit<VideoAd, 'id' | 'viewsCount' | 'createdAt'>) => {
    setActionLoading(true);
    try {
      if (selectedAd) {
        await updateDoc(doc(db, 'video_ads', selectedAd.id), adData);
        addToast('Video ad updated successfully!', 'success');
      } else {
        await addDoc(collection(db, 'video_ads'), {
          ...adData,
          viewsCount: 0,
          createdAt: Timestamp.now()
        });
        addToast('Video ad created successfully!', 'success');
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error saving ad:", error);
      addToast('Failed to save video ad.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleActive = async (ad: VideoAd) => {
    try {
      await updateDoc(doc(db, 'video_ads', ad.id), { isActive: !ad.isActive });
      addToast(`Ad ${!ad.isActive ? 'activated' : 'deactivated'}`, 'success');
    } catch (error) {
      addToast('Failed to toggle status', 'error');
    }
  };

  const handleDeleteAd = async () => {
    if (!adToDelete) return;
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, 'video_ads', adToDelete));
      addToast('Video ad deleted successfully', 'success');
    } catch (error) {
      addToast('Failed to delete ad', 'error');
    } finally {
      setActionLoading(false);
      setIsDeleteConfirmOpen(false);
      setAdToDelete(null);
    }
  };

  const NetworkBadge: React.FC<{ network: string }> = ({ network }) => {
    const colors = {
      HilltopAds: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      AdMob: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      Custom: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
    };
    const colorClass = colors[network as keyof typeof colors] || colors.Custom;
    
    return (
      <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${colorClass}`}>
        {network}
      </span>
    );
  };

  return (
    <div className="container mx-auto">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
        <div>
           <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Video Ads Manager</h1>
           <p className="text-gray-500 dark:text-gray-400 mt-1">Manage multiple ad networks and video campaigns.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-5 rounded-xl transition-colors duration-200 shadow-lg shadow-indigo-500/30 flex items-center gap-2"
        >
          <PlayCircle size={20} />
          + Add New Video Ad
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : ads.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-gray-300 dark:border-slate-700">
           <PlayCircle size={48} className="mx-auto text-gray-300 mb-4" />
           <p className="text-gray-500 dark:text-gray-400 text-lg">No video ads created yet.</p>
           <button onClick={() => handleOpenModal()} className="mt-4 text-indigo-600 hover:underline font-bold">Create your first ad</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ads.map(ad => (
            <div key={ad.id} className={`bg-white dark:bg-slate-900 rounded-2xl shadow-sm border transition-all duration-200 hover:shadow-md ${ad.isActive ? 'border-gray-100 dark:border-slate-800' : 'border-gray-200 dark:border-slate-800 opacity-75'}`}>
              <div className="p-6">
                <div className="flex justify-between items-start mb-3">
                   <NetworkBadge network={ad.network} />
                   <div className="flex items-center gap-1">
                      <span className={`w-2.5 h-2.5 rounded-full ${ad.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`}></span>
                      <span className="text-xs font-bold text-gray-500 uppercase">{ad.isActive ? 'Active' : 'Inactive'}</span>
                   </div>
                </div>
                
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1 line-clamp-1" title={ad.title}>{ad.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 line-clamp-2">{ad.description}</p>
                
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm mb-4">
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">Rs {ad.rewardAmount}</span>
                        <span className="text-xs">Reward</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                        <Clock size={14} />
                        <span>{ad.duration}s</span>
                    </div>
                     <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                        <Eye size={14} />
                        <span>{ad.viewsCount} / {ad.maxViews}</span>
                    </div>
                </div>
                
                <div className="text-xs text-gray-400 border-t border-gray-100 dark:border-slate-800 pt-3 mb-4">
                   Expires: {ad.expiryDate?.toDate().toLocaleDateString()}
                </div>

                <div className="flex gap-2">
                   <button 
                      onClick={() => handleToggleActive(ad)} 
                      className={`flex-1 py-2 rounded-lg text-sm font-bold border ${ad.isActive ? 'border-amber-200 text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800' : 'border-emerald-200 text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800'}`}
                   >
                      {ad.isActive ? 'Deactivate' : 'Activate'}
                   </button>
                   <button onClick={() => handleOpenModal(ad)} className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg">
                      <Edit size={18} />
                   </button>
                   <button onClick={() => { setAdToDelete(ad.id); setIsDeleteConfirmOpen(true); }} className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg">
                      <Trash2 size={18} />
                   </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <VideoAdModal 
          ad={selectedAd} 
          onClose={() => setIsModalOpen(false)} 
          onSave={handleSaveAd}
          isLoading={actionLoading} 
        />
      )}

      <ConfirmationModal 
        isOpen={isDeleteConfirmOpen} 
        onClose={() => setIsDeleteConfirmOpen(false)} 
        onConfirm={handleDeleteAd} 
        title="Delete Video Ad" 
        message="Are you sure you want to delete this ad? This action cannot be undone."
      />
    </div>
  );
};

export default VideoAdsPage;