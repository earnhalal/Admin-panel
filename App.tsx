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
import ReferralReportPage from './pages/ReferralReportPage';
import ToastContainer from './components/ToastContainer';
import AiAutomationsPage from './pages/AiAutomationsPage';
import FraudDetectionPage from './pages/FraudDetectionPage';
import DepositsPage from './pages/DepositsPage';
import SettingsPage from './pages/SettingsPage';
import UserProfilePage from './pages/UserProfilePage';
import RevenuePage from './pages/RevenuePage';
import BoosterStorePage from './pages/BoosterStorePage';
import VideoAdsPage from './pages/VideoAdsPage';
import MailboxPage from './pages/MailboxPage';
import PromotionsPage from './pages/PromotionsPage';
import PromotionSubmissionsPage from './pages/PromotionSubmissionsPage';
import PromotionOrdersPage from './pages/PromotionOrdersPage';
import SocialTasksPage from './pages/SocialTasksPage';
import JoiningApprovalsPage from './pages/JoiningApprovalsPage';
import PartnerProgramPage from './pages/PartnerProgramPage';
import LotteryManagementPage from './pages/LotteryManagementPage';
import HistoryPage from './pages/HistoryPage';

const App: React.FC = () => {
  return (
    <>
      <ToastContainer />
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<AdminLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="users/:userId" element={<UserProfilePage />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="promotions" element={<PromotionsPage />} />
              <Route path="promotion-requests" element={<PromotionSubmissionsPage />} />
              <Route path="promotion-orders" element={<PromotionOrdersPage />} />
              <Route path="social-tasks" element={<SocialTasksPage />} />
              <Route path="video-ads" element={<VideoAdsPage />} />
              <Route path="withdrawals" element={<WithdrawalsPage />} />
              <Route path="deposits" element={<DepositsPage />} />
              <Route path="approvals" element={<JoiningApprovalsPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="lotteries" element={<LotteryManagementPage />} />
              <Route path="partner-program" element={<PartnerProgramPage />} />
              <Route path="referrals" element={<ReferralsPage />} />
              <Route path="referral-report" element={<ReferralReportPage />} />
              <Route path="booster-store" element={<BoosterStorePage />} />
              <Route path="mailbox" element={<MailboxPage />} />
              <Route path="ai-automations" element={<AiAutomationsPage />} />
              <Route path="fraud-detection" element={<FraudDetectionPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="revenue" element={<RevenuePage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </HashRouter>
    </>
  );
};

export default App;