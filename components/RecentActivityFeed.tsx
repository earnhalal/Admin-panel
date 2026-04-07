import React, { useState, useEffect } from 'react';
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
        // Firestore calls disabled to prevent Quota Exceeded errors
        setLoading(false);
        return () => {};
    }, []);
    
    const timeSince = (date: Date) => {
        if (date.getTime() === 0) return 'a while ago';
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
        if (seconds < 5) return "just now";
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