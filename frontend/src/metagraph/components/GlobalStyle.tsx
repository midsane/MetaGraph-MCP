export function GlobalStyle() {
  return (
    <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

    :root{
      --bg: #0B0D12;
      --surface: #12151C;
      --surface-2: #171B24;
      --border: rgba(255,255,255,0.08);
      --border-strong: rgba(255,255,255,0.16);
      --hover: rgba(255,255,255,0.04);
      --hover-strong: rgba(255,255,255,0.08);
      --text: #F3F2EE;
      --text-dim: #9195A2;
      --text-faint: #5C606B;

      --blue: #5B9CFF;
      --blue-soft: rgba(91,156,255,0.14);

      --amber: #F0A63A;
      --amber-soft: rgba(240,166,58,0.12);
      --teal: #34C3AE;
      --teal-soft: rgba(52,195,174,0.12);
      --violet: #8D7CF6;
      --violet-soft: rgba(141,124,246,0.12);
      --rose: #F2596B;
      --rose-soft: rgba(242,89,107,0.12);
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
      0%   { box-shadow: 0 0 0 0 rgba(52,195,174,0.55); }
      70%  { box-shadow: 0 0 0 6px rgba(52,195,174,0); }
      100% { box-shadow: 0 0 0 0 rgba(52,195,174,0); }
    }
    .mg-live-dot{ animation: mg-pulse 2.2s ease-out infinite; }

    .mg-graph-texture{
      background-image: radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1px);
      background-size: 22px 22px;
    }

    .mg-scroll::-webkit-scrollbar{ width: 8px; height: 8px; }
    .mg-scroll::-webkit-scrollbar-thumb{ background: var(--border-strong); border-radius: 8px; }
    .mg-scroll::-webkit-scrollbar-track{ background: transparent; }
  `}</style>
  );
}
