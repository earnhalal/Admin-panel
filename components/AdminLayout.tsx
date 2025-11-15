import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { MenuIcon } from './icons/MenuIcon';
import NotificationBell from './NotificationBell';

const AdminLayout: React.FC = () => {
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-200">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="flex-1 flex flex-col overflow-hidden transition-all duration-300 md:ml-64">
        <header className="flex-shrink-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm z-20 flex items-center justify-between h-16 px-4 sm:px-6 md:px-8 border-b border-slate-200 dark:border-slate-800">
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 rounded-md md:hidden">
              <MenuIcon className="w-6 h-6" />
          </button>
          <div className="md:hidden"></div> {/* Spacer for mobile */}
          <div className="hidden md:block">
            {/* Can add breadcrumbs or page title here later */}
          </div>
          <div className="flex items-center gap-4">
              <NotificationBell />
          </div>
        </header>
        
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;