#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const outputPath = process.argv[2];

if (!outputPath) {
  console.error("Usage: node tools/jt81-raw-minimal-spike.mjs <output.jt>");
  process.exit(1);
}

// Raw JT 8.1 knowledge spike.
//
// This is intentionally not a Kairo exporter. It writes only the smallest
// fields we can identify with reasonable confidence from public JT format
// descriptions and local file-header observations:
//
// 1. A fixed-width 80 byte version string area at the start of the file.
// 2. A 32-bit little-endian byte-order flag immediately after the version.
//
// We are explicitly not writing geometry, a segment table, logical scene graph
// elements, a table of contents, object IDs, compression data, quantization
// parameters, or any other undocumented structure. If this file is rejected by
// Siemens tooling, that is an expected spike result.

const chunks = [];

// Bytes 0..79:
// JT files have a recognizable ASCII version header. For a JT 8.1 candidate,
// the confidently known visible token is "Version 8.1". The field is padded to
// 80 bytes with ASCII spaces so tools that scan the first fixed-width header
// field can still see the version string without us inventing later sections.
const versionField = Buffer.alloc(80, 0x20);
Buffer.from("Version 8.1", "ascii").copy(versionField, 0);
chunks.push(versionField);

// Bytes 80..83:
// Public JT descriptions identify a byte-order value after the version field.
// This spike writes int32 little-endian value 1. This is a hypothesis to test
// with local Siemens tooling, not a claim that the remaining file is complete.
const byteOrderField = Buffer.alloc(4);
byteOrderField.writeInt32LE(1, 0);
chunks.push(byteOrderField);

// No further bytes are written. The absence of a TOC/segment graph is the point
// of this minimal candidate: it should tell us whether a recognizable JT 8.1
// file header is enough for TxJt2Jt to report a more specific parse error.
const candidate = Buffer.concat(chunks);

mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
writeFileSync(outputPath, candidate);

console.log(`Wrote JT 8.1 minimal raw candidate: ${outputPath}`);
console.log(`Size: ${candidate.length} bytes`);
