import React, { useState, useEffect } from 'react';
import { useToast } from '../contexts/ToastContext';
import { get, ref } from 'firebase/database';
import { rtdb } from '../services/firebase';

const ReferralsPage: React.FC = () => {
    return (
        <div className="container mx-auto max-w-4xl pt-8">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">Manage Referral Bonuses</h1>
            
            <div className="bg-white dark:bg-slate-900 shadow-xl rounded-2xl p-8 text-center border border-gray-100 dark:border-slate-800">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">🚀</span>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                    Referrals are now Automated
                </h2>
                <p className="text-gray-600 dark:text-gray-400 text-lg mb-6">
                    To save database limits and make your work easier, referral bonuses are now <b>automatically granted</b> when you approve a user's payment or activation request.
                </p>
                <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl text-left inline-block">
                    <h3 className="font-semibold text-indigo-900 dark:text-indigo-300 mb-2">How it works now:</h3>
                    <ul className="list-disc list-inside text-indigo-700 dark:text-indigo-400 space-y-1 text-sm">
                        <li>Go to <b>Users</b> or <b>Joining Approvals</b>.</li>
                        <li>Approve the user's payment request.</li>
                        <li>The system instantly finds their inviter and credits Rs 125 to their RTDB balance!</li>
                        <li>Use the "Sync Old Referrals" button in the Users page for old users.</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default ReferralsPage;