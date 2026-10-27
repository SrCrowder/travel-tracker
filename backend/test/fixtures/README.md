# Test fixtures

- `iphone7.heic` — real iPhone 7 HEIC photo with EXIF date (2019-10-20 18:34:30 +02:00) and GPS
  (38.0466 N, 12.9944 E). From the [exifr](https://github.com/MikeKovarik/exifr) test fixtures (MIT licence).
- `iphone-ios18.heic` — `iphone7.heic` with the 52-byte `ftyp` box iOS 18 writes
  (`mif1 MiHB MiHA heix MiHE MiPr miaf heic tmap`), iloc offsets shifted to match. exifr's stock
  HEIC detection rejects it (ftyp > 50 bytes); see `src/services/exifr.ts`.
- `iphone-hevc.mov` — 3 s HEVC (`hvc1`) + AAC QuickTime file with the same metadata keys an iPhone writes
  (`com.apple.quicktime.location.ISO6709`, `creationdate`, `make`, `model`). Generated with:
  ```
  ffmpeg -f lavfi -i testsrc=size=1280x720:rate=30 -f lavfi -i sine=frequency=440 -t 3 \
    -c:v libx265 -tag:v hvc1 -pix_fmt yuv420p -c:a aac \
    -metadata com.apple.quicktime.location.ISO6709="+38.0466+012.9944+010.000/" \
    -metadata com.apple.quicktime.creationdate="2019-10-20T18:40:00+0200" \
    -metadata com.apple.quicktime.make=Apple -metadata com.apple.quicktime.model="iPhone 15" \
    -movflags use_metadata_tags iphone-hevc.mov
  ```
- `h264.mp4` — 2 s H.264 + AAC MP4 (already playable in browsers; only remuxed).
