import React, { useState, useEffect } from 'react';
import { rtdb } from '../services/firebase';
import { ref, onValue, get } from 'firebase/database';
import Spinner from '../components/Spinner';

interface Referral {
  id: string;
  referrerUid: string;
  userUid: string;
  referrerName: string;
  userName: string;
  status: 'paid' | 'unpaid';
  commission: number;
}

const ReferralReportPage: React.FC = () => {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const invitesRef = ref(rtdb, 'invites');
    
    const unsubscribe = onValue(invitesRef, async (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setReferrals([]);
        setLoading(false);
        return;
      }

      const allReferrals: Referral[] = [];
      const referrerUids = Object.keys(data);

      // Fetch all referrer names in parallel
      const referrerNames = await Promise.all(
        referrerUids.map(async (uid) => {
          const userSnap = await get(ref(rtdb, `users/${uid}/username`));
          return { uid, name: userSnap.val() || 'Unknown' };
        })
      );
      
      const nameMap = referrerNames.reduce((acc, curr) => ({ ...acc, [curr.uid]: curr.name }), {});

      for (const referrerUid in data) {
        const history = data[referrerUid].history;
        if (history) {
          for (const userUid in history) {
            const referralData = history[userUid];
            allReferrals.push({
              id: `${referrerUid}_${userUid}`,
              referrerUid,
              userUid,
              referrerName: nameMap[referrerUid],
              userName: referralData.userName || 'Unknown',
              status: referralData.status || 'unpaid',
              commission: referralData.status === 'paid' ? 100 : 0,
            });
          }
        }
      }
      setReferrals(allReferrals);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) return <div className="flex justify-center items-center min-h-[400px]"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Referral Report</h1>
      <div className="bg-white dark:bg-slate-900 shadow-md rounded-lg overflow-hidden">
        <table className="min-w-full leading-normal">
          <thead>
            <tr>
              <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Who Invited</th>
              <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Who Joined</th>
              <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Status</th>
              <th className="px-5 py-3 border-b-2 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Earning</th>
            </tr>
          </thead>
          <tbody>
            {referrals.map((ref) => (
              <tr key={ref.id}>
                <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">{ref.referrerName}</td>
                <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">{ref.userName}</td>
                <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${ref.status === 'paid' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                        {ref.status.toUpperCase()}
                    </span>
                </td>
                <td className="px-5 py-5 border-b border-gray-200 dark:border-slate-800 text-sm">
                    {ref.status === 'paid' ? `Rs ${ref.commission}` : 'Pending'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReferralReportPage;
