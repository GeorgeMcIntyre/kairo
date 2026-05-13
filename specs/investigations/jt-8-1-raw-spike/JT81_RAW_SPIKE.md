# JT 8.1 Raw Minimal Spike

## Scope

This is a raw-format learning spike only. It does not add a Kairo JT exporter and does not touch viewer, semantic, DXF importer, Cloudflare, or `.kairo` package code.

The existing repo notes intentionally park JT export:

- `specs/KAIRO_DECISIONS.md` says JT export is parked until licensed tooling is available.
- `specs/KAIRO_DECISIONS.md` also records "No raw JT writer" because JT binary writing is high risk.
- `specs/ISSUE_BACKLOG.md` says the target would likely be legacy faceted JT, and first compatibility should be proven with Siemens/reference tooling.

George explicitly authorized this raw JT 8.1 spike, so the experiment is isolated here.

## Files

- `tools/jt81-raw-minimal-spike.mjs`
- `tools/jt81-probe-local-tools.mjs`
- `specs/investigations/jt-8-1-raw-spike/minimal-candidate.jt`
- `specs/investigations/jt-8-1-raw-spike/probe-results.md`

## Candidate Bytes Written

The generated candidate is 84 bytes.

| Offset | Size | Value | Reason |
| --- | ---: | --- | --- |
| `0x00` | 80 bytes | ASCII `Version 8.1`, padded with spaces | Publicly recognizable JT version header token. |
| `0x50` | 4 bytes | `01 00 00 00` | Hypothesized little-endian byte-order field after the version string. |

First 128 bytes, as generated:

```text
56 65 72 73 69 6f 6e 20 38 2e 31 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 01 00 00 00
```

This intentionally omits all geometry and all higher-level JT structures.

## Known Fields

Known enough to test:

- A JT file has a recognizable version header string at the start of the file.
- `Version 8.1` is the visible token expected for a JT 8.1 candidate.
- JT has byte-order handling near the start of the file.

Known from Kairo project constraints:

- Kairo should not rely on a hand-written raw JT writer as production architecture.
- Any real exporter must be validated by Siemens/reference tooling before it is called successful.

## Uncertain Fields

The spike does not know enough to write these safely:

- Exact JT 8.1 file header layout after the version string.
- Whether the 80-byte version field is padded with spaces, nulls, newline, or another convention in all JT 8.1 tools.
- Exact byte-order field value and interpretation.
- Table of contents location and binary layout.
- Logical scene graph segment layout.
- Segment IDs, object IDs, element headers, and property atom structure.
- Assembly node element structure.
- Named node storage.
- Material/color property storage.
- Faceted B-rep or polygon set segment layout.
- Compression and quantization settings.
- Required end-of-file or alignment rules.

## Header Recognition

The file has a recognizable ASCII JT header token:

```text
Version 8.1
```

That does not make the file a valid JT file. It only proves the spike can write the first visible token and a byte-order hypothesis.

## Local Siemens Validation

`tools/jt81-probe-local-tools.mjs` found:

- `C:\Program Files\Tecnomatix_2301.0\eMPower\TxJt2Jt.exe`
- The generated candidate exists.
- The generated candidate is 84 bytes.

The probe attempted:

```text
TxJt2Jt.exe minimal-candidate.jt minimal-candidate.txjt2jt-output.jt
```

Result:

- Exit code: `3221225781`
- stdout: empty
- stderr: empty
- Timed out: no
- Output JT created: no

This is not a successful JT validation. The code usually indicates the executable failed to start cleanly in this shell environment before it could return a JT parse error. The spike therefore cannot yet say whether `TxJt2Jt` recognizes or rejects the candidate JT content.

See `probe-results.md` for the captured command result.

Follow-up local inspection found `TxJt2Jt.exe` inside a large `eMPower` install with many adjacent DLLs, but no obvious dedicated `TxJt2Jt` launcher script. The current shell has Siemens-related variables such as `AUX_PATH`, `SPLM_LICENSE_SERVER`, and NX variables, but launching the probe from the tool directory with that directory prepended to `PATH` still returns `3221225781`.

## Manual JT2Go Validation

George manually attempted to open `minimal-candidate.jt` in JT2Go. JT2Go rejected the file with:

```text
Failed to open document.
```

This confirms the 84-byte header-only candidate is not a readable JT document. The result is expected because the spike did not write the required JT table of contents, segment records, logical scene graph, object IDs, or geometry/property payloads.

## Minimum Extra Information Needed

### a) Empty JT 8.1 File

Need:

- Complete JT 8.1 file header definition.
- Required table-of-contents structure, even when there are no scene elements.
- Required segment list rules and offsets.
- Required file footer, alignment, and object-reference rules.
- A Siemens tool invocation that starts correctly and reports parse errors.

### b) One Assembly Node

Need everything for an empty file, plus:

- Logical Scene Graph segment format.
- Assembly node element/object header format.
- Object ID/reference format.
- Child list encoding.
- Node name/property encoding.

### c) One Faceted Triangle/Rectangle

Need everything above, plus:

- Shape node or part node linkage to geometry.
- Faceted geometry segment layout.
- Vertex/index array encoding.
- Normal and color/material binding rules.
- Quantization/compression rules for JT 8.1 faceted geometry.

### d) One Named Device Node

Need everything for an assembly node, plus:

- Stable convention for custom attributes/properties.
- How Siemens consumers expose JT node names and properties.
- Compatibility proof in Process Simulate or `TxJt2Jt`.

## Realism for Kairo

Raw JT 8.1 writing is not realistic for Kairo as a production path without Siemens JT Open Toolkit, official JT documentation, or a validated converter. A minimal valid JT is not just a header plus triangles; it requires a coherent scene graph, segment table, object identity model, property model, and faceted geometry encoding.

The practical production path should remain:

- Use Siemens JT Open Toolkit when available, or
- Use a converter/toolchain that preserves names, colors, geometry, units, and custom properties, then validate in Process Simulate.

## Recommended Next JT Step

Before attempting one rectangle/plate in raw JT, get one of these:

- Siemens JT 8.1 file format documentation covering header, TOC, LSG, and faceted geometry.
- A tiny known-good JT 8.1 file from Siemens tooling that contains one named colored triangle/plate and can be legally inspected as a reference.
- A working local command-line validation path for `TxJt2Jt.exe`, including required environment variables or launch wrapper.

Once a validator starts cleanly, rerun this spike and update `probe-results.md` with a real parse result.
