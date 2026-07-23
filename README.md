# Workforce Pulse – Methodology Document

**Data period:** 2025-10-06 to 2025-10-24 (19 days)  
**Employees:** 15 in logs, 16 in HRMS (one extra, one duplicate, one terminated)

---

## 1. Assumptions

### activity_logs.csv
- Date format ambiguity: When both the first and second number are ≤12, we treat as **MM/DD/YYYY** (US-style) since the majority of unambiguous rows use this format. When the first number is >12, it must be DD/MM/YYYY.
- Negative durations are data entry errors → **dropped**.
- Zero-duration rows carry no signal → **dropped**.
- Blank durations → **dropped**.
- Durations >480 min (full 8-hour day) are **flagged as outliers** but **kept** — we surface them in the anomaly UI and exclude them from headline calculations via z-score outlier detection rather than a hard cap.
- `is_repetitive` null/ambiguous values (empty, NA, `-`) → treated as **false** (conservative: don't overcount automatable time).
- Rows with `employee_id = "?"` → **dropped** (unknown identity, cannot join).

### employees.json
- Schema migrated mid-year: `employee_id`/`EmployeeID`, `department`/`Dept`, flat vs. nested `meta.role`/`meta.tenure` all reconciled into one canonical schema.
- **Compensation normalization:** LPA × 100,000 = annual INR. Hourly INR × 8 hrs × 22 working days × 12 months = annual INR. Already-annual INR passed through.
- **Working hours:** Both `"9-18"` strings and `{start, end}` objects normalized to `daily_hours` float.

---

## 2. Join Strategy & Conflict Resolution

**Left join:** activity logs ← employee metadata on `employee_id`.

### Edge cases:
| Issue | Resolution |
|-------|-----------|
| **Duplicate E013** (two records in HRMS) | Kept the first (more complete `name` field). Compensation values were close (₹14L vs ₹13.5L) — averaged to ₹13.75L and logged in audit. |
| **Missing employee** (in logs, not HRMS) | None in this dataset — all 15 active log employees have HRMS records. |
| **Extra E016** (in HRMS, not in logs) | Included in employee metadata, flagged as "no activity" in data quality report. |
| **Terminated E015** | Included in historical analysis (their Oct 6–20 activity is real). Excluded from forward-looking monthly projections (terminated Oct 20). |
| **Unknown "?" employee** | Two rows dropped. Shown in data quality report. |

---

## 3. Headline Number Formulas

### Recoverable Hours/Month
```
recoverable_hours_month = 
  sum(duration_minutes where is_repetitive=true)
  × 0.70  [automation capture rate — industry standard for RPA/AI]
  × (30/19)  [scale from 19-day dataset to 30-day month]
  ÷ 60
```

**Why 70%?** Pure RPA can automate ~80-90% of strictly rule-based tasks. We discount to 70% to account for edge cases, exceptions, and change management overhead. This is a conservative, defensible figure.

### Recoverable INR/Month
```
For each repetitive activity row:
  employee_hourly_rate = annual_inr / (daily_hours × 22 × 12)
  row_cost = duration_minutes × (hourly_rate / 60)

recoverable_inr_month = 
  sum(row_cost for repetitive rows with known compensation)
  × 0.70 × (30/19)
```

The rupee number uses each employee's actual hourly rate from HRMS, not an average. This makes it auditable: the number for Sales differs from HR because their compensation differs.

---

## 4. Automation Priority Formula

```
score = volume_weight × 0.30
      + repetitive_rate × 0.35
      + employee_spread × 0.20
      + rupee_weight × 0.15

Where:
  volume_weight = total_minutes / max(total_minutes across all categories)
  repetitive_rate = repetitive_rows / total_rows
  employee_spread = unique_employees / 15
  rupee_weight = total_cost_inr / max(total_cost_inr across all categories)
```

**Weight rationale:**
- `repetitive_rate` (0.35) is highest because automation ROI depends on how consistently a task is repeated — a high-volume task done inconsistently is harder to automate.
- `volume_weight` (0.30) reflects raw time consumption.
- `employee_spread` (0.20) — tasks done by many employees benefit from a single automation more than niche tasks.
- `rupee_weight` (0.15) — cost impact matters but is already partially captured by volume × spread.

---

## 5. Anomaly Detection

Three-layer approach:
1. **Duration outliers:** flag rows where `duration > mean + 2.5σ` within the task category. Catches the 999-minute E012/E013 entries as clearly erroneous.
2. **Hard cap:** flag all rows > 480 min regardless of category mean.
3. **High repetitive-share employees:** flag anyone with >65% of their logged time marked repetitive.

Anomalies are **surfaced in the UI** prominently but **not dropped** from the dataset — a COO should know about them.

---

## 6. What Was Cut & Why

- **Real-time data ingestion:** No streaming pipeline — the dataset is static and 19 days old. A live ingestion layer would add complexity without value.
- **ML-based anomaly detection:** A simple z-score is auditable and explainable; a black-box model would require justification the COO can't verify.
- **Org-chart visualization:** Nice to have but not what the COO asked for.
- **Predictive forecasting:** The dataset spans only 3 weeks — insufficient for reliable time-series modeling. Projecting forward from 19 days with any statistical confidence would require more data.

---

## 7. What We'd Build Next (With 2 More Days)

1. **Actual cost-per-automation ROI:** Factor in estimated automation build cost (₹X one-time) vs. monthly savings → payback period per task category.
2. **Slack/email integration:** Pull live activity data instead of CSV.
3. **Role-based benchmarking:** Compare each role against external benchmarks (e.g., industry average time on email triage for Finance Analysts).
4. **Automated anomaly alerts:** Email/Slack notification when a new week's data shows a significant jump in repetitive task share.
5. **Drill-down to raw rows:** Allow clicking any number on the dashboard to see the exact source rows it was computed from.
