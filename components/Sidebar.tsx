import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { HomeIcon } from './icons/HomeIcon';
import { UsersIcon } from './icons/UsersIcon';
import { TasksIcon } from './icons/TasksIcon';
import { WithdrawalIcon } from './icons/WithdrawalIcon';
import { ReferralIcon } from './icons/ReferralIcon';
import { signOut } from 'firebase/auth';
import { auth } from '../services/firebase';

const Sidebar: React.FC = () => {
  const commonLinkClass = "flex items-center px-4 py-3 text-gray-300 hover:bg-gray-700 hover:text-white rounded-lg transition-colors duration-200";
  const activeLinkClass = "bg-gray-700 text-white";
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
        await signOut(auth);
        navigate('/login');
    } catch (error) {
        console.error('Failed to log out', error);
    }
  };

  return (
    <aside className="w-64 bg-gray-800 text-white flex-shrink-0 flex flex-col p-4">
      <div className="text-2xl font-bold mb-10 px-4">Admin Panel</div>
      <nav className="flex flex-col gap-2">
        <NavLink 
          to="/dashboard"
          className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
        >
          <HomeIcon className="w-5 h-5 mr-3" />
          Dashboard
        </NavLink>
        <NavLink 
          to="/users"
          className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
        >
          <UsersIcon className="w-5 h-5 mr-3" />
          Users
        </NavLink>
        <NavLink 
          to="/tasks"
          className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
        >
          <TasksIcon className="w-5 h-5 mr-3" />
          Tasks
        </NavLink>
        <NavLink 
          to="/withdrawals"
          className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
        >
          <WithdrawalIcon className="w-5 h-5 mr-3" />
          Withdrawals
        </NavLink>
        <NavLink 
          to="/referrals"
          className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
        >
          <ReferralIcon className="w-5 h-5 mr-3" />
          Referrals
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
  );
};

export default Sidebar;