import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { UsersIcon } from './icons/UsersIcon';
import { WithdrawalIcon } from './icons/WithdrawalIcon';
import { DepositIcon } from './icons/DepositIcon';

interface ActivityItem {
    id: string;
    type: 'user' | 'withdrawal' | 'deposit';
    text: string;
    timestamp: Date;
}

const ICONS: { [key in ActivityItem['type']]: React.ReactNode } = {
    user: <UsersIcon className="w-4 h-4 text-sky-500" />,
    withdrawal: <WithdrawalIcon className="w-4 h-4 text-red-500" />,
    deposit: <DepositIcon className="w-4 h-4 text-green-500" />,
};

const RecentActivityFeed: React.FC = () => {
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const queries = {
            users: query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(5)),
            withdrawals: query(collection(db, 'withdrawalRequests'), orderBy('requestedAt', 'desc'), limit(5)),
            deposits: query(collection(db, 'depositRequests'), orderBy('requestedAt', 'desc'), limit(5))
        };

        const unsubs = Object.entries(queries).map(([type, q]) => 
            onSnapshot(q, (snapshot) => {
                const newActivities = snapshot.docs.map(doc => {
                    const data = doc.data();
                    if (type === 'users') {
                        return { id: doc.id, type: 'user', text: `${data.email} just signed up.`, timestamp: (data.createdAt as Timestamp).toDate() };
                    }
                    if (type === 'withdrawals') {
                        return { id: doc.id, type: 'withdrawal', text: `New withdrawal request for Rs ${data.amount}.`, timestamp: (data.requestedAt as Timestamp).toDate() };
                    }
                    // deposits
                    return { id: doc.id, type: 'deposit', text: `New deposit request for Rs ${data.amount}.`, timestamp: (data.requestedAt as Timestamp).toDate() };
                }) as ActivityItem[];

                setActivities(prev => {
                    const filteredPrev = prev.filter(p => p.type !== type);
                    const combined = [...filteredPrev, ...newActivities];
                    combined.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
                    return combined.slice(0, 10);
                });

                setLoading(false);
            })
        );
        
        return () => unsubs.forEach(unsub => unsub());

    }, []);
    
    const timeSince = (date: Date) => {
        const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + " years ago";
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + " months ago";
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + " days ago";
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + " hours ago";
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + " minutes ago";
        return Math.floor(seconds) + " seconds ago";
    }

    return (
        <div>
            <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-4">Recent Activity</h2>
            {loading ? <p>Loading activity...</p> : 
                activities.length === 0 ? <p className="text-sm text-gray-500">No recent activity.</p> :
                <ul className="space-y-4">
                    {activities.map(activity => (
                        <li key={activity.id} className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-1 bg-slate-100 dark:bg-slate-800 p-2 rounded-full">{ICONS[activity.type]}</div>
                            <div>
                                <p className="text-sm text-gray-800 dark:text-gray-200">{activity.text}</p>
                                <p className="text-xs text-gray-400">{timeSince(activity.timestamp)}</p>
                            </div>
                        </li>
                    ))}
                </ul>
            }
        </div>
    );
};

export default RecentActivityFeed;
