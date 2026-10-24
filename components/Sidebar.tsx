import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LogOut, X } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import { NAV_SECTIONS } from './navigation';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out', error);
    }
  };

  const handleLinkClick = () => {
    if (window.innerWidth < 768) {
      onClose();
    }
  };

  const email = currentUser?.email || '';
  const displayName = email ? email.split('@')[0] : 'Admin';
  const initial = (displayName.charAt(0) || 'A').toUpperCase();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
      isActive
        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 hover:bg-indigo-600'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
    }`;

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className={`fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      ></div>

      {/* Sidebar Container — light panel (deep indigo in dark mode) */}
      <aside className={`fixed top-0 left-0 h-full w-64 bg-white dark:bg-indigo-950 border-r border-slate-200 dark:border-indigo-900 flex flex-col z-50 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>

        {/* Brand Header */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-slate-100 dark:border-indigo-900 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-[10px] flex items-center justify-center text-white text-sm font-black shadow-md shadow-indigo-600/25">TM</div>
            <div className="leading-tight">
              <span className="block text-[15px] font-bold text-slate-900 dark:text-white tracking-tight">TaskMint</span>
              <span className="block text-[10px] font-semibold text-indigo-600 dark:text-indigo-300 uppercase tracking-[0.14em]">Admin Panel</span>
            </div>
          </div>
          <button onClick={onClose} className="md:hidden text-slate-400 hover:text-slate-700 dark:hover:text-white p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10" aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        {/* Grouped Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV_SECTIONS.map((section, sectionIdx) => (
            <div key={section.label} className={sectionIdx === 0 ? '' : 'mt-6'}>
              <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-indigo-300/60">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink key={item.path} to={item.path} onClick={handleLinkClick} className={linkClass}>
                    <item.icon size={18} className="shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Admin identity + Sign out */}
        <div className="p-3 border-t border-slate-100 dark:border-indigo-900 shrink-0">
          <div className="flex items-center gap-3 px-2 py-1.5">
            <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 flex items-center justify-center font-bold text-sm shrink-0">
              {initial}
            </div>
            <div className="min-w-0 leading-tight">
              <span className="block text-sm font-semibold text-slate-800 dark:text-white truncate capitalize">{displayName}</span>
              <span className="block text-xs text-slate-400 dark:text-indigo-300/70 truncate">{email || 'Administrator'}</span>
            </div>
          </div>
          <button onClick={handleLogout} className="mt-1.5 w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors duration-150">
            <LogOut size={18} className="shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
