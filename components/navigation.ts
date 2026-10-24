import {
  LayoutDashboard,
  ArrowDownToLine,
  ArrowUpFromLine,
  UserCheck,
  History,
  Wallet,
  TrendingUp,
  Users,
  Handshake,
  Award,
  Share2,
  ClipboardList,
  Users2,
  ListChecks,
  ClipboardCheck,
  PlayCircle,
  Store,
  Ticket,
  Bot,
  ShieldAlert,
  Mail,
  Settings,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

/**
 * Single source of truth for the admin panel's navigation structure.
 *
 * The sidebar renders these sections, and the topbar derives its page
 * title / breadcrumb from the same data, so a page can never be labelled
 * one thing in the menu and another in the header.
 *
 * Every route that exists in App.tsx is listed here exactly once.
 * Detail routes (e.g. /users/:userId) are not menu items; they are
 * resolved by getPageMeta() below so the topbar still names them.
 */
export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Platform overview, totals and pending work at a glance.' },
    ],
  },
  {
    label: 'Approvals & Money',
    items: [
      { path: '/deposits', label: 'Deposits', icon: ArrowDownToLine, description: 'Review deposit requests and payment screenshots.' },
      { path: '/withdrawals', label: 'Withdrawals', icon: ArrowUpFromLine, description: 'Review and process user payout requests.' },
      { path: '/approvals', label: 'Joining Approvals', icon: UserCheck, description: 'Verify activation payments and activate new accounts.' },
      { path: '/history', label: 'Approvals History', icon: History, description: 'Past joining approval decisions.' },
      { path: '/earning-history', label: 'Earning History', icon: Wallet, description: 'Earnings recorded for users across the platform.' },
      { path: '/revenue', label: 'Revenue', icon: TrendingUp, description: 'Platform revenue, commissions and payouts.' },
    ],
  },
  {
    label: 'Users & Growth',
    items: [
      { path: '/users', label: 'Users', icon: Users, description: 'Manage user accounts, balances and status.' },
      { path: '/partner-program', label: 'Partner Program', icon: Handshake, description: 'Partner plans, requests and approvals.' },
      { path: '/partner-profiles', label: 'Partner Profiles', icon: Award, description: 'Partner accounts and their plan tiers.' },
      { path: '/referrals', label: 'Referrals', icon: Share2, description: 'Manage referral bonuses waiting to be paid.' },
      { path: '/referral-report', label: 'Referral Report', icon: ClipboardList, description: 'Referral commissions earned by each user.' },
      { path: '/team', label: 'Team', icon: Users2, description: 'Admin and team member access.' },
    ],
  },
  {
    label: 'Tasks & Content',
    items: [
      { path: '/social-tasks', label: 'Social Tasks', icon: ListChecks, description: 'Manage tasks — user promotion orders are reviewed here too.' },
      { path: '/social-task-submissions', label: 'Task Submissions', icon: ClipboardCheck, description: 'Proof submitted by users for social tasks.' },
      { path: '/video-ads', label: 'Video Ads', icon: PlayCircle, description: 'Video ads users watch to earn.' },
      { path: '/booster-store', label: 'Booster Store', icon: Store, description: 'Boosters for sale and booster purchase requests.' },
      { path: '/lotteries', label: 'Lotteries', icon: Ticket, description: 'Lottery draws, tickets and prizes.' },
    ],
  },
  {
    label: 'Automation & Safety',
    items: [
      { path: '/ai-agent', label: 'AI Agent', icon: Bot, description: 'Automatic approvals, queue switches and agent activity.' },
      { path: '/fraud-detection', label: 'Fraud Detection', icon: ShieldAlert, description: 'Scan user activity for suspicious patterns.' },
    ],
  },
  {
    label: 'Communication',
    items: [
      { path: '/mailbox', label: 'Mailbox', icon: Mail, description: 'Send messages and broadcasts to users.' },
    ],
  },
  {
    label: 'System',
    items: [
      { path: '/settings', label: 'Settings', icon: Settings, description: 'App control: fees, bonuses, payment details and switches.' },
      { path: '/maintenance', label: 'Maintenance', icon: Wrench, description: 'System maintenance tools and data repairs.' },
    ],
  },
];

export interface PageMeta {
  title: string;
  section: string;
  description: string;
}

const DETAIL_ROUTES: { prefix: string; meta: PageMeta }[] = [
  { prefix: '/users/', meta: { title: 'User Profile', section: 'Users & Growth', description: 'Account details, balance and activity for one user.' } },
  { prefix: '/earning-history/', meta: { title: 'User Earning History', section: 'Approvals & Money', description: 'Every earning recorded for this user.' } },
  { prefix: '/referral-report/', meta: { title: 'Referral Detail', section: 'Users & Growth', description: 'Referrals made by this user and commissions paid.' } },
];

/** Resolve the topbar title/breadcrumb for any current pathname. */
export function getPageMeta(pathname: string): PageMeta {
  for (const route of DETAIL_ROUTES) {
    if (pathname.startsWith(route.prefix)) return route.meta;
  }
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (pathname === item.path) {
        return { title: item.label, section: section.label, description: item.description };
      }
    }
  }
  const dashboard = NAV_SECTIONS[0].items[0];
  return { title: dashboard.label, section: NAV_SECTIONS[0].label, description: dashboard.description };
}
