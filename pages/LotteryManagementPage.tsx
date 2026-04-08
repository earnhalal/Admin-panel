import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, addDoc, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';
import { Ticket, Check, Plus, Calendar, Users, DollarSign, ArrowLeft, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Lottery {
  id: string;
  fee: number;
  prizePool: number;
  maxMembers: number;
  currentMembers: number;
  color: string;
  status: 'active' | 'completed';
  drawDate: any;
}

const COLOR_THEMES = [
  { label: 'Purple to Indigo', value: 'from-purple-500 to-indigo-600' },
  { label: 'Amber to Orange', value: 'from-amber-400 to-orange-500' },
  { label: 'Emerald to Teal', value: 'from-emerald-400 to-teal-500' },
  { label: 'Rose to Pink', value: 'from-rose-400 to-pink-500' },
  { label: 'Blue to Cyan', value: 'from-blue-500 to-cyan-400' },
  { label: 'Slate to Gray', value: 'from-slate-600 to-gray-700' },
];

const LotteryManagementPage: React.FC = () => {
  const [lotteries, setLotteries] = useState<Lottery[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});
  const { addToast } = useToast();
  const navigate = useNavigate();

  // Form State
  const [fee, setFee] = useState<string>('');
  const [prizePool, setPrizePool] = useState<string>('');
  const [maxMembers, setMaxMembers] = useState<string>('');
  const [color, setColor] = useState<string>(COLOR_THEMES[0].value);

  useEffect(() => {
    const q = query(collection(db, 'lotteries'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const lotteriesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Lottery[];
      
      // Sort: active first, then by drawDate
      lotteriesData.sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        const dateA = a.drawDate?.seconds || 0;
        const dateB = b.drawDate?.seconds || 0;
        return dateB - dateA;
      });

      setLotteries(lotteriesData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching lotteries:", error);
      addToast("Failed to load lotteries.", "error");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [addToast]);

  const handleCreateLottery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fee || !prizePool || !maxMembers) {
      addToast("Please fill all fields", "error");
      return;
    }

    setSubmitting(true);
    try {
      const drawDate = new Date();
      drawDate.setDate(drawDate.getDate() + 7); // 7 days from now

      await addDoc(collection(db, 'lotteries'), {
        fee: Number(fee),
        prizePool: Number(prizePool),
        maxMembers: Number(maxMembers),
        color: color,
        currentMembers: 0,
        status: 'active',
        drawDate: Timestamp.fromDate(drawDate)
      });

      addToast("Lottery created successfully!", "success");
      // Reset form
      setFee('');
      setPrizePool('');
      setMaxMembers('');
      setColor(COLOR_THEMES[0].value);
    } catch (error) {
      console.error("Error creating lottery:", error);
      addToast("Failed to create lottery.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkCompleted = async (id: string) => {
    if (!window.confirm("Are you sure you want to mark this lottery as completed?")) return;
    
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await updateDoc(doc(db, 'lotteries', id), {
        status: 'completed'
      });
      addToast("Lottery marked as completed.", "success");
    } catch (error) {
      console.error("Error updating lottery:", error);
      addToast("Failed to update lottery status.", "error");
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  if (loading) return <div className="flex justify-center items-center min-h-[400px]"><Spinner /></div>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-gray-500"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Ticket className="text-indigo-500" /> Lottery Management
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Create and manage active lotteries</p>
        </div>
      </div>

      {/* Create Form */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Plus size={20} className="text-indigo-500" /> Create New Lottery
        </h2>
        <form onSubmit={handleCreateLottery} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Entry Fee (Rs)</label>
            <input 
              type="number" 
              min="0"
              required
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="e.g. 100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prize Pool (Rs)</label>
            <input 
              type="number" 
              min="0"
              required
              value={prizePool}
              onChange={(e) => setPrizePool(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="e.g. 5000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max Members</label>
            <input 
              type="number" 
              min="1"
              required
              value={maxMembers}
              onChange={(e) => setMaxMembers(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="e.g. 50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Color Theme</label>
            <select 
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {COLOR_THEMES.map(theme => (
                <option key={theme.value} value={theme.value}>{theme.label}</option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-4 flex justify-end mt-2">
            <button 
              type="submit" 
              disabled={submitting}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors flex items-center gap-2 disabled:opacity-70"
            >
              {submitting ? <Spinner size="sm" /> : <Plus size={18} />}
              Create Lottery
            </button>
          </div>
        </form>
      </div>

      {/* Lotteries List */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">All Lotteries</h2>
        {lotteries.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-gray-100 dark:border-slate-800">
            <Ticket className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">No lotteries found</h3>
            <p className="text-gray-500">Create your first lottery using the form above.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {lotteries.map(lottery => (
              <div key={lottery.id} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden flex flex-col">
                {/* Card Header with Gradient */}
                <div className={`p-6 bg-gradient-to-r ${lottery.color} text-white relative`}>
                  <div className="absolute top-4 right-4">
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${lottery.status === 'active' ? 'bg-white/20 text-white' : 'bg-black/20 text-white/80'}`}>
                      {lottery.status.toUpperCase()}
                    </span>
                  </div>
                  <Trophy className="w-10 h-10 mb-3 text-white/80" />
                  <h3 className="text-2xl font-bold">Rs {lottery.prizePool.toLocaleString()}</h3>
                  <p className="text-white/80 text-sm font-medium">Prize Pool</p>
                </div>
                
                {/* Card Body */}
                <div className="p-6 flex-grow space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b border-gray-50 dark:border-slate-800">
                    <span className="text-sm text-gray-500 flex items-center gap-2"><DollarSign size={16} /> Entry Fee</span>
                    <span className="font-bold text-gray-900 dark:text-white">Rs {lottery.fee}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-gray-50 dark:border-slate-800">
                    <span className="text-sm text-gray-500 flex items-center gap-2"><Users size={16} /> Members</span>
                    <span className="font-bold text-gray-900 dark:text-white">
                      {lottery.currentMembers} / {lottery.maxMembers}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-gray-50 dark:border-slate-800">
                    <span className="text-sm text-gray-500 flex items-center gap-2"><Calendar size={16} /> Draw Date</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {lottery.drawDate ? new Date(lottery.drawDate.seconds * 1000).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="pt-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500">Fill Progress</span>
                      <span className="font-medium text-indigo-600 dark:text-indigo-400">
                        {Math.round((lottery.currentMembers / lottery.maxMembers) * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full bg-gradient-to-r ${lottery.color}`} 
                        style={{ width: `${Math.min((lottery.currentMembers / lottery.maxMembers) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Card Footer Action */}
                {lottery.status === 'active' && (
                  <div className="p-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800">
                    <button
                      onClick={() => handleMarkCompleted(lottery.id)}
                      disabled={actionLoading[lottery.id]}
                      className="w-full py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      {actionLoading[lottery.id] ? <Spinner size="sm" /> : <><Check size={16} /> Mark as Completed</>}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LotteryManagementPage;
