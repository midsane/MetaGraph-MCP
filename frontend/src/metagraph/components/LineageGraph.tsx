import { useMemo } from 'react';
import { Background, BackgroundVariant, Controls, MarkerType, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';
import { AssetNode, NODE_WIDTH, estimateNodeHeight } from './graph/AssetNode.tsx';
import { CollapsibleEdge } from './graph/CollapsibleEdge.tsx';

const nodeTypes = { asset: AssetNode };
const edgeTypes = { collapsible: CollapsibleEdge };

function layoutNodes(nodes, edges) {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'LR', nodesep: 70, ranksep: 140 });
  graph.setDefaultEdgeLabel(() => ({}));

  nodes.forEach(node => {
    graph.setNode(node.id, { width: NODE_WIDTH, height: estimateNodeHeight(node) });
  });
  edges.forEach(edge => {
    graph.setEdge(edge.source, edge.target);
  });

  dagre.layout(graph);

  return nodes.map(node => {
    const { x, y } = graph.node(node.id);
    const height = estimateNodeHeight(node);
    return { ...node, position: { x: x - NODE_WIDTH / 2, y: y - height / 2 } };
  });
}

export function LineageGraph({ nodes, edges, onSelect, selectedId }) {
  const { flowNodes, flowEdges } = useMemo(() => {
    const positioned = layoutNodes(nodes, edges);

    return {
      flowNodes: positioned.map(node => ({
        id: node.id,
        type: 'asset',
        position: node.position,
        selected: node.id === selectedId,
        data: node,
      })),
      flowEdges: edges.map(edge => ({
        id: `${edge.source}->${edge.target}`,
        source: edge.source,
        target: edge.target,
        type: 'collapsible',
      })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, selectedId]);

  return (
    <div className="h-[640px] w-full overflow-hidden rounded-xl">
      <ReactFlowProvider>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={(_, node) => onSelect?.(node.id)}
          onPaneClick={() => onSelect?.(null)}
          fitView
          minZoom={0.25}
          maxZoom={1.5}
          defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--text-faint)' }, style: { stroke: 'var(--border-strong)', strokeWidth: 1.5 } }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="rgba(15,23,42,0.12)" />
          <Controls showInteractive={false} className="!rounded-xl !border !border-[var(--border)] !bg-[var(--surface)] !shadow-lg [&_button]:!border-[var(--border)] [&_button]:!bg-[var(--surface)] [&_button]:!fill-[var(--text-dim)] [&_button:hover]:!bg-[var(--hover)]" />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
