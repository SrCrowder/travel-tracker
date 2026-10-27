import { useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { getImageUrl } from '../api/client';
import TripPdfDocument from '../components/TripPdfDocument';
import type { Trip } from '../types';

// Static imports — no dynamic import() to avoid chunk-fetch failures in production.
// @react-pdf/renderer is placed in its own Rollup chunk (manualChunks in vite.config.ts)
// so it's still separated from the main vendor bundle, just loaded eagerly with TripDetail.

export function useTripPdfExport() {
  const [exporting, setExporting] = useState(false);

  const exportPdf = async (trip: Trip) => {
    setExporting(true);
    try {
      // ── 1. Collect all image filenames ────────────────────────────────────
      const filenames = new Set<string>();
      if (trip.cover_image) filenames.add(trip.cover_image);
      trip.locations?.forEach((loc) => loc.photos?.forEach((p) => filenames.add(p.filename)));
      trip.photos?.forEach((p) => filenames.add(p.filename));

      // ── 2. Fetch all images as base64 data URLs (parallel) ───────────────
      const imageMap: Record<string, string> = {};

      await Promise.all(
        [...filenames].map(async (filename) => {
          try {
            const res = await fetch(getImageUrl(filename));
            if (!res.ok) return;
            const blob = await res.blob();
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            imageMap[filename] = dataUrl;
          } catch {
            // Skip images that fail — PDF will simply omit them
          }
        })
      );

      // ── 3. Render to blob and trigger download ────────────────────────────
      const blob = await pdf(
        <TripPdfDocument trip={trip} imageMap={imageMap} />
      ).toBlob();

      const url = URL.createObjectURL(blob!);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${trip.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  return { exportPdf, exporting };
}
