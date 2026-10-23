import {
  collection, doc, getDoc, getDocs, query, where, updateDoc, setDoc,
  addDoc, increment, Timestamp, serverTimestamp
} from 'firebase/firestore';
import {
  ref as rtdbRef, get as rtdbGet, set as rtdbSet, update as rtdbUpdate,
  remove as rtdbRemove, increment as rtdbIncrement
} from 'firebase/database';
import { db, rtdb } from './firebase';

/**
 * TaskMint AI Agent engine.
 *
 * The agent performs the SAME writes the manual admin pages perform
 * (deposit approval, joining activation, promotion handling with refunds
 * and commission, partner unlock) — but only when a request passes clear,
 * objective safety checks. Anything uncertain is left pending for a human
 * (reported as "escalated"). Every action is written to `agent_logs`.
 *
 * Withdrawals are guarded, not paid: the agent never invents a payment
 * transaction reference. It only auto-rejects requests whose payout
 * account details are objectively incomplete (with the standard refund).
 */

export interface AgentSettings {
  enabled: boolean;
  deposits: boolean;
  joining: boolean;
  promotions: boolean;
  partner: boolean;
  withdrawalsGuard: boolean;
  maxAutoDeposit: number;
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  enabled: false,
  deposits: true,
  joining: true,
  promotions: true,
  partner: true,
  withdrawalsGuard: true,
  maxAutoDeposit: 5000
};

export interface AgentAction {
  queue: 'deposit' | 'joining' | 'promotion' | 'partner' | 'withdrawal';
  targetId: string;
  userId?: string;
  action: 'approved' | 'rejected';
  reasons: string[];
  amount?: number;
}

export interface AgentRunResult {
  actions: AgentAction[];
  escalated: Record<string, number>;
}

const norm = (v: any) => String(v ?? '').trim().toLowerCase();
const isPending = (v: any) => norm(v) === 'pending';

async function logAction(a: AgentAction) {
  try {
    await addDoc(collection(db, 'agent_logs'), {
      ...a,
      actor: 'ai-agent',
      timestamp: serverTimestamp()
    });
  } catch (e) {}
}

async function notifyUser(userId: string, title: string, message: string, type: string) {
  try {
    await addDoc(collection(db, 'notifications'), {
      userId, title, message, type, status: 'unread',
      timestamp: new Date().toISOString()
    });
  } catch (e) {}
}

async function creditBothLedgers(userId: string, amount: number) {
  const balRef = rtdbRef(rtdb, `users/${userId}/balance`);
  const snap = await rtdbGet(balRef);
  await rtdbSet(balRef, (snap.val() || 0) + amount);
  try {
    await updateDoc(doc(db, 'users', userId), { balance: increment(amount) });
  } catch (e) {
    await setDoc(doc(db, 'users', userId), { balance: increment(amount) }, { merge: true });
  }
}

/* ------------------------------ DEPOSITS ------------------------------ */

async function approveDeposit(d: any) {
  await creditBothLedgers(d.userId, d.amount);
  if (d.type === 'activation') {
    await rtdbSet(rtdbRef(rtdb, 'users/' + d.userId + '/status'), 'active');
    await rtdbSet(rtdbRef(rtdb, 'users/' + d.userId + '/feeStatus'), 'paid');
  }
  await updateDoc(doc(db, 'deposits', d.id), {
    status: 'Approved', approvedAt: Timestamp.now(), handledBy: 'ai-agent'
  });
}

async function rejectDeposit(d: any, reason: string) {
  await updateDoc(doc(db, 'deposits', d.id), {
    status: 'Rejected', rejectedAt: Timestamp.now(), handledBy: 'ai-agent', agentNote: reason
  });
  if (d.type === 'activation') {
    try { await rtdbRemove(rtdbRef(rtdb, `pending_requests/${d.userId}`)); } catch (e) {}
    try { await rtdbSet(rtdbRef(rtdb, 'users/' + d.userId + '/status'), 'rejected'); } catch (e) {}
  }
  await notifyUser(d.userId, 'Deposit Rejected',
    `Your deposit of Rs. ${d.amount} was rejected by our verification system: ${reason}. If you believe this is a mistake, please contact support on WhatsApp.`, 'deposit');
}

async function processDeposits(s: AgentSettings, out: AgentRunResult) {
  const snap = await getDocs(collection(db, 'deposits'));
  const all = snap.docs.map(x => ({ id: x.id, ...(x.data() as any) }));
  const txOf = (d: any) => norm(d.transactionId || d.txnId || d.transactionID);
  const txCounts = new Map<string, number>();
  const txApproved = new Set<string>();
  for (const d of all) {
    const tx = txOf(d);
    if (!tx) continue;
    txCounts.set(tx, (txCounts.get(tx) || 0) + 1);
    if (norm(d.status) === 'approved') txApproved.add(tx);
  }
  for (const d of all.filter(x => isPending(x.status))) {
    const tx = txOf(d);
    if (!d.userId || !(Number(d.amount) > 0)) {
      await rejectDeposit(d, 'Invalid deposit amount or missing user');
      out.actions.push({ queue: 'deposit', targetId: d.id, userId: d.userId, action: 'rejected', reasons: ['Invalid amount or missing user'], amount: d.amount });
    } else if (!tx) {
      await rejectDeposit(d, 'Missing transaction ID');
      out.actions.push({ queue: 'deposit', targetId: d.id, userId: d.userId, action: 'rejected', reasons: ['Missing transaction ID'], amount: d.amount });
    } else if (txApproved.has(tx) || (txCounts.get(tx) || 0) > 1) {
      await rejectDeposit(d, 'Duplicate transaction ID');
      out.actions.push({ queue: 'deposit', targetId: d.id, userId: d.userId, action: 'rejected', reasons: ['Duplicate transaction ID'], amount: d.amount });
    } else if (Number(d.amount) > s.maxAutoDeposit) {
      out.escalated.deposit++;
    } else {
      await approveDeposit(d);
      out.actions.push({ queue: 'deposit', targetId: d.id, userId: d.userId, action: 'approved', reasons: ['Unique transaction ID', `Within auto limit Rs. ${s.maxAutoDeposit}`], amount: d.amount });
    }
  }
}

/* ------------------------------ JOINING ------------------------------- */

async function activateJoining(userId: string) {
  await rtdbUpdate(rtdbRef(rtdb, 'users/' + userId), {
    status: 'active', feeStatus: 'paid', isActivated: true, isPaid: true, paymentStatus: 'verified'
  });
  try {
    await updateDoc(doc(db, 'users', userId), {
      status: 'active', isActivated: true, isPaid: true, paymentStatus: 'verified'
    });
  } catch (e) {}
  try { await rtdbRemove(rtdbRef(rtdb, `pending_requests/${userId}`)); } catch (e) {}
}

async function processJoining(out: AgentRunResult) {
  const pendingSnap = await rtdbGet(rtdbRef(rtdb, 'pending_requests'));
  if (!pendingSnap.exists()) return;
  const pending = pendingSnap.val() || {};
  let fee = 150;
  try {
    const sDoc = await getDoc(doc(db, 'app_settings', 'global'));
    if (sDoc.exists() && Number((sDoc.data() as any).activationFee) > 0) fee = Number((sDoc.data() as any).activationFee);
  } catch (e) {}

  for (const userId of Object.keys(pending)) {
    const uSnap = await rtdbGet(rtdbRef(rtdb, 'users/' + userId));
    const u = uSnap.val() || {};
    if (norm(u.status) === 'active') {
      try { await rtdbRemove(rtdbRef(rtdb, `pending_requests/${userId}`)); } catch (e) {}
      out.actions.push({ queue: 'joining', targetId: userId, userId, action: 'approved', reasons: ['Account already active — cleared from queue'] });
      continue;
    }
    // Referred users stay manual so the full referral-bonus flow runs.
    let hasReferrer = !!(u.referredBy || u.referrerUid || u.referrerId || u.invitedBy);
    if (!hasReferrer) {
      try {
        const fs = await getDoc(doc(db, 'users', userId));
        if (fs.exists()) {
          const f = fs.data() as any;
          hasReferrer = !!(f.referredBy || f.referrerUid || f.referrerId || f.invitedBy);
        }
      } catch (e) {}
    }
    if (hasReferrer) { out.escalated.joining++; continue; }

    // Verified payment evidence: an approved activation deposit for this user.
    let paid = false;
    try {
      const q = query(collection(db, 'deposits'), where('userId', '==', userId));
      const ds = await getDocs(q);
      paid = ds.docs.some(x => {
        const d = x.data() as any;
        return norm(d.status) === 'approved' && (d.type === 'activation' || Number(d.amount) >= fee);
      });
    } catch (e) {}
    if (paid) {
      await activateJoining(userId);
      out.actions.push({ queue: 'joining', targetId: userId, userId, action: 'approved', reasons: ['Activation payment verified', 'No referrer — no bonus chain needed'] });
    } else {
      out.escalated.joining++;
    }
  }
}

/* ----------------------------- PROMOTIONS ----------------------------- */

async function approvePromotion(order: any) {
  const quantity = order.quantity || order.totalLimit || 100;
  const gross = order.price || 0;
  const unitPrice = order.unitPrice || (quantity > 0 ? gross / quantity : 0);
  let commissionRate = 10;
  try {
    const rateSnap = await rtdbGet(rtdbRef(rtdb, 'settings/taskCommissionRate'));
    if (rateSnap.exists() && !isNaN(Number(rateSnap.val()))) commissionRate = Number(rateSnap.val());
  } catch (e) {}
  const commission = Math.round(gross * commissionRate) / 100;
  const workerReward = unitPrice > 0
    ? Math.max(0.05, Math.round(unitPrice * (100 - commissionRate)) / 100)
    : (order.reward || 0.20);

  await addDoc(collection(db, 'social_tasks'), {
    title: order.title || 'Untitled',
    description: order.description || '',
    platform: order.platform || 'other',
    reward: workerReward,
    link: order.link || '',
    totalLimit: quantity,
    views: 0,
    status: 'active',
    createdAt: Timestamp.now(),
    orderId: order.id,
    userId: order.userId
  });
  await updateDoc(doc(db, 'promotion_orders', order.id), {
    status: 'approved', approvedAt: Timestamp.now(), handledBy: 'ai-agent',
    quantity, workerReward, adminCommission: commission
  });
  if (commission > 0) {
    await addDoc(collection(db, 'revenueTransactions'), {
      adminFeeAmount: commission, originalAmount: gross, sourceUser: order.userId,
      timestamp: Timestamp.now(), transactionType: 'task_commission', relatedDocId: order.id
    });
  }
}

async function rejectPromotion(order: any, reason: string) {
  await updateDoc(doc(db, 'promotion_orders', order.id), {
    status: 'rejected', rejectedAt: Timestamp.now(), handledBy: 'ai-agent', agentNote: reason
  });
  if (order.price && order.price > 0 && order.userId) {
    await rtdbUpdate(rtdbRef(rtdb, `users/${order.userId}`), { balance: rtdbIncrement(order.price) });
    try {
      await updateDoc(doc(db, 'users', order.userId), { balance: increment(order.price) });
    } catch (e) {
      await setDoc(doc(db, 'users', order.userId), { balance: increment(order.price) }, { merge: true });
    }
    await updateDoc(doc(db, 'promotion_orders', order.id), { refundedAmount: order.price });
    await notifyUser(order.userId, 'Promotion Order Rejected',
      `Your promotion order (${order.service || order.title || 'Promotion'}) was not approved: ${reason}. Rs. ${order.price} has been refunded to your TaskMint balance.`, 'promotion');
  }
}

async function processPromotions(out: AgentRunResult) {
  const q = query(collection(db, 'promotion_orders'), where('status', '==', 'pending'));
  const snap = await getDocs(q);
  for (const x of snap.docs) {
    const order: any = { id: x.id, ...x.data() };
    const link = String(order.link || '');
    const validLink = /^https?:\/\/[^\s]+\.[^\s]+/i.test(link);
    if (!validLink) {
      await rejectPromotion(order, 'Invalid or missing promotion link');
      out.actions.push({ queue: 'promotion', targetId: order.id, userId: order.userId, action: 'rejected', reasons: ['Invalid or missing link — refunded'], amount: order.price });
    } else if (!(Number(order.price) > 0) && !(Number(order.quantity) > 0)) {
      out.escalated.promotion++;
    } else {
      await approvePromotion(order);
      out.actions.push({ queue: 'promotion', targetId: order.id, userId: order.userId, action: 'approved', reasons: ['Valid link', 'Task created with platform commission'], amount: order.price });
    }
  }
}

/* ------------------------------ PARTNER ------------------------------- */

async function approvePartner(req: any) {
  await updateDoc(doc(db, 'partnerRequests', req.id), {
    status: 'approved', updatedAt: new Date(), handledBy: 'ai-agent'
  });
  if (req.userId) {
    await updateDoc(doc(db, 'users', req.userId), {
      isPartner: true, partnerSince: new Date(),
      role: 'partner', partnerStatus: 'active', partnerTier: 'silver'
    });
    try {
      await rtdbUpdate(rtdbRef(rtdb, `users/${req.userId}`), { role: 'partner', partnerStatus: 'active' });
    } catch (e) {}
  }
}

async function rejectPartner(req: any, reason: string) {
  await updateDoc(doc(db, 'partnerRequests', req.id), {
    status: 'rejected', updatedAt: new Date(), handledBy: 'ai-agent', agentNote: reason
  });
  if (req.userId) {
    try { await updateDoc(doc(db, 'users', req.userId), { partnerStatus: 'none' }); } catch (e) {}
    try { await rtdbUpdate(rtdbRef(rtdb, `users/${req.userId}`), { partnerStatus: 'none' }); } catch (e) {}
    await notifyUser(req.userId, 'Partner Request Rejected',
      `Your partner upgrade request was not approved: ${reason}. You can submit a new request with a valid transaction ID.`, 'partner');
  }
}

async function processPartner(out: AgentRunResult) {
  const snap = await getDocs(collection(db, 'partnerRequests'));
  const all = snap.docs.map(x => ({ id: x.id, ...(x.data() as any) }));
  const txCounts = new Map<string, number>();
  for (const r of all) {
    const tx = norm(r.txId);
    if (tx) txCounts.set(tx, (txCounts.get(tx) || 0) + 1);
  }
  for (const r of all.filter(x => isPending(x.status))) {
    const tx = norm(r.txId);
    if (!tx) {
      await rejectPartner(r, 'Missing transaction ID');
      out.actions.push({ queue: 'partner', targetId: r.id, userId: r.userId, action: 'rejected', reasons: ['Missing transaction ID'] });
    } else if ((txCounts.get(tx) || 0) > 1) {
      await rejectPartner(r, 'Transaction ID already used');
      out.actions.push({ queue: 'partner', targetId: r.id, userId: r.userId, action: 'rejected', reasons: ['Duplicate transaction ID'] });
    } else {
      await approvePartner(r);
      out.actions.push({ queue: 'partner', targetId: r.id, userId: r.userId, action: 'approved', reasons: ['Unique transaction ID', 'Partner unlocked (role + status + tier)'] });
    }
  }
}

/* ----------------------------- WITHDRAWALS ---------------------------- */

async function processWithdrawalsGuard(out: AgentRunResult) {
  const snap = await getDocs(collection(db, 'withdrawals'));
  for (const x of snap.docs) {
    const w: any = { id: x.id, ...x.data() };
    if (!isPending(w.status)) continue;
    const acct = String(w.accountNumber || w.accountDetails?.accountNumber || '').trim();
    const name = String(w.accountName || w.accountDetails?.accountName || '').trim();
    if (!acct || !name) {
      await updateDoc(doc(db, 'withdrawals', w.id), {
        status: 'rejected', rejectionReason: 'Incomplete payout account details', rejectedAt: Timestamp.now(), handledBy: 'ai-agent'
      });
      if (w.userId && Number(w.amount) > 0) {
        await creditBothLedgers(w.userId, Number(w.amount));
      }
      out.actions.push({ queue: 'withdrawal', targetId: w.id, userId: w.userId, action: 'rejected', reasons: ['Incomplete payout account details — refunded'], amount: w.amount });
    } else {
      // Valid withdrawals stay for a human: paying out needs a real
      // payment transaction reference the agent must never invent.
      out.escalated.withdrawal++;
    }
  }
}

/* -------------------------------- RUNNER ------------------------------ */

export async function runAgent(settings: AgentSettings): Promise<AgentRunResult> {
  const out: AgentRunResult = {
    actions: [],
    escalated: { deposit: 0, joining: 0, promotion: 0, partner: 0, withdrawal: 0 }
  };
  if (settings.deposits) await processDeposits(settings, out);
  if (settings.joining) await processJoining(out);
  if (settings.promotions) await processPromotions(out);
  if (settings.partner) await processPartner(out);
  if (settings.withdrawalsGuard) await processWithdrawalsGuard(out);

  for (const a of out.actions) await logAction(a);
  try {
    await addDoc(collection(db, 'agent_logs'), {
      queue: 'run', targetId: 'summary', action: 'summary',
      reasons: [`${out.actions.length} actions taken`],
      escalated: out.escalated, actor: 'ai-agent', timestamp: serverTimestamp()
    });
  } catch (e) {}
  return out;
}
