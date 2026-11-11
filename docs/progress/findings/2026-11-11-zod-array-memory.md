# zod's array memory fix needs a length cap — findings (2026-11-11)

**Ran:** issue 152 (Dependabot alert 187, zod memory exhaustion on large arrays). Node 24.18.1,
CachyOS, against zod 4.4.3 (master before this change) and 4.6.7 (the patched release that
Dependabot PR 115 proposed), outside Vercel.

## Why it matters

The admin question routes (create, update, reorder) parse request bodies through `z.array(...)`
schemas in `src/application/dtos/question-admin.dto.ts`, which had no length cap. Once anyone
can sign up as a host (issue 129), any account can send them a body of up to 4.5 MB (Vercel's
request limit). The working assumption was that merging the zod bump (PR 115) fixes the alert.
It doesn't.

## Measurement

A `CreateQuestionDTO`-shaped body of 4.4 MB with `options` set to 2.2 million numbers (each a
wrong-typed element), `safeParse(JSON.parse(body))`, heapUsed before and after:

| zod | `options` schema | issues | heap delta | time |
|---|---|---|---|---|
| 4.4.3 | `z.array(z.string())` | 2,200,000 | 1,626 MB | 3.6 s |
| 4.6.7 | `z.array(z.string())` | 2,200,000 | 933 MB | 1.9 s |
| 4.4.3 | `.max(50)` | 2,200,001 | 1,644 MB | 3.8 s |
| 4.6.7 | `.max(50)` | 1 | 22 MB | 24 ms |

The same body with 1.47 million valid empty strings on 4.6.7 and no cap: 0 issues, 16 MB, 52 ms.
The cost is the issue objects, one per bad element.

## Conclusion

zod 4.6.6+ stops at the length check only when the array has one. The advisory's title ("oversized
constrained collections") says this; its description ("without a length constraint") reads as
the opposite. The fix is both the bump and a `.max()` on every input array. The unit tests in
`src/tests/application/dtos/question-admin.dto.test.ts` fail on 4.4.3 with the caps in place
(1,051 issues instead of 1) and pass on 4.6.7.

Not measured: memory on Vercel itself, where the default function memory is 2 GB and Fluid
Compute shares one instance between concurrent requests.
