import { createPortal } from 'react-dom';

/**
 * Renders overlays (modals, viewer) in <body>. Inside an element with a
 * transform, filter or backdrop-filter, "position: fixed" is relative to that
 * element instead of the window, which pushes overlays off screen or clips them.
 */
export default function Portal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body);
}
