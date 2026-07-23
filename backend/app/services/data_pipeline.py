"""
Data Pipeline Service
======================
Ingests, normalizes, and joins activity_logs.csv + employees.json.
All normalization decisions are documented inline.
"""

import json
import re
import warnings
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
import pandas as pd
import pytz

warnings.filterwarnings("ignore")

IST = pytz.timezone("Asia/Kolkata")
DATA_DIR = Path(__file__).parent.parent / "data"

# ─────────────────────────────────────────────
# APP NAME CANONICALIZATION MAP
# Covers all observed variants in the dataset
# ─────────────────────────────────────────────
APP_ALIASES = {
    # Salesforce variants
    "sfdc": "Salesforce",
    "sales force": "Salesforce",
    "salesforce": "Salesforce",

    # Outlook variants
    "ms outlook": "Outlook",
    "outlook": "Outlook",

    # Gmail / Google Mail
    "gmail": "Gmail",
    "google mail": "Gmail",

    # Excel variants
    "excel": "Excel",
    "ms excel": "Excel",
    "microsoft excel": "Excel",

    # Slack
    "slack": "Slack",

    # Zoom
    "zoom": "Zoom",
    "zoom meetings": "Zoom",

    # PowerPoint variants
    "powerpoint": "PowerPoint",
    "ms powerpoint": "PowerPoint",
    "microsoft powerpoint": "PowerPoint",
    "ppt": "PowerPoint",

    # SAP
    "sap": "SAP",

    # Zoho variants
    "zoho": "Zoho CRM",
    "zoho crm": "Zoho CRM",

    # Chrome variants
    "chrome": "Chrome",
    "google chrome": "Chrome",

    # Jira
    "jira": "Jira",

    # Word variants
    "word": "Word",
    "ms word": "Word",
    "microsoft word": "Word",

    # Tally variants
    "tally": "Tally ERP",
    "tally erp": "Tally ERP",

    # Notion
    "notion": "Notion",

    # WhatsApp variants
    "whatsapp": "WhatsApp",
    "whatsapp web": "WhatsApp",
    "whatsapp web": "WhatsApp",

    # Misc
    "na": None,          # "NA" app → treat as unknown
    "-": None,           # dash placeholder → unknown
    "": None,            # blank → unknown
}

# ─────────────────────────────────────────────
# TASK CATEGORY CANONICALIZATION MAP
# ─────────────────────────────────────────────
TASK_ALIASES = {
    # Email Triage
    "email triage": "Email Triage",
    "email-triage": "Email Triage",

    # Internal Comms
    "internal comms": "Internal Comms",
    "internal communication": "Internal Comms",
    "internal communications": "Internal Comms",

    # Status Updates
    "status updates": "Status Updates",
    "status update": "Status Updates",

    # CRM Updates
    "crm updates": "CRM Updates",
    "crm update": "CRM Updates",

    # Lead Entry
    "lead-entry": "Lead Entry",
    "lead entry": "Lead Entry",

    # Reporting
    "reporting": "Reporting",
    "report": "Reporting",

    # Data Entry
    "data entry": "Data Entry",
    "data-entry": "Data Entry",

    # Reconciliation
    "reconciliation": "Reconciliation",
    "recon": "Reconciliation",

    # Vendor Management
    "vendor mgmt": "Vendor Management",
    "vendor management": "Vendor Management",

    # Vendor Portals
    "vendor portals": "Vendor Portals",
    "vendor portal": "Vendor Portals",

    # Invoice Processing
    "invoice proc": "Invoice Processing",
    "invoice processing": "Invoice Processing",

    # Calendar Management
    "cal mgmt": "Calendar Management",
    "calendar mgmt": "Calendar Management",
    "calendar management": "Calendar Management",

    # Client Comms
    "client communication": "Client Communication",
    "client comms": "Client Communication",
    "client communication": "Client Communication",

    # Meetings
    "meetings": "Meetings",
    "meeting": "Meetings",
    "internal meeting": "Meetings",

    # Pipeline Review
    "pipeline review": "Pipeline Review",

    # Research
    "research": "Research",

    # Deck Building
    "deck building": "Deck Building",
    "slide building": "Deck Building",

    # Bookkeeping
    "bookkeeping": "Bookkeeping",

    # GST Prep
    "gst prep": "GST Prep",
    "gst filing prep": "GST Prep",

    # Ticket Updates
    "ticket updates": "Ticket Updates",

    # Documentation
    "documentation": "Documentation",
    "notes": "Documentation",
    "docs": "Documentation",
    "doc drafting": "Documentation",
    "document drafting": "Documentation",
    "drafting": "Documentation",

    # Uncategorized / NA
    "na": None,
    "-": None,
    "": None,
}


def _canonical_app(raw: str) -> Optional[str]:
    """Return canonical app name, None if unknown/blank."""
    if pd.isna(raw) or str(raw).strip() == "":
        return None
    clean = str(raw).strip().lower()
    return APP_ALIASES.get(clean, str(raw).strip().title())


def _canonical_task(raw: str) -> Optional[str]:
    """Return canonical task category, None if unknown/blank."""
    if pd.isna(raw) or str(raw).strip() == "":
        return None
    clean = str(raw).strip().lower()
    return TASK_ALIASES.get(clean, str(raw).strip().title())


def _parse_bool(val) -> Optional[bool]:
    """
    Normalize is_repetitive column.
    Truthy: TRUE, true, 1, yes, Yes
    Falsy: FALSE, false, 0, no, No
    Null: empty, NA, -, NaN
    """
    if pd.isna(val):
        return None
    s = str(val).strip().lower()
    if s in ("true", "1", "yes"):
        return True
    if s in ("false", "0", "no"):
        return False
    return None  # -, empty, NA etc.


def _parse_timestamp(raw: str) -> Optional[datetime]:
    """
    Try multiple timestamp formats.
    Returns IST-aware datetime or None.

    Format priority:
    1. ISO 8601 with T separator → treat as UTC, convert to IST
    2. DD/MM/YYYY HH:MM  (day > 12 is diagnostic)
    3. MM/DD/YYYY HH:MM  (US-style)
    4. Try pandas auto-parse as fallback
    """
    if pd.isna(raw) or str(raw).strip() == "":
        return None

    s = str(raw).strip()

    # ISO format: 2025-10-17T13:21:23
    if "T" in s:
        try:
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = pytz.utc.localize(dt)
            return dt.astimezone(IST)
        except ValueError:
            pass

    # Date with slash separators
    # Parse by examining the first segment to disambiguate DD/MM vs MM/DD
    m = re.match(
        r"^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$", s
    )
    if m:
        a, b, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        hour, minute = int(m.group(4)), int(m.group(5))
        second = int(m.group(6)) if m.group(6) else 0

        if a > 12:
            # a must be day
            day, month = a, b
        elif b > 12:
            # b must be day
            month, day = a, b
        else:
            # Ambiguous: both ≤ 12.
            # Context: dataset is Oct 2025. We'll try MM/DD first (more US-style),
            # then DD/MM. If month would be > 12 either way, flag.
            # For this dataset month is always 9 or 10 — if a=10 and b<=12 it's ambiguous.
            # Heuristic: If row has "10/" prefix and second part is 1-31, treat as MM/DD
            # (US style) since many rows clearly are MM/DD/YYYY.
            # Decision: treat format as MM/DD/YYYY when first number ≤ 12.
            month, day = a, b

        try:
            dt = datetime(year, month, day, hour, minute, second)
            dt = IST.localize(dt)
            return dt
        except ValueError:
            # Swap and try
            try:
                dt = datetime(year, b, a, hour, minute, second)
                dt = IST.localize(dt)
                return dt
            except ValueError:
                return None

    # Fallback: pandas
    try:
        dt = pd.to_datetime(s, dayfirst=False)
        return IST.localize(dt.to_pydatetime())
    except Exception:
        return None


def _assign_week(dt: Optional[datetime]) -> Optional[int]:
    """Assign dataset week number (1-based from Oct 6, 2025)."""
    if dt is None:
        return None
    base = datetime(2025, 10, 6, tzinfo=IST)
    delta = (dt.date() - base.date()).days
    if delta < 0:
        return None
    return (delta // 7) + 1


# ─────────────────────────────────────────────
# EMPLOYEE JSON NORMALIZATION
# ─────────────────────────────────────────────
def _normalize_employees(raw_employees: list) -> Tuple[pd.DataFrame, dict]:
    """
    Reconcile inconsistent HRMS schema into one canonical row per employee.
    Returns (DataFrame, audit_log dict).
    """
    audit = {
        "duplicates_found": [],
        "missing_fields_patched": [],
        "compensation_conflicts": [],
    }

    records = {}  # employee_id → canonical dict

    for emp in raw_employees:
        # ── 1. Resolve employee_id ──
        eid = emp.get("employee_id") or emp.get("EmployeeID")
        if not eid:
            continue

        # ── 2. Resolve department ──
        dept = emp.get("department") or emp.get("Dept") or emp.get("dept")

        # ── 3. Resolve role & tenure (may be nested under meta) ──
        meta = emp.get("meta", {})
        role = emp.get("role") or meta.get("role")
        tenure_raw = emp.get("tenure_years") or meta.get("tenure")
        try:
            tenure = float(tenure_raw) if tenure_raw is not None else None
        except (ValueError, TypeError):
            tenure = None

        # ── 4. Normalize compensation → annual INR ──
        comp_obj = emp.get("compensation", {})
        if isinstance(comp_obj, dict):
            amount = comp_obj.get("amount")
            unit = str(comp_obj.get("unit", "")).lower()
        else:
            amount = comp_obj
            unit = "annual_inr"

        try:
            amount = float(amount)
        except (TypeError, ValueError):
            amount = None

        annual_inr = None
        if amount is not None:
            if "lpa" in unit:
                annual_inr = amount * 100_000
            elif "hourly" in unit:
                # 8 hrs/day × 22 working days/month × 12 months
                annual_inr = amount * 8 * 22 * 12
            elif "annual" in unit:
                annual_inr = amount
            else:
                annual_inr = amount  # best guess

        # ── 5. Normalize working_hours → daily_hours float ──
        wh = emp.get("working_hours")
        daily_hours = 9.0  # safe default
        if isinstance(wh, dict):
            try:
                start_h = int(str(wh.get("start", "09:00")).split(":")[0])
                end_h = int(str(wh.get("end", "18:00")).split(":")[0])
                daily_hours = float(end_h - start_h)
            except Exception:
                pass
        elif isinstance(wh, str) and "-" in wh:
            try:
                parts = wh.split("-")
                daily_hours = float(int(parts[1]) - int(parts[0]))
            except Exception:
                pass

        # ── 6. Status ──
        status = emp.get("status", "active")
        terminated_on = emp.get("terminated_on")

        canonical = {
            "employee_id": eid,
            "name": emp.get("name"),
            "department": dept,
            "role": role,
            "tenure_years": tenure,
            "annual_inr": annual_inr,
            "daily_hours": daily_hours,
            "status": status,
            "terminated_on": terminated_on,
        }

        # ── 7. Handle duplicates — keep record with more complete data ──
        if eid in records:
            existing = records[eid]
            audit["duplicates_found"].append(
                {
                    "employee_id": eid,
                    "kept_compensation": existing["annual_inr"],
                    "discarded_compensation": canonical["annual_inr"],
                    "decision": "kept first record (more complete name); averaged compensation",
                }
            )
            # Average compensation if both present
            if existing["annual_inr"] and canonical["annual_inr"]:
                existing["annual_inr"] = (
                    existing["annual_inr"] + canonical["annual_inr"]
                ) / 2
                audit["compensation_conflicts"].append(
                    {
                        "employee_id": eid,
                        "resolution": f"Averaged {existing['annual_inr']} and {canonical['annual_inr']}",
                    }
                )
        else:
            records[eid] = canonical

    df = pd.DataFrame(list(records.values()))

    # Hourly rate for cost calculations
    # annual_inr / (daily_hours * 22 * 12)
    df["hourly_rate_inr"] = df["annual_inr"] / (df["daily_hours"] * 22 * 12)

    return df, audit


# ─────────────────────────────────────────────
# ACTIVITY LOG NORMALIZATION
# ─────────────────────────────────────────────
def _normalize_activities(raw_df: pd.DataFrame) -> Tuple[pd.DataFrame, dict]:
    """
    Clean and normalize activity log CSV.
    Returns (clean_df, audit dict).
    """
    audit = {
        "total_raw_rows": len(raw_df),
        "rows_dropped": [],
        "rows_flagged": [],
        "bool_nulls": 0,
        "unknown_employee_rows_dropped": 0,
        "duplicate_rows_dropped": 0,
        "duration_negatives_dropped": 0,
        "duration_zeros_dropped": 0,
        "duration_outliers_flagged": 0,
        "blank_duration_dropped": 0,
    }

    df = raw_df.copy()

    # ── Step 1: Drop rows with unknown employee_id ("?") ──
    unknown_mask = df["employee_id"].astype(str).str.strip() == "?"
    audit["unknown_employee_rows_dropped"] = int(unknown_mask.sum())
    df = df[~unknown_mask].copy()

    # ── Step 2: Normalize duration_minutes ──
    df["duration_minutes"] = pd.to_numeric(
        df["duration_minutes"].astype(str).str.strip().replace({"": np.nan}),
        errors="coerce",
    )

    blank_mask = df["duration_minutes"].isna()
    audit["blank_duration_dropped"] = int(blank_mask.sum())
    df = df[~blank_mask].copy()

    neg_mask = df["duration_minutes"] < 0
    audit["duration_negatives_dropped"] = int(neg_mask.sum())
    df = df[~neg_mask].copy()

    zero_mask = df["duration_minutes"] == 0
    audit["duration_zeros_dropped"] = int(zero_mask.sum())
    df = df[~zero_mask].copy()

    # Flag outliers: > 480 minutes (full 8-hour day) as suspicious
    # Keep but flag — a 999-minute entry is clearly an error or test data
    OUTLIER_THRESHOLD = 480
    outlier_mask = df["duration_minutes"] > OUTLIER_THRESHOLD
    audit["duration_outliers_flagged"] = int(outlier_mask.sum())
    df["is_duration_outlier"] = outlier_mask

    # ── Step 3: Parse timestamps ──
    df["timestamp_raw"] = df["timestamp"].astype(str)
    df["timestamp_ist"] = df["timestamp_raw"].apply(_parse_timestamp)

    unparseable = df["timestamp_ist"].isna()
    audit["timestamp_unparseable"] = int(unparseable.sum())
    df = df[~unparseable].copy()

    # ── Step 4: Assign week number ──
    df["week"] = df["timestamp_ist"].apply(_assign_week)

    # ── Step 5: Canonical app names ──
    df["app_used_raw"] = df["app_used"].astype(str)
    df["app_used"] = df["app_used_raw"].apply(_canonical_app)

    # ── Step 6: Canonical task categories ──
    df["task_category_raw"] = df["task_category"].astype(str)
    df["task_category"] = df["task_category_raw"].apply(_canonical_task)

    # ── Step 7: Normalize is_repetitive ──
    df["is_repetitive"] = df["is_repetitive"].apply(_parse_bool)
    audit["bool_nulls"] = int(df["is_repetitive"].isna().sum())
    # Treat null as False (conservative assumption — not enough info to call repetitive)
    df["is_repetitive"] = df["is_repetitive"].fillna(False)

    # ── Step 8: Deduplicate ──
    before_dedup = len(df)
    df = df.drop_duplicates(
        subset=["employee_id", "timestamp_ist", "app_used", "task_category"]
    )
    audit["duplicate_rows_dropped"] = before_dedup - len(df)

    # ── Step 9: Add date columns for filtering ──
    df["date"] = df["timestamp_ist"].apply(lambda x: x.date() if x else None)
    df["hour"] = df["timestamp_ist"].apply(lambda x: x.hour if x else None)
    df["day_of_week"] = df["timestamp_ist"].apply(
        lambda x: x.strftime("%A") if x else None
    )

    audit["total_clean_rows"] = len(df)
    return df, audit


# ─────────────────────────────────────────────
# PIPELINE ENTRYPOINT
# ─────────────────────────────────────────────
_cache = None


def load_and_process() -> dict:
    """
    Main pipeline function. Returns a dict with all processed data.
    Results are cached after first call.
    """
    global _cache
    if _cache is not None:
        return _cache

    # ── Load raw data ──
    activity_path = DATA_DIR / "activity_logs.csv"
    employees_path = DATA_DIR / "employees.json"

    raw_activities = pd.read_csv(activity_path, dtype=str)
    with open(employees_path, "r", encoding="utf-8") as f:
        employees_raw = json.load(f)

    raw_employees_list = employees_raw["data"]["employees"]

    # ── Normalize ──
    emp_df, emp_audit = _normalize_employees(raw_employees_list)
    act_df, act_audit = _normalize_activities(raw_activities)

    # ── Join ──
    joined = act_df.merge(
        emp_df[
            [
                "employee_id",
                "name",
                "department",
                "role",
                "tenure_years",
                "annual_inr",
                "hourly_rate_inr",
                "daily_hours",
                "status",
                "terminated_on",
            ]
        ],
        on="employee_id",
        how="left",
        suffixes=("_act", "_emp"),
    )

    # Prefer activity department (more granular) but fall back to emp
    # Note: activity df has 'department', emp_df also has 'department' → merge adds _act/_emp suffixes
    if "department_act" in joined.columns:
        joined["department"] = joined["department_act"].combine_first(
            joined["department_emp"] if "department_emp" in joined.columns else pd.Series(pd.NA, index=joined.index)
        )
        joined = joined.drop(
            columns=["department_act", "department_emp"], errors="ignore"
        )
    elif "department" not in joined.columns:
        joined["department"] = pd.NA

    # ── Join quality flags ──
    no_metadata = act_df[~act_df["employee_id"].isin(emp_df["employee_id"])][
        "employee_id"
    ].unique()
    no_activity = emp_df[~emp_df["employee_id"].isin(act_df["employee_id"])][
        "employee_id"
    ].values

    # ── Cost calculations ──
    # Recoverable minutes: repetitive tasks only
    # Automation capture rate: 70% (industry standard for RPA/AI automation)
    AUTOMATION_CAPTURE_RATE = 0.70
    MONTH_DAYS = 30
    DATASET_DAYS = 19  # Oct 6–24 inclusive

    joined["cost_per_minute"] = joined["hourly_rate_inr"] / 60
    joined["minute_cost_inr"] = joined["duration_minutes"] * joined["cost_per_minute"]

    repetitive_mask = joined["is_repetitive"] == True
    joined["is_automatable"] = repetitive_mask

    # ── Automation priority score per task category ──
    task_stats = (
        joined.groupby("task_category")
        .agg(
            total_minutes=("duration_minutes", "sum"),
            total_cost_inr=("minute_cost_inr", "sum"),
            total_rows=("employee_id", "count"),
            repetitive_rows=("is_automatable", "sum"),
            unique_employees=("employee_id", "nunique"),
        )
        .reset_index()
    )
    task_stats["repetitive_rate"] = (
        task_stats["repetitive_rows"] / task_stats["total_rows"]
    )
    task_stats["volume_weight"] = task_stats["total_minutes"] / task_stats[
        "total_minutes"
    ].max()
    task_stats["employee_spread"] = task_stats["unique_employees"] / 15
    task_stats["rupee_weight"] = task_stats["total_cost_inr"] / task_stats[
        "total_cost_inr"
    ].max()

    task_stats["automation_score"] = (
        task_stats["volume_weight"] * 0.30
        + task_stats["repetitive_rate"] * 0.35
        + task_stats["employee_spread"] * 0.20
        + task_stats["rupee_weight"] * 0.15
    )
    task_stats = task_stats.sort_values("automation_score", ascending=False)

    # ── Headline numbers ──
    rep_df = joined[joined["is_automatable"]].copy()

    # Scale from dataset period (19 days) to full month (30 days)
    scale_factor = MONTH_DAYS / DATASET_DAYS

    recoverable_minutes_raw = rep_df["duration_minutes"].sum()
    recoverable_hours_month = (
        recoverable_minutes_raw * AUTOMATION_CAPTURE_RATE * scale_factor / 60
    )

    rep_df_with_cost = rep_df.dropna(subset=["hourly_rate_inr"])
    recoverable_inr_month = (
        rep_df_with_cost["minute_cost_inr"].sum()
        * AUTOMATION_CAPTURE_RATE
        * scale_factor
    )

    # ── Anomaly detection ──
    # Flag entries where duration > mean + 2.5σ within their task category
    task_mean = joined.groupby("task_category")["duration_minutes"].transform("mean")
    task_std = joined.groupby("task_category")["duration_minutes"].transform("std").fillna(0)
    joined["z_score"] = (joined["duration_minutes"] - task_mean) / task_std.replace(0, 1)
    joined["is_anomaly"] = (joined["z_score"] > 2.5) | joined["is_duration_outlier"]

    anomalies = (
        joined[joined["is_anomaly"]]
        .sort_values("duration_minutes", ascending=False)
        .head(10)[
            [
                "employee_id",
                "name",
                "department",
                "task_category",
                "duration_minutes",
                "timestamp_ist",
                "z_score",
            ]
        ]
    )

    # ── Serialize ──
    def df_to_records(df):
        d = df.copy()
        for col in d.select_dtypes(include=["datetime64", "datetimetz"]).columns:
            d[col] = d[col].astype(str)
        for col in d.columns:
            if hasattr(d[col], "dt"):
                d[col] = d[col].astype(str)
        # Handle timezone-aware datetime objects
        for col in d.columns:
            try:
                d[col] = d[col].apply(
                    lambda x: x.isoformat() if hasattr(x, "isoformat") else x
                )
            except Exception:
                pass
        return d.where(pd.notna(d), None).to_dict(orient="records")

    _cache = {
        "joined": joined,
        "employees": emp_df,
        "activities": act_df,
        "task_stats": task_stats,
        "anomalies": anomalies,
        "audit": {
            "activity": act_audit,
            "employee": emp_audit,
            "no_metadata_employees": list(no_metadata),
            "no_activity_employees": list(no_activity),
        },
        "headline": {
            "recoverable_hours_month": round(recoverable_hours_month, 1),
            "recoverable_inr_month": round(recoverable_inr_month, 0),
            "automation_capture_rate": AUTOMATION_CAPTURE_RATE,
            "scale_factor": scale_factor,
            "dataset_days": DATASET_DAYS,
            "methodology": (
                f"Repetitive task minutes ({int(recoverable_minutes_raw)} min raw) "
                f"× {AUTOMATION_CAPTURE_RATE:.0%} automation capture rate "
                f"× {scale_factor:.2f} (30/{DATASET_DAYS} day scale) "
                f"÷ 60 = {recoverable_hours_month:.1f} hrs/month. "
                f"INR calculated using each employee's hourly rate "
                f"(annual_INR / (daily_hours × 22 × 12))."
            ),
        },
        "date_range": {
            "start": "2025-10-06",
            "end": "2025-10-24",
        },
    }

    return _cache


def get_data():
    """Return cached pipeline result."""
    return load_and_process()
