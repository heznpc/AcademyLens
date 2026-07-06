const { mkdirSync, readdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, join } = require("node:path");

const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "dist", "academy-lens.zip");
const INPUTS = ["manifest.json", "assets", "src", "README.md", "PRIVACY_POLICY.md", "LICENSE"];
const DEFAULT_ZIP_TIMESTAMP = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return ~crc >>> 0;
}

function zipTimestampDate() {
  const epoch = Number(process.env.SOURCE_DATE_EPOCH);
  if (Number.isFinite(epoch) && epoch > 0) return new Date(epoch * 1000);
  return DEFAULT_ZIP_TIMESTAMP;
}

function dosDateTime(date = zipTimestampDate()) {
  const year = Math.max(1980, date.getUTCFullYear());
  const time = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  return { day, time };
}

function writeUInt16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function writeUInt32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function listFiles(path, prefix = "") {
  const fullPath = join(ROOT, path);
  const entries = readdirSync(fullPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    const childPath = `${path}/${entry.name}`;
    const childEntry = prefix ? `${prefix}/${entry.name}` : childPath;
    if (entry.isDirectory()) {
      files.push(...listFiles(childPath, childEntry));
    } else {
      files.push({ path: childPath, entry: childEntry });
    }
  }
  return files;
}

function collectEntries() {
  return INPUTS.flatMap((input) => {
    const entries = readdirSync(ROOT, { withFileTypes: true });
    const match = entries.find((entry) => entry.name === input);
    if (!match) throw new Error(`Missing zip input: ${input}`);
    if (match.isDirectory()) return listFiles(input);
    return [{ path: input, entry: input }];
  }).sort((a, b) => a.entry.localeCompare(b.entry));
}

function localHeader(entryName, data, timestamp) {
  const name = Buffer.from(entryName);
  const checksum = crc32(data);
  return Buffer.concat([
    writeUInt32(0x04034b50),
    writeUInt16(20),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(timestamp.time),
    writeUInt16(timestamp.day),
    writeUInt32(checksum),
    writeUInt32(data.length),
    writeUInt32(data.length),
    writeUInt16(name.length),
    writeUInt16(0),
    name,
    data
  ]);
}

function centralDirectory(entryName, data, timestamp, offset) {
  const name = Buffer.from(entryName);
  const checksum = crc32(data);
  return Buffer.concat([
    writeUInt32(0x02014b50),
    writeUInt16(20),
    writeUInt16(20),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(timestamp.time),
    writeUInt16(timestamp.day),
    writeUInt32(checksum),
    writeUInt32(data.length),
    writeUInt32(data.length),
    writeUInt16(name.length),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt32(0),
    writeUInt32(offset),
    name
  ]);
}

function endOfCentralDirectory(entryCount, centralSize, centralOffset) {
  return Buffer.concat([
    writeUInt32(0x06054b50),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(entryCount),
    writeUInt16(entryCount),
    writeUInt32(centralSize),
    writeUInt32(centralOffset),
    writeUInt16(0)
  ]);
}

function buildZip() {
  const timestamp = dosDateTime(zipTimestampDate());
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of collectEntries()) {
    const data = readFileSync(join(ROOT, file.path));
    const local = localHeader(file.entry, data, timestamp);
    const central = centralDirectory(file.entry, data, timestamp, offset);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralOffset = offset;
  const central = Buffer.concat(centrals);
  const zip = Buffer.concat([
    ...locals,
    central,
    endOfCentralDirectory(centrals.length, central.length, centralOffset)
  ]);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, zip);
  console.log(`wrote ${OUT} (${centrals.length} files)`);
}

if (require.main === module) {
  buildZip();
}

module.exports = {
  buildZip,
  collectEntries,
  dosDateTime,
  zipTimestampDate
};
