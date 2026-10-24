import React, { useState, useEffect, useRef } from 'react';
import { collection, query, limit, onSnapshot } from 'firebase/firestore';
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

// Docs in this project store dates in several shapes: Firestore
// Timestamps, ISO strings (the app writes `date` / `joiningDate` as
// ISO), epoch numbers, and older locale strings like "24/10/2026".
// `new Date(value)` silently yields Invalid Date for some of them
// (a Timestamp object, a DD/MM/YYYY string), and an Invalid Date
// poisons every sort it touches — items with real, newer dates sank
// below older ones. Normalise everything to a valid Date here.
const parseActivityDate = (value: any): Date => {
    if (value == null) return new Date(0);
    if (value instanceof Date) return isNaN(value.getTime()) ? new Date(0) : value;
    if (typeof value.toDate === 'function') {
        try {
            const d = value.toDate();
            if (d && !isNaN(d.getTime())) return d;
        } catch { /* fall through */ }
    }
    if (typeof value === 'number') {
        const d = new Date(value);
        return isNaN(d.getTime()) ? new Date(0) : d;
    }
    if (typeof value === 'string') {
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) return parsed;
        // DD/MM/YYYY (optionally with a time) — the format `new Date`
        // cannot parse in most browsers.
        const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (m) {
            const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
            if (!isNaN(d.getTime())) return d;
        }
    }
    if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
    return new Date(0);
};

const DISPLAY_COUNT = 10;
// The collections are fetched unordered (document-ID order), so the
// limit is a window over IDs, NOT over time. At limit(100) the newest
// deposits (102+ docs) could fall outside the window entirely and
// never reach the feed. 250 covers the current collections with
// headroom while staying a bounded read.
const FETCH_LIMIT = 250;

const RecentActivityFeed: React.FC = () => {
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(true);
    // Latest snapshot per source; the merged feed is always rebuilt
    // from BOTH full lists, sorted by real timestamp desc, and only
    // then sliced to the display count. (Previously each source was
    // sliced to its own top 5 before merging, and items accumulated
    // in state across snapshots.)
    const sourceItems = useRef<{ deposits: ActivityItem[]; withdrawals: ActivityItem[] }>({ deposits: [], withdrawals: [] });

    useEffect(() => {
        const rebuild = () => {
            const combined = [...sourceItems.current.deposits, ...sourceItems.current.withdrawals];
            const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
            setActivities(unique.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, DISPLAY_COUNT));
            setLoading(false);
        };

        // App-written deposits carry a `date` string, not `createdAt` —
        // ordering/filtering on createdAt excluded every one of them.
        const depositsQuery = query(collection(db, 'deposits'), limit(FETCH_LIMIT));
        const unsubDeposits = onSnapshot(depositsQuery, (snapshot) => {
            sourceItems.current.deposits = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    type: 'deposit' as const,
                    text: `New ${data.type || 'deposit'} request of Rs ${data.amount}`,
                    timestamp: parseActivityDate(data.date ?? data.timestamp ?? data.createdAt)
                };
            });
            rebuild();
        }, (error) => {
            console.error("Error fetching recent deposits:", error);
            setLoading(false);
        });

        // App-written withdrawals carry a `timestamp`, not `createdAt`.
        const withdrawalsQuery = query(collection(db, 'withdrawals'), limit(FETCH_LIMIT));
        const unsubWithdrawals = onSnapshot(withdrawalsQuery, (snapshot) => {
            sourceItems.current.withdrawals = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    type: 'withdrawal' as const,
                    text: `Withdrawal request of Rs ${data.amount}`,
                    timestamp: parseActivityDate(data.timestamp ?? data.date ?? data.createdAt)
                };
            });
            rebuild();
        }, (error) => {
            console.error("Error fetching recent withdrawals:", error);
            setLoading(false);
        });

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
