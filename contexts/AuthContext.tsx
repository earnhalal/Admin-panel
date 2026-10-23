import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';

const OWNER_EMAIL = 'r83842009@gmail.com';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  isAdmin: boolean;
  adminChecked: boolean;
}

const AuthContext = createContext<AuthContextType>({ currentUser: null, loading: true, isAdmin: false, adminChecked: false });

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setLoading(false);
      if (!user) {
        setIsAdmin(false);
        setAdminChecked(true);
        return;
      }
      // Admin access = owner email, Firestore users role 'admin', or a team membership
      try {
        if (user.email === OWNER_EMAIL) {
          setIsAdmin(true);
          return;
        }
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        if (userSnap.exists() && userSnap.data().role === 'admin') {
          setIsAdmin(true);
          return;
        }
        if (user.email) {
          const teamSnap = await getDoc(doc(db, 'team', user.email));
          if (teamSnap.exists() && teamSnap.data().role) {
            setIsAdmin(true);
            return;
          }
        }
        setIsAdmin(false);
      } catch (e) {
        setIsAdmin(false);
      } finally {
        setAdminChecked(true);
      }
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    loading,
    isAdmin,
    adminChecked,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
