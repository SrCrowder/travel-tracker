import { useRef, useCallback } from 'react';
import { X, Move } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CoverPositionPickerProps {
  imageUrl: string;
  x: number;
  y: number;
  onChange: (x: number, y: number) => void;
  onRemove: () => void;
}

export default function CoverPositionPicker({
  imageUrl, x, y, onChange, onRemove,
}: CoverPositionPickerProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  // Keep a mutable ref in sync with the latest x/y so event handlers always see current values
  const posRef = useRef({ x, y });
  posRef.current = { x, y };

  const clamp = (v: number) => Math.min(100, Math.max(0, v));

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = ev.clientX - lastPos.current.x;
      const dy = ev.clientY - lastPos.current.y;
      lastPos.current = { x: ev.clientX, y: ev.clientY };
      onChange(
        clamp(posRef.current.x - (dx / rect.width) * 100),
        clamp(posRef.current.y - (dy / rect.height) * 100),
      );
    };

    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [onChange]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    dragging.current = true;
    lastPos.current = { x: touch.clientX, y: touch.clientY };

    const onMove = (ev: TouchEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const t = ev.touches[0];
      const rect = containerRef.current.getBoundingClientRect();
      const dx = t.clientX - lastPos.current.x;
      const dy = t.clientY - lastPos.current.y;
      lastPos.current = { x: t.clientX, y: t.clientY };
      onChange(
        clamp(posRef.current.x - (dx / rect.width) * 100),
        clamp(posRef.current.y - (dy / rect.height) * 100),
      );
    };

    const onEnd = () => {
      dragging.current = false;
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }, [onChange]);

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl overflow-hidden h-36 cursor-grab active:cursor-grabbing select-none group"
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    >
      <img
        src={imageUrl}
        alt="Cover"
        draggable={false}
        className="w-full h-full object-cover pointer-events-none"
        style={{ objectPosition: `${x}% ${y}%` }}
      />

      {/* Drag hint overlay — visible on hover */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="flex items-center gap-1.5 bg-black/50 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm">
          <Move size={12} />
          {t('addTrip.fields.dragToReposition')}
        </div>
      </div>

      {/* Remove button */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}
