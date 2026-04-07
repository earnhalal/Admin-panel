import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Mail, Send, Trash2 } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

interface MailMessage {
  id: string;
  title: string;
  body: string;
  createdAt: any;
  sentBy: string;
}

const MailboxPage: React.FC = () => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [mails, setMails] = useState<MailMessage[]>([]);
  const { showToast } = useToast();

  useEffect(() => {
    const q = query(collection(db, 'mails'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const mailData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MailMessage[];
      setMails(mailData);
    }, (error) => {
      console.error("Error fetching mails:", error);
      showToast("Failed to load mails", "error");
    });

    return () => unsubscribe();
  }, [showToast]);

  const handleSendMail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      showToast("Title and body are required", "error");
      return;
    }

    setIsSending(true);
    try {
      await addDoc(collection(db, 'mails'), {
        title: title.trim(),
        body: body.trim(),
        createdAt: serverTimestamp(),
        sentBy: 'Admin'
      });
      showToast("Mail sent successfully to all users!", "success");
      setTitle('');
      setBody('');
    } catch (error) {
      console.error("Error sending mail:", error);
      showToast("Failed to send mail", "error");
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteMail = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this mail? It will be removed from all users' mailboxes.")) return;
    
    try {
      await deleteDoc(doc(db, 'mails', id));
      showToast("Mail deleted successfully", "success");
    } catch (error) {
      console.error("Error deleting mail:", error);
      showToast("Failed to delete mail", "error");
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-indigo-600/20 rounded-xl flex items-center justify-center text-indigo-500">
          <Mail size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Broadcast Mailbox</h1>
          <p className="text-slate-400 text-sm">Send messages to all users in the app</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Compose Section */}
        <div className="lg:col-span-1">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Send size={18} className="text-indigo-400" />
              Compose New Mail
            </h2>
            <form onSubmit={handleSendMail} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="E.g., Welcome to the new update!"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Message Body</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your message here..."
                  rows={6}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors resize-none"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isSending}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSending ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Send size={18} />
                    Send to All Users
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Sent Mails History */}
        <div className="lg:col-span-2">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-full">
            <h2 className="text-lg font-semibold text-white mb-4">Sent Mails History</h2>
            
            <div className="space-y-4">
              {mails.length === 0 ? (
                <div className="text-center py-12 bg-slate-950/50 rounded-xl border border-slate-800/50">
                  <Mail size={48} className="mx-auto text-slate-600 mb-3" />
                  <p className="text-slate-400">No mails sent yet</p>
                </div>
              ) : (
                mails.map((mail) => (
                  <div key={mail.id} className="bg-slate-950 border border-slate-800 rounded-xl p-5 group hover:border-slate-700 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-white font-medium text-lg">{mail.title}</h3>
                      <button 
                        onClick={() => handleDeleteMail(mail.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded-lg hover:bg-rose-400/10 transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete Mail"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <p className="text-slate-400 text-sm whitespace-pre-wrap mb-3">{mail.body}</p>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Sent by {mail.sentBy}</span>
                      <span>
                        {mail.createdAt?.toDate ? new Date(mail.createdAt.toDate()).toLocaleString() : 'Just now'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MailboxPage;
