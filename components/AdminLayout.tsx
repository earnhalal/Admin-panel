import React, { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';
import { useTheme } from '../contexts/ThemeContext';
import { 
  LayoutDashboard, 
  Users, 
  Wallet, 
  CheckSquare, 
  Menu,
  PlayCircle,
  Sun,
  Moon
} from 'lucide-react';

const AdminLayout: React.FC = () => {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  const bottomNavItems = [
    { path: '/dashboard', icon: <LayoutDashboard size={24} />, label: 'Home' },
    { path: '/tasks', icon: <CheckSquare size={24} />, label: 'Tasks' },
    { path: '/video-ads', icon: <PlayCircle size={24} />, label: 'Ads' },
    { path: '/withdrawals', icon: <Wallet size={24} />, label: 'Wallet' },
  ];

  const isPathActive = (path: string) => location.pathname.startsWith(path);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-sans transition-colors duration-200">
      {/* Desktop Sidebar / Mobile Drawer */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden transition-all duration-300 md:ml-72">
        
        {/* Top Header */}
        <header className="flex-shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-20 flex items-center justify-between h-16 px-4 sm:px-6 border-b border-gray-200 dark:border-slate-800 sticky top-0 transition-colors duration-200">
           {/* Mobile Header Content */}
          <div className="flex items-center gap-3 md:hidden">
             <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/20">TM</div>
             <span className="font-bold text-gray-900 dark:text-white">TaskMint</span>
          </div>

          {/* Desktop Breadcrumb/Title Placeholder */}
          <div className="hidden md:flex items-center text-sm font-medium text-gray-500 dark:text-gray-400">
             Admin Console / <span className="text-gray-900 dark:text-white ml-1 capitalize">{location.pathname.split('/')[1] || 'Dashboard'}</span>
          </div>
          
          {/* Right Actions */}
          <div className="flex items-center gap-4">
              <button 
                onClick={toggleTheme}
                className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800 transition-colors"
                aria-label="Toggle Dark Mode"
              >
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <NotificationBell />
              <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-700 dark:text-indigo-400 font-bold text-xs border border-indigo-200 dark:border-indigo-800">
                  A
              </div>
          </div>
        </header>
        
        {/* Scrollable Main View */}
        <main className="flex-1 overflow-y-auto scroll-smooth no-scrollbar pb-24 md:pb-6">
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <div className="md:hidden fixed bottom-0 left-0 w-full bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 pb-safe z-30 px-2 py-2 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
          <div className="flex justify-between items-center">
             {bottomNavItems.map((item) => {
               const isActive = isPathActive(item.path);
               return (
                 <NavLink 
                    key={item.path} 
                    to={item.path} 
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-200 flex-1 ${isActive ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                 >
                    <div className={`transition-transform duration-200 ${isActive ? '-translate-y-1' : ''}`}>
                      {item.icon}
                    </div>
                    {isActive && <span className="text-[10px] font-bold animate-fade-in">{item.label}</span>}
                 </NavLink>
               )
             })}
             {/* More Button to open Sidebar Drawer */}
             <button 
                onClick={() => setSidebarOpen(true)}
                className="flex flex-col items-center gap-1 p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-1"
             >
                 <Menu size={24} />
                 <span className="text-[10px] font-medium opacity-0">Menu</span>
             </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AdminLayout;