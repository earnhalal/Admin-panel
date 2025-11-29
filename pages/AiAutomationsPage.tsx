import React, { useState } from 'react';
import { collection, query, where, getDocs, doc, runTransaction, updateDoc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useToast } from '../contexts/ToastContext';
import { decideReferralApproval, decideTaskApproval, decideWithdrawalRequest, generateSmartReport } from '../services/aiService';
import { User } from './UsersPage';
import { Task, UserTask } from './TasksPage';
import { AiIcon } from '../components/icons/AiIcon';
import Spinner from '../components/Spinner';
import { SparklesIcon } from '../components/icons/SparklesIcon';

interface Referral {
    id: string;
    referrerId: string;
    referredId: string;
    status: 'pending_bonus' | 'approved' | 'rejected';
    bonusAmount: number;
    createdAt: Timestamp;
    referrerEmail?: string;
}

interface WithdrawalRequest {
  id: string;
  userId: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
}


const AiAutomationsPage: React.FC = () => {
    const { addToast } = useToast();

    // Stats for Automations
    const [isProcessingReferrals, setIsProcessingReferrals] = useState(false);
    const [referralLogs, setReferralLogs] = useState<string[]>([]);
    const [referralStats, setReferralStats] = useState({ processed: 0, approved: 0, rejected: 0, failed: 0 });

    const [isProcessingTasks, setIsProcessingTasks] = useState(false);
    const [taskLogs, setTaskLogs] = useState<string[]>([]);
    const [taskStats, setTaskStats] = useState({ processed: 0, approved: 0, rejected: 0, failed: 0 });

    const [isProcessingWithdrawals, setIsProcessingWithdrawals] = useState(false);
    const [withdrawalLogs, setWithdrawalLogs] = useState<string[]>([]);
    const [withdrawalStats, setWithdrawalStats] = useState({ processed: 0, kept_pending: 0, rejected: 0, failed: 0 });

    // Stats for Smart Report
    const [aiReport, setAiReport] = useState<string | null>(null);
    const [isReportLoading, setIsReportLoading] = useState(false);


    const handleApproveBonus = async (referral: Referral) => {
        await runTransaction(db, async (transaction) => {
            const referrerRef = doc(db, 'users', referral.referrerId);
            const referralRef = doc(db, 'referrals', referral.id);
            const referrerDoc = await transaction.get(referrerRef);
            if (!referrerDoc.exists()) throw "Referrer document not found!";
            const newBalance = referrerDoc.data().balance + referral.bonusAmount;
            transaction.update(referrerRef, { balance: newBalance });
            transaction.update(referralRef, { status: 'approved' });
        });
    };

    const handleRejectBonus = async (referralId: string) => {
        const referralRef = doc(db, 'referrals', referralId);
        await updateDoc(referralRef, { status: 'rejected' });
    };

    const processPendingReferrals = async () => {
        setIsProcessingReferrals(true);
        setReferralLogs(['▶️ Starting AI processing for pending referrals...']);
        setReferralStats({ processed: 0, approved: 0, rejected: 0, failed: 0 });

        try {
            const q = query(collection(db, 'referrals'), where('status', '==', 'pending_bonus'));
            const snapshot = await getDocs(q);
            const pendingReferrals = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Referral));

            if (pendingReferrals.length === 0) {
                setReferralLogs(prev => [...prev, '✅ No pending referrals to process.']);
                setIsProcessingReferrals(false);
                return;
            }

            setReferralLogs(prev => [...prev, `🔍 Found ${pendingReferrals.length} pending referral(s).`]);

            for (const referral of pendingReferrals) {
                setReferralStats(prev => ({ ...prev, processed: prev.processed + 1 }));
                const referredUserRef = doc(db, 'users', referral.referredId);
                const referredUserDoc = await getDoc(referredUserRef);
                
                if (!referredUserDoc.exists()) {
                    setReferralLogs(prev => [...prev, `[ERROR] Referred user ${referral.referredId} not found. Skipping.`]);
                    setReferralStats(prev => ({ ...prev, failed: prev.failed + 1 }));
                    continue;
                }

                const referredUser = { id: referredUserDoc.id, ...referredUserDoc.data() } as User;
                setReferralLogs(prev => [...prev, `🤔 Analyzing referral for ${referredUser.email}...`]);

                const decision = await decideReferralApproval(referredUser);
                setReferralLogs(prev => [...prev, `💡 AI decision for ${referredUser.email}: ${decision}`]);

                if (decision === 'APPROVE') {
                    await handleApproveBonus(referral);
                    setReferralStats(prev => ({ ...prev, approved: prev.approved + 1 }));
                    setReferralLogs(prev => [...prev, `[SUCCESS] Approved bonus for referral ${referral.id}.`]);
                } else if (decision === 'REJECT') {
                    await handleRejectBonus(referral.id);
                    setReferralStats(prev => ({ ...prev, rejected: prev.rejected + 1 }));
                    setReferralLogs(prev => [...prev, `[REJECTED] Rejected bonus for referral ${referral.id}.`]);
                } else {
                    setReferralStats(prev => ({ ...prev, failed: prev.failed + 1 }));
                    setReferralLogs(prev => [...prev, `[FAIL] AI failed to decide for ${referredUser.email}. Skipping.`]);
                }
            }
            addToast('AI referral processing complete!', 'success');
            setReferralLogs(prev => [...prev, '🏁 Processing complete.']);
        } catch (error) {
            console.error("Error during referral processing: ", error);
            addToast('An error occurred during AI processing.', 'error');
            setReferralLogs(prev => [...prev, `[FATAL ERROR] ${error instanceof Error ? error.message : 'Unknown error'}`]);
        } finally {
            setIsProcessingReferrals(false);
        }
    };
    
    // Task processing logic
    const handleApproveSubmission = async (submission: UserTask) => {
        await runTransaction(db, async (transaction) => {
            const userRef = doc(db, 'users', submission.userId);
            const submissionRef = doc(db, 'userTasks', submission.id);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) throw "User document not found!";
            const newBalance = userDoc.data().balance + (submission.taskReward || 0);
            transaction.update(userRef, { balance: newBalance });
            transaction.update(submissionRef, { status: 'approved' });
        });
    };
    
    const handleRejectSubmission = async (submissionId: string) => {
        const submissionRef = doc(db, 'userTasks', submissionId);
        await updateDoc(submissionRef, { status: 'rejected' });
    };

    const processPendingTasks = async () => {
        setIsProcessingTasks(true);
        setTaskLogs(['▶️ Starting AI processing for pending task submissions...']);
        setTaskStats({ processed: 0, approved: 0, rejected: 0, failed: 0 });

         try {
            const q = query(collection(db, 'userTasks'), where('status', '==', 'submitted'));
            const snapshot = await getDocs(q);
            const pendingTasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UserTask));

            if (pendingTasks.length === 0) {
                setTaskLogs(prev => [...prev, '✅ No pending submissions to process.']);
                setIsProcessingTasks(false);
                return;
            }
            setTaskLogs(prev => [...prev, `🔍 Found ${pendingTasks.length} pending submission(s).`]);

            for (const taskSub of pendingTasks) {
                setTaskStats(prev => ({ ...prev, processed: prev.processed + 1 }));
                const userRef = doc(db, 'users', taskSub.userId);
                const taskRef = doc(db, 'tasks', taskSub.taskId);
                const userDoc = await getDoc(userRef);
                const taskDoc = await getDoc(taskRef);

                if (!userDoc.exists() || !taskDoc.exists()) {
                     setTaskLogs(prev => [...prev, `[ERROR] User or Task not found for submission ${taskSub.id}. Skipping.`]);
                    setTaskStats(prev => ({ ...prev, failed: prev.failed + 1 }));
                    continue;
                }

                const user = userDoc.data() as User;
                const task = taskDoc.data() as Task;
                taskSub.taskReward = task.reward; // Ensure reward is populated
                
                setTaskLogs(prev => [...prev, `🤔 Analyzing submission from ${user.email} for task "${task.title}"...`]);

                const decision = await decideTaskApproval({ userEmail: user.email, taskTitle: task.title });
                setTaskLogs(prev => [...prev, `💡 AI decision for ${user.email}: ${decision}`]);

                if (decision === 'APPROVE') {
                    await handleApproveSubmission(taskSub);
                    setTaskStats(prev => ({ ...prev, approved: prev.approved + 1 }));
                    setTaskLogs(prev => [...prev, `[SUCCESS] Approved submission ${taskSub.id}.`]);
                } else if (decision === 'REJECT') { // This path is less likely based on the prompt but good to have
                    await handleRejectSubmission(taskSub.id);
                    setTaskStats(prev => ({ ...prev, rejected: prev.rejected + 1 }));
                    setTaskLogs(prev => [...prev, `[REJECTED] Rejected submission ${taskSub.id}.`]);
                } else {
                    setTaskStats(prev => ({ ...prev, failed: prev.failed + 1 }));
                    setTaskLogs(prev => [...prev, `[FAIL] AI failed to decide for submission ${taskSub.id}. Skipping.`]);
                }
            }
             addToast('AI task processing complete!', 'success');
            setTaskLogs(prev => [...prev, '🏁 Processing complete.']);

        } catch (error) {
            console.error("Error during task processing: ", error);
            addToast('An error occurred during AI processing.', 'error');
            setTaskLogs(prev => [...prev, `[FATAL ERROR] ${error instanceof Error ? error.message : 'Unknown error'}`]);
        } finally {
            setIsProcessingTasks(false);
        }
    };

     const processPendingWithdrawals = async () => {
        setIsProcessingWithdrawals(true);
        setWithdrawalLogs(['▶️ Starting AI processing for pending withdrawals...']);
        setWithdrawalStats({ processed: 0, kept_pending: 0, rejected: 0, failed: 0 });

        try {
            const q = query(collection(db, 'withdrawal_requests'), where('status', '==', 'pending'));
            const snapshot = await getDocs(q);
            const pending = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as WithdrawalRequest));

            if (pending.length === 0) {
                setWithdrawalLogs(p => [...p, '✅ No pending withdrawals.']);
                setIsProcessingWithdrawals(false);
                return;
            }
            setWithdrawalLogs(p => [...p, `🔍 Found ${pending.length} pending withdrawal(s).`]);

            for (const request of pending) {
                setWithdrawalStats(p => ({ ...p, processed: p.processed + 1 }));
                const userDoc = await getDoc(doc(db, 'users', request.userId));
                if (!userDoc.exists()) {
                    setWithdrawalLogs(p => [...p, `[ERROR] User ${request.userId} not found. Skipping.`]);
                    setWithdrawalStats(p => ({ ...p, failed: p.failed + 1 }));
                    continue;
                }
                const user = { id: userDoc.id, ...userDoc.data() } as User;
                setWithdrawalLogs(p => [...p, `🤔 Analyzing withdrawal from ${user.email} for Rs ${request.amount}...`]);

                const { decision, reason } = await decideWithdrawalRequest(user, request);
                setWithdrawalLogs(p => [...p, `💡 AI decision for ${user.email}: ${decision}. Reason: ${reason}`]);

                if (decision === 'REJECT') {
                    await runTransaction(db, async (transaction) => {
                        const withdrawalRef = doc(db, 'withdrawal_requests', request.id);
                        const userRef = doc(db, 'users', request.userId);
                        const newBalance = user.balance + request.amount;
                        transaction.update(userRef, { balance: newBalance });
                        transaction.update(withdrawalRef, { status: 'rejected', rejectionReason: `AI: ${reason}` });
                    });
                    setWithdrawalStats(p => ({ ...p, rejected: p.rejected + 1 }));
                    setWithdrawalLogs(p => [...p, `[REJECTED] Rejected withdrawal for ${user.email}. Funds returned.`]);
                } else {
                    setWithdrawalStats(p => ({ ...p, kept_pending: p.kept_pending + 1 }));
                    setWithdrawalLogs(p => [...p, `[PENDING] Request for ${user.email} left for manual review.`]);
                }
            }
            addToast('AI withdrawal processing complete!', 'success');
            setWithdrawalLogs(p => [...p, '🏁 Processing complete.']);
        } catch (error) {
            addToast('Error during withdrawal processing.', 'error');
            setWithdrawalLogs(p => [...p, `[FATAL ERROR] ${error instanceof Error ? error.message : 'Unknown error'}`]);
        } finally {
            setIsProcessingWithdrawals(false);
        }
    };

    const handleGenerateSmartReport = async () => {
        setIsReportLoading(true);
        setAiReport(null);
        try {
            // Fetch live stats for the report
            const usersSnap = await getDocs(collection(db, 'users'));
            const userCount = usersSnap.size;
            const totalBalance = usersSnap.docs.reduce((acc, doc) => acc + (doc.data().balance || 0), 0);
            
            const withdrawSnap = await getDocs(query(collection(db, 'withdrawal_requests'), where('status', '==', 'Pending')));
            const pendingWithdrawals = withdrawSnap.size;

            const approvedWithdrawalsSnap = await getDocs(query(collection(db, 'withdrawal_requests'), where('status', '==', 'Approved')));
            const totalWithdrawn = approvedWithdrawalsSnap.docs.reduce((acc, doc) => acc + (doc.data().amount || 0), 0);

            const submissionsSnap = await getDocs(query(collection(db, 'userTasks'), where('status', '==', 'submitted')));
            const pendingSubmissions = submissionsSnap.size;
            
            const tasksSnap = await getDocs(query(collection(db, 'tasks'), where('status', '==', 'pending')));
            const pendingTaskRequests = tasksSnap.size;

            const stats = {
                userCount,
                totalBalance,
                totalWithdrawn,
                pendingWithdrawals,
                pendingSubmissions,
                pendingTaskRequests
            };

            const report = await generateSmartReport(stats);
            setAiReport(report);
            addToast("Business report generated successfully!", "success");
        } catch (error) {
            const message = error instanceof Error ? error.message : "An unknown error occurred.";
            addToast(`Report generation failed: ${message}`, 'error');
        } finally {
            setIsReportLoading(false);
        }
    };


    const AutomationCard: React.FC<{
        title: string;
        description: string;
        onRun: () => void;
        isProcessing: boolean;
        stats: any;
        logs: string[];
        icon: React.ReactNode;
        resultLabels: { [key: string]: string };
    }> = ({ title, description, onRun, isProcessing, stats, logs, icon, resultLabels }) => (
        <div className="bg-white dark:bg-slate-900 shadow-sm border border-gray-100 dark:border-slate-800 rounded-2xl p-6">
            <div className="flex items-start gap-4">
                <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-xl text-indigo-600 dark:text-indigo-400">{icon}</div>
                <div>
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white">{title}</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{description}</p>
                </div>
            </div>
            <div className="mt-6 flex flex-col sm:flex-row items-center gap-4">
                 <button
                    onClick={onRun}
                    disabled={isProcessing}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors duration-200 disabled:bg-indigo-400 disabled:cursor-wait"
                >
                    {isProcessing ? <><Spinner /> Processing...</> : 'Run Auto-Pilot'}
                </button>
                <div className="flex-1 text-xs text-center sm:text-left text-gray-500 dark:text-gray-300">
                    Processed: <span className="font-bold">{stats.processed}</span> | 
                    {Object.entries(resultLabels).map(([key, label]) => (
                        <React.Fragment key={key}>
                            {` ${label}: `}<span className={`font-bold ${key.includes('reject') ? 'text-rose-600 dark:text-rose-400' : key.includes('approve') || key.includes('kept') ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{stats[key]}</span> |
                        </React.Fragment>
                    ))}
                    Failed: <span className="font-bold text-amber-600 dark:text-amber-400">{stats.failed}</span>
                </div>
            </div>
            {logs.length > 0 && (
                <div className="mt-4 bg-gray-50 dark:bg-slate-950 rounded-lg p-4 max-h-48 overflow-y-auto border border-gray-100 dark:border-slate-800">
                    <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono">{logs.join('\n')}</pre>
                </div>
            )}
        </div>
    );

    return (
        <div className="container mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">AI Automations</h1>
            <p className="text-gray-500 dark:text-gray-400 mb-8">Deploy AI agents to automate platform management tasks and generate insights.</p>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                 {/* Smart Report Card - New Addition */}
                <div className="lg:col-span-3 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-6 shadow-lg text-white">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                                <SparklesIcon className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold">AI Smart Business Report</h2>
                                <p className="text-purple-100 text-sm mt-1">Get an instant, data-driven summary of your platform's performance.</p>
                            </div>
                        </div>
                         <button 
                            onClick={handleGenerateSmartReport}
                            disabled={isReportLoading}
                            className="bg-white text-indigo-600 px-5 py-2.5 rounded-xl font-bold text-sm shadow-md hover:bg-purple-50 transition-colors disabled:opacity-75 disabled:cursor-wait flex items-center gap-2"
                        >
                            {isReportLoading ? <Spinner /> : null}
                            {isReportLoading ? 'Analyzing...' : 'Generate New Report'}
                        </button>
                    </div>

                    {aiReport && (
                        <div className="mt-6 bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 animate-fade-in">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-200 mb-2">AI Analysis</h3>
                            <div className="prose prose-sm prose-invert max-w-none text-white whitespace-pre-wrap leading-relaxed">
                                {aiReport}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-6">
                <AutomationCard 
                    title="Withdrawal Request Auto-Pilot"
                    description="AI checks for suspicious withdrawal patterns (new users, high amounts) and can reject them or flag for review."
                    onRun={processPendingWithdrawals}
                    isProcessing={isProcessingWithdrawals}
                    stats={withdrawalStats}
                    logs={withdrawalLogs}
                    icon={<AiIcon className="w-6 h-6" />}
                    resultLabels={{ kept_pending: 'Review Needed', rejected: 'Rejected' }}
                />
                <AutomationCard 
                    title="Referral Bonus Auto-Pilot"
                    description="AI verifies if a referred user has a valid 'verified' payment status before releasing bonuses to referrers."
                    onRun={processPendingReferrals}
                    isProcessing={isProcessingReferrals}
                    stats={referralStats}
                    logs={referralLogs}
                    icon={<AiIcon className="w-6 h-6" />}
                    resultLabels={{ approved: 'Approved', rejected: 'Rejected' }}
                />
                 <AutomationCard 
                    title="Task Submission Auto-Pilot"
                    description="AI automatically approves standard task submissions based on predefined policies to speed up user payouts."
                    onRun={processPendingTasks}
                    isProcessing={isProcessingTasks}
                    stats={taskStats}
                    logs={taskLogs}
                    icon={<AiIcon className="w-6 h-6" />}
                    resultLabels={{ approved: 'Approved', rejected: 'Rejected' }}
                />
            </div>
        </div>
    );
};

export default AiAutomationsPage;