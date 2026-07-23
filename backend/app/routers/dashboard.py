"""
Dashboard Router
================
All analytics endpoints for the frontend dashboard.
"""
import math
from typing import Optional
import numpy as np
import pandas as pd
from fastapi import APIRouter, Query

from ..services.data_pipeline import get_data

router = APIRouter()


def safe_val(v):
    """Convert numpy/pandas types to JSON-serializable Python types."""
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return float(v)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return v


def safe_records(df: pd.DataFrame) -> list:
    """Convert DataFrame to list of JSON-safe dicts."""
    records = []
    for _, row in df.iterrows():
        records.append({k: safe_val(v) for k, v in row.items()})
    return records


def filter_joined(
    joined: pd.DataFrame,
    department: Optional[str] = None,
    task_category: Optional[str] = None,
    employee_id: Optional[str] = None,
    week: Optional[int] = None,
) -> pd.DataFrame:
    df = joined.copy()
    if department and department != "all":
        df = df[df["department"] == department]
    if task_category and task_category != "all":
        df = df[df["task_category"] == task_category]
    if employee_id and employee_id != "all":
        df = df[df["employee_id"] == employee_id]
    if week and week > 0:
        df = df[df["week"] == week]
    return df


def _rep_minutes(df: pd.DataFrame) -> pd.Series:
    """Compute repetitive minutes per group — pandas 3.0 safe pattern.
    Returns sum of duration_minutes where is_automatable is True.
    """
    return df[df["is_automatable"] == True]["duration_minutes"].sum()


def _agg_rep_minutes(df: pd.DataFrame, group_col) -> pd.DataFrame:
    """Aggregate repetitive minutes safely without lambda referencing outer scope."""
    rep = (
        df[df["is_automatable"] == True]
        .groupby(group_col)["duration_minutes"]
        .sum()
        .reset_index()
    )
    rep.columns = [group_col, "repetitive_minutes"]
    return rep


@router.get("/headline")
async def headline(
    department: Optional[str] = Query(None),
    task_category: Optional[str] = Query(None),
    week: Optional[int] = Query(None),
):
    """Headline KPIs — recoverable hours & INR/month."""
    data = get_data()
    joined = filter_joined(
        data["joined"],
        department=department,
        task_category=task_category,
        week=week,
    )

    AUTOMATION_CAPTURE_RATE = 0.70
    MONTH_DAYS = 30
    DATASET_DAYS = 19
    scale_factor = MONTH_DAYS / DATASET_DAYS

    rep_df = joined[joined["is_automatable"] == True]

    recoverable_minutes_raw = rep_df["duration_minutes"].sum()
    recoverable_hours_month = (
        recoverable_minutes_raw * AUTOMATION_CAPTURE_RATE * scale_factor / 60
    )

    rep_with_cost = rep_df.dropna(subset=["hourly_rate_inr"])
    recoverable_inr_month = (
        rep_with_cost["minute_cost_inr"].sum() * AUTOMATION_CAPTURE_RATE * scale_factor
    )

    total_minutes = joined["duration_minutes"].sum()
    rep_share = rep_df["duration_minutes"].sum() / max(total_minutes, 1)

    return {
        "recoverable_hours_month": round(safe_val(recoverable_hours_month) or 0, 1),
        "recoverable_inr_month": round(safe_val(recoverable_inr_month) or 0, 0),
        "total_minutes": safe_val(total_minutes),
        "repetitive_share": round(safe_val(rep_share) or 0, 3),
        "total_employees": int(joined["employee_id"].nunique()),
        "total_rows": len(joined),
        "methodology": data["headline"]["methodology"],
        "date_range": data["date_range"],
        "automation_capture_rate": AUTOMATION_CAPTURE_RATE,
        "scale_factor": round(scale_factor, 2),
        "dataset_days": DATASET_DAYS,
    }


@router.get("/breakdown")
async def breakdown(
    dimension: str = Query("task_category", enum=["task_category", "app_used", "department"]),
    department: Optional[str] = Query(None),
    task_category: Optional[str] = Query(None),
    week: Optional[int] = Query(None),
):
    """Time-sink breakdown by dimension."""
    data = get_data()
    joined = filter_joined(
        data["joined"],
        department=department,
        task_category=task_category,
        week=week,
    )

    # Remove nulls in dimension
    df = joined.dropna(subset=[dimension])
    df = df[df[dimension].astype(str) != "nan"]
    df = df[df[dimension].astype(str) != "None"]

    grouped = (
        df.groupby(dimension)
        .agg(
            total_minutes=("duration_minutes", "sum"),
            unique_employees=("employee_id", "nunique"),
            total_cost_inr=("minute_cost_inr", "sum"),
            row_count=("employee_id", "count"),
        )
        .reset_index()
    )
    # Join repetitive minutes safely
    rep_agg = _agg_rep_minutes(df, dimension)
    grouped = grouped.merge(rep_agg, on=dimension, how="left")
    grouped["repetitive_minutes"] = grouped["repetitive_minutes"].fillna(0)
    grouped["repetitive_rate"] = grouped["repetitive_minutes"] / grouped["total_minutes"].clip(lower=1)
    grouped = grouped.sort_values("total_minutes", ascending=False)

    return {"data": safe_records(grouped), "dimension": dimension}


@router.get("/automation-priority")
async def automation_priority(
    department: Optional[str] = Query(None),
    week: Optional[int] = Query(None),
):
    """Ranked automation opportunities."""
    data = get_data()
    joined = filter_joined(data["joined"], department=department, week=week)

    df = joined.dropna(subset=["task_category"])
    df = df[df["task_category"].astype(str) != "nan"]

    task_stats = (
        df.groupby("task_category")
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
        task_stats["repetitive_rows"] / task_stats["total_rows"].clip(lower=1)
    )

    max_min = task_stats["total_minutes"].max() or 1
    max_cost = task_stats["total_cost_inr"].max() or 1

    task_stats["volume_weight"] = task_stats["total_minutes"] / max_min
    task_stats["employee_spread"] = task_stats["unique_employees"] / 15
    task_stats["rupee_weight"] = task_stats["total_cost_inr"] / max_cost
    task_stats["automation_score"] = (
        task_stats["volume_weight"] * 0.30
        + task_stats["repetitive_rate"] * 0.35
        + task_stats["employee_spread"] * 0.20
        + task_stats["rupee_weight"] * 0.15
    )
    task_stats = task_stats.sort_values("automation_score", ascending=False)

    return {
        "data": safe_records(task_stats),
        "formula": "score = volume(0.30) + repetitive_rate(0.35) + employee_spread(0.20) + rupee_impact(0.15)",
    }


@router.get("/employee-drill")
async def employee_drill(
    employee_id: str = Query(...),
    department: Optional[str] = Query(None),
):
    """Per-employee activity drill-down with peer comparison."""
    data = get_data()
    joined = data["joined"]

    emp_df = joined[joined["employee_id"] == employee_id].copy()
    if emp_df.empty:
        return {"error": f"Employee {employee_id} not found"}

    emp_dept = emp_df["department"].iloc[0]

    # Top tasks for this employee — pandas 3.0 safe
    top_tasks = (
        emp_df.groupby("task_category")
        .agg(
            total_minutes=("duration_minutes", "sum"),
            row_count=("employee_id", "count"),
        )
        .reset_index()
        .sort_values("total_minutes", ascending=False)
    )
    rep_agg = _agg_rep_minutes(emp_df, "task_category")
    top_tasks = top_tasks.merge(rep_agg, on="task_category", how="left")
    top_tasks["repetitive_minutes"] = top_tasks["repetitive_minutes"].fillna(0)

    # Peer comparison — same department
    dept_df = joined[
        (joined["department"] == emp_dept) & (joined["employee_id"] != employee_id)
    ]
    peer_total = dept_df.groupby("employee_id")["duration_minutes"].sum()
    peer_rep = (
        dept_df[dept_df["is_automatable"] == True]
        .groupby("employee_id")["duration_minutes"]
        .sum()
    )
    peer_rep_share = (peer_rep / peer_total.clip(lower=1)).mean()

    emp_total = emp_df["duration_minutes"].sum()
    emp_rep = emp_df[emp_df["is_automatable"] == True]["duration_minutes"].sum()
    emp_rep_share = emp_rep / max(emp_total, 1)

    # Weekly trend for employee — pandas 3.0 safe
    weekly_total = (
        emp_df.groupby("week")
        .agg(total_minutes=("duration_minutes", "sum"))
        .reset_index()
    )
    weekly_rep = _agg_rep_minutes(emp_df.assign(week=emp_df["week"]), "week").rename(
        columns={"repetitive_minutes": "rep_minutes"}
    )
    weekly = weekly_total.merge(weekly_rep, on="week", how="left")
    weekly["rep_minutes"] = weekly["rep_minutes"].fillna(0)
    weekly.rename(columns={"rep_minutes": "repetitive_minutes"}, inplace=True)

    return {
        "employee_id": employee_id,
        "name": emp_df["name"].iloc[0] if "name" in emp_df.columns else employee_id,
        "role": emp_df["role"].iloc[0] if "role" in emp_df.columns else None,
        "department": emp_dept,
        "annual_inr": safe_val(emp_df["annual_inr"].iloc[0]) if "annual_inr" in emp_df.columns else None,
        "total_minutes": safe_val(emp_total),
        "repetitive_minutes": safe_val(emp_rep),
        "repetitive_share": round(safe_val(emp_rep_share) or 0, 3),
        "peer_repetitive_share": round(safe_val(peer_rep_share) or 0, 3),
        "top_tasks": safe_records(top_tasks.head(10)),
        "weekly_trend": safe_records(weekly),
    }


@router.get("/employees-list")
async def employees_list(
    department: Optional[str] = Query(None),
    task_category: Optional[str] = Query(None),
):
    """List of employees with summary stats — filterable."""
    data = get_data()
    joined = filter_joined(
        data["joined"],
        department=department,
        task_category=task_category,
    )

    emp_stats = (
        joined.groupby(["employee_id"])
        .agg(
            name=("name", "first"),
            department=("department", "first"),
            role=("role", "first"),
            total_minutes=("duration_minutes", "sum"),
            annual_inr=("annual_inr", "first"),
            row_count=("employee_id", "count"),
        )
        .reset_index()
    )
    rep_agg = _agg_rep_minutes(joined, "employee_id")
    emp_stats = emp_stats.merge(rep_agg, on="employee_id", how="left")
    emp_stats["repetitive_minutes"] = emp_stats["repetitive_minutes"].fillna(0)
    emp_stats["repetitive_share"] = emp_stats["repetitive_minutes"] / emp_stats["total_minutes"].clip(lower=1)

    return {"data": safe_records(emp_stats.sort_values("total_minutes", ascending=False))}


@router.get("/weekly-trend")
async def weekly_trend(
    dimension: str = Query("task_category"),
    department: Optional[str] = Query(None),
    top_n: int = Query(5),
):
    """Week-over-week trend for top N task categories or repetitive share."""
    data = get_data()
    joined = filter_joined(data["joined"], department=department)
    joined = joined.dropna(subset=["week", dimension])
    joined = joined[joined["week"].between(1, 4)]

    # Get top N by total minutes
    top_items = (
        joined.groupby(dimension)["duration_minutes"]
        .sum()
        .nlargest(top_n)
        .index.tolist()
    )

    filtered = joined[joined[dimension].isin(top_items)]

    trend = (
        filtered.groupby(["week", dimension])
        .agg(total_minutes=("duration_minutes", "sum"))
        .reset_index()
    )
    # Rep minutes for trend
    rep_trend = (
        filtered[filtered["is_automatable"] == True]
        .groupby(["week", dimension])["duration_minutes"]
        .sum()
        .reset_index()
    )
    rep_trend.columns = ["week", dimension, "rep_minutes"]
    trend = trend.merge(rep_trend, on=["week", dimension], how="left")
    trend["rep_minutes"] = trend["rep_minutes"].fillna(0)
    trend["rep_share"] = trend["rep_minutes"] / trend["total_minutes"].clip(lower=1)

    # Overall weekly rep share
    overall_total = (
        joined.groupby("week")
        .agg(total_minutes=("duration_minutes", "sum"))
        .reset_index()
    )
    overall_rep = (
        joined[joined["is_automatable"] == True]
        .groupby("week")["duration_minutes"]
        .sum()
        .reset_index()
    )
    overall_rep.columns = ["week", "rep_minutes"]
    overall = overall_total.merge(overall_rep, on="week", how="left")
    overall["rep_minutes"] = overall["rep_minutes"].fillna(0)
    overall["rep_share"] = overall["rep_minutes"] / overall["total_minutes"].clip(lower=1)

    return {
        "trend": safe_records(trend),
        "overall_weekly": safe_records(overall),
        "top_items": top_items,
        "dimension": dimension,
    }


@router.get("/anomalies")
async def anomalies():
    """Surface data anomalies and outliers."""
    data = get_data()
    joined = data["joined"]

    # Duration outliers
    outlier_df = joined[joined.get("is_anomaly", joined["is_duration_outlier"] if "is_duration_outlier" in joined.columns else pd.Series(False, index=joined.index)) == True].sort_values(
        "duration_minutes", ascending=False
    )

    # Check for the right column name
    if "is_duration_outlier" in joined.columns:
        outlier_df = joined[joined["is_duration_outlier"] == True].sort_values("duration_minutes", ascending=False)
    elif "is_anomaly" in joined.columns:
        outlier_df = joined[joined["is_anomaly"] == True].sort_values("duration_minutes", ascending=False)
    else:
        outlier_df = joined.nlargest(5, "duration_minutes")

    outlier_records = []
    for _, row in outlier_df.head(10).iterrows():
        outlier_records.append({
            "employee_id": safe_val(row["employee_id"]),
            "name": safe_val(row.get("name")),
            "role": safe_val(row.get("role")),
            "department": safe_val(row.get("department")),
            "task_category": safe_val(row.get("task_category")),
            "duration_minutes": safe_val(row["duration_minutes"]),
            "annual_inr": safe_val(row.get("annual_inr")),
            "z_score": safe_val(row.get("z_score")),  # computed in pipeline as z_score
        })

    # High-rep departments
    dept_total = joined.groupby("department")["duration_minutes"].sum().reset_index()
    dept_total.columns = ["department", "total_minutes"]
    dept_rep = (
        joined[joined["is_automatable"] == True]
        .groupby("department")["duration_minutes"]
        .sum()
        .reset_index()
    )
    dept_rep.columns = ["department", "rep_minutes"]
    dept_stats = dept_total.merge(dept_rep, on="department", how="left")
    dept_stats["rep_minutes"] = dept_stats["rep_minutes"].fillna(0)
    dept_stats["rep_share"] = dept_stats["rep_minutes"] / dept_stats["total_minutes"].clip(lower=1)
    high_rep_depts = dept_stats[dept_stats["rep_share"] > 0.5].sort_values("rep_share", ascending=False)

    # High-rep employees
    emp_total = joined.groupby("employee_id").agg(
        name=("name", "first"),
        department=("department", "first"),
        total_minutes=("duration_minutes", "sum"),
    ).reset_index()
    emp_rep_agg = _agg_rep_minutes(joined, "employee_id")
    emp_stats = emp_total.merge(emp_rep_agg, on="employee_id", how="left")
    emp_stats["repetitive_minutes"] = emp_stats["repetitive_minutes"].fillna(0)
    emp_stats["rep_share"] = emp_stats["repetitive_minutes"] / emp_stats["total_minutes"].clip(lower=1)
    high_rep_emps = emp_stats[emp_stats["rep_share"] > 0.65].sort_values("rep_share", ascending=False)

    n_outliers = len(outlier_df)
    n_high_rep = len(high_rep_emps)

    return {
        "duration_outliers": outlier_records,
        "high_repetitive_departments": safe_records(high_rep_depts),
        "high_repetitive_employees": safe_records(high_rep_emps),
        "summary": (
            f"{n_outliers} duration outlier row(s) detected (>2.5σ within task category). "
            f"{n_high_rep} employee(s) have >65% repetitive task share. "
            "See Data Quality page for full ingestion audit."
        ),
    }


@router.get("/filters")
async def get_filters():
    """Return available filter values."""
    data = get_data()
    joined = data["joined"]

    depts = sorted([str(d) for d in joined["department"].dropna().unique() if str(d) not in ("nan", "None")])
    tasks = sorted([str(t) for t in joined["task_category"].dropna().unique() if str(t) not in ("nan", "None")])
    emps = sorted([str(e) for e in joined["employee_id"].dropna().unique()])
    weeks = sorted([int(w) for w in joined["week"].dropna().unique() if not math.isnan(float(w))])

    return {
        "departments": depts,
        "task_categories": tasks,
        "employees": emps,
        "weeks": weeks,
    }


@router.get("/data-quality")
async def data_quality():
    """Return full data ingestion audit log."""
    data = get_data()
    return data["audit"]


@router.get("/employee-raw-activity")
async def employee_raw_activity(employee_id: str = Query(...)):
    """
    Return every activity row logged for a given employee_id,
    with all fields including HRMS metadata, timestamps, duration,
    task category, app used, is_repetitive, week, and cost.
    Used for the anomaly card CSV export.
    """
    data = get_data()
    joined = data["joined"]

    emp_rows = joined[joined["employee_id"] == employee_id].copy()

    if emp_rows.empty:
        return {"employee_id": employee_id, "rows": [], "total_rows": 0}

    # Build clean export columns
    export_cols = []
    col_map = {
        "employee_id": "employee_id",
        "name": "name",
        "role": "role",
        "department": "department",
        "annual_inr": "annual_inr",
        "hourly_rate_inr": "hourly_rate_inr",
        "timestamp_ist": "timestamp_ist",
        "week": "week",
        "task_category": "task_category",
        "app_used": "app_used",
        "duration_minutes": "duration_minutes",
        "is_repetitive": "is_repetitive",
        "is_automatable": "is_automatable",
        "is_duration_outlier": "is_duration_outlier",
        "z_score": "z_score",
        "minute_cost_inr": "minute_cost_inr",
    }
    available = {c: c for c in col_map if c in emp_rows.columns}
    emp_export = emp_rows[list(available.keys())].copy()

    # Convert timestamps to strings, sanitize NaN/Inf floats for JSON compliance
    for col in emp_export.select_dtypes(include=["datetimetz", "datetime64"]).columns:
        emp_export[col] = emp_export[col].astype(str)
    for col in emp_export.columns:
        try:
            emp_export[col] = emp_export[col].apply(
                lambda x: x.isoformat() if hasattr(x, "isoformat") else x
            )
        except Exception:
            pass

    # Sort by timestamp
    emp_export = emp_export.sort_values(
        "timestamp_ist" if "timestamp_ist" in emp_export.columns else emp_export.columns[0]
    )

    # Replace NaN/None with None (JSON null), then sanitize any remaining NaN floats
    import math
    raw_records = emp_export.where(pd.notna(emp_export), None).to_dict(orient="records")

    def _sanitize(val):
        if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
            return None
        return val

    records = [{k: _sanitize(v) for k, v in row.items()} for row in raw_records]

    # Summary stats (safe against NaN)
    total_min = float(emp_rows["duration_minutes"].sum())
    if math.isnan(total_min): total_min = 0.0
    rep_min_series = emp_rows[emp_rows["is_automatable"] == True]["duration_minutes"] if "is_automatable" in emp_rows.columns else pd.Series([], dtype=float)
    rep_min = float(rep_min_series.sum()) if len(rep_min_series) else 0.0
    if math.isnan(rep_min): rep_min = 0.0

    return {
        "employee_id": employee_id,
        "name": safe_val(emp_rows["name"].iloc[0]) if "name" in emp_rows.columns else None,
        "role": safe_val(emp_rows["role"].iloc[0]) if "role" in emp_rows.columns else None,
        "department": safe_val(emp_rows["department"].iloc[0]) if "department" in emp_rows.columns else None,
        "annual_inr": safe_val(emp_rows["annual_inr"].iloc[0]) if "annual_inr" in emp_rows.columns else None,
        "total_minutes": round(total_min, 1),
        "repetitive_minutes": round(rep_min, 1),
        "total_rows": len(records),
        "rows": records,
    }

