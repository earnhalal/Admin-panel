import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Mail, Send, Trash2, Inbox, Reply, X } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

interface MailMessage {
  id: string;
  title: string;
  body: string;
  createdAt: any;
  sentBy: string;
  direction?: string;
  userId?: string;
  recipient?: string;
  fromName?: string;
  read?: boolean;
  replied?: boolean;
}

const MailboxPage: React.FC = () => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [mails, setMails] = useState<MailMessage[]>([]);
  const [selectedInbox, setSelectedInbox] = useState<MailMessage | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const { showToast } = useToast();

  // Team Inbox: mails users sent from the app's mailbox (relayed by the
  // server agent into `mails` with direction 'inbound').
  const inboxMails = mails.filter((m) => m.direction === 'inbound');
  const unreadInbox = inboxMails.filter((m) => !m.read).length;
  const archiveMails = mails.filter((m) => m.direction !== 'inbound');

  const openInboxMail = async (mail: MailMessage) => {
    setSelectedInbox(mail);
    setReplyBody('');
    if (!mail.read) {
      try { await updateDoc(doc(db, 'mails', mail.id), { read: true }); } catch { /* best-effort */ }
    }
  };

  const handleReply = async () => {
    if (!selectedInbox || !replyBody.trim() || isReplying) return;
    const targetUid = selectedInbox.userId || selectedInbox.recipient;
    if (!targetUid) { showToast('This mail has no sender to reply to', 'error'); return; }
    setIsReplying(true);
    try {
      await addDoc(collection(db, 'mails'), {
        direction: 'outbound',
        userId: targetUid,
        recipient: targetUid,
        title: selectedInbox.title?.toLowerCase().startsWith('re:') ? selectedInbox.title : `Re: ${selectedInbox.title || ''}`,
        body: replyBody.trim(),
        createdAt: serverTimestamp(),
        sentBy: 'Admin'
      });
      // Immediate in-app alert; the mailbox copy itself arrives via the
      // server agent's relay within a couple of minutes.
      await addDoc(collection(db, 'notifications'), {
        userId: targetUid,
        title: 'New mail from the TaskMint team',
        message: replyBody.trim().slice(0, 140),
        type: 'admin',
        status: 'unread',
        timestamp: new Date().toISOString()
      });
      await updateDoc(doc(db, 'mails', selectedInbox.id), { replied: true });
      showToast('Reply sent to the user\'s mailbox', 'success');
      setSelectedInbox({ ...selectedInbox, replied: true });
      setReplyBody('');
    } catch (error) {
      console.error('Error replying to mail:', error);
      showToast('Failed to send the reply', 'error');
    } finally {
      setIsReplying(false);
    }
  };

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

      // Also deliver it into the user app: users read 'notifications', not 'mails'.
      // userId 'all' is the broadcast channel the user app listens to.
      await addDoc(collection(db, 'notifications'), {
        userId: 'all',
        title: title.trim(),
        message: body.trim(),
        type: 'admin',
        status: 'unread',
        timestamp: new Date().toISOString()
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Broadcast Mailbox</h1>
          <p className="text-slate-400 text-sm">Send messages to all users in the app</p>
        </div>
      </div>

      {/* Team Inbox — mails sent by users from the app */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
          <Inbox size={18} className="text-emerald-400" />
          Team Inbox
          {unreadInbox > 0 && (
            <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center">{unreadInbox}</span>
          )}
        </h2>
        <p className="text-slate-400 text-sm mb-4">Mails users send from the app's Mailbox arrive here. Open one to read it and reply — the reply lands in the user's in-app mailbox.</p>

        {selectedInbox ? (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="text-white font-semibold text-lg">{selectedInbox.title}</h3>
              <button onClick={() => setSelectedInbox(null)} className="text-slate-500 hover:text-white p-1" title="Close">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              From <span className="text-slate-300 font-semibold">{selectedInbox.fromName || selectedInbox.sentBy || 'Member'}</span>
              {' • '}{selectedInbox.createdAt?.toDate ? new Date(selectedInbox.createdAt.toDate()).toLocaleString() : 'Just now'}
              {selectedInbox.replied && <span className="ml-2 text-emerald-400 font-semibold">Replied</span>}
            </p>
            <p className="text-slate-300 text-sm whitespace-pre-wrap mb-5">{selectedInbox.body}</p>
            <label className="block text-sm font-medium text-slate-400 mb-1">Reply</label>
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="Write your reply to this user..."
              rows={4}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors resize-none mb-3"
            />
            <button
              onClick={handleReply}
              disabled={isReplying || !replyBody.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 px-5 rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isReplying ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Reply size={16} />}
              Send Reply
            </button>
          </div>
        ) : inboxMails.length === 0 ? (
          <div className="text-center py-10 bg-slate-950/50 rounded-xl border border-slate-800/50">
            <Inbox size={40} className="mx-auto text-slate-600 mb-3" />
            <p className="text-slate-400">No user mails yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {inboxMails.map((mail) => (
              <button
                key={mail.id}
                onClick={() => openInboxMail(mail)}
                className={`w-full text-left bg-slate-950 border rounded-xl px-4 py-3 transition-colors hover:border-slate-600 ${mail.read ? 'border-slate-800' : 'border-emerald-500/40'}`}
              >
                <div className="flex items-center gap-2">
                  {!mail.read && <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />}
                  <span className={`text-sm truncate ${mail.read ? 'text-slate-300 font-medium' : 'text-white font-semibold'}`}>{mail.fromName || mail.sentBy || 'Member'}</span>
                  <span className="flex-1 truncate text-sm text-slate-400">— {mail.title}</span>
                  {mail.replied && <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 shrink-0">Replied</span>}
                  <span className="text-[11px] text-slate-500 shrink-0">{mail.createdAt?.toDate ? new Date(mail.createdAt.toDate()).toLocaleDateString() : ''}</span>
                </div>
                <p className="text-xs text-slate-500 truncate mt-1 pl-4">{mail.body}</p>
              </button>
            ))}
          </div>
        )}
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
              {archiveMails.length === 0 ? (
                <div className="text-center py-12 bg-slate-950/50 rounded-xl border border-slate-800/50">
                  <Mail size={48} className="mx-auto text-slate-600 mb-3" />
                  <p className="text-slate-400">No mails sent yet</p>
                </div>
              ) : (
                archiveMails.map((mail) => (
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
