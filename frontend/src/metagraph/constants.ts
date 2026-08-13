import {
    Database,
    Network,
    Sparkles,
} from 'lucide-react';

export const NAV = [
    { id: 'business-db', icon: Database, label: 'Update Business DB', accent: 'amber' },
    { id: 'context-layer', icon: Network, label: 'Context Layer', accent: 'teal' },
    { id: 'ask', icon: Sparkles, label: 'Ask a Question', accent: 'violet' },
];

export const PII_KEYWORDS = ['ssn', 'email', 'phone', 'dob', 'password', 'credit_card', 'address', 'card_number', 'cvv'];

export const INITIAL_SQL = `-- Executed directly against business-db (schema-qualify with target_db.)
-- Watch the Context Layer graph update on its own once the event
-- listener (npm run sync:watch) reacts to this change.
CREATE TABLE target_db.user_contacts AS
SELECT id, email FROM target_db.raw_users;`;

export const ACCENTS = {
    amber: { text: 'text-[var(--amber)]', bg: 'bg-[var(--amber-soft)]', ring: 'ring-[var(--amber)]/30', solid: '#F0A63A' },
    teal: { text: 'text-[var(--teal)]', bg: 'bg-[var(--teal-soft)]', ring: 'ring-[var(--teal)]/30', solid: '#34C3AE' },
    violet: { text: 'text-[var(--violet)]', bg: 'bg-[var(--violet-soft)]', ring: 'ring-[var(--violet)]/30', solid: '#8D7CF6' },
    rose: { text: 'text-[var(--rose)]', bg: 'bg-[var(--rose-soft)]', ring: 'ring-[var(--rose)]/30', solid: '#F2596B' },
};
