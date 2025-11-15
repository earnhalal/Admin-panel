import React, { useState } from 'react';
import { collection, query, where, getDocs, doc, runTransaction, updateDoc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useToast } from '../contexts/ToastContext';
import { decideReferralApproval, decideTaskApproval } from '../services/aiService';
import { User } from './UsersPage';
import { Task, UserTask } from './TasksPage';
import { AiIcon } from '../components/icons/AiIcon';
import Spinner from '../components/Spinner';

interface Referral {
    id: string;
    referrerId: string;
    referredId: string;
    status: 'pending_bonus' | 'approved' | 'rejected';
    bonusAmount: number;
    createdAt: Timestamp;
    referrerEmail?: string;
}


const AiAutomationsPage: React.FC = () => {
    const { addToast } = useToast();

    const [isProcessingReferrals, setIsProcessingReferrals] = useState(false);
    const [referralLogs, setReferralLogs] = useState<string[]>([]);
    const [referralStats, setReferralStats] = useState({ processed: 0, approved: 0, rejected: 0, failed: 0 });

    const [isProcessingTasks, setIsProcessingTasks] = useState(false);
    const [taskLogs, setTaskLogs] = useState<string[]>([]);
    const [taskStats, setTaskStats] = useState({ processed: 0, approved: 0, rejected: 0, failed: 0 });

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


    const AutomationCard: React.FC<{
        title: string;
        description: string;
        onRun: () => void;
        isProcessing: boolean;
        stats: { processed: number; approved: number; rejected: number; failed: number };
        logs: string[];
        icon: React.ReactNode;
    }> = ({ title, description, onRun, isProcessing, stats, logs, icon }) => (
        <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl p-6">
            <div className="flex items-start gap-4">
                <div className="bg-indigo-100 dark:bg-indigo-900/50 p-3 rounded-lg">{icon}</div>
                <div>
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white">{title}</h2>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">{description}</p>
                </div>
            </div>
            <div className="mt-6 flex flex-col sm:flex-row items-center gap-4">
                 <button
                    onClick={onRun}
                    disabled={isProcessing}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors duration-200 disabled:bg-indigo-400 disabled:cursor-wait"
                >
                    {isProcessing ? <><Spinner /> Processing...</> : 'Run AI Now'}
                </button>
                <div className="flex-1 text-sm text-center sm:text-left text-gray-500 dark:text-gray-300">
                    Processed: <span className="font-bold">{stats.processed}</span> | 
                    Approved: <span className="font-bold text-green-600 dark:text-green-400">{stats.approved}</span> | 
                    Rejected: <span className="font-bold text-red-600 dark:text-red-400">{stats.rejected}</span> |
                    Failed: <span className="font-bold text-yellow-600 dark:text-yellow-400">{stats.failed}</span>
                </div>
            </div>
            {logs.length > 0 && (
                <div className="mt-4 bg-gray-100 dark:bg-gray-900 rounded-lg p-4 max-h-60 overflow-y-auto">
                    <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">{logs.join('\n')}</pre>
                </div>
            )}
        </div>
    );

    return (
        <div className="container mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">AI Automations</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-8">Use AI to automate repetitive approval tasks. Click a button to process all pending items in a category.</p>

            <div className="space-y-8">
                <AutomationCard 
                    title="Referral Bonus Automation"
                    description="AI will check if a referred user's payment is 'verified' and approve the bonus for the referrer accordingly."
                    onRun={processPendingReferrals}
                    isProcessing={isProcessingReferrals}
                    stats={referralStats}
                    logs={referralLogs}
                    icon={<AiIcon className="w-6 h-6 text-indigo-500" />}
                />
                 <AutomationCard 
                    title="Task Submission Automation"
                    description="AI will approve task submissions based on the current policy. (Currently defaults to approval)."
                    onRun={processPendingTasks}
                    isProcessing={isProcessingTasks}
                    stats={taskStats}
                    logs={taskLogs}
                    icon={<AiIcon className="w-6 h-6 text-indigo-500" />}
                />
            </div>
        </div>
    );
};

export default AiAutomationsPage;