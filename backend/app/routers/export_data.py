"""
Export Router
=============
Data export endpoints for executive summary generation.
"""
from fastapi import APIRouter, Query
from typing import Optional
from ..services.data_pipeline import get_data
from ..routers.dashboard import safe_records, filter_joined, safe_val

router = APIRouter()


@router.get("/summary")
async def export_summary(
    department: Optional[str] = Query(None),
    task_category: Optional[str] = Query(None),
    week: Optional[int] = Query(None),
):
    """
    Generate export data package for executive summary PDF.
    Returns all data needed to render the one-pager.
    """
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

    # Top 5 automation opps
    import pandas as pd
    import numpy as np

    task_stats = (
        joined.dropna(subset=["task_category"])
        .groupby("task_category")
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
    task_stats["automation_score"] = (
        (task_stats["total_minutes"] / max_min) * 0.30
        + task_stats["repetitive_rate"] * 0.35
        + (task_stats["unique_employees"] / 15) * 0.20
        + (task_stats["total_cost_inr"] / max_cost) * 0.15
    )
    top5 = task_stats.sort_values("automation_score", ascending=False).head(5)

    return {
        "headline": {
            "recoverable_hours_month": round(safe_val(recoverable_hours_month) or 0, 1),
            "recoverable_inr_month": round(safe_val(recoverable_inr_month) or 0, 0),
            "total_employees": int(joined["employee_id"].nunique()),
            "total_rows": len(joined),
        },
        "top_automation_opportunities": safe_records(top5),
        "date_range": data["date_range"],
        "methodology": data["headline"]["methodology"],
        "active_filters": {
            "department": department or "all",
            "task_category": task_category or "all",
            "week": week or "all",
        },
        "generated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }
