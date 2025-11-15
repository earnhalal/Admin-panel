import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import BarChart from '../components/BarChart';
import Pagination from '../components/Pagination';
import { WithdrawalIcon } from '../components/icons/WithdrawalIcon';
import { DepositIcon } from '../components/icons/DepositIcon';
import { TasksIcon } from '../components/icons/TasksIcon';

interface RevenueTransaction {
    id: string;
    adminFeeAmount: number;
    originalAmount: number;
    sourceUser: string;
    timestamp: Timestamp;
    transactionType: 'deposit_fee' | 'withdrawal_fee' | 'task_commission' | 'listing_fee';
    relatedDocId: string;
}

const StatCard: React.FC<{ title: string; value: string; icon: React.ReactNode; }> = ({ title, value, icon }) => (
  <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-lg flex items-center justify-between">
    <div>
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{title}</p>
      <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
    </div>
    <div className="bg-indigo-100 dark:bg-indigo-900/50 p-3 rounded-full">
      {icon}
    </div>
  </div>
);

const RevenuePage: React.FC = () => {
    const [transactions, setTransactions] = useState<RevenueTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    useEffect(() => {
        const q = query(collection(db, 'revenueTransactions'), orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RevenueTransaction));
            setTransactions(data);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching revenue data:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const revenueStats = useMemo(() => {
        return transactions.reduce((acc, tx) => {
            acc.total += tx.adminFeeAmount;
            if (tx.transactionType === 'deposit_fee') acc.depositFees += tx.adminFeeAmount;
            if (tx.transactionType === 'withdrawal_fee') acc.withdrawalFees += tx.adminFeeAmount;
            if (tx.transactionType === 'task_commission') acc.taskCommissions += tx.adminFeeAmount;
            if (tx.transactionType === 'listing_fee') acc.listingFees += tx.adminFeeAmount;
            return acc;
        }, { total: 0, depositFees: 0, withdrawalFees: 0, taskCommissions: 0, listingFees: 0 });
    }, [transactions]);
    
    const chartData = useMemo(() => {
        const data: { [key: string]: number } = {};
        const labels: string[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            labels.push(label);
            data[label] = 0;
        }
        transactions.forEach(tx => {
            const txDate = tx.timestamp.toDate();
            const label = txDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (data.hasOwnProperty(label)) {
                data[label] += tx.adminFeeAmount;
            }
        });
        return {
            labels,
            datasets: [{
                label: 'Daily Revenue',
                data: labels.map(label => data[label]),
            }]
        };
    }, [transactions]);
    
    const paginatedTransactions = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return transactions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [transactions, currentPage]);
    
    const formatType = (type: string) => {
        return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    return (
        <div className="container mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">Revenue Dashboard</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Total Revenue" value={`Rs ${revenueStats.total.toFixed(2)}`} icon={<TasksIcon className="w-6 h-6 text-indigo-500" />} />
                <StatCard title="From Deposits" value={`Rs ${revenueStats.depositFees.toFixed(2)}`} icon={<DepositIcon className="w-6 h-6 text-indigo-500" />} />
                <StatCard title="From Withdrawals" value={`Rs ${revenueStats.withdrawalFees.toFixed(2)}`} icon={<WithdrawalIcon className="w-6 h-6 text-indigo-500" />} />
                <StatCard title="From Tasks" value={`Rs ${(revenueStats.taskCommissions + revenueStats.listingFees).toFixed(2)}`} icon={<TasksIcon className="w-6 h-6 text-indigo-500" />} />
            </div>

            <div className="mt-8 bg-white dark:bg-slate-900 p-6 rounded-xl shadow-lg">
                <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-4">Daily Revenue (Last 7 Days)</h2>
                <div className="h-80">
                    <BarChart data={chartData} />
                </div>
            </div>

            <div className="mt-8 bg-white dark:bg-slate-900 shadow-md rounded-lg overflow-hidden">
                 <h2 className="text-2xl font-bold text-gray-800 dark:text-white p-6">Revenue Transaction Log</h2>
                {loading ? <p className="text-center py-4">Loading transactions...</p> : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="min-w-full leading-normal">
                                <thead>
                                    <tr>
                                        <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Date</th>
                                        <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Type</th>
                                        <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Admin Fee</th>
                                        <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Original Amount</th>
                                        <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">User ID</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedTransactions.map(tx => (
                                        <tr key={tx.id}>
                                            <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">{tx.timestamp.toDate().toLocaleString()}</td>
                                            <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">{formatType(tx.transactionType)}</td>
                                            <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm font-semibold text-green-600">Rs {tx.adminFeeAmount.toFixed(2)}</td>
                                            <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">Rs {tx.originalAmount.toFixed(2)}</td>
                                            <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm text-gray-500">{tx.sourceUser}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Pagination currentPage={currentPage} totalPages={Math.ceil(transactions.length / ITEMS_PER_PAGE)} onPageChange={setCurrentPage} />
                    </>
                )}
            </div>
        </div>
    );
};

export default RevenuePage;