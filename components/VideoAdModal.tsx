import React, { useState, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import { VideoAd } from '../pages/VideoAdsPage';
import Spinner from './Spinner';

interface VideoAdModalProps {
  ad: VideoAd | null;
  onClose: () => void;
  onSave: (ad: Omit<VideoAd, 'id' | 'viewsCount' | 'createdAt'>) => void;
  isLoading?: boolean;
}

type AdNetwork = 'HilltopAds' | 'AdMob' | 'Custom';

const VideoAdModal: React.FC<VideoAdModalProps> = ({ ad, onClose, onSave, isLoading }) => {
  // General Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rewardAmount, setRewardAmount] = useState(5);
  const [duration, setDuration] = useState(30);
  const [network, setNetwork] = useState<AdNetwork>('HilltopAds');
  const [maxViews, setMaxViews] = useState(1000);
  const [expiryDate, setExpiryDate] = useState(''); // YYYY-MM-DD
  const [isActive, setIsActive] = useState(true);

  // Network Specific Fields
  // HilltopAds
  const [htZoneId, setHtZoneId] = useState('');
  const [htScriptUrl, setHtScriptUrl] = useState('https://jolly-garbage.com/dhm.FKzddPGVNWvnZpGrUM/TeUmy9puNZpU/lqkTPyTDY/3pMhT/UOxCMqjhQzt-Ndj/cDxYNZTnEZy/NRQn');
  
  // AdMob
  const [amAdUnitId, setAmAdUnitId] = useState('');

  // Custom
  const [customEmbed, setCustomEmbed] = useState('');

  useEffect(() => {
    if (ad) {
      setTitle(ad.title);
      setDescription(ad.description);
      setRewardAmount(ad.rewardAmount);
      setDuration(ad.duration);
      setNetwork(ad.network);
      setMaxViews(ad.maxViews);
      
      if (ad.expiryDate) {
        const date = ad.expiryDate.toDate();
        setExpiryDate(date.toISOString().split('T')[0]);
      }

      setIsActive(ad.isActive);

      if (ad.network === 'HilltopAds') {
        setHtZoneId(ad.config.zoneId || '');
        setHtScriptUrl(ad.config.scriptUrl || 'https://jolly-garbage.com/dhm.FKzddPGVNWvnZpGrUM/TeUmy9puNZpU/lqkTPyTDY/3pMhT/UOxCMqjhQzt-Ndj/cDxYNZTnEZy/NRQn');
      } else if (ad.network === 'AdMob') {
        setAmAdUnitId(ad.config.adUnitId || '');
      } else if (ad.network === 'Custom') {
        setCustomEmbed(ad.embedCode || '');
      }
    } else {
      // Default state for new ad
      setTitle('');
      setDescription('');
      setRewardAmount(5);
      setDuration(30);
      setNetwork('HilltopAds');
      setMaxViews(1000);
      setExpiryDate('');
      setIsActive(true);
      setHtZoneId('');
      setHtScriptUrl('https://jolly-garbage.com/dhm.FKzddPGVNWvnZpGrUM/TeUmy9puNZpU/lqkTPyTDY/3pMhT/UOxCMqjhQzt-Ndj/cDxYNZTnEZy/NRQn');
      setAmAdUnitId('');
      setCustomEmbed('');
    }
  }, [ad]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let config: any = {};
    let embedCode = '';

    if (network === 'HilltopAds') {
      config = { zoneId: htZoneId, scriptUrl: htScriptUrl };
      // Auto-generate a generic script tag representation
      embedCode = `<script src="${htScriptUrl}" data-zone="${htZoneId}"></script>`;
    } else if (network === 'AdMob') {
      config = { adUnitId: amAdUnitId };
      embedCode = `AdMob Unit: ${amAdUnitId}`; // Placeholder for native implementation
    } else {
      config = {};
      embedCode = customEmbed;
    }

    // Convert expiry date string to Timestamp
    let expiryTimestamp: Timestamp;
    if (expiryDate) {
      expiryTimestamp = Timestamp.fromDate(new Date(expiryDate));
    } else {
      // Default to 1 year from now if not set
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      expiryTimestamp = Timestamp.fromDate(d);
    }

    onSave({
      title,
      description,
      rewardAmount,
      duration,
      network,
      config,
      embedCode,
      maxViews,
      expiryDate: expiryTimestamp,
      isActive
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-2xl my-8">
        <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">
          {ad ? 'Edit Video Ad' : 'Add New Video Ad'}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Ad Title</label>
              <input 
                type="text" 
                value={title} 
                onChange={e => setTitle(e.target.value)} 
                className="shadow appearance-none border rounded-xl w-full py-2.5 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500" 
                required 
                placeholder="e.g., Watch & Earn Bonus"
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Description</label>
              <input 
                type="text" 
                value={description} 
                onChange={e => setDescription(e.target.value)} 
                className="shadow appearance-none border rounded-xl w-full py-2.5 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600" 
                required 
                placeholder="Brief description for the user"
              />
            </div>

            <div>
              <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Reward Amount</label>
              <input 
                type="number" 
                value={rewardAmount} 
                onChange={e => setRewardAmount(parseFloat(e.target.value))} 
                className="shadow appearance-none border rounded-xl w-full py-2.5 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600" 
                required 
              />
            </div>

            <div>
              <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Duration (seconds)</label>
              <input 
                type="number" 
                value={duration} 
                onChange={e => setDuration(parseInt(e.target.value))} 
                className="shadow appearance-none border rounded-xl w-full py-2.5 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600" 
                required 
              />
            </div>
          </div>

          <hr className="border-gray-200 dark:border-gray-700" />

          {/* Network Configuration */}
          <div>
            <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Ad Network</label>
            <select 
              value={network} 
              onChange={e => setNetwork(e.target.value as AdNetwork)}
              className="shadow appearance-none border rounded-xl w-full py-2.5 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="HilltopAds">HilltopAds</option>
              <option value="AdMob">AdMob</option>
              <option value="Custom">Custom / Other</option>
            </select>
          </div>

          <div className="bg-gray-50 dark:bg-slate-700/50 p-4 rounded-xl border border-gray-200 dark:border-gray-600">
            {network === 'HilltopAds' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Zone ID</label>
                  <input 
                    type="text" 
                    value={htZoneId} 
                    onChange={e => setHtZoneId(e.target.value)} 
                    className="shadow appearance-none border rounded-xl w-full py-2.5 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" 
                    required 
                    placeholder="e.g., your_hilltop_zone_id"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Script URL</label>
                  <input 
                    type="url" 
                    value={htScriptUrl} 
                    onChange={e => setHtScriptUrl(e.target.value)} 
                    className="shadow appearance-none border rounded-xl w-full py-2.5 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" 
                    required 
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Embed code will be auto-generated based on these values.</p>
              </div>
            )}

            {network === 'AdMob' && (
              <div>
                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Ad Unit ID</label>
                <input 
                  type="text" 
                  value={amAdUnitId} 
                  onChange={e => setAmAdUnitId(e.target.value)} 
                  className="shadow appearance-none border rounded-xl w-full py-2.5 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700" 
                  required 
                  placeholder="ca-app-pub-xxxxxxxxxxxxxxxx/yyyyyyyyyy"
                />
              </div>
            )}

            {network === 'Custom' && (
              <div>
                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Full Embed Code</label>
                <textarea 
                  value={customEmbed} 
                  onChange={e => setCustomEmbed(e.target.value)} 
                  className="shadow appearance-none border rounded-xl w-full py-2.5 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 h-32 font-mono text-sm" 
                  required 
                  placeholder="Paste HTML/JS snippet here..."
                />
              </div>
            )}
          </div>

          <hr className="border-gray-200 dark:border-gray-700" />

          {/* Limits & Settings */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div>
              <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Max Views Allowed</label>
              <input 
                type="number" 
                value={maxViews} 
                onChange={e => setMaxViews(parseInt(e.target.value))} 
                className="shadow appearance-none border rounded-xl w-full py-2.5 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600" 
                required 
              />
            </div>
            
            <div>
              <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Expiry Date</label>
              <input 
                type="date" 
                value={expiryDate} 
                onChange={e => setExpiryDate(e.target.value)} 
                className="shadow appearance-none border rounded-xl w-full py-2.5 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600" 
                required 
              />
            </div>

            <div className="flex items-end pb-3">
              <label className="flex items-center cursor-pointer">
                <div className="relative">
                  <input 
                    type="checkbox" 
                    className="sr-only" 
                    checked={isActive} 
                    onChange={e => setIsActive(e.target.checked)}
                  />
                  <div className={`block w-14 h-8 rounded-full transition-colors ${isActive ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-slate-600'}`}></div>
                  <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${isActive ? 'transform translate-x-6' : ''}`}></div>
                </div>
                <div className="ml-3 text-gray-700 dark:text-gray-300 font-bold">
                  {isActive ? 'Active' : 'Inactive'}
                </div>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-slate-600 hover:bg-gray-300 dark:hover:bg-slate-500 font-bold transition-colors"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 font-bold transition-colors inline-flex items-center disabled:bg-indigo-400"
              disabled={isLoading}
            >
              {isLoading && <Spinner />}
              {ad ? 'Update Video Ad' : 'Create Video Ad'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VideoAdModal;