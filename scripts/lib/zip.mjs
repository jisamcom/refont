// Minimal dependency-free ZIP writer (PKZIP, store + deflate).
// Node >=22 provides zlib.crc32; we deflate-raw each entry and fall back to
// stored when compression doesn't help (e.g. already-compressed PNGs).
// Fixed mod-date (1980-01-01) keeps output deterministic for reproducible builds.
import { deflateRawSync, crc32 } from 'node:zlib';
import { Buffer } from 'node:buffer';

const DOS_DATE = 0x21; // 1980-01-01
const DOS_TIME = 0x00;
const UTF8_FLAG = 0x0800; // bit 11: filename is UTF-8

/**
 * @param {{name: string, data: Buffer}[]} entries  zip-relative path + bytes
 * @returns {Buffer} the complete .zip file
 */
export function zipSync(entries) {
  const local = [];
  const central = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const crc = crc32(e.data) >>> 0;
    const uncompressed = e.data.length;

    let method = 8;
    let body = deflateRawSync(e.data);
    if (body.length >= uncompressed) {
      method = 0; // stored
      body = e.data;
    }
    const compressed = body.length;

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0); // local file header signature
    lfh.writeUInt16LE(20, 4); // version needed
    lfh.writeUInt16LE(UTF8_FLAG, 6); // general purpose flags
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(DOS_TIME, 10);
    lfh.writeUInt16LE(DOS_DATE, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(compressed, 18);
    lfh.writeUInt32LE(uncompressed, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28); // extra field length
    local.push(lfh, nameBuf, body);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0); // central dir header signature
    cdh.writeUInt16LE(20, 4); // version made by
    cdh.writeUInt16LE(20, 6); // version needed
    cdh.writeUInt16LE(UTF8_FLAG, 8);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt16LE(DOS_TIME, 12);
    cdh.writeUInt16LE(DOS_DATE, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(compressed, 20);
    cdh.writeUInt32LE(uncompressed, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30); // extra length
    cdh.writeUInt16LE(0, 32); // comment length
    cdh.writeUInt16LE(0, 34); // disk number start
    cdh.writeUInt16LE(0, 36); // internal attrs
    cdh.writeUInt32LE(0, 38); // external attrs
    cdh.writeUInt32LE(offset, 42); // relative offset of local header
    central.push(cdh, nameBuf);

    offset += lfh.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central dir signature
  eocd.writeUInt16LE(0, 4); // this disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir start
  eocd.writeUInt16LE(entries.length, 8); // entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralBuf.length, 12); // central dir size
  eocd.writeUInt32LE(offset, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...local, centralBuf, eocd]);
}
