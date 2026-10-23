import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../services/firebase';
import { signOut } from 'firebase/auth';

const ProtectedRoute: React.FC = () => {
  const { currentUser, loading, isAdmin, adminChecked } = useAuth();

  if (loading || (currentUser && !adminChecked)) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900 px-4">
        <div className="max-w-sm w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Admins Only</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            This account does not have admin access to the TaskMint panel. If you are a team member, ask the owner to add your email under Team.
          </p>
          <button
            onClick={() => signOut(auth)}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-xl transition"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
};

export default ProtectedRoute;
