import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  
  useEffect(() => {
    if (currentUser) {
      navigate('/dashboard');
    }
  }, [currentUser, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!email || !password) {
        setError('Please enter both email and password.');
        setLoading(false);
        return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError('Failed to log in. Please check your credentials.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4 sm:p-0">
      <div className="w-full max-w-md p-8 space-y-8 bg-white dark:bg-gray-800 rounded-2xl shadow-lg">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white">
            Admin Panel Login
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Sign in to manage your application
          </p>
        </div>
        {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 dark:bg-red-900 dark:text-red-300 dark:border-red-700 px-4 py-3 rounded-lg relative" role="alert">
                <span className="block sm:inline">{error}</span>
            </div>
        )}
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">Email address</label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-500 text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-500 text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
