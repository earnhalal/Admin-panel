import React, { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { getPageMeta } from './navigation';
import {
  LayoutDashboard,
  ListChecks,
  PlayCircle,
  ArrowUpFromLine,
  Menu,
  Sun,
  Moon,
  ChevronRight,
} from 'lucide-react';

const AdminLayout: React.FC = () => {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { currentUser } = useAuth();

  const meta = getPageMeta(location.pathname);

  const email = currentUser?.email || '';
  const displayName = email ? email.split('@')[0] : 'Admin';
  const initial = (displayName.charAt(0) || 'A').toUpperCase();

  // Mobile quick bar — every target here is a real route from navigation.ts.
  const bottomNavItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Home' },
    { path: '/social-tasks', icon: ListChecks, label: 'Tasks' },
    { path: '/video-ads', icon: PlayCircle, label: 'Ads' },
    { path: '/withdrawals', icon: ArrowUpFromLine, label: 'Payouts' },
  ];

  const isPathActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div className="flex h-screen bg-[#F5F6FA] dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-sans transition-colors duration-200">
      {/* Desktop Sidebar / Mobile Drawer */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area — offset by the w-64 sidebar on md+ */}
      <div className="flex-1 flex flex-col overflow-hidden transition-all duration-300 md:ml-64">

        {/* Topbar */}
        <header className="flex-shrink-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md z-20 flex items-center justify-between gap-4 h-16 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 sticky top-0 transition-colors duration-200">
          {/* Left: mobile brand / desktop page title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
            <div className="flex items-center gap-2.5 md:hidden">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center text-white text-xs font-black shadow-md shadow-indigo-600/25">TM</div>
              <span className="font-bold text-slate-900 dark:text-white">TaskMint</span>
            </div>
            <div className="hidden md:block min-w-0">
              <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                <span>Admin Panel</span>
                <ChevronRight size={12} />
                <span className="text-indigo-600 dark:text-indigo-400">{meta.section}</span>
              </div>
              <h1 className="text-lg font-bold leading-tight text-slate-900 dark:text-white truncate">{meta.title}</h1>
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
              aria-label="Toggle Dark Mode"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <NotificationBell />
            <div className="hidden sm:block w-px h-8 bg-slate-200 dark:bg-slate-700 mx-1"></div>
            <div className="hidden sm:flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm shadow-indigo-600/30">
                {initial}
              </div>
              <div className="hidden xl:block leading-tight">
                <span className="block text-sm font-semibold text-slate-800 dark:text-white capitalize">{displayName}</span>
                <span className="block text-xs text-slate-400 dark:text-slate-500">{email || 'Administrator'}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Main View */}
        <main className="flex-1 overflow-y-auto scroll-smooth pb-24 md:pb-8">
          <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8 max-w-[1440px] mx-auto w-full">
            <Outlet />
          </div>
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <div className="md:hidden fixed bottom-0 left-0 w-full bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 pb-safe z-30 px-2 py-1.5 shadow-[0_-4px_20px_rgba(15,23,42,0.06)]">
          <div className="flex justify-between items-stretch">
            {bottomNavItems.map((item) => {
              const isActive = isPathActive(item.path);
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors duration-150 flex-1 ${isActive ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                >
                  <item.icon size={22} />
                  <span className={`text-[10px] ${isActive ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
                </NavLink>
              );
            })}
            {/* More Button to open Sidebar Drawer */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex-1"
            >
              <Menu size={22} />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AdminLayout;
