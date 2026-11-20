import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import SeverityBadge from './SeverityBadge.jsx';

// The ordered test cases of a suite. Drag the ⠿ handle with the mouse or a finger,
// or focus it and use Space, the arrow keys, then Space again.
export default function SortableCaseList({ cases, onReorder, onRemove, busy }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const titleOf = (id) => cases.find((c) => c.id === id)?.title ?? 'test case';
  const positionOf = (id) => cases.findIndex((c) => c.id === id) + 1;

  // What screen readers hear while dragging.
  const announcements = {
    onDragStart: ({ active }) => `Picked up "${titleOf(active.id)}", position ${positionOf(active.id)} of ${cases.length}.`,
    onDragOver: ({ active, over }) =>
      over ? `"${titleOf(active.id)}" is over position ${positionOf(over.id)} of ${cases.length}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `Dropped "${titleOf(active.id)}" at position ${positionOf(over.id)} of ${cases.length}.` : `Dropped "${titleOf(active.id)}".`,
    onDragCancel: ({ active }) => `Cancelled. "${titleOf(active.id)}" stays at position ${positionOf(active.id)}.`,
  };

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const from = positionOf(active.id) - 1;
    const to = positionOf(over.id) - 1;
    onReorder(arrayMove(cases, from, to));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{ announcements }}
    >
      <SortableContext items={cases.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <ol className="case-list">
          {cases.map((tc, i) => (
            <SortableCaseRow key={tc.id} testCase={tc} position={i + 1} onRemove={onRemove} busy={busy} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortableCaseRow({ testCase, position, onRemove, busy }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: testCase.id,
    disabled: busy,
  });

  return (
    <li
      ref={setNodeRef}
      className={`case-row${isDragging ? ' is-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="drag-handle"
        aria-label={`Move "${testCase.title}", position ${position}`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <span className="case-position">{position}.</span>
      <span className="case-title">{testCase.title}</span>
      <SeverityBadge severity={testCase.severity} />
      <span className={`status-text status-${testCase.status}`}>{testCase.status}</span>
      <button
        type="button"
        className="icon-button"
        onClick={() => onRemove(testCase)}
        disabled={busy}
        aria-label={`Remove "${testCase.title}" from this suite`}
        title="Remove from suite"
      >
        ✕
      </button>
    </li>
  );
}
