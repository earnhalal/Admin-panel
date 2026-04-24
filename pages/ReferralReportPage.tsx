import React, { useState, useEffect, useMemo } from 'react';
import { rtdb } from '../services/firebase';
import { ref, onValue, get } from 'firebase/database';
import { 
  Users, 
  Search, 
  ArrowRight, 
  Filter, 
  Download,
  Calendar,
  Wallet,
  CheckCircle2,
  Clock,
  ChevronRight,
  TrendingUp,
  UserPlus
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Spinner from '../components/Spinner';

interface ReferralRecord {
  invitedUserId: string;
  referrerUid: string;
  status: string;
  paidAt?: number;
  commission: number;
}

interface ReferrerStats {
  uid: string;
  name: string;
  username: string;
  totalInvites: number;
  paidInvites: number;
  pendingInvites: number;
  totalEarned: number;
  lastActive?: number;
}

interface DetailedInvite {
  id: string;
  referrerUid: string;
  referrerUsername: string;
  invitedUid: string;
  invitedUsername: string;
  status: string;
  timestamp: number;
  commission: number;
}

const ReferralReportPage: React.FC = () => {
    const navigate = useNavigate();
    const [invites, setInvites] = useState<any>({});
    const [users, setUsers] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'rejected'>('all');
    const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('detailed');

    useEffect(() => {
        const invitesRef = ref(rtdb, 'invites');
        const usersRef = ref(rtdb, 'users');

        const fetchAll = async () => {
            try {
                const [invitesSnap, usersSnap] = await Promise.all([
                    get(invitesRef),
                    get(usersRef)
                ]);
                
                setInvites(invitesSnap.val() || {});
                setUsers(usersSnap.val() || {});
            } catch (error) {
                console.error("Error fetching referral data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchAll();
    }, []);

    const detailedHistory = useMemo(() => {
        const list: DetailedInvite[] = [];

        Object.entries(invites).forEach(([referrerUid, data]: [string, any]) => {
            const history = data.history || {};
            const referrerData = users[referrerUid] || {};
            
            Object.entries(history).forEach(([invitedUid, inviteData]: [string, any]) => {
                const invitedUserData = users[invitedUid] || {};
                
                // Prioritize finding a username field. If not found, check if the ID itself looks like a username
                // Many times in RTDB, people use the username AS the key.
                const rUsername = referrerData.username || referrerData.name || (referrerUid.length < 20 ? referrerUid : 'User');
                const iUsername = invitedUserData.username || invitedUserData.name || (invitedUid.length < 20 ? invitedUid : 'New User');

                list.push({
                    id: `${referrerUid}_${invitedUid}`,
                    referrerUid,
                    referrerUsername: rUsername,
                    invitedUid,
                    invitedUsername: iUsername,
                    status: inviteData.status || 'pending',
                    timestamp: inviteData.paidAt || inviteData.timestamp || 0,
                    commission: Number(inviteData.commission) || 0
                });
            });
        });

        return list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }, [invites, users]);

    const referrerStats = useMemo(() => {
        const stats: ReferrerStats[] = [];

        Object.entries(invites).forEach(([referrerUid, data]: [string, any]) => {
            const history = data.history || {};
            const historyItems = Object.entries(history);
            
            const userData = users[referrerUid] || {};
            
            // Fix: If UID doesn't exist in users node, check if the UID itself is a username
            const displayName = userData.username || userData.name || userData.code || (referrerUid.length < 20 ? referrerUid : 'Unknown');

            const report: ReferrerStats = {
                uid: referrerUid,
                name: userData.name || (referrerUid.length < 20 ? referrerUid : 'Unknown'),
                username: displayName === 'Unknown' ? referrerUid : displayName,
                totalInvites: historyItems.length,
                paidInvites: historyItems.filter(([_, item]: [string, any]) => item.status === 'paid' || item.status === 'approved').length,
                pendingInvites: historyItems.filter(([_, item]: [string, any]) => item.status === 'pending' || !item.status).length,
                totalEarned: historyItems.reduce((acc, [_, item]: [string, any]) => acc + (Number(item.commission) || 0), 0),
                lastActive: userData.lastActive || userData.lastLoginAt
            };

            stats.push(report);
        });

        return stats.sort((a, b) => b.totalInvites - a.totalInvites);
    }, [invites, users]);

    const filteredRecords = useMemo(() => {
        if (viewMode === 'summary') {
            return referrerStats.filter(stat => {
                const matchesSearch = 
                    stat.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    stat.username.toLowerCase().includes(searchTerm.toLowerCase());
                
                if (statusFilter === 'all') return matchesSearch;
                if (statusFilter === 'paid') return matchesSearch && stat.paidInvites > 0;
                if (statusFilter === 'pending') return matchesSearch && stat.pendingInvites > 0;
                return matchesSearch;
            });
        } else {
            return detailedHistory.filter(invite => {
                const matchesSearch = 
                    invite.referrerUsername.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    invite.invitedUsername.toLowerCase().includes(searchTerm.toLowerCase());
                
                if (statusFilter === 'all') return matchesSearch;
                if (statusFilter === 'paid') return matchesSearch && (invite.status === 'paid' || invite.status === 'approved');
                if (statusFilter === 'pending') return matchesSearch && invite.status === 'pending';
                if (statusFilter === 'rejected') return matchesSearch && invite.status === 'rejected';
                return matchesSearch;
            });
        }
    }, [viewMode, referrerStats, detailedHistory, searchTerm, statusFilter]);

    const totals = useMemo(() => {
        return referrerStats.reduce((acc, stat) => {
            acc.invites += stat.totalInvites;
            acc.paid += stat.paidInvites;
            acc.pending += stat.pendingInvites;
            acc.earnings += stat.totalEarned;
            return acc;
        }, { invites: 0, paid: 0, pending: 0, earnings: 0 });
    }, [referrerStats]);

    if (loading) return <Spinner />;

    return (
        <div className="space-y-8 animate-fade-in pb-12">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6 px-2 md:px-0">
                <div>
                    <h1 className="text-2xl md:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
                        <TrendingUp className="text-indigo-600" size={28} />
                        Referral Report
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm md:text-lg">
                        Detailed tracking of every invitation and reward.
                    </p>
                </div>
                <div className="flex gap-1 overflow-x-auto bg-gray-100 dark:bg-slate-800 p-1 rounded-xl md:rounded-2xl shrink-0 no-scrollbar">
                    <button 
                        onClick={() => setViewMode('detailed')}
                        className={`px-3 md:px-4 py-2 rounded-lg md:rounded-xl text-xs md:text-sm font-bold transition-all whitespace-nowrap ${viewMode === 'detailed' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-gray-500'}`}
                    >
                        Detailed History
                    </button>
                    <button 
                        onClick={() => setViewMode('summary')}
                        className={`px-3 md:px-4 py-2 rounded-lg md:rounded-xl text-xs md:text-sm font-bold transition-all whitespace-nowrap ${viewMode === 'summary' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-gray-500'}`}
                    >
                        Inviter Summary
                    </button>
                </div>
            </div>

            {/* Overview Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 px-2 md:px-0">
                <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden">
                    <p className="text-gray-400 text-[10px] md:text-xs font-semibold uppercase tracking-wider">Total Invites</p>
                    <h3 className="text-xl md:text-3xl font-black text-gray-900 dark:text-white mt-1">{totals.invites}</h3>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                    <p className="text-gray-400 text-[10px] md:text-xs font-semibold uppercase tracking-wider">Approved</p>
                    <h3 className="text-xl md:text-3xl font-black text-green-600 mt-1">{totals.paid}</h3>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                    <p className="text-gray-400 text-[10px] md:text-xs font-semibold uppercase tracking-wider">Pending</p>
                    <h3 className="text-xl md:text-3xl font-black text-amber-500 mt-1">{totals.pending}</h3>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                    <p className="text-gray-400 text-[10px] md:text-xs font-semibold uppercase tracking-wider">Earnings</p>
                    <h3 className="text-xl md:text-3xl font-black text-indigo-600 mt-1">Rs {totals.earnings}</h3>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white dark:bg-slate-900 p-3 md:p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row items-center gap-3 px-2 md:px-4">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                        type="text" 
                        placeholder={viewMode === 'detailed' ? "Search..." : "Search inviter..."}
                        className="w-full pl-11 pr-4 py-2.5 bg-gray-50 dark:bg-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-gray-700 dark:text-gray-200"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 no-scrollbar">
                    {['all', 'paid', 'pending', 'rejected'].map((f) => (
                        <button 
                            key={f}
                            onClick={() => setStatusFilter(f as any)}
                            className={`px-4 py-2 rounded-xl font-bold text-[10px] md:text-xs capitalize transition-all whitespace-nowrap ${statusFilter === f ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 hover:bg-gray-200'}`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Data Area */}
            <div className="px-2 md:px-0">
                <div className="bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden overflow-x-auto max-w-full">
                    <table className="w-full text-left border-collapse min-w-[600px] md:min-w-[800px]">
                    {viewMode === 'detailed' ? (
                        <>
                            <thead>
                                <tr className="border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/30">
                                    <th className="px-8 py-5 text-xs font-black text-gray-400 uppercase tracking-widest">Inviter (Username)</th>
                                    <th className="px-2 text-center text-gray-300"><ArrowRight size={16} /></th>
                                    <th className="px-8 py-5 text-xs font-black text-gray-400 uppercase tracking-widest">Invited User</th>
                                    <th className="px-8 py-5 text-xs font-black text-gray-400 uppercase tracking-widest">Status</th>
                                    <th className="px-8 py-5 text-xs font-black text-gray-400 uppercase tracking-widest text-right">Commission</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-slate-800/50">
                                {(filteredRecords as DetailedInvite[]).map((row) => (
                                    <tr 
                                        key={row.id} 
                                        className="hover:bg-gray-50/50 dark:hover:bg-slate-800/20 transition-colors cursor-pointer"
                                        onClick={() => navigate(`/referral-report/${row.referrerUid}`)}
                                    >
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center font-bold text-blue-600 dark:text-blue-400">
                                                    {row.referrerUsername.charAt(0).toUpperCase()}
                                                </div>
                                                <span className="font-black text-gray-900 dark:text-white">@{row.referrerUsername}</span>
                                            </div>
                                        </td>
                                        <td className="px-2 py-6 text-center text-gray-300">
                                            <ChevronRight size={16} className="mx-auto" />
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center font-bold text-indigo-600 dark:text-indigo-400">
                                                    {row.invitedUsername.charAt(0).toUpperCase()}
                                                </div>
                                                <span className="font-bold text-gray-700 dark:text-gray-300">@{row.invitedUsername}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                                                row.status === 'paid' || row.status === 'approved' 
                                                ? 'bg-green-50 text-green-600 border-green-100 dark:bg-green-900/20 dark:border-green-800' 
                                                : row.status === 'rejected'
                                                ? 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-900/20 dark:border-rose-800'
                                                : 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:border-amber-800'
                                            }`}>
                                                {row.status}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <span className="text-lg font-black text-gray-900 dark:text-white">Rs {row.commission}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </>
                    ) : (
                        <>
                            <thead>
                                <tr className="border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/30">
                                    <th className="px-8 py-5 text-xs font-black text-gray-400 uppercase tracking-widest">Inviter Summary</th>
                                    <th className="px-8 py-5 text-xs font-black text-gray-400 uppercase tracking-widest text-center">Invites</th>
                                    <th className="px-8 py-5 text-xs font-black text-gray-400 uppercase tracking-widest text-right">Earnings</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-slate-800/50">
                                {(filteredRecords as ReferrerStats[]).map((stat) => (
                                    <tr 
                                        key={stat.uid} 
                                        className="hover:bg-gray-50/50 dark:hover:bg-slate-800/20 transition-colors cursor-pointer"
                                        onClick={() => navigate(`/referral-report/${stat.uid}`)}
                                    >
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center font-bold text-indigo-600 dark:text-indigo-400 text-xl border border-indigo-100">
                                                    {stat.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-black text-gray-900 dark:text-white">{stat.name}</p>
                                                    <p className="text-xs text-indigo-500 font-bold">@{stat.username}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-center">
                                            <span className="text-xl font-black text-gray-800 dark:text-white">{stat.totalInvites}</span>
                                            <div className="flex items-center justify-center gap-2 mt-1">
                                                <span className="text-[10px] text-green-500 font-bold">{stat.paidInvites} Paid</span>
                                                <span className="text-[10px] text-gray-400 font-bold">{stat.pendingInvites} Wait</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <p className="text-xl font-black text-indigo-600 leading-none">Rs {stat.totalEarned.toLocaleString()}</p>
                                            <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase">Total Commission</p>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </>
                    )}
                </table>
                {filteredRecords.length === 0 && (
                    <div className="py-20 text-center">
                        <Search size={40} className="mx-auto text-gray-200 mb-2" />
                        <h3 className="font-bold text-gray-500">No records found</h3>
                    </div>
                )}
            </div>
        </div>
            
        {/* Legend / Info Footer */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                <div className="bg-slate-900 dark:bg-indigo-900/10 p-8 rounded-3xl border border-indigo-500/20 shadow-2xl shadow-indigo-500/5">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <ArrowRight className="text-indigo-400" size={20} /> How stats are calculated?
                    </h3>
                    <ul className="space-y-3">
                        <li className="flex items-start gap-3 text-sm text-indigo-200/70">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0"></div>
                            <b>Total Invites:</b> Count of all users who signed up using this inviter's link or code.
                        </li>
                        <li className="flex items-start gap-3 text-sm text-indigo-200/70">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0"></div>
                            <b>Paid Invites:</b> Users whose account fee was approved. Commission is only paid for these.
                        </li>
                        <li className="flex items-start gap-3 text-sm text-indigo-200/70">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0"></div>
                            <b>Earnings:</b> Sum of Rs 100 for every 'Paid' status referral in the inviter's history.
                        </li>
                    </ul>
                </div>

                <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center text-center">
                    <UserPlus size={48} className="text-indigo-100 dark:text-slate-800 mb-4" />
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Need to manual sync?</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 max-w-xs">
                        If some old referrals are missing rewards, use the "Sync Old Referrals" feature in the Users Management page.
                    </p>
                    <button className="px-6 py-3 bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 rounded-2xl font-black text-sm hover:bg-indigo-600 hover:text-white transition-all">
                        Go to User Management
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReferralReportPage;
