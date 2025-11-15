import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { HomeIcon } from './icons/HomeIcon';
import { UsersIcon } from './icons/UsersIcon';
import { TasksIcon } from './icons/TasksIcon';
import { WithdrawalIcon } from './icons/WithdrawalIcon';
import { ReferralIcon } from './icons/ReferralIcon';
import { AiIcon } from './icons/AiIcon';
import { ShieldIcon } from './icons/ShieldIcon';
import { DepositIcon } from './icons/DepositIcon';
import { signOut } from 'firebase/auth';
import { auth } from '../services/firebase';
import { GenericXIcon } from './icons/GenericXIcon';
import { SettingsIcon } from './icons/SettingsIcon';
import { RevenueIcon } from './icons/RevenueIcon';
import { StoreIcon } from './icons/StoreIcon';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const commonLinkClass = "flex items-center px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-white rounded-lg transition-colors duration-200";
  const activeLinkClass = "bg-indigo-600 text-white";
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
        await signOut(auth);
        navigate('/login');
    } catch (error) {
        console.error('Failed to log out', error);
    }
  };
  
  const handleLinkClick = () => {
    if (window.innerWidth < 768) { // md breakpoint
        onClose();
    }
  }

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      ></div>
      <aside className={`fixed top-0 left-0 h-full w-64 bg-gray-900 text-white flex-shrink-0 flex flex-col p-4 z-40 transform transition-transform duration-300 md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex justify-between items-center mb-10 px-4">
          <div className="text-2xl font-bold">
            <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
                Admin Panel
            </span>
          </div>
          <button onClick={onClose} className="md:hidden p-1">
             <GenericXIcon className="w-6 h-6" />
          </button>
        </div>
        <nav className="flex flex-col gap-2">
          <NavLink 
            to="/dashboard"
            onClick={handleLinkClick}
            className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
          >
            <HomeIcon className="w-5 h-5 mr-3" />
            Dashboard
          </NavLink>
          <NavLink 
            to="/revenue"
            onClick={handleLinkClick}
            className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
          >
            <RevenueIcon className="w-5 h-5 mr-3" />
            Revenue
          </NavLink>
          <NavLink 
            to="/users"
            onClick={handleLinkClick}
            className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
          >
            <UsersIcon className="w-5 h-5 mr-3" />
            Users
          </NavLink>
          <NavLink 
            to="/tasks"
            onClick={handleLinkClick}
            className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
          >
            <TasksIcon className="w-5 h-5 mr-3" />
            Tasks
          </NavLink>
           <NavLink 
            to="/booster-store"
            onClick={handleLinkClick}
            className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
          >
            <StoreIcon className="w-5 h-5 mr-3" />
            Booster Store
          </NavLink>
          <NavLink 
            to="/withdrawals"
            onClick={handleLinkClick}
            className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
          >
            <WithdrawalIcon className="w-5 h-5 mr-3" />
            Withdrawals
          </NavLink>
          <NavLink 
            to="/deposits"
            onClick={handleLinkClick}
            className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
          >
            <DepositIcon className="w-5 h-5 mr-3" />
            Deposits
          </NavLink>
          <NavLink 
            to="/referrals"
            onClick={handleLinkClick}
            className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
          >
            <ReferralIcon className="w-5 h-5 mr-3" />
            Referrals
          </NavLink>
           <NavLink 
            to="/ai-automations"
            onClick={handleLinkClick}
            className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
          >
            <AiIcon className="w-5 h-5 mr-3" />
            AI Automations
          </NavLink>
          <NavLink 
            to="/fraud-detection"
            onClick={handleLinkClick}
            className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
          >
            <ShieldIcon className="w-5 h-5 mr-3" />
            Fraud Detection
          </NavLink>
          <NavLink 
            to="/settings"
            onClick={handleLinkClick}
            className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
          >
            <SettingsIcon className="w-5 h-5 mr-3" />
            Settings
          </NavLink>
        </nav>
        <div className="mt-auto px-4 py-3">
          <button onClick={handleLogout} className="w-full flex items-center text-red-400 hover:text-red-300 transition-colors duration-200">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
              </svg>
              Logout
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;