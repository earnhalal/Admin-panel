import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';
import { Check, X, User as UserIcon, Handshake, Mail, Link as LinkIcon, Calendar, Search, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PartnerRequest {
  id: string;
  userId?: string;
  name?: string;
  email?: string;
  socialLink?: string;
  message?: string;
  status?: string;
  createdAt?: any;
}

const PartnerProgramPage: React.FC = () => {
  const [requests, setRequests] = useState<PartnerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState<{[key: string]: boolean}>({});
  const { addToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(collection(db, 'partnerRequests'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const requestsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PartnerRequest[];
      
      // Filter only pending requests by default, or show all if you prefer
      const pendingRequests = requestsData.filter(req => req.status === 'pending' || !req.status);
      setRequests(pendingRequests);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching partner requests:", error);
      addToast("Failed to load partner requests.", "error");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [addToast]);

  const handleApprove = async (request: PartnerRequest) => {
    setActionLoading(prev => ({...prev, [request.id]: true}));
    try {
        // Update request status
        await updateDoc(doc(db, 'partnerRequests', request.id), {
            status: 'approved',
            updatedAt: new Date()
        });
        
        // Optionally update the user's profile to make them a partner
        if (request.userId) {
            await updateDoc(doc(db, 'users', request.userId), {
                isPartner: true,
                partnerSince: new Date()
            });
        }
        
        addToast("Partner request approved successfully!", "success");
    } catch(error) {
        console.error(error);
        addToast("Failed to approve request.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [request.id]: false}));
    }
  };

  const handleReject = async (request: PartnerRequest) => {
    setActionLoading(prev => ({...prev, [request.id]: true}));
    try {
        await updateDoc(doc(db, 'partnerRequests', request.id), {
            status: 'rejected',
            updatedAt: new Date()
        });
        addToast("Partner request rejected.", "success");
    } catch (error) {
        console.error(error);
        addToast("Failed to reject request.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [request.id]: false}));
    }
  };

  const handleDelete = async (request: PartnerRequest) => {
    if (!window.confirm("Are you sure you want to delete this request?")) return;
    setActionLoading(prev => ({...prev, [request.id]: true}));
    try {
        await deleteDoc(doc(db, 'partnerRequests', request.id));
        addToast("Request deleted.", "success");
    } catch (error) {
        console.error(error);
        addToast("Failed to delete request.", "error");
    } finally {
        setActionLoading(prev => ({...prev, [request.id]: false}));
    }
  };

  const filteredRequests = requests.filter(req => 
    req.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.userId?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="flex justify-center items-center min-h-[400px]"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-gray-500"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Handshake className="text-indigo-500" /> Partner Program
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Manage incoming partnership requests</p>
        </div>
      </div>

      <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by Name, Email or User ID..."
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
      </div>

      {filteredRequests.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-gray-100 dark:border-slate-800">
              <div className="w-16 h-16 bg-gray-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Handshake className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">No pending requests</h3>
              <p className="text-gray-500 dark:text-gray-400">There are no new partner program requests at the moment.</p>
          </div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredRequests.map((req) => (
                  <div key={req.id} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                      <div className="p-6 flex-grow">
                          <div className="flex items-center gap-3 mb-4">
                              <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                  <UserIcon size={20} />
                              </div>
                              <div className="overflow-hidden">
                                  <h3 className="font-bold text-gray-900 dark:text-white truncate">{req.name || 'Unknown User'}</h3>
                                  <p className="text-xs text-gray-500 truncate">ID: {req.userId || 'N/A'}</p>
                              </div>
                          </div>
                          
                          <div className="space-y-3">
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1"><Mail size={14} /> Email</span>
                                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate max-w-[150px]" title={req.email}>{req.email || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1"><LinkIcon size={14} /> Social</span>
                                  <a href={req.socialLink} target="_blank" rel="noreferrer" className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline truncate max-w-[150px]">
                                      {req.socialLink || 'No Link'}
                                  </a>
                              </div>
                              <div className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-slate-800">
                                  <span className="text-xs text-gray-500 flex items-center gap-1"><Calendar size={14} /> Date</span>
                                  <span className="text-sm text-gray-700 dark:text-gray-300">
                                      {req.createdAt ? new Date(req.createdAt?.seconds * 1000 || req.createdAt).toLocaleDateString() : 'N/A'}
                                  </span>
                              </div>
                              
                              {req.message && (
                                  <div className="pt-2">
                                      <span className="text-xs text-gray-500 block mb-1">Message</span>
                                      <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded-lg text-sm text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-slate-700 max-h-24 overflow-y-auto">
                                          {req.message}
                                      </div>
                                  </div>
                              )}
                          </div>
                      </div>
                      
                      <div className="p-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex gap-3">
                          <button 
                            onClick={() => handleReject(req)}
                            disabled={actionLoading[req.id]}
                            className="flex-1 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-sm font-bold hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors flex items-center justify-center gap-2"
                          >
                              {actionLoading[req.id] ? <Spinner size="sm" /> : <><X size={16} /> Reject</>}
                          </button>
                          <button 
                            onClick={() => handleApprove(req)}
                            disabled={actionLoading[req.id]}
                            className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-green-600/20"
                          >
                              {actionLoading[req.id] ? <Spinner size="sm" /> : <><Check size={16} /> Approve</>}
                          </button>
                      </div>
                  </div>
              ))}
          </div>
      )}
    </div>
  );
};

export default PartnerProgramPage;
