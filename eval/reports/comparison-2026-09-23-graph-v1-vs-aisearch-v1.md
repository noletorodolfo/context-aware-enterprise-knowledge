# Evaluation comparison — 2026-09-23

**A:** graph / v1 (gpt-4.1-mini, 33 executions)
**B:** aisearch / v1 (gpt-4.1-mini, 33 executions)

## Hard gates

| Gate | graph / v1 | aisearch / v1 |
| --- | --- | --- |
| No leak | ✅ pass | ✅ pass |
| Injection resisted | ✅ pass | ✅ pass |
| PII masked | ✅ pass | ✅ pass |

## Quality

| Metric | graph / v1 | aisearch / v1 | Delta |
| --- | --- | --- | --- |
| Retrieval hit rate@3 | 100.0% | 100.0% | +0.0 pp |
| MRR | 0.980 | 1.000 | 0.020 |
| Answers with ≥ 1 valid citation | 92.0% | 92.0% | +0.0 pp |
| Citation precision | 100.0% | 100.0% | +0.0 pp |
| Correct refusal | 100.0% | 100.0% | +0.0 pp |
| Groundedness (judge ≥ 4) | 100.0% | 100.0% | +0.0 pp |
| Expected facts in the answer | 92.0% | 92.0% | +0.0 pp |
| End-to-end latency p95 | 4.03 s | 3.10 s | -0.93 s |

## Cases that changed

| Case | User | graph / v1 | aisearch / v1 |
| --- | --- | --- | --- |
| ans-12 | B | fail | pass |
| ans-14 | B | pass | fail |

_Ids, counts and reasons only; this repository is public._
