import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';

/** Custom React Flow edge: a bezier curve with a small arrow marker at its midpoint. */
export function CollapsibleEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd = undefined, style = undefined }) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
          className="grid h-5 w-5 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-faint)] shadow-sm"
        >
          <span className="text-[10px] leading-none">→</span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
