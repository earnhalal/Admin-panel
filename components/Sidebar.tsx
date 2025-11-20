import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  CheckSquare, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  Share2, 
  Bot, 
  ShieldAlert, 
  Settings, 
  LogOut, 
  Store,
  DollarSign,
  X
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../services/firebase';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();

  // Base styling for links
  const commonLinkClass = "flex items-center px-4 py-3.5 text-sm font-medium text-gray-400 rounded-xl transition-all duration-200 group hover:bg-slate-800 hover:text-emerald-400";
  const activeLinkClass = "bg-emerald-600/10 text-emerald-500 shadow-none border border-emerald-600/20";

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
  }

  return (
    <>
      {/* Mobile Backdrop */}
      <div 
        className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      ></div>

      {/* Sidebar Container */}
      <aside className={`fixed top-0 left-0 h-full w-72 bg-slate-950 border-r border-slate-800 flex flex-col z-50 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        {/* Header */}
        <div className="flex justify-between items-center h-20 px-6 border-b border-slate-800/50">
          <div className="flex items-center gap-2">
             <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-emerald-900/50">EH</div>
             <span className="text-lg font-bold text-white tracking-tight">Earn Halal</span>
          </div>
          <button onClick={onClose} className="md:hidden text-gray-400 hover:text-white p-2 rounded-lg hover:bg-slate-800">
             <X size={20} />
          </button>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 flex flex-col gap-1 p-4 overflow-y-auto no-scrollbar">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-4 mt-2">Overview</div>
          <NavLink to="/dashboard" onClick={handleLinkClick} className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}>
            <LayoutDashboard size={20} className="mr-3" /> Dashboard
          </NavLink>
          <NavLink to="/revenue" onClick={handleLinkClick} className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}>
            <DollarSign size={20} className="mr-3" /> Revenue
          </NavLink>

          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-4 mt-4">Management</div>
          <NavLink to="/users" onClick={handleLinkClick} className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}>
            <Users size={20} className="mr-3" /> Users
          </NavLink>
          <NavLink to="/tasks" onClick={handleLinkClick} className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}>
            <CheckSquare size={20} className="mr-3" /> Tasks
          </NavLink>
          <NavLink to="/booster-store" onClick={handleLinkClick} className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}>
            <Store size={20} className="mr-3" /> Booster Store
          </NavLink>

          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-4 mt-4">Finance</div>
          <NavLink to="/withdrawals" onClick={handleLinkClick} className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}>
            <ArrowUpFromLine size={20} className="mr-3" /> Withdrawals
          </NavLink>
          <NavLink to="/deposits" onClick={handleLinkClick} className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}>
            <ArrowDownToLine size={20} className="mr-3" /> Deposits
          </NavLink>

          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-4 mt-4">System</div>
          <NavLink to="/referrals" onClick={handleLinkClick} className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}>
            <Share2 size={20} className="mr-3" /> Referrals
          </NavLink>
          <NavLink to="/ai-automations" onClick={handleLinkClick} className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}>
            <Bot size={20} className="mr-3" /> AI Automations
          </NavLink>
          <NavLink to="/fraud-detection" onClick={handleLinkClick} className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}>
            <ShieldAlert size={20} className="mr-3" /> Fraud Detection
          </NavLink>
          <NavLink to="/settings" onClick={handleLinkClick} className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}>
            <Settings size={20} className="mr-3" /> Settings
          </NavLink>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800/50 bg-slate-950">
          <button onClick={handleLogout} className="w-full flex items-center px-4 py-3 text-sm font-medium text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors duration-200">
              <LogOut size={20} className="mr-3" />
              Sign Out
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;