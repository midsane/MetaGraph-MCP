import { GitBranch } from 'lucide-react';
import { ACCENTS, NAV } from '../constants.ts';

export function Sidebar({ activeTab, onSelectTab }) {
  return (
    <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 bg-[var(--bg)] p-2 lg:w-56 lg:flex-col lg:border-b-0 lg:border-r lg:border-white/10 lg:p-4">
      <div className="hidden items-center gap-2 px-3 pb-5 lg:flex">
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-[var(--surface)]">
          <GitBranch size={16} className="text-[var(--teal)]" />
        </span>
        <span className="mg-display text-[15px] font-semibold tracking-tight">MetaGraph</span>
      </div>

      {NAV.map(tab => {
        const accent = ACCENTS[tab.accent];
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
              isActive ? `${accent.bg} ${accent.text} ring-1 ${accent.ring}` : 'text-[var(--text-dim)] hover:bg-white/5 hover:text-[var(--text)]'
            }`}
          >
            <tab.icon size={17} />{tab.label}
          </button>
        );
      })}
    </nav>
  );
}
