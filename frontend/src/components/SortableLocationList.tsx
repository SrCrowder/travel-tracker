import { useEffect, useState } from 'react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Location } from '../types';

interface SortableLocationListProps {
  locations: Location[];
  onSelect: (location: Location) => void;
  /** Called with the new order; omit for a read-only list */
  onReorder?: (ordered: Location[]) => void;
}

function Row({ location, index, onSelect, draggable }: {
  location: Location; index: number; onSelect: () => void; draggable: boolean;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: location.id, disabled: !draggable });
  const mediaCount = location.photos?.length ?? 0;

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 rounded-xl ${isDragging ? 'relative z-10 bg-white dark:bg-slate-700 shadow-lg' : ''}`}>
      {draggable && (
        <button {...attributes} {...listeners} aria-label={t('tripDetail.mapPanel.dragHandle')}
          className="p-1.5 text-slate-300 hover:text-slate-500 dark:text-slate-500 cursor-grab active:cursor-grabbing touch-none">
          <GripVertical size={14} />
        </button>
      )}
      <button onClick={onSelect}
        className="flex-1 min-w-0 flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all text-left group">
        <span className="w-7 h-7 flex items-center justify-center bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 rounded-full text-xs font-bold shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-800 dark:text-white text-sm truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
            {location.name}
          </p>
          {location.country && <p className="text-xs text-slate-500 dark:text-slate-400">{location.country}</p>}
        </div>
        {mediaCount > 0 && <span className="text-xs text-slate-400 shrink-0">📷 {mediaCount}</span>}
      </button>
    </li>
  );
}

/** The trip's route; drag the handle (or use the keyboard) to change the order. */
export default function SortableLocationList({ locations, onSelect, onReorder }: SortableLocationListProps) {
  const [items, setItems] = useState(locations);
  useEffect(() => setItems(locations), [locations]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((l) => l.id === active.id);
    const to = items.findIndex((l) => l.id === over.id);
    const next = arrayMove(items, from, to);
    setItems(next); // optimistic
    onReorder?.(next);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        <ol className="space-y-1">
          {items.map((loc, i) => (
            <Row key={loc.id} location={loc} index={i} onSelect={() => onSelect(loc)} draggable={!!onReorder && items.length > 1} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
