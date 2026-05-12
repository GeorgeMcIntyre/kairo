# JT 8.1 Raw Spike Probe Results

Generated: 2026-05-12T11:27:27.158Z

## Inputs

- Candidate JT: `C:\Users\georgem\source\repos\kairo\specs\investigations\jt-8-1-raw-spike\minimal-candidate.jt`
- Candidate exists: yes
- Candidate size: 84 bytes
- TxJt2Jt path: `C:\Program Files\Tecnomatix_2301.0\eMPower\TxJt2Jt.exe`
- TxJt2Jt exists: yes

## First 128 Bytes

```text
56 65 72 73 69 6f 6e 20 38 2e 31 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 01 00 00 00
```

## TxJt2Jt Probe

- Command: `C:\Program Files\Tecnomatix_2301.0\eMPower\TxJt2Jt.exe "C:\Users\georgem\source\repos\kairo\specs\investigations\jt-8-1-raw-spike\minimal-candidate.jt" "C:\Users\georgem\source\repos\kairo\specs\investigations\jt-8-1-raw-spike\minimal-candidate.txjt2jt-output.jt"`
- Exit code: 3221225781
- Signal: (none)
- Timed out: no

### stdout

```text
(empty)
```

### stderr

```text
(empty)
```

### Output File

- Expected output: `C:\Users\georgem\source\repos\kairo\specs\investigations\jt-8-1-raw-spike\minimal-candidate.txjt2jt-output.jt`
- Output exists: no

## Manual JT2Go Probe

George attempted to open the candidate in JT2Go. The viewer displayed:

```text
Failed to open document.
```

Conclusion: the header-only candidate is not a valid readable JT file.
