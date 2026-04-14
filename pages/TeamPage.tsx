import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';
import { UserPlus, Shield, Mail, Trash2, UserCheck, ShieldAlert, ShieldCheck } from 'lucide-react';

interface TeamMember {
  id: string;
  email: string;
  role: 'admin' | 'manager' | 'editor' | 'payment_manager';
  addedAt: any;
  status: 'active' | 'pending';
}

const TeamPage: React.FC = () => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<TeamMember['role']>('editor');
  const { addToast } = useToast();

  useEffect(() => {
    const q = query(collection(db, 'team'), orderBy('addedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const membersList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as TeamMember));
      setMembers(membersList);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching team:", error);
      addToast("Failed to load team members.", "error");
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) return;

    setIsAdding(true);
    try {
      const memberId = newEmail.toLowerCase(); // Use email as ID directly
      await setDoc(doc(db, 'team', memberId), {
        email: newEmail.toLowerCase(),
        role: newRole,
        addedAt: new Date(),
        status: 'active'
      });
      addToast("Team member added successfully!", "success");
      setNewEmail('');
      setNewRole('editor');
    } catch (error) {
      console.error("Error adding member:", error);
      addToast("Failed to add team member.", "error");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveMember = async (id: string) => {
    if (!window.confirm("Are you sure you want to remove this team member?")) return;
    try {
      await deleteDoc(doc(db, 'team', id));
      addToast("Member removed.", "success");
    } catch (error) {
      addToast("Failed to remove member.", "error");
    }
  };

  const getRoleBadge = (role: TeamMember['role']) => {
    switch (role) {
      case 'admin': return <span className="bg-rose-100 text-rose-700 px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1"><ShieldAlert size={12} /> Admin</span>;
      case 'manager': return <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1"><ShieldCheck size={12} /> Manager</span>;
      case 'payment_manager': return <span className="bg-green-100 text-green-700 px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1"><Shield size={12} /> Payments</span>;
      default: return <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1"><UserCheck size={12} /> Editor</span>;
    }
  };

  if (loading) return <div className="flex justify-center items-center min-h-[400px]"><Spinner /></div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Team Management</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Add and manage your team members and their roles.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Add Member Form */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 h-fit">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
            <UserPlus className="text-indigo-500" /> Add New Member
          </h2>
          <form onSubmit={handleAddMember} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input 
                  type="email" 
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="team@example.com"
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
              <select 
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as any)}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="editor">Editor (Tasks & Content)</option>
                <option value="manager">Manager (User & Support)</option>
                <option value="payment_manager">Payment Manager (Withdrawals)</option>
                <option value="admin">Admin (Full Access)</option>
              </select>
            </div>
            <button 
              type="submit" 
              disabled={isAdding}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isAdding ? <Spinner /> : <UserPlus size={18} />}
              Add to Team
            </button>
          </form>
        </div>

        {/* Team List */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Current Team Members</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 dark:border-slate-800">
                  <th className="pb-4 font-bold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Member</th>
                  <th className="pb-4 font-bold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Role</th>
                  <th className="pb-4 font-bold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Status</th>
                  <th className="pb-4 font-bold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800/50">
                {members.map((member) => (
                  <tr key={member.id} className="group hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                          {member.email.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{member.email}</span>
                      </div>
                    </td>
                    <td className="py-4">{getRoleBadge(member.role)}</td>
                    <td className="py-4">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-full">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                        {member.status}
                      </span>
                    </td>
                    <td className="py-4 text-right">
                      <button 
                        onClick={() => handleRemoveMember(member.id)}
                        className="p-2 text-gray-400 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-500 dark:text-gray-400 italic">
                      No team members added yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamPage;
