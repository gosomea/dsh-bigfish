import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent, type MouseEvent } from 'react';

const key = 'bigfish.position.v1';
interface Position { right: number; bottom: number }
/** One gesture for the full pet and its collapsed icon; clicks remain clicks below 5px. */
export function usePetDrag(size: number, collapsed: boolean) {
  const [position, setPosition] = useState<Position>(() => {
    try { const v = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (v && Number.isFinite(v.right) && Number.isFinite(v.bottom)) return v;
    } catch { /* Device position is optional. */ }
    return { right: 16, bottom: 90 };
  });
  const [element, setElement] = useState<HTMLElement | null>(null);
  const elementRef = useCallback((node: HTMLElement | null) => setElement(node), []);
  const current = useRef(position), suppressed = useRef(false);
  const gesture = useRef<{ id: number; x: number; y: number; start: Position; moved: boolean }>();
  const [dragging, setDragging] = useState(false);
  const clamp = (v: Position): Position => {
    const bounds = element?.getBoundingClientRect();
    const width = bounds?.width ?? (collapsed ? 48 : Math.min(340 * size / 180, innerWidth - 16));
    const height = bounds?.height ?? (collapsed ? 48 : width * 250 / 340 + 90);
    return { right: Math.max(0, Math.min(v.right, innerWidth - width - 8)),
      bottom: Math.max(20, Math.min(v.bottom, Math.max(20, innerHeight - height - 8))) };
  };
  const move = (value: Position) => { current.current = clamp(value); setPosition(previous => previous.right === current.current.right && previous.bottom === current.current.bottom ? previous : current.current); };
  useLayoutEffect(() => {
    const resize = () => move(current.current);
    resize(); addEventListener('resize', resize);
    const observer = new ResizeObserver(resize); if (element) observer.observe(element);
    return () => { observer.disconnect(); removeEventListener('resize', resize); };
  }, [size, collapsed, element]);
  const finish = (e: PointerEvent<HTMLElement>) => {
    const g = gesture.current; if (!g || g.id !== e.pointerId) return;
    suppressed.current = g.moved; gesture.current = undefined; setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (g.moved) try { localStorage.setItem(key, JSON.stringify(current.current)); } catch { /* Device preference only. */ }
  };
  return { position, dragging, elementRef, handlers: {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (!e.isPrimary || e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('.bf-popover') || (!collapsed && target.closest('button,input,select,a'))) return;
      suppressed.current = false;
      gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: current.current, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const g = gesture.current; if (!g || g.id !== e.pointerId) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.moved && Math.hypot(dx, dy) < 5) return;
      g.moved = true; setDragging(true); move({ right: g.start.right - dx, bottom: g.start.bottom - dy });
    },
    onPointerUp: finish, onPointerCancel: finish, onLostPointerCapture: finish,
    onClickCapture(e: MouseEvent<HTMLElement>) {
      if (suppressed.current && e.detail !== 0) { e.preventDefault(); e.stopPropagation(); suppressed.current = false; }
    },
  } };
}
