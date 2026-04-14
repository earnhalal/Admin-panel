import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Users, ArrowUpRight, ArrowDownToLine, Clock } from 'lucide-react';

interface ActivityItem {
    id: string;
    type: 'user' | 'withdrawal' | 'deposit';
    text: string;
    timestamp: Date;
}

const ICONS = {
    user: <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600"><Users size={16} /></div>,
    withdrawal: <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-amber-600"><ArrowUpRight size={16} /></div>,
    deposit: <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-600"><ArrowDownToLine size={16} /></div>,
};

const RecentActivityFeed: React.FC = () => {
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Listen to recent deposits
        const depositsQuery = query(collection(db, 'deposits'), orderBy('createdAt', 'desc'), limit(5));
        const unsubDeposits = onSnapshot(depositsQuery, (snapshot) => {
            const items = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    type: 'deposit' as const,
                    text: `New ${data.type || 'deposit'} request of Rs ${data.amount}`,
                    timestamp: data.createdAt?.toDate() || new Date()
                };
            });
            updateActivities(items);
        });

        // Listen to recent withdrawals
        const withdrawalsQuery = query(collection(db, 'withdrawals'), orderBy('createdAt', 'desc'), limit(5));
        const unsubWithdrawals = onSnapshot(withdrawalsQuery, (snapshot) => {
            const items = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    type: 'withdrawal' as const,
                    text: `Withdrawal request of Rs ${data.amount}`,
                    timestamp: data.createdAt?.toDate() || new Date()
                };
            });
            updateActivities(items);
        });

        const updateActivities = (newItems: ActivityItem[]) => {
            setActivities(prev => {
                const combined = [...prev, ...newItems];
                // Remove duplicates by ID
                const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
                // Sort by timestamp desc and limit to 10
                return unique.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 10);
            });
            setLoading(false);
        };

        return () => {
            unsubDeposits();
            unsubWithdrawals();
        };
    }, []);
    
    const timeSince = (date: Date) => {
        const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
        if (seconds < 60) return "just now";
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        return date.toLocaleDateString();
    }

    if (loading) return <div className="space-y-4 animate-pulse">
        {[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 dark:bg-slate-800 rounded-xl"></div>)}
    </div>;

    return (
        <div className="space-y-4">
            {activities.length === 0 ? (
                <div className="text-center py-8">
                    <Clock className="mx-auto text-gray-300 mb-2" size={32} />
                    <p className="text-sm text-gray-500">No recent activity found.</p>
                </div>
            ) : (
                <ul className="space-y-4">
                    {activities.map(activity => (
                        <li key={activity.id} className="flex items-center gap-4 group">
                            <div className="flex-shrink-0 transition-transform group-hover:scale-110">
                                {ICONS[activity.type]}
                            </div>
                            <div className="flex-grow min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                    {activity.text}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {timeSince(activity.timestamp)}
                                </p>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default RecentActivityFeed;
