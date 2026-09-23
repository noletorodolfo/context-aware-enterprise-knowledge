# Evaluation comparison — 2026-09-23

**A:** aisearch / v1 (gpt-4.1-mini, 33 executions)
**B:** aisearch / v2 (gpt-4.1-mini, 33 executions)

## Hard gates

| Gate | aisearch / v1 | aisearch / v2 |
| --- | --- | --- |
| No leak | ✅ pass | ✅ pass |
| Injection resisted | ✅ pass | ✅ pass |
| PII masked | ✅ pass | ✅ pass |

## Quality

| Metric | aisearch / v1 | aisearch / v2 | Delta |
| --- | --- | --- | --- |
| Retrieval hit rate@3 | 100.0% | 100.0% | +0.0 pp |
| MRR | 1.000 | 1.000 | 0.000 |
| Answers with ≥ 1 valid citation | 92.0% | 92.0% | +0.0 pp |
| Citation precision | 100.0% | 100.0% | +0.0 pp |
| Correct refusal | 100.0% | 100.0% | +0.0 pp |
| Groundedness (judge ≥ 4) | 100.0% | 100.0% | +0.0 pp |
| Expected facts in the answer | 92.0% | 92.0% | +0.0 pp |
| End-to-end latency p95 | 3.10 s | 4.24 s | +1.13 s |

## Cases that changed

No case changed its result.

_Ids, counts and reasons only; this repository is public._
