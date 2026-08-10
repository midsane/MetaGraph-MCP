import { useEffect, useRef } from 'react';
import { Network } from 'vis-network/standalone';

const NODE_OPTIONS = {
  shape: 'box',
  margin: 14,
  color: {
    background: '#171B24',
    border: '#34C3AE',
    highlight: { background: '#1C212C', border: '#7FE4D6' },
  },
  font: { color: '#F3F2EE', face: 'JetBrains Mono, monospace', size: 13 },
  borderWidth: 1.5,
  shapeProperties: { borderRadius: 10 },
};

const EDGE_OPTIONS = {
  arrows: 'to',
  color: { color: '#2A2E38', highlight: '#34C3AE' },
  smooth: true,
  width: 1.5,
};

const NETWORK_OPTIONS = {
  layout: { hierarchical: { enabled: true, direction: 'LR', sortMethod: 'directed', levelSeparation: 180 } },
  physics: false,
  interaction: { hover: true },
};

export function LineageGraph({ nodes, edges }) {
  const graphElement = useRef(null);
  const networkRef = useRef(null);

  useEffect(() => {
    if (!graphElement.current || !nodes.length) {
      return undefined;
    }

    networkRef.current?.destroy();

    networkRef.current = new Network(graphElement.current, {
      nodes: nodes.map(node => ({ id: node.id, label: node.label, ...NODE_OPTIONS })),
      edges: edges.map(edge => ({ from: edge.from, to: edge.to, ...EDGE_OPTIONS })),
    }, {
      ...NETWORK_OPTIONS,
      layout: {
        hierarchical: {
          ...NETWORK_OPTIONS.layout.hierarchical,
          enabled: edges.length > 0,
        },
      },
      physics: edges.length === 0 ? { enabled: true } : false,
    });

    networkRef.current.fit({ animation: { duration: 250, easingFunction: 'easeInOutQuad' } });

    return () => networkRef.current?.destroy();
  }, [edges, nodes]);

  return <div ref={graphElement} className="h-[460px] w-full rounded-xl border border-white/10 bg-[var(--bg)]" />;
}