import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import { db, rtdb } from '../services/firebase';
import Spinner from '../components/Spinner';
import { Award, Search, Users, Trophy, Star, ShieldCheck, ArrowLeft, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface UserProfile {
  id: string;
  name?: string;
  username?: string;
  displayName?: string;
  email?: string;
  isPartner?: boolean;
  activePlan?: string;
  balance?: number;
  totalEarnings?: number;
}

interface Purchase {
  userId: string;
  boosterName: string;
  status: string;
}

const PartnerProfilesPage: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    
    // 1. Listen to RTDB users
    const rtdbUsersRef = ref(rtdb, 'users');
    const unsubscribeRTDB = onValue(rtdbUsersRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const rtdbUsersList = Object.entries(data).map(([id, value]: [string, any]) => ({
                id,
                ...value,
            } as UserProfile));
            
            setUsers(prev => {
                const merged = [...prev];
                rtdbUsersList.forEach(rUser => {
                    const idx = merged.findIndex(u => u.id === rUser.id);
                    if (idx > -1) merged[idx] = { ...merged[idx], ...rUser };
                    else merged.push(rUser);
                });
                return merged;
            });
        }
    });

    // 2. Listen to Firestore users
    const unsubFSUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        const fsUsersList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as UserProfile[];
        
        setUsers(prev => {
            const merged = [...prev];
            fsUsersList.forEach(fUser => {
                const idx = merged.findIndex(u => u.id === fUser.id);
                if (idx > -1) merged[idx] = { ...merged[idx], ...fUser };
                else merged.push(fUser);
            });
            return merged;
        });
    });

    // 3. Listen to booster purchases
    const q = query(collection(db, 'boosterPurchases'), where('status', '==', 'approved'));
    const unsubPurchases = onSnapshot(q, (snapshot) => {
      const purchaseData = snapshot.docs.map(doc => ({
        ...doc.data()
      })) as Purchase[];
      setPurchases(purchaseData);
      setLoading(false);
    });

    return () => {
      unsubscribeRTDB();
      unsubFSUsers();
      unsubPurchases();
    };
  }, []);

  const partners = useMemo(() => {
    return users.map(user => {
      const userPurchases = purchases.filter(p => p.userId === user.id);
      
      let plan = user.activePlan || 'Standard';
      
      // Determine plan based on purchase name, with more flexible matching
      const gold = userPurchases.find(p => p.boosterName.toLowerCase().includes('gold'));
      const silver = userPurchases.find(p => p.boosterName.toLowerCase().includes('silver') || p.boosterName.toLowerCase().includes('sliver'));
      const bronze = userPurchases.find(p => p.boosterName.toLowerCase().includes('bronze'));

      // Also check if these exist as boolean flags on the user object
      const isGold = user.isGoldPartner || user.isGold || (user as any).plan === 'gold';
      const isSilver = user.isSilverPartner || user.isSilver || (user as any).plan === 'silver';
      const isBronze = user.isBronzePartner || user.isBronze || (user as any).plan === 'bronze';

      if (gold || isGold) plan = 'Gold';
      else if (silver || isSilver) plan = 'Silver';
      else if (bronze || isBronze) plan = 'Bronze';

      return { ...user, activePlan: plan };
    }).filter(user => (user.activePlan && user.activePlan !== 'Standard') || user.isPartner);
  }, [users, purchases]);

  const filteredPartners = partners.filter(p => 
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTierColor = (tier: string) => {
    switch(tier.toLowerCase()) {
      case 'gold': return 'from-amber-400 to-yellow-600 text-amber-950 shadow-amber-500/20';
      case 'silver': return 'from-slate-300 to-slate-500 text-slate-900 shadow-slate-500/20';
      case 'bronze': return 'from-orange-400 to-orange-700 text-orange-950 shadow-orange-500/20';
      default: return 'from-indigo-500 to-purple-600 text-white shadow-indigo-500/20';
    }
  };

  const getTierIcon = (tier: string) => {
    switch(tier.toLowerCase()) {
      case 'gold': return <Trophy size={20} className="text-amber-700" />;
      case 'silver': return <Star size={20} className="text-slate-700" />;
      case 'bronze': return <Award size={20} className="text-orange-800" />;
      default: return <ShieldCheck size={20} className="text-white" />;
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
            <Trophy className="text-amber-500" /> Partner Profiles
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">View and manage Silver, Bronze, and Gold partners</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Search partners by name or ID..."
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPartners.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-gray-200 dark:border-slate-800">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-gray-500 font-medium">No partners found with the selected criteria.</h3>
          </div>
        ) : (
          filteredPartners.map((partner) => (
            <div key={partner.id} className="relative group bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
              {/* Tier Badge Background Decoration */}
              <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${getTierColor(partner.activePlan || 'Partner')} opacity-5 -mr-16 -mt-16 rounded-full`}></div>
              
              <div className="flex justify-between items-start mb-6">
                <div className={`px-4 py-1.5 rounded-full bg-gradient-to-r ${getTierColor(partner.activePlan || 'Partner')} text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg`}>
                  {getTierIcon(partner.activePlan || 'Partner')}
                  {partner.activePlan || 'Partner'}
                </div>
                {partner.isPartner && <div className="p-1 px-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded uppercase tracking-tighter">Verified</div>}
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white truncate">{partner.name || partner.username || 'Anonymous'}</h3>
                  <p className="text-xs text-gray-500 font-mono">ID: {partner.id}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-50 dark:border-slate-800">
                  <div>
                    <p className="text-[10px] uppercase text-gray-400 font-bold tracking-wider mb-1">Balance</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">Rs {(partner.balance || 0).toFixed(0)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-gray-400 font-bold tracking-wider mb-1">Earnings</p>
                    <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">Rs {(partner.totalEarnings || 0).toFixed(0)}</p>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <button 
                  onClick={() => navigate(`/users/${partner.id}`)}
                  className="w-full py-3 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-gray-300 rounded-2xl text-sm font-bold hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                >
                  View Full Profile
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PartnerProfilesPage;
