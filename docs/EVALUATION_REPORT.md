# NETSCOPE Diagnostic Engine Benchmark Report

## 1. Dataset & Independent Run Summary
- **Total Evaluated Records**: 6
- **Independent Held-Out Runs**: 6
- **Fault Cases Evaluated**: 5
- **Unsupported / Healthy Baseline Cases**: 1
- **Limitation Disclosure**: Evaluated only on held-out records. No synthetic samples manufactured.

## 2. Deterministic Rule Baseline Performance
| Metric | Value | Definition |
|---|---|---|
| **Top-1 Accuracy** | 1.0 | Fraction of fault cases where the top-ranked candidate link matches the ground truth label. |
| **Top-3 Accuracy** | 1.0 | Fraction of fault cases where the ground truth label appears within the top 3 ranked candidates. |
| **Mean Reciprocal Rank (MRR)** | 1.0 | Mean of the reciprocal ranks (1/rank) of the ground truth label across all fault cases (0 if not in ranked candidates). |
| **Selective Accuracy** | 1.0 | Accuracy evaluated strictly on runs where the engine issued a confident diagnosis without abstaining. |
| **Abstention Coverage** | 0.8333 | Fraction of evaluated runs where the engine issued a diagnosis rather than abstaining. |
| **False Confident Diagnosis Rate** | 0.0 | Fraction of non-abstained diagnoses where the top-ranked prediction was incorrect. |
| **Unsupported Abstention Accuracy** | 1.0 | Fraction of healthy / unsupported runs where the engine correctly abstained. |
| **Unsupported Conclusion Rate** | 0.0 | Fraction of healthy / unsupported runs where the engine falsely issued a fault conclusion. |

## 3. Per-Scenario Results
| Scenario ID | Total Runs | Top-1 Matches | Abstentions | Accuracy |
|---|---|---|---|---|
| `bgp_r1_r2_shutdown` | 1 | 1 | 0 | 1.0 |
| `degraded_r2_r4` | 1 | 1 | 0 | 1.0 |
| `healthy_baseline` | 1 | 0 | 1 | 0.0 |
| `link_r2_r4_down` | 1 | 1 | 0 | 1.0 |
| `link_r3_r4_down` | 1 | 1 | 0 | 1.0 |
| `route_r5_withdrawal` | 1 | 1 | 0 | 1.0 |

## 4. Per-Class Precision & Recall
| Class | Support | True Positives | False Positives | False Negatives | Precision | Recall |
|---|---|---|---|---|---|---|
| `NO_FAULT` | 1 | 0 | 0 | 1 | N/A | 0.0 |
| `R1-R2` | 1 | 1 | 0 | 0 | 1.0 | 1.0 |
| `R2-R4` | 2 | 2 | 0 | 0 | 1.0 | 1.0 |
| `R3-R4` | 1 | 1 | 0 | 0 | 1.0 | 1.0 |
| `R4-R5` | 1 | 1 | 0 | 0 | 1.0 | 1.0 |

## 5. Confusion Matrix
| Actual \ Predicted | `ABSTAIN` | `R1-R2` | `R2-R4` | `R3-R4` | `R4-R5` |
|---|---|---|---|---|---|
| `ABSTAIN` | 0 | 0 | 0 | 0 | 0 |
| `NO_FAULT` | 1 | 0 | 0 | 0 | 0 |
| `R1-R2` | 0 | 1 | 0 | 0 | 0 |
| `R2-R4` | 0 | 0 | 2 | 0 | 0 |
| `R3-R4` | 0 | 0 | 0 | 1 | 0 |
| `R4-R5` | 0 | 0 | 0 | 0 | 1 |

## 8. Metric Definitions
| Metric | Formula / Meaning |
|---|---|
| `abstention_coverage` | Fraction of evaluated runs where the engine issued a diagnosis rather than abstaining. |
| `false_confident_diagnosis_rate` | Fraction of non-abstained diagnoses where the top-ranked prediction was incorrect. |
| `mean_reciprocal_rank` | Mean of the reciprocal ranks (1/rank) of the ground truth label across all fault cases (0 if not in ranked candidates). |
| `selective_accuracy` | Accuracy evaluated strictly on runs where the engine issued a confident diagnosis without abstaining. |
| `top1_accuracy` | Fraction of fault cases where the top-ranked candidate link matches the ground truth label. |
| `top3_accuracy` | Fraction of fault cases where the ground truth label appears within the top 3 ranked candidates. |
| `unsupported_abstention_accuracy` | Fraction of healthy / unsupported runs where the engine correctly abstained. |
| `unsupported_conclusion_rate` | Fraction of healthy / unsupported runs where the engine falsely issued a fault conclusion. |

---
*Benchmark metrics generated automatically by NETSCOPE evaluation harness.*