

import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { MenuIcon } from './icons/MenuIcon';

const AdminLayout: React.FC = () => {
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-200">
      <header className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm z-30 flex items-center px-4 border-b border-slate-200 dark:border-slate-800">
         <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-md">
            <MenuIcon className="w-6 h-6" />
         </button>
      </header>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <main className="flex-1 flex flex-col overflow-hidden transition-all duration-300 md:ml-64">
        <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto mt-16 md:mt-0">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;