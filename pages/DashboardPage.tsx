import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { UsersIcon } from '../components/icons/UsersIcon';
import { WithdrawalIcon } from '../components/icons/WithdrawalIcon';
import { TasksIcon } from '../components/icons/TasksIcon';

const StatCard: React.FC<{ title: string; value: number | null; icon: React.ReactNode; loading: boolean }> = ({ title, value, icon, loading }) => (
  <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg flex items-center justify-between">
    <div>
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase">{title}</p>
      {loading ? (
        <div className="w-12 h-8 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse mt-1"></div>
      ) : (
        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
      )}
    </div>
    <div className="bg-indigo-100 dark:bg-indigo-900/50 p-3 rounded-full">
      {icon}
    </div>
  </div>
);


const DashboardPage: React.FC = () => {
  const [userCount, setUserCount] = useState<number | null>(null);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<number | null>(null);
  const [pendingSubmissions, setPendingSubmissions] = useState<number | null>(null);
  
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(true);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);

  useEffect(() => {
    // Listener for total users
    const usersQuery = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      setUserCount(snapshot.size);
      setLoadingUsers(false);
    }, (error) => {
      console.error("Error fetching user count:", error);
      setLoadingUsers(false);
    });

    // Listener for pending withdrawals
    const withdrawalsQuery = query(collection(db, 'withdrawalRequests'), where('status', '==', 'pending'));
    const unsubscribeWithdrawals = onSnapshot(withdrawalsQuery, (snapshot) => {
      setPendingWithdrawals(snapshot.size);
      setLoadingWithdrawals(false);
    }, (error) => {
       console.error("Error fetching pending withdrawals:", error);
       setLoadingWithdrawals(false);
    });

    // Listener for pending task submissions
    const submissionsQuery = query(collection(db, 'userTasks'), where('status', '==', 'submitted'));
    const unsubscribeSubmissions = onSnapshot(submissionsQuery, (snapshot) => {
      setPendingSubmissions(snapshot.size);
      setLoadingSubmissions(false);
    }, (error) => {
        console.error("Error fetching pending submissions:", error);
        setLoadingSubmissions(false);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeWithdrawals();
      unsubscribeSubmissions();
    };
  }, []);

  return (
    <div className="container mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">
        Admin Dashboard
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard title="Total Users" value={userCount} icon={<UsersIcon className="w-6 h-6 text-indigo-500" />} loading={loadingUsers} />
        <StatCard title="Pending Withdrawals" value={pendingWithdrawals} icon={<WithdrawalIcon className="w-6 h-6 text-indigo-500" />} loading={loadingWithdrawals} />
        <StatCard title="Pending Task Submissions" value={pendingSubmissions} icon={<TasksIcon className="w-6 h-6 text-indigo-500" />} loading={loadingSubmissions} />
      </div>
       <div className="mt-8 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200 mb-4">Overview</h2>
        <p className="text-gray-600 dark:text-gray-300">
          This is the central hub for managing your application. The statistics above are updated in real-time. You can navigate through different sections using the sidebar to manage users, tasks, withdrawal requests, and referrals.
        </p>
      </div>
    </div>
  );
};

export default DashboardPage;