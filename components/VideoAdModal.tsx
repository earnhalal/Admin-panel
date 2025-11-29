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

type AdNetwork = 'HilltopAds' | 'MyAdCash' | 'Custom' | 'PropellerAds' | 'AdMob' | 'MyAdCashManual';

const VideoAdModal: React.FC<VideoAdModalProps> = ({ ad, onClose, onSave, isLoading }) => {
  // General Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rewardAmount, setRewardAmount] = useState(5);
  const [duration, setDuration] = useState(30);
  const [network, setNetwork] = useState<AdNetwork>('MyAdCash');
  const [maxViews, setMaxViews] = useState(1000);
  const [expiryDate, setExpiryDate] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Network Specific Fields
  const [zoneId, setZoneId] = useState(''); // MyAdCash & HilltopAds
  const [scriptUrl, setScriptUrl] = useState('https://jolly-garbage.com/dhm.FKzddPGVNWvnZpGrUM/TeUmy9puNZpU/lqkTPyTDY/3pMhT/UOxCMqjhQzt-Ndj/cDxYNZTnEZy/NRQn'); // HilltopAds
  const [customCode, setCustomCode] = useState(''); // Custom / PropellerAds / AdMob / MyAdCashManual

  useEffect(() => {
    if (ad) {
      setTitle(ad.title);
      setDescription(ad.description);
      setRewardAmount(ad.rewardAmount);
      setDuration(ad.duration);
      setNetwork(ad.network);
      setMaxViews(ad.maxViews);
      setIsActive(ad.isActive);
      
      if (ad.expiryDate) {
        setExpiryDate(ad.expiryDate.toDate().toISOString().split('T')[0]);
      } else {
        // Default expiry 1 year from now if missing
        const d = new Date();
        d.setFullYear(d.getFullYear() + 1);
        setExpiryDate(d.toISOString().split('T')[0]);
      }

      // Populate fields based on network type
      if (ad.network === 'MyAdCash') {
        setZoneId(ad.config?.zoneId || '');
      } else if (ad.network === 'HilltopAds') {
        setZoneId(ad.config?.zoneId || '');
        setScriptUrl(ad.config?.scriptUrl || '');
      } else {
        // For Custom, PropellerAds, AdMob, MyAdCashManual we populate the raw code
        setCustomCode(ad.rawEmbedCode || '');
      }
    } else {
      // Defaults for new ad
      setTitle('');
      setDescription('');
      setRewardAmount(5);
      setDuration(30);
      setNetwork('MyAdCash');
      setMaxViews(1000);
      
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      setExpiryDate(d.toISOString().split('T')[0]);
      
      setIsActive(true);
      setZoneId('');
      setScriptUrl('https://jolly-garbage.com/dhm.FKzddPGVNWvnZpGrUM/TeUmy9puNZpU/lqkTPyTDY/3pMhT/UOxCMqjhQzt-Ndj/cDxYNZTnEZy/NRQn');
      setCustomCode('');
    }
  }, [ad]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let config: any = {};
    let innerAdCode = '';

    // 1. Generate Inner Ad Code based on Network
    if (network === 'MyAdCash') {
      const cleanZoneId = zoneId.trim();
      config = { zoneId: cleanZoneId };
      innerAdCode = `
        <script id="aclib" type="text/javascript" src="//acscdn.com/script/aclib.js" async></script>
        <script type="text/javascript">
          var aclib = aclib || { cmd: [] };
          aclib.cmd.push(function() {
            aclib.runVideoSlider({
              zoneId: '${cleanZoneId}',
              width: '100%',
              height: '100vh'
            });
          });
        </script>
      `;

    } else if (network === 'HilltopAds') {
      const cleanZoneId = zoneId.trim();
      const cleanScriptUrl = scriptUrl.trim();
      config = { zoneId: cleanZoneId, scriptUrl: cleanScriptUrl };
      innerAdCode = `<script src="${cleanScriptUrl}" data-zone="${cleanZoneId}"></script>`;

    } else {
      // Custom, PropellerAds, AdMob, MyAdCashManual
      config = {};
      innerAdCode = customCode;
    }

    // 2. Wrap in PRO Full-Screen Template
    const finalCode = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Video Ad</title>
    <style>
        body, html {
            margin: 0; padding: 0; width: 100%; height: 100%;
            background-color: #000000;
            display: flex; justify-content: center; align-items: center;
            overflow: hidden;
        }
        #loader {
            border: 4px solid #333333;
            border-top: 4px solid #ffffff;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            position: absolute;
            z-index: 10;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        #ad-container {
            width: 100%;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            position: relative;
            z-index: 20;
        }
    </style>
</head>
<body>

    <!-- Loading Spinner -->
    <div id="loader"></div>

    <!-- Ad Content -->
    <div id="ad-container">
        ${innerAdCode}
    </div>

    <script>
        const AD_DURATION_SEC = ${duration};
        let isAdPlaying = false;

        function onAdPlayStart() {
            if (isAdPlaying) return;
            isAdPlaying = true;
            
            // Hide Loader
            const loader = document.getElementById('loader');
            if (loader) loader.style.display = 'none';

            // Send Event: Ad Started
            console.log("Ad Started Playing...");
            if (window.flutter_inappwebview) {
                window.flutter_inappwebview.callHandler('adStartedPlaying');
            }

            // Schedule Completion
            setTimeout(onAdCompleted, AD_DURATION_SEC * 1000);
        }

        function onAdCompleted() {
            console.log("Ad Completed!");
            if (window.flutter_inappwebview) {
                window.flutter_inappwebview.callHandler('adCompleted', 'done');
            }
        }

        // Auto-detect start logic
        window.addEventListener('load', function() {
            // Give ads a moment to render (2.5 seconds buffer)
            setTimeout(onAdPlayStart, 2500);
        });

        // Optional: Listen for specific network events to trigger start earlier if possible
        document.addEventListener('aclibComplete', onAdCompleted); 
    </script>
</body>
</html>`;

    // Expiry Date Logic
    let expiryTimestamp: Timestamp;
    if (expiryDate) {
      expiryTimestamp = Timestamp.fromDate(new Date(expiryDate));
    } else {
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
      // We explicitly clear 'embedCode' (legacy field) to force app to use 'rawEmbedCode'
      embedCode: '', 
      rawEmbedCode: finalCode, // This contains the full PRO template
      maxViews,
      expiryDate: expiryTimestamp,
      isActive
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-100 dark:border-gray-700 flex flex-col max-h-[90vh]">
        
        {/* Header (Fixed) */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {ad ? 'Edit Video Ad' : 'Create New Video Ad'}
            </h2>
        </div>
        
        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto flex-grow">
            <form id="adForm" onSubmit={handleSubmit} className="space-y-6">
            {/* General Information Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Ad Title</label>
                <input 
                    type="text" 
                    value={title} 
                    onChange={e => setTitle(e.target.value)} 
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all" 
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
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all" 
                    required 
                    placeholder="Brief description for the user"
                />
                </div>

                <div>
                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Reward Amount (Rs)</label>
                <input 
                    type="number" 
                    value={rewardAmount} 
                    onChange={e => setRewardAmount(parseFloat(e.target.value))} 
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500" 
                    required 
                />
                </div>

                <div>
                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Duration (seconds)</label>
                <input 
                    type="number" 
                    value={duration} 
                    onChange={e => setDuration(parseInt(e.target.value))} 
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500" 
                    required 
                />
                </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-3">Ad Network</label>
                <div className="relative mb-4">
                    <select
                        value={network}
                        onChange={(e) => setNetwork(e.target.value as AdNetwork)}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 appearance-none"
                    >
                        <option value="MyAdCash">MyAdCash (Recommended)</option>
                        <option value="MyAdCashManual">MyAdCash (Manual Paste)</option>
                        <option value="HilltopAds">HilltopAds</option>
                        <option value="PropellerAds">PropellerAds / Other</option>
                        <option value="AdMob">AdMob</option>
                        <option value="Custom">Custom Code</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
                        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>

                {/* Dynamic Fields */}
                <div className="bg-gray-50 dark:bg-slate-700/50 p-5 rounded-xl border border-gray-200 dark:border-gray-600 space-y-4">
                    
                    {network === 'MyAdCash' && (
                        <>
                            <div>
                                <label className="block text-gray-700 dark:text-gray-300 text-xs font-bold mb-1 uppercase tracking-wider">Zone ID</label>
                                <input 
                                    type="text" 
                                    value={zoneId} 
                                    onChange={e => setZoneId(e.target.value)} 
                                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-600 text-gray-900 dark:text-white" 
                                    placeholder="e.g. 10654258"
                                    required 
                                />
                            </div>
                            <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium bg-indigo-100 dark:bg-indigo-900/30 p-3 rounded-lg">
                                ✓ System will generate the code and <strong>automatically wrap it in the PRO full-screen template</strong>.
                            </div>
                        </>
                    )}

                    {network === 'MyAdCashManual' && (
                        <>
                            <div>
                                <label className="block text-gray-700 dark:text-gray-300 text-xs font-bold mb-1 uppercase tracking-wider">Paste Full MyAdCash Code Here (from dashboard)</label>
                                <textarea 
                                    value={customCode} 
                                    onChange={e => setCustomCode(e.target.value)} 
                                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-600 text-gray-900 dark:text-white font-mono text-xs h-32" 
                                    placeholder="<!DOCTYPE html>..."
                                    required 
                                />
                            </div>
                            <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium bg-indigo-100 dark:bg-indigo-900/30 p-3 rounded-lg">
                                ✓ Manual Mode: Your code will be <strong>wrapped in the PRO template</strong> to ensure consistent playback and tracking.
                            </div>
                        </>
                    )}

                    {network === 'HilltopAds' && (
                        <>
                            <div>
                                <label className="block text-gray-700 dark:text-gray-300 text-xs font-bold mb-1 uppercase tracking-wider">Zone ID</label>
                                <input 
                                    type="text" 
                                    value={zoneId} 
                                    onChange={e => setZoneId(e.target.value)} 
                                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-600 text-gray-900 dark:text-white" 
                                    required 
                                />
                            </div>
                            <div>
                                <label className="block text-gray-700 dark:text-gray-300 text-xs font-bold mb-1 uppercase tracking-wider">Script URL</label>
                                <input 
                                    type="url" 
                                    value={scriptUrl} 
                                    onChange={e => setScriptUrl(e.target.value)} 
                                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-600 text-gray-900 dark:text-white" 
                                    required 
                                />
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                Scripts will be wrapped in the PRO full-screen player.
                            </div>
                        </>
                    )}

                    {(network === 'Custom' || network === 'PropellerAds' || network === 'AdMob') && (
                        <>
                            <div>
                                <label className="block text-gray-700 dark:text-gray-300 text-xs font-bold mb-1 uppercase tracking-wider">Full Ad Code (HTML/JS)</label>
                                <textarea 
                                    value={customCode} 
                                    onChange={e => setCustomCode(e.target.value)} 
                                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-600 text-gray-900 dark:text-white font-mono text-xs h-32" 
                                    placeholder="<iframe>...</iframe> or <script>...</script>"
                                    required 
                                />
                            </div>
                            <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                                Code will be wrapped in the PRO template (black background, centered, loading spinner).
                            </div>
                        </>
                    )}

                </div>
            </div>


            {/* Settings Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Max Views</label>
                <input 
                    type="number" 
                    value={maxViews} 
                    onChange={e => setMaxViews(parseInt(e.target.value))} 
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white" 
                    required 
                />
                </div>
                
                <div>
                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Expiry Date</label>
                <input 
                    type="date" 
                    value={expiryDate} 
                    onChange={e => setExpiryDate(e.target.value)} 
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white" 
                    required 
                />
                </div>

                <div className="flex items-center justify-center md:justify-start pt-6">
                <label className="inline-flex items-center cursor-pointer">
                    <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={isActive}
                        onChange={e => setIsActive(e.target.checked)}
                    />
                    <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 dark:peer-focus:ring-emerald-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-600"></div>
                    <span className="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">{isActive ? 'Active' : 'Inactive'}</span>
                    </label>
                </div>
            </div>
            </form>
        </div>

        {/* Footer (Fixed) */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 flex items-center justify-end gap-3 bg-white dark:bg-gray-800 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 font-bold transition-colors"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="adForm"
              className="px-6 py-2.5 rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 font-bold transition-colors inline-flex items-center gap-2 disabled:bg-indigo-400"
              disabled={isLoading}
            >
              {isLoading && <Spinner />}
              {ad ? 'Update Ad' : 'Create Ad'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default VideoAdModal;