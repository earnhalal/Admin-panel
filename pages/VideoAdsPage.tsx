import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, orderBy, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useToast } from '../contexts/ToastContext';
import VideoAdModal from '../components/VideoAdModal';
import ConfirmationModal from '../components/ConfirmationModal';
import Spinner from '../components/Spinner';
import Checkbox from '../components/Checkbox';
import { PlayCircle, Trash2, Edit, Eye, Clock, Code, Search, Filter, TrendingUp, DollarSign } from 'lucide-react';

export interface VideoAd {
  id: string;
  title: string;
  description: string;
  rewardAmount: number;
  duration: number; // in seconds
  network: 'HilltopAds' | 'AdMob' | 'Custom' | 'MyAdCash' | 'PropellerAds' | 'MyAdCashManual';
  config: {
    zoneId?: string;
    scriptUrl?: string;
    adUnitId?: string;
  };
  embedCode?: string; // Legacy field, might be empty now
  rawEmbedCode?: string; // PRIMARY FIELD: Stores the final generated HTML/JS code
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

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [networkFilter, setNetworkFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Bulk Selection State
  const [selectedAdIds, setSelectedAdIds] = useState<Set<string>>(new Set());

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

  const filteredAds = useMemo(() => {
    return ads.filter(ad => {
      const matchesSearch = ad.title.toLowerCase().includes(searchTerm.toLowerCase()) || ad.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesNetwork = networkFilter === 'All' || ad.network === networkFilter;
      const matchesStatus = statusFilter === 'All' || (statusFilter === 'Active' ? ad.isActive : !ad.isActive);
      return matchesSearch && matchesNetwork && matchesStatus;
    });
  }, [ads, searchTerm, networkFilter, statusFilter]);

  const stats = useMemo(() => {
      const totalViews = ads.reduce((acc, curr) => acc + (curr.viewsCount || 0), 0);
      const totalSpent = ads.reduce((acc, curr) => acc + ((curr.viewsCount || 0) * curr.rewardAmount), 0);
      return {
          total: ads.length,
          active: ads.filter(a => a.isActive).length,
          views: totalViews,
          spent: totalSpent
      }
  }, [ads]);

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

  // Bulk Selection Handlers
  const handleSelectAd = (id: string) => {
    setSelectedAdIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        return newSet;
    });
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
        setSelectedAdIds(new Set(filteredAds.map(ad => ad.id)));
    } else {
        setSelectedAdIds(new Set());
    }
  };

  const handleBulkAction = async (action: 'activate' | 'deactivate' | 'delete') => {
      setActionLoading(true);
      const batch = writeBatch(db);
      
      selectedAdIds.forEach(id => {
          const adRef = doc(db, 'video_ads', id);
          if (action === 'delete') {
              batch.delete(adRef);
          } else {
              batch.update(adRef, { isActive: action === 'activate' });
          }
      });

      try {
          await batch.commit();
          addToast(`Bulk ${action} successful on ${selectedAdIds.size} items.`, 'success');
          setSelectedAdIds(new Set());
      } catch (error) {
           addToast(`Bulk ${action} failed.`, 'error');
      } finally {
          setActionLoading(false);
      }
  };

  const NetworkBadge: React.FC<{ network: string }> = ({ network }) => {
    const colors: {[key: string]: string} = {
      HilltopAds: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      MyAdCash: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
      MyAdCashManual: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
      PropellerAds: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
      AdMob: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
      Custom: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
    };
    const colorClass = colors[network] || colors.Custom;
    
    return (
      <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${colorClass}`}>
        {network === 'MyAdCashManual' ? 'MyAdCash (Manual)' : network}
      </span>
    );
  };

  return (
    <div className="container mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800">
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Ads</p>
              <p className="text-3xl font-extrabold text-gray-900 dark:text-white mt-2">{stats.total}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800">
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Active Campaigns</p>
              <p className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-2">{stats.active}</p>
          </div>
           <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800">
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Views</p>
              <p className="text-3xl font-extrabold text-blue-600 dark:text-blue-400 mt-2">{stats.views.toLocaleString()}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800">
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estimated Payout</p>
              <p className="text-3xl font-extrabold text-purple-600 dark:text-purple-400 mt-2">Rs {stats.spent.toLocaleString()}</p>
          </div>
      </div>
      
      {/* Filters & Bulk Actions Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4 items-center w-full">
            <div className="relative flex-grow w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input 
                    type="text" 
                    placeholder="Search ads..." 
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
             <div className="flex gap-4 w-full md:w-auto">
                 <select 
                    className="px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={networkFilter}
                    onChange={(e) => setNetworkFilter(e.target.value)}
                 >
                     <option value="All">All Networks</option>
                     <option value="MyAdCash">MyAdCash</option>
                     <option value="MyAdCashManual">MyAdCash (Manual)</option>
                     <option value="HilltopAds">HilltopAds</option>
                     <option value="Custom">Custom</option>
                 </select>
                 <select 
                    className="px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                 >
                     <option value="All">All Status</option>
                     <option value="Active">Active</option>
                     <option value="Inactive">Inactive</option>
                 </select>
            </div>
          </div>
          
          {selectedAdIds.size > 0 && (
             <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg border border-indigo-100 dark:border-indigo-800 animate-fade-in">
                 <span className="text-sm font-bold text-indigo-800 dark:text-indigo-300">{selectedAdIds.size} items selected</span>
                 <div className="flex gap-2">
                     <button onClick={() => handleBulkAction('activate')} className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 rounded-md hover:bg-indigo-700">Activate</button>
                     <button onClick={() => handleBulkAction('deactivate')} className="px-3 py-1.5 text-xs font-bold text-white bg-amber-500 rounded-md hover:bg-amber-600">Deactivate</button>
                     <button onClick={() => handleBulkAction('delete')} className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 rounded-md hover:bg-rose-700">Delete</button>
                 </div>
             </div>
          )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : filteredAds.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-gray-300 dark:border-slate-700">
           <PlayCircle size={48} className="mx-auto text-gray-300 mb-4" />
           <p className="text-gray-500 dark:text-gray-400 text-lg">No ads found matching filters.</p>
           {ads.length === 0 && <button onClick={() => handleOpenModal()} className="mt-4 text-indigo-600 hover:underline font-bold">Create your first ad</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="col-span-full mb-2 flex items-center gap-2 px-2">
              <Checkbox 
                checked={selectedAdIds.size === filteredAds.length && filteredAds.length > 0} 
                onChange={handleSelectAll} 
                className="w-5 h-5"
              />
              <span className="text-sm font-medium text-gray-500">Select All Visible</span>
          </div>

          {filteredAds.map(ad => (
            <div key={ad.id} className={`bg-white dark:bg-slate-900 rounded-2xl shadow-sm border transition-all duration-200 hover:shadow-md ${ad.isActive ? 'border-gray-100 dark:border-slate-800' : 'border-gray-200 dark:border-slate-800 opacity-75'}`}>
              <div className="p-6">
                <div className="flex justify-between items-start mb-3">
                   <div className="flex items-center gap-3">
                       <Checkbox 
                          checked={selectedAdIds.has(ad.id)} 
                          onChange={() => handleSelectAd(ad.id)} 
                       />
                       <NetworkBadge network={ad.network} />
                   </div>
                   <div className="flex items-center gap-1">
                      <span className={`w-2.5 h-2.5 rounded-full ${ad.isActive ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-slate-600'}`}></span>
                      <span className="text-xs font-bold text-gray-500 uppercase">{ad.isActive ? 'Active' : 'Inactive'}</span>
                   </div>
                </div>
                
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1 line-clamp-1" title={ad.title}>{ad.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 line-clamp-2">{ad.description}</p>
                
                {/* Visual Stats Grid */}
                <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm mb-4 p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl">
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300" title="Reward Per View">
                        <DollarSign size={16} className="text-indigo-500" />
                        <span className="font-bold">Rs {ad.rewardAmount}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300" title="Duration">
                        <Clock size={16} className="text-blue-500" />
                        <span>{ad.duration}s</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 col-span-2" title="Total Budget Used">
                         <TrendingUp size={16} className="text-purple-500" />
                         <span className="text-xs">Spent: </span>
                         <span className="font-bold">Rs {(ad.rewardAmount * ad.viewsCount).toLocaleString()}</span>
                    </div>
                </div>
                
                {/* Progress Bar */}
                <div className="mb-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span className="flex items-center gap-1"><Eye size={12}/> {ad.viewsCount} views</span>
                        <span>Max: {ad.maxViews}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                        <div 
                            className="bg-indigo-500 h-2 rounded-full transition-all duration-500" 
                            style={{ width: `${Math.min((ad.viewsCount / ad.maxViews) * 100, 100)}%` }}
                        ></div>
                    </div>
                </div>

                <div className="flex gap-2 border-t border-gray-100 dark:border-slate-800 pt-4">
                   <button 
                      onClick={() => handleToggleActive(ad)} 
                      className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${ad.isActive ? 'border-amber-200 text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40' : 'border-indigo-200 text-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40'}`}
                   >
                      {ad.isActive ? 'Deactivate' : 'Activate'}
                   </button>
                   <button onClick={() => handleOpenModal(ad)} className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
                      <Edit size={18} />
                   </button>
                   <button onClick={() => { setAdToDelete(ad.id); setIsDeleteConfirmOpen(true); }} className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg border border-gray-200 dark:border-slate-700">
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