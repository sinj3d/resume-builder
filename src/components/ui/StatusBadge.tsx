import { CSSProperties } from 'react';
import { ApplicationStatus, APPLICATION_STATUSES } from '../../lib/tauri';

interface StatusToken {
  label: string;
  border: string;
  text: string;
  bg: string;
  darkBorder: string;
  darkText: string;
  darkBg: string;
}

export const STATUS_TOKENS: Record<ApplicationStatus, StatusToken> = {
  wishlist: {
    label: 'Wishlist',
    border: '#9c927e', text: '#6e6553', bg: 'rgba(156,146,126,.08)',
    darkBorder: '#93896f', darkText: '#b4a68a', darkBg: 'rgba(180,166,138,.12)',
  },
  applied: {
    label: 'Applied',
    border: '#8a3d22', text: '#8a3d22', bg: 'rgba(138,61,34,.06)',
    darkBorder: '#d98c5f', darkText: '#d98c5f', darkBg: 'rgba(217,140,95,.10)',
  },
  interviewing: {
    label: 'Interviewing',
    border: '#b8860b', text: '#8a6d1f', bg: 'rgba(184,134,11,.07)',
    darkBorder: '#d4a83f', darkText: '#d4a83f', darkBg: 'rgba(212,168,63,.12)',
  },
  offer: {
    label: 'Offer',
    border: '#3d6b35', text: '#3d6b35', bg: 'rgba(61,107,53,.07)',
    darkBorder: '#6fae62', darkText: '#6fae62', darkBg: 'rgba(111,174,98,.12)',
  },
  rejected: {
    label: 'Rejected',
    border: '#a1453a', text: '#a1453a', bg: 'rgba(161,69,58,.07)',
    darkBorder: '#d97567', darkText: '#d97567', darkBg: 'rgba(217,117,103,.12)',
  },
};

const BADGE_CLASSES =
  'rounded-full border px-3.5 py-[5px] text-[11px] font-semibold uppercase tracking-[.05em] ' +
  'border-[color:var(--sb-border)] text-[color:var(--sb-text)] bg-[color:var(--sb-bg)] ' +
  'dark:border-[color:var(--sb-border-dark)] dark:text-[color:var(--sb-text-dark)] dark:bg-[color:var(--sb-bg-dark)]';

function tokenStyle(t: StatusToken): CSSProperties {
  return {
    '--sb-border': t.border,
    '--sb-text': t.text,
    '--sb-bg': t.bg,
    '--sb-border-dark': t.darkBorder,
    '--sb-text-dark': t.darkText,
    '--sb-bg-dark': t.darkBg,
  } as CSSProperties;
}

interface StatusBadgeProps {
  status: ApplicationStatus;
  interactive?: boolean;
  onChange?: (status: ApplicationStatus) => void;
}

export default function StatusBadge({ status, interactive = false, onChange }: StatusBadgeProps) {
  const t = STATUS_TOKENS[status];

  if (interactive) {
    return (
      <select
        value={status}
        onChange={e => onChange?.(e.target.value as ApplicationStatus)}
        style={tokenStyle(t)}
        className={`${BADGE_CLASSES} cursor-pointer appearance-none text-center`}
      >
        {APPLICATION_STATUSES.map(s => (
          <option key={s} value={s}>{STATUS_TOKENS[s].label}</option>
        ))}
      </select>
    );
  }

  return (
    <span style={tokenStyle(t)} className={BADGE_CLASSES}>
      {t.label}
    </span>
  );
}
