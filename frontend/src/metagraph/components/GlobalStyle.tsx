export function GlobalStyle() {
  return (
    <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

    :root{
      --bg: #F5F6F8;
      --surface: #FFFFFF;
      --surface-2: #F1F2F5;
      --border: rgba(15,23,42,0.09);
      --border-strong: rgba(15,23,42,0.16);
      --hover: rgba(15,23,42,0.04);
      --hover-strong: rgba(15,23,42,0.07);
      --text: #0F172A;
      --text-dim: #5B6472;
      --text-faint: #939BA8;

      --blue: #2563EB;
      --blue-soft: rgba(37,99,235,0.10);

      --amber: #B45309;
      --amber-soft: #FEF3C7;
      --teal: #0F766E;
      --teal-soft: #CCFBF1;
      --violet: #6D28D9;
      --violet-soft: #EDE9FE;
      --rose: #BE123C;
      --rose-soft: #FFE4E6;
    }

    .mg-root{
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
    }
    .mg-display{ font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif; letter-spacing: -0.01em; }
    .mg-mono{ font-family: 'JetBrains Mono', ui-monospace, monospace; }

    .mg-root *:focus-visible{
      outline: 2px solid var(--blue);
      outline-offset: 2px;
      border-radius: 4px;
    }

    @keyframes mg-pulse{
      0%   { box-shadow: 0 0 0 0 rgba(15,118,110,0.35); }
      70%  { box-shadow: 0 0 0 6px rgba(15,118,110,0); }
      100% { box-shadow: 0 0 0 0 rgba(15,118,110,0); }
    }
    .mg-live-dot{ animation: mg-pulse 2.2s ease-out infinite; }

    .mg-graph-texture{
      background-image: radial-gradient(rgba(15,23,42,0.08) 1px, transparent 1px);
      background-size: 22px 22px;
    }

    .mg-scroll::-webkit-scrollbar{ width: 8px; height: 8px; }
    .mg-scroll::-webkit-scrollbar-thumb{ background: var(--border-strong); border-radius: 8px; }
    .mg-scroll::-webkit-scrollbar-track{ background: transparent; }
  `}</style>
  );
}
