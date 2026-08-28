export type GpsCoordinate = { lat: number; lng: number };

function readU16(view: DataView, offset: number, little: boolean): number {
  return little ? view.getUint16(offset, true) : view.getUint16(offset, false);
}

function readU32(view: DataView, offset: number, little: boolean): number {
  return little ? view.getUint32(offset, true) : view.getUint32(offset, false);
}

function readRational(view: DataView, offset: number, little: boolean): number {
  const numerator = readU32(view, offset, little);
  const denominator = readU32(view, offset + 4, little);
  if (!denominator) return 0;
  return numerator / denominator;
}

function dmsToDeg(view: DataView, offset: number, little: boolean): number {
  return (
    readRational(view, offset, little) +
    readRational(view, offset + 8, little) / 60 +
    readRational(view, offset + 16, little) / 3600
  );
}

function parseGpsIfd(
  view: DataView,
  tiffStart: number,
  gpsOffset: number,
  little: boolean
): GpsCoordinate | null {
  if (gpsOffset + 2 > view.byteLength) return null;
  const count = readU16(view, gpsOffset, little);
  let lat: number | null = null;
  let lng: number | null = null;
  let latRef = 'N';
  let lngRef = 'E';

  for (let index = 0; index < count; index += 1) {
    const entry = gpsOffset + 2 + index * 12;
    if (entry + 12 > view.byteLength) break;
    const tag = readU16(view, entry, little);
    const type = readU16(view, entry + 2, little);
    const valueOffset = tiffStart + readU32(view, entry + 8, little);

    if (tag === 1 && type === 2) {
      latRef = String.fromCharCode(view.getUint8(entry + 8));
    } else if (tag === 2 && valueOffset + 24 <= view.byteLength) {
      lat = dmsToDeg(view, valueOffset, little);
    } else if (tag === 3 && type === 2) {
      lngRef = String.fromCharCode(view.getUint8(entry + 8));
    } else if (tag === 4 && valueOffset + 24 <= view.byteLength) {
      lng = dmsToDeg(view, valueOffset, little);
    }
  }

  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (latRef === 'S') lat = -lat;
  if (lngRef === 'W') lng = -lng;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

function parseExifApp1(payload: Uint8Array): GpsCoordinate | null {
  if (payload.length < 14) return null;
  const header = String.fromCharCode(...payload.subarray(0, 6));
  if (header !== 'Exif\u0000\u0000') return null;
  const view = new DataView(payload.buffer, payload.byteOffset + 6, payload.byteLength - 6);
  const endianMark = String.fromCharCode(view.getUint8(0), view.getUint8(1));
  const little = endianMark === 'II';
  if (!little && endianMark !== 'MM') return null;
  const tiffStart = 0;
  const ifd0 = readU32(view, 4, little);
  if (ifd0 + 2 > view.byteLength) return null;
  const count = readU16(view, ifd0, little);
  for (let index = 0; index < count; index += 1) {
    const entry = ifd0 + 2 + index * 12;
    if (entry + 12 > view.byteLength) break;
    const tag = readU16(view, entry, little);
    if (tag !== 0x8825) continue;
    const gpsOffset = tiffStart + readU32(view, entry + 8, little);
    return parseGpsIfd(view, tiffStart, gpsOffset, little);
  }
  return null;
}

export function readJpegGps(buffer: ArrayBuffer): GpsCoordinate | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const size = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (size < 2) break;
    if (marker === 0xe1) {
      const gps = parseExifApp1(bytes.subarray(offset + 4, offset + 2 + size));
      if (gps) return gps;
    }
    offset += 2 + size;
  }
  return null;
}

export async function readGpsFromImageFile(file: File): Promise<GpsCoordinate | null> {
  return readJpegGps(await file.arrayBuffer());
}

function readAscii(view: DataView, entry: number, tiffStart: number, little: boolean): string {
  const type = readU16(view, entry + 2, little);
  const count = readU32(view, entry + 4, little);
  if (type !== 2 || count < 2) return '';
  const dataOffset = count <= 4 ? entry + 8 : tiffStart + readU32(view, entry + 8, little);
  if (dataOffset + count > view.byteLength) return '';
  return String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + dataOffset, count - 1));
}

function parseExifDate(raw: string): string | null {
  const match = raw.trim().match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`;
}

function readDateFromIfd(
  view: DataView,
  ifd: number,
  tiffStart: number,
  little: boolean,
  wanted: number[]
): string | null {
  if (ifd + 2 > view.byteLength) return null;
  const count = readU16(view, ifd, little);
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > view.byteLength) break;
    const tag = readU16(view, entry, little);
    if (!wanted.includes(tag)) continue;
    const parsed = parseExifDate(readAscii(view, entry, tiffStart, little));
    if (parsed) return parsed;
  }
  return null;
}

function parseCaptureTimeApp1(payload: Uint8Array): string | null {
  if (payload.length < 14) return null;
  const header = String.fromCharCode(...payload.subarray(0, 6));
  if (header !== 'Exif\u0000\u0000') return null;
  const view = new DataView(payload.buffer, payload.byteOffset + 6, payload.byteLength - 6);
  const endianMark = String.fromCharCode(view.getUint8(0), view.getUint8(1));
  const little = endianMark === 'II';
  if (!little && endianMark !== 'MM') return null;
  const ifd0 = readU32(view, 4, little);
  const original = readDateFromIfd(view, ifd0, 0, little, [0x9003, 0x9004, 0x0132]);
  if (original) return original;
  if (ifd0 + 2 > view.byteLength) return null;
  const count = readU16(view, ifd0, little);
  for (let index = 0; index < count; index += 1) {
    const entry = ifd0 + 2 + index * 12;
    if (entry + 12 > view.byteLength) break;
    if (readU16(view, entry, little) !== 0x8769) continue;
    const exifIfd = readU32(view, entry + 8, little);
    return readDateFromIfd(view, exifIfd, 0, little, [0x9003, 0x9004, 0x0132]);
  }
  return null;
}

export function readJpegCaptureTime(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const size = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (size < 2) break;
    if (marker === 0xe1) {
      const capturedAt = parseCaptureTimeApp1(bytes.subarray(offset + 4, offset + 2 + size));
      if (capturedAt) return capturedAt;
    }
    offset += 2 + size;
  }
  return null;
}

export async function readCaptureTimeFromImageFile(file: File): Promise<string | null> {
  try {
    return readJpegCaptureTime(await file.arrayBuffer());
  } catch {
    return null;
  }
}
