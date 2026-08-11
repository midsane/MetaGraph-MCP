import {
    GitBranch,
    ShieldAlert,
    Sparkles,
    UploadCloud,
} from 'lucide-react';

export const NAV = [
    { id: 'ingest', icon: UploadCloud, label: 'Ingest', accent: 'amber' },
    { id: 'lineage', icon: GitBranch, label: 'Lineage', accent: 'teal' },
    { id: 'governance', icon: ShieldAlert, label: 'Governance', accent: 'amber' },
    { id: 'rag', icon: Sparkles, label: 'Ask catalog', accent: 'violet' },
];

export const PII_KEYWORDS = ['ssn', 'email', 'phone', 'dob', 'password', 'credit_card', 'address', 'card_number', 'cvv'];

export const INITIAL_SQL = `CREATE TABLE raw_users (
  id UUID,
  full_name VARCHAR(255),
  email VARCHAR(255),
  ssn VARCHAR(11)
);

CREATE TABLE stg_users AS
SELECT id, full_name, email FROM raw_users;`;

export const ACCENTS = {
    amber: { text: 'text-[var(--amber)]', bg: 'bg-[var(--amber-soft)]', ring: 'ring-[var(--amber)]/30', solid: '#F0A63A' },
    teal: { text: 'text-[var(--teal)]', bg: 'bg-[var(--teal-soft)]', ring: 'ring-[var(--teal)]/30', solid: '#34C3AE' },
    violet: { text: 'text-[var(--violet)]', bg: 'bg-[var(--violet-soft)]', ring: 'ring-[var(--violet)]/30', solid: '#8D7CF6' },
    rose: { text: 'text-[var(--rose)]', bg: 'bg-[var(--rose-soft)]', ring: 'ring-[var(--rose)]/30', solid: '#F2596B' },
};