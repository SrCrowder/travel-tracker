import {
  Document, Page, View, Text, Image, StyleSheet,
} from '@react-pdf/renderer';
import { format } from 'date-fns';
import i18next from 'i18next';
import type { Trip, Photo } from '../types';

// i18next is a singleton — its language is already set by the time exportPdf()
// is called, so t() returns strings in whatever language the user has selected.
const t = (key: string) => i18next.t(key);

interface TripPdfDocumentProps {
  trip: Trip;
  imageMap: Record<string, string>; // filename -> base64 data URL
}

const INDIGO    = '#4F46E5';
const SLATE_800 = '#1E293B';
const SLATE_600 = '#475569';
const SLATE_400 = '#94A3B8';
const AMBER     = '#F59E0B';

// A4 inner width at 48pt padding each side: 595 - 96 = 499pt
const INNER_W = 499;
const COL2_W  = (INNER_W - 4) / 2; // ~247pt per column in 2-col layout
const COL2_H  = 160;
const COL1_H  = 200;

const s = StyleSheet.create({
  // ── Pages ──────────────────────────────────────────────────────────────────
  page:      { fontFamily: 'Helvetica', backgroundColor: '#ffffff', padding: 48 },
  coverPage: { padding: 0, fontFamily: 'Helvetica' },

  // ── Cover ──────────────────────────────────────────────────────────────────
  coverBg: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    objectFit: 'cover',
  },
  coverSolid: {
    flex: 1, backgroundColor: INDIGO, justifyContent: 'flex-end',
  },
  // Translucent panel pinned to bottom — text is readable over any photo
  coverPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(15,15,30,0.72)',
    padding: 40, paddingTop: 28,
  },
  coverPanelSolid: { padding: 40, paddingTop: 28 },
  coverTitle: { fontFamily: 'Helvetica-Bold', fontSize: 28, color: '#ffffff', marginBottom: 8 },
  coverDates: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginBottom: 10 },
  coverDesc:  { fontSize: 11, color: 'rgba(255,255,255,0.78)', lineHeight: 1.5 },

  // ── Section heading ────────────────────────────────────────────────────────
  sectionTitle: {
    fontFamily: 'Helvetica-Bold', fontSize: 20, color: INDIGO,
    marginBottom: 18, paddingBottom: 6,
    borderBottomWidth: 1.5, borderBottomColor: '#EEF2FF',
  },

  // ── Location block ─────────────────────────────────────────────────────────
  locBlock:   { marginBottom: 26 },
  locNumber:  {
    fontFamily: 'Helvetica-Bold', fontSize: 10, color: '#ffffff',
    backgroundColor: INDIGO,
    paddingHorizontal: 6, paddingVertical: 2,
    marginRight: 8,
  },
  locNameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' },
  locName:    { fontFamily: 'Helvetica-Bold', fontSize: 15, color: SLATE_800 },
  locCountry: { fontSize: 11, color: SLATE_600, marginBottom: 4 },
  locMeta:    { fontSize: 10, color: SLATE_600, marginBottom: 4 },
  locStars:   { fontSize: 12, color: AMBER, marginBottom: 5 },
  locDesc:    { fontSize: 11, color: SLATE_800, lineHeight: 1.65, marginBottom: 8 },

  // ── Notes box ──────────────────────────────────────────────────────────────
  notesBox: {
    backgroundColor: '#F8FAFC',
    borderLeftWidth: 3, borderLeftColor: INDIGO,
    paddingHorizontal: 10, paddingVertical: 8,
    marginBottom: 10,
  },
  notesLabel: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: INDIGO, marginBottom: 3 },
  notesText:  { fontSize: 10, color: SLATE_600, lineHeight: 1.55 },

  // ── Divider ────────────────────────────────────────────────────────────────
  divider: {
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
    marginTop: 4, marginBottom: 22,
  },

  // ── Footer / page number ───────────────────────────────────────────────────
  pageNum: { position: 'absolute', bottom: 22, right: 48, fontSize: 9, color: SLATE_400 },
  footer:  { position: 'absolute', bottom: 22, left: 48,  fontSize: 8, color: '#CBD5E1' },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d?: string | null) {
  if (!d) return '';
  try { return format(new Date(d), 'MMM d, yyyy'); } catch { return d; }
}

function stars(r?: number | null) {
  if (!r) return '';
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

function photoRows(photos: Photo[], imageMap: Record<string, string>) {
  const visible = photos.filter((p) => imageMap[p.filename]);
  const rows: Photo[][] = [];
  for (let i = 0; i < visible.length; i += 2) rows.push(visible.slice(i, i + 2));
  return rows;
}

function renderPhotoRows(rows: Photo[][], imageMap: Record<string, string>) {
  return rows.map((row, ri) => {
    if (row.length === 1) {
      return (
        <View key={ri} style={{ marginBottom: 6 }}>
          <Image
            src={imageMap[row[0].filename]}
            style={{ width: INNER_W, height: COL1_H, objectFit: 'scale-down', objectPosition: 'center center' }}
          />
          {row[0].caption ? (
            <Text style={{ fontSize: 8, color: SLATE_400, marginTop: 2 }}>{row[0].caption}</Text>
          ) : null}
        </View>
      );
    }
    return (
      <View key={ri} style={{ flexDirection: 'row', marginBottom: 6 }}>
        <View style={{ width: COL2_W, marginRight: 4 }}>
          <Image
            src={imageMap[row[0].filename]}
            style={{ width: COL2_W, height: COL2_H, objectFit: 'scale-down', objectPosition: 'center center' }}
          />
          {row[0].caption ? (
            <Text style={{ fontSize: 8, color: SLATE_400, marginTop: 2 }}>{row[0].caption}</Text>
          ) : null}
        </View>
        <View style={{ width: COL2_W }}>
          <Image
            src={imageMap[row[1].filename]}
            style={{ width: COL2_W, height: COL2_H, objectFit: 'scale-down', objectPosition: 'center center' }}
          />
          {row[1].caption ? (
            <Text style={{ fontSize: 8, color: SLATE_400, marginTop: 2 }}>{row[1].caption}</Text>
          ) : null}
        </View>
      </View>
    );
  });
}

// ─── Document ─────────────────────────────────────────────────────────────────

export default function TripPdfDocument({ trip, imageMap }: TripPdfDocumentProps) {
  const sorted      = [...(trip.locations ?? [])].sort((a, b) => a.order_index - b.order_index);
  const hasCover    = !!(trip.cover_image && imageMap[trip.cover_image]);
  const dateRange   = `${fmtDate(trip.start_date)} – ${fmtDate(trip.end_date)}`;
  const generalRows = photoRows(trip.photos ?? [], imageMap);

  return (
    <Document title={trip.title} author={t('pdf.footer')}>

      {/* ── COVER PAGE ──────────────────────────────────────────────────── */}
      <Page size="A4" style={s.coverPage}>
        {hasCover ? (
          <>
            <Image src={imageMap[trip.cover_image!]} style={s.coverBg} />
            <View style={s.coverPanel}>
              <Text style={s.coverTitle}>{trip.title}</Text>
              <Text style={s.coverDates}>{dateRange}</Text>
              {trip.description ? <Text style={s.coverDesc}>{trip.description}</Text> : null}
            </View>
          </>
        ) : (
          <View style={s.coverSolid}>
            <View style={s.coverPanelSolid}>
              <Text style={s.coverTitle}>{trip.title}</Text>
              <Text style={s.coverDates}>{dateRange}</Text>
              {trip.description ? <Text style={s.coverDesc}>{trip.description}</Text> : null}
            </View>
          </View>
        )}
        <Text style={s.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>

      {/* ── LOCATIONS PAGE(S) ───────────────────────────────────────────── */}
      {sorted.length > 0 && (
        <Page size="A4" style={s.page} wrap>
          <Text style={s.sectionTitle}>{t('pdf.locations')}</Text>

          {sorted.map((loc, idx) => {
            const rows   = photoRows(loc.photos ?? [], imageMap);
            const isLast = idx === sorted.length - 1;
            return (
              <View key={loc.id} style={s.locBlock} wrap={false}>
                <View style={s.locNameRow}>
                  <Text style={s.locNumber}>{idx + 1}</Text>
                  <Text style={s.locName}>{loc.name}</Text>
                </View>
                {loc.country ? <Text style={s.locCountry}>{loc.country}</Text> : null}

                {(loc.date_start || loc.date_end) && (
                  <Text style={s.locMeta}>
                    {[loc.date_start && fmtDate(loc.date_start), loc.date_end && fmtDate(loc.date_end)]
                      .filter(Boolean).join(' – ')}
                  </Text>
                )}

                {loc.rating ? <Text style={s.locStars}>{stars(loc.rating)}</Text> : null}
                {loc.description ? <Text style={s.locDesc}>{loc.description}</Text> : null}

                {loc.notes ? (
                  <View style={s.notesBox}>
                    <Text style={s.notesLabel}>{t('pdf.notes')}</Text>
                    <Text style={s.notesText}>{loc.notes}</Text>
                  </View>
                ) : null}

                {renderPhotoRows(rows, imageMap)}
                {!isLast && <View style={s.divider} />}
              </View>
            );
          })}

          <Text style={s.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
          <Text style={s.footer} fixed>{t('pdf.footer')}</Text>
        </Page>
      )}

      {/* ── GENERAL PHOTOS PAGE ─────────────────────────────────────────── */}
      {generalRows.length > 0 && (
        <Page size="A4" style={s.page} wrap>
          <Text style={s.sectionTitle}>{t('pdf.photos')}</Text>
          {renderPhotoRows(generalRows, imageMap)}
          <Text style={s.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
          <Text style={s.footer} fixed>{t('pdf.footer')}</Text>
        </Page>
      )}

    </Document>
  );
}
