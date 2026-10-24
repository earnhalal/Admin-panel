import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';

// Session cache for the Firestore users collection.
//
// Several admin pages used to download the ENTIRE users collection
// (3,000+ documents) on every visit — the single biggest drain on the
// free Firestore daily read quota (50k reads/day), which ran out on
// 2026-10-24 and stalled the whole platform. The list is now fetched
// at most once per cache window per panel session and shared by all
// pages that need it.

export interface CachedUser {
  id: string;
  [key: string]: any;
}

const TTL_MS = 30 * 60 * 1000;
let cache: { at: number; users: CachedUser[] } | null = null;
let inflight: Promise<CachedUser[]> | null = null;

export async function getAllUsersCached(force = false): Promise<CachedUser[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.users;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const users = snap.docs.map(d => ({ id: d.id, ...d.data() } as CachedUser));
      cache = { at: Date.now(), users };
      return users;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function invalidateUsersCache() {
  cache = null;
}
