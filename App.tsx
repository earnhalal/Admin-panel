import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './components/AdminLayout';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import UsersPage from './pages/UsersPage';
import TasksPage from './pages/TasksPage';
import WithdrawalsPage from './pages/WithdrawalsPage';
import ProtectedRoute from './components/ProtectedRoute';
import ReferralsPage from './pages/ReferralsPage';

const App: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<AdminLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="withdrawals" element={<WithdrawalsPage />} />
            <Route path="referrals" element={<ReferralsPage />} />
          </Route>
        </Route>
         <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </HashRouter>
  );
};

export default App;