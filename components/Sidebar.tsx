import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { HomeIcon } from './icons/HomeIcon';
import { UsersIcon } from './icons/UsersIcon';
import { TasksIcon } from './icons/TasksIcon';
import { WithdrawalIcon } from './icons/WithdrawalIcon';
import { ReferralIcon } from './icons/ReferralIcon';
import { CloseIcon } from './icons/CloseIcon';
import { signOut } from 'firebase/auth';
import { auth } from '../services/firebase';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen }) => {
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

  const handleLinkClick = () => {
    if (window.innerWidth < 768) { // md breakpoint
        setIsOpen(false);
    }
  }

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black bg-opacity-60 z-30 md:hidden transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      ></div>
      <aside className={`w-64 bg-gray-800 text-white flex-shrink-0 flex flex-col p-4 fixed md:relative inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="flex justify-between items-center mb-10">
            <div className="text-2xl font-bold px-4">Admin Panel</div>
            <button onClick={() => setIsOpen(false)} className="md:hidden p-2 -mr-2" aria-label="Close menu">
                <CloseIcon className="w-6 h-6 text-gray-300" />
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
            to="/withdrawals"
            onClick={handleLinkClick}
            className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
          >
            <WithdrawalIcon className="w-5 h-5 mr-3" />
            Withdrawals
          </NavLink>
          <NavLink 
            to="/referrals"
            onClick={handleLinkClick}
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
    </>
  );
};

export default Sidebar;
