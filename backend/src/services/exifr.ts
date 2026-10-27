import exifr from 'exifr';

// exifr (unmaintained since 2021) only recognises HEIC/AVIF files whose "ftyp"
// box is at most 50 bytes. iOS 18 writes a longer brand list (52+ bytes:
// mif1 MiHB MiHA heix MiHE MiPr miaf heic tmap), so photos from recent iPhones
// were read as "Unknown file format" and lost their date and GPS. Same check,
// without that limit.
type Parser = { type: string; canHandle: (file: { getUint16(o: number): number; getString(o: number, n: number): string; byteLength: number }, firstTwoBytes: number) => boolean };

const parsers = (exifr as unknown as { fileParsers: Map<string, Parser> }).fileParsers;
for (const name of ['heic', 'avif']) {
  const parser = parsers.get(name);
  if (!parser) continue;
  parser.canHandle = function canHandle(file, firstTwoBytes) {
    if (firstTwoBytes !== 0) return false;
    const ftypLength = file.getUint16(2);
    if (ftypLength < 16 || ftypLength > 1024) return false;
    for (let offset = 16; offset + 4 <= ftypLength && offset + 4 <= file.byteLength; offset += 4) {
      if (file.getString(offset, 4) === this.type) return true;
    }
    return false;
  };
}

export default exifr;
