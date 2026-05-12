// CityList — drag-and-drop sortable list of CityCards backed by @dnd-kit.
//
// Architecture:
//   - Local "mirror" state (`order`) holds the displayed sequence of city ids.
//     This lets us update the UI optimistically the instant the drag drops,
//     before the PATCH /api/cities/reorder round-trip completes.
//   - When the cities prop changes (e.g. after a refetch following save or a
//     successful reorder), the mirror resyncs to the new authoritative order.
//   - On drop: compute arrayMove → set mirror → call onReorder → on rejection,
//     revert the mirror to the pre-drop snapshot so the UI matches reality.
//
// Drag handle isolation:
//   The drag listeners are attached ONLY to the right-side handle button,
//   never the whole row. This is what keeps tap-to-edit working on the card
//   body — without isolation, every tap registers as a drag start and the
//   onCardClick callback never fires.
//
// Keyboard accessibility: @dnd-kit's default sensors include a KeyboardSensor
// (Space picks up, Arrows move, Enter drops). We don't disable or replace it.
// `prefers-reduced-motion` is also handled automatically by the library.

import { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
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
import type { CityDTO } from '@/types/city';

interface CityListProps {
  readonly cities: readonly CityDTO[];
  readonly onCardClick: (id: string) => void;
  readonly onReorder: (orderedIds: readonly string[]) => Promise<void>;
}

export function CityList({ cities, onCardClick, onReorder }: CityListProps) {
  const [order, setOrder] = useState<readonly string[]>(() =>
    cities.map((c) => c.id),
  );

  // Resync the mirror whenever the upstream cities list changes (refetch,
  // create, delete, or a server-confirmed reorder). Comparing by id sequence
  // would avoid pointless setState calls, but React bails on identical state
  // arrays cheaply enough that the simpler form is fine.
  useEffect(() => {
    setOrder(cities.map((c) => c.id));
  }, [cities]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require a small movement before starting a drag so a tap on the handle
      // can still focus/activate it without immediately triggering a drag.
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = order.indexOf(String(active.id));
      const newIndex = order.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;

      const previous = order;
      const newOrder = arrayMove([...order], oldIndex, newIndex);
      setOrder(newOrder); // optimistic

      void (async () => {
        try {
          await onReorder(newOrder);
        } catch {
          // Revert on failure — caller's refetch will resync to server truth
          // shortly, but reverting immediately avoids a visible "wrong then
          // right" flicker.
          setOrder(previous);
        }
      })();
    },
    [order, onReorder],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={[...order]} strategy={verticalListSortingStrategy}>
        <ul className="space-y-3">
          {order.map((id) => {
            const city = cities.find((c) => c.id === id);
            if (!city) return null;
            return (
              <SortableCityRow
                key={id}
                city={city}
                onCardClick={onCardClick}
              />
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

interface SortableCityRowProps {
  readonly city: CityDTO;
  readonly onCardClick: (id: string) => void;
}

function SortableCityRow({ city, onCardClick }: SortableCityRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: city.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const arrived = formatArrived(city.arrivedAt);

  return (
    <li ref={setNodeRef} style={style}>
      <div className="flex items-stretch gap-2 rounded-lg bg-bg-elev border border-line hover:border-amber-500/40 transition-colors">
        <button
          type="button"
          onClick={() => onCardClick(city.id)}
          className="flex-1 text-left p-3 min-w-0"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-ink font-semibold truncate">{city.name}</span>
            <span className="text-ink-mute text-xs whitespace-nowrap">
              {arrived}
            </span>
          </div>
          {city.caption && (
            <p className="mt-1 text-ink-dim text-sm line-clamp-2">
              {city.caption}
            </p>
          )}
        </button>
        <button
          type="button"
          aria-label="Reorder"
          className="px-3 flex items-center justify-center text-ink-mute hover:text-ink touch-none select-none min-w-[44px]"
          // Drag listeners ONLY on the handle — keeps the card body tappable
          // so onCardClick fires reliably.
          {...attributes}
          {...listeners}
        >
          <span aria-hidden="true" className="text-lg leading-none">≡</span>
        </button>
      </div>
    </li>
  );
}

function formatArrived(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
