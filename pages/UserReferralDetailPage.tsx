import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { rtdb } from '../services/firebase';
import { ref, get } from 'firebase/database';
import { ArrowLeft, User, Share2, CheckCircle2, Clock, XCircle, Calendar, ChevronRight, Search } from 'lucide-react';
import Spinner from '../components/Spinner';

interface InviteItem {
  invitedUid: string;
  status: string;
  commission: number;
  timestamp: number;
  invitedUsername: string;
}

const UserReferralDetailPage: React.FC = () => {
    const { userId } = useParams<{ userId: string }>();
    const navigate = useNavigate();
    const [invites, setInvites] = useState<InviteItem[]>([]);
    const [referrerName, setReferrerName] = useState('Loading...');
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (!userId) return;

        const fetchData = async () => {
            try {
                // 1. Get Referrer details
                const referrerSnap = await get(ref(rtdb, `users/${userId}`));
                if (referrerSnap.exists()) {
                    const data = referrerSnap.val();
                    setReferrerName(data.username || data.name || (userId.length < 20 ? userId : 'User'));
                } else {
                    setReferrerName(userId);
                }

                // 2. Get Invite History
                const invitesSnap = await get(ref(rtdb, `invites/${userId}/history`));
                const allUsersSnap = await get(ref(rtdb, 'users'));
                const users = allUsersSnap.val() || {};

                if (invitesSnap.exists()) {
                    const history = invitesSnap.val();
                    const list = Object.entries(history).map(([invitedUid, data]: [string, any]) => {
                        const invitedUserData = users[invitedUid] || {};
                        return {
                            invitedUid,
                            status: data.status || 'pending',
                            commission: Number(data.commission) || 0,
                            timestamp: data.paidAt || data.timestamp || 0,
                            invitedUsername: invitedUserData.username || invitedUserData.name || (invitedUid.length < 20 ? invitedUid : 'New User')
                        };
                    });
                    setInvites(list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
                }
            } catch (error) {
                console.error("Error fetching referral details:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [userId]);

    const filteredInvites = useMemo(() => {
        return invites.filter(item => 
            item.invitedUsername.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.invitedUid.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [invites, searchTerm]);

    const stats = useMemo(() => {
        return invites.reduce((acc, item) => {
            if (item.status === 'paid' || item.status === 'approved') acc.paid++;
            else if (item.status === 'rejected') acc.rejected++;
            else acc.pending++;
            acc.totalCommission += item.commission;
            return acc;
        }, { paid: 0, pending: 0, rejected: 0, totalCommission: 0 });
    }, [invites]);

    if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

    return (
        <div className="space-y-6 p-4 md:p-6">
            <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                <ArrowLeft size={20} /> Back to Reports
            </button>

            {/* Profile Header */}
            <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-5 w-full md:w-auto">
                    <div className="w-16 h-16 md:w-20 md:h-20 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-3xl font-black shadow-xl shadow-indigo-500/20">
                        {referrerName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white">@{referrerName}</h1>
                        <div className="flex items-center gap-4 mt-1">
                            <span className="text-xs font-bold text-gray-400">UID: {userId}</span>
                            <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded text-[10px] font-black uppercase">Referrer</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-4 w-full md:w-auto">
                    <div className="flex-1 md:flex-none text-center bg-gray-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-gray-100 dark:border-slate-800">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Invites</p>
                        <p className="text-2xl font-black text-gray-900 dark:text-white">{invites.length}</p>
                    </div>
                    <div className="flex-1 md:flex-none text-center bg-gray-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-gray-100 dark:border-slate-800">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Earned</p>
                        <p className="text-2xl font-black text-indigo-600">Rs {stats.totalCommission}</p>
                    </div>
                </div>
            </div>

            {/* Status Grid */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 text-center">
                    <div className="text-green-500 mb-1 flex justify-center"><CheckCircle2 size={20} /></div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Paid</p>
                    <p className="text-lg font-black text-gray-900 dark:text-white">{stats.paid}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 text-center">
                    <div className="text-amber-500 mb-1 flex justify-center"><Clock size={20} /></div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Pending</p>
                    <p className="text-lg font-black text-gray-900 dark:text-white">{stats.pending}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 text-center">
                    <div className="text-rose-500 mb-1 flex justify-center"><XCircle size={20} /></div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Rejected</p>
                    <p className="text-lg font-black text-gray-900 dark:text-white">{stats.rejected}</p>
                </div>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                    type="text"
                    placeholder="Search invited users..."
                    className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Invited List */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 overflow-hidden shadow-sm">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        <tr>
                            <th className="px-6 py-4">Invited User</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4 text-right">Reward</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-slate-800/50">
                        {filteredInvites.map((invite) => (
                            <tr key={invite.invitedUid} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/20 transition-colors">
                                <td className="px-6 py-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center font-bold text-gray-500">
                                            {invite.invitedUsername.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-900 dark:text-white">@{invite.invitedUsername}</p>
                                            <p className="text-[10px] text-gray-400 font-medium">ID: {invite.invitedUid}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-5">
                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                                        invite.status === 'paid' || invite.status === 'approved'
                                        ? 'bg-green-100 text-green-600 dark:bg-green-900/30'
                                        : invite.status === 'rejected'
                                        ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30'
                                        : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30'
                                    }`}>
                                        {invite.status}
                                    </span>
                                </td>
                                <td className="px-6 py-5 text-right">
                                    <span className="font-black text-gray-900 dark:text-white">Rs {invite.commission}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredInvites.length === 0 && (
                    <div className="py-20 text-center">
                        <Share2 size={40} className="mx-auto text-gray-100 mb-2" />
                        <p className="text-gray-400 font-bold">No invites found</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default UserReferralDetailPage;
