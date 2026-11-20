import { useEffect, useRef, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import SeverityBadge from './SeverityBadge.jsx';

// The ordered test cases of a suite.
// Mouse and touch: drag the ⠿ handle (dnd-kit).
// Keyboard: focus ⠿, press Space or Enter to pick up, arrow keys to move one place per press,
// Space or Enter to drop, Escape to cancel. Handled here directly so no key press is ever lost.
export default function SortableCaseList({ cases, onReorder, onRemove, busy }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Keyboard move in progress: the picked test case's id, and the order while moving.
  const [picked, setPicked] = useState(null);
  const [draft, setDraft] = useState(null);
  const [message, setMessage] = useState(''); // read out by screen readers
  const handleRefs = useRef(new Map());

  const shown = draft ?? cases;
  const titleOf = (id) => shown.find((c) => c.id === id)?.title ?? 'test case';
  const positionOf = (id, list = shown) => list.findIndex((c) => c.id === id) + 1;

  // Keep focus on the moving handle after the list re-renders in its new order.
  useEffect(() => {
    if (picked !== null) handleRefs.current.get(picked)?.focus();
  }, [picked, draft]);

  // If the list changes underneath (e.g. reloaded), drop any keyboard move in progress.
  useEffect(() => {
    setPicked(null);
    setDraft(null);
  }, [cases]);

  const finishKeyboardMove = (text) => {
    setPicked(null);
    setDraft(null);
    setMessage(text);
  };

  const handleKeyDown = (e, tc) => {
    if (busy) return;
    const isSelect = e.key === ' ' || e.key === 'Enter';

    if (picked === null) {
      if (!isSelect) return;
      e.preventDefault();
      setPicked(tc.id);
      setDraft(cases);
      setMessage(
        `Picked up "${tc.title}", position ${positionOf(tc.id, cases)} of ${cases.length}. ` +
          'Use the up and down arrow keys to move it, Space to drop it, or Escape to cancel.'
      );
      return;
    }
    if (picked !== tc.id) return;

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const from = positionOf(tc.id) - 1;
      const to = from + (e.key === 'ArrowUp' ? -1 : 1);
      if (to < 0 || to >= shown.length) {
        setMessage(`"${tc.title}" is already ${to < 0 ? 'first' : 'last'}.`);
        return;
      }
      setDraft(arrayMove(shown, from, to));
      setMessage(`"${tc.title}" moved to position ${to + 1} of ${shown.length}.`);
    } else if (isSelect) {
      e.preventDefault();
      const changed = shown.some((c, i) => c.id !== cases[i].id);
      const position = positionOf(tc.id);
      if (changed) onReorder(shown);
      finishKeyboardMove(`Dropped "${tc.title}" at position ${position} of ${shown.length}.`);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finishKeyboardMove(`Cancelled. "${tc.title}" is back at position ${positionOf(tc.id, cases)}.`);
    }
  };

  // Tabbing away (not the list re-rendering) cancels a keyboard move.
  const handleBlur = (e, tc) => {
    if (picked === tc.id && e.relatedTarget) {
      finishKeyboardMove(`Cancelled. "${tc.title}" is back at position ${positionOf(tc.id, cases)}.`);
    }
  };

  // Mouse and touch dragging, and what screen readers hear during it.
  const announcements = {
    onDragStart: ({ active }) => `Picked up "${titleOf(active.id)}", position ${positionOf(active.id)} of ${shown.length}.`,
    onDragOver: ({ active, over }) =>
      over ? `"${titleOf(active.id)}" is over position ${positionOf(over.id)} of ${shown.length}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `Dropped "${titleOf(active.id)}" at position ${positionOf(over.id)} of ${shown.length}.` : `Dropped "${titleOf(active.id)}".`,
    onDragCancel: ({ active }) => `Cancelled. "${titleOf(active.id)}" stays at position ${positionOf(active.id)}.`,
  };

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    onReorder(arrayMove(cases, positionOf(active.id, cases) - 1, positionOf(over.id, cases) - 1));
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={{ announcements }}
      >
        <SortableContext items={shown.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <ol className="case-list">
            {shown.map((tc, i) => (
              <SortableCaseRow
                key={tc.id}
                testCase={tc}
                position={i + 1}
                picked={picked === tc.id}
                busy={busy}
                onRemove={onRemove}
                onKeyDown={(e) => handleKeyDown(e, tc)}
                onBlur={(e) => handleBlur(e, tc)}
                handleRef={(el) => (el ? handleRefs.current.set(tc.id, el) : handleRefs.current.delete(tc.id))}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <div className="visually-hidden" role="status" aria-live="assertive">{message}</div>
    </>
  );
}

function SortableCaseRow({ testCase, position, picked, busy, onRemove, onKeyDown, onBlur, handleRef }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: testCase.id,
    disabled: busy,
  });

  return (
    <li
      ref={setNodeRef}
      className={`case-row${isDragging ? ' is-dragging' : ''}${picked ? ' is-picked' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        ref={(el) => {
          setActivatorNodeRef(el);
          handleRef(el);
        }}
        className="drag-handle"
        {...attributes}
        {...listeners}
        aria-label={`Move "${testCase.title}", position ${position}`}
        aria-pressed={picked}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
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
