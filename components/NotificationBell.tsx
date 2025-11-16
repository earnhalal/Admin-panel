import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { BellIcon } from './icons/BellIcon';
import { Link } from 'react-router-dom';

interface Notification {
    type: 'deposit' | 'withdrawal' | 'task' | 'referral';
    count: number;
}

const NOTIFICATION_CONFIG = {
    deposit: { label: 'New Deposit Requests', path: '/deposits' },
    withdrawal: { label: 'New Withdrawal Requests', path: '/withdrawals' },
    task: { label: 'New Task Submissions', path: '/tasks' },
    referral: { label: 'New Referral Bonuses', path: '/referrals' }
};

const NotificationBell: React.FC = () => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const queries = {
            deposit: query(collection(db, 'depositRequests'), where('status', '==', 'pending')),
            withdrawal: query(collection(db, 'withdrawal_requests'), where('status', '==', 'pending')),
            task: query(collection(db, 'userTasks'), where('status', '==', 'submitted')),
            referral: query(collection(db, 'referrals'), where('status', '==', 'pending_bonus'))
        };

        const unsubscribes = Object.entries(queries).map(([type, q]) => {
            return onSnapshot(q, (snapshot) => {
                setNotifications(prev => {
                    const otherNotifs = prev.filter(n => n.type !== type);
                    if (snapshot.size > 0) {
                        return [...otherNotifs, { type: type as Notification['type'], count: snapshot.size }];
                    }
                    return otherNotifs;
                });
            });
        });

        return () => unsubscribes.forEach(unsub => unsub());
    }, []);
    
    const totalCount = notifications.reduce((acc, curr) => acc + curr.count, 0);

    return (
        <div className="relative">
            <button onClick={() => setIsOpen(!isOpen)} className="relative p-2 rounded-full hover:bg-gray-200 dark:hover:bg-slate-800 transition-colors">
                <BellIcon className="w-6 h-6" />
                {totalCount > 0 && (
                    <span className="absolute top-1 right-1 block h-3 w-3 rounded-full bg-red-500 border-2 border-white dark:border-slate-950"></span>
                )}
            </button>
            
            {isOpen && (
                <div 
                    className="fixed inset-0"
                    onClick={() => setIsOpen(false)}
                ></div>
            )}
            
            {isOpen && (
                 <div className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50">
                    <div className="p-3 border-b border-slate-200 dark:border-slate-700">
                        <h3 className="font-semibold">Notifications</h3>
                    </div>
                    <div className="py-2">
                        {totalCount > 0 ? (
                            notifications.map(notif => (
                                <Link
                                    key={notif.type}
                                    to={NOTIFICATION_CONFIG[notif.type].path}
                                    onClick={() => setIsOpen(false)}
                                    className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"
                                >
                                    <span className="font-bold text-indigo-500">{notif.count}</span> {NOTIFICATION_CONFIG[notif.type].label}
                                </Link>
                            ))
                        ) : (
                            <p className="px-4 py-3 text-sm text-center text-gray-500 dark:text-gray-400">No new notifications</p>
                        )}
                    </div>
                 </div>
            )}
        </div>
    );
};

export default NotificationBell;