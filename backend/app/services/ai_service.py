"""
AI Assistant Service
====================
Grounded conversational AI using Groq API.
All quantitative claims are injected from the normalized dataset.
"""
import os
import json
import re
from typing import AsyncGenerator, List, Dict
import httpx

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "llama-3.3-70b-versatile"


def _build_system_prompt(data: dict) -> str:
    """
    Build a grounded system prompt from the normalized dataset.
    Injects actual numbers so the LLM cannot hallucinate them.
    """
    joined = data["joined"]
    emp_df = data["employees"]
    task_stats = data["task_stats"]
    headline = data["headline"]
    audit = data["audit"]

    rep_df = joined[joined["is_automatable"] == True].copy()
    rep_dept = rep_df.groupby("department")["duration_minutes"].sum().reset_index()
    rep_dept.columns = ["department", "repetitive_minutes"]

    dept_summary = (
        joined.groupby("department")
        .agg(
            total_minutes=("duration_minutes", "sum"),
            unique_employees=("employee_id", "nunique"),
            total_cost_inr=("minute_cost_inr", "sum"),
        )
        .reset_index()
    )
    dept_summary = dept_summary.merge(rep_dept, on="department", how="left")
    dept_summary["repetitive_minutes"] = dept_summary["repetitive_minutes"].fillna(0)

    dept_text = "\n".join(
        f"  - {row['department']}: {row['total_minutes']:.0f} min total, "
        f"{row['repetitive_minutes']:.0f} min repetitive, "
        f"{row['unique_employees']} employees, "
        f"₹{row['total_cost_inr']:,.0f} total cost"
        for _, row in dept_summary.iterrows()
        if row["department"] and str(row["department"]) != "nan"
    )

    # Build top task categories
    top_tasks = task_stats.head(10)
    tasks_text = "\n".join(
        f"  - {row['task_category']}: {row['total_minutes']:.0f} min, "
        f"{row['repetitive_rate']:.0%} repetitive, "
        f"score={row['automation_score']:.3f}, "
        f"₹{row['total_cost_inr']:,.0f} cost"
        for _, row in top_tasks.iterrows()
        if row["task_category"] and str(row["task_category"]) != "nan"
    )

    # Per-employee quick stats
    emp_stats = (
        joined.groupby(["employee_id", "name", "department", "role"])
        .agg(
            total_minutes=("duration_minutes", "sum"),
            rep_minutes=("is_automatable", lambda x: joined.loc[x.index, "duration_minutes"][x].sum()),
            hourly_rate=("hourly_rate_inr", "first"),
        )
        .reset_index()
    )
    emp_text = "\n".join(
        f"  - {row['employee_id']} ({row.get('name','?')}, {row.get('role','?')}, "
        f"{row['department']}): {row['total_minutes']:.0f} min total, "
        f"{row['rep_minutes']:.0f} min repetitive, "
        f"₹{row['hourly_rate']:,.0f}/hr rate"
        for _, row in emp_stats.iterrows()
        if row["employee_id"] and str(row["employee_id"]) != "nan"
    )

    return f"""You are the Workforce Pulse AI Assistant. You analyze employee productivity data for a COO.

IMPORTANT RULES:
1. ONLY cite numbers from the dataset below. Never hallucinate figures.
2. Every quantitative claim must reference the source data (e.g., "based on {headline['dataset_days']} days of data").
3. When asked follow-up questions, maintain context from the conversation.
4. Format monetary values in Indian Rupees (₹).
5. Be concise but insightful. Focus on actionable recommendations.
6. If you don't have data to answer precisely, say so honestly.

=== DATASET SUMMARY ===
Period: 2025-10-06 to 2025-10-24 ({headline['dataset_days']} days)
Total employees: {len(emp_df)} with metadata, {audit['activity']['total_clean_rows']} clean activity rows
Headline: {headline['recoverable_hours_month']:.1f} hours/month recoverable, ₹{headline['recoverable_inr_month']:,.0f}/month recoverable
Methodology: {headline['methodology']}

=== DEPARTMENT BREAKDOWN ===
{dept_text}

=== TOP TASK CATEGORIES BY AUTOMATION SCORE ===
{tasks_text}

=== EMPLOYEE PROFILES ===
{emp_text}

=== DATA QUALITY NOTES ===
- Unknown employee rows dropped: {audit['activity']['unknown_employee_rows_dropped']}
- Negative duration rows dropped: {audit['activity']['duration_negatives_dropped']}
- Blank duration rows dropped: {audit['activity']['blank_duration_dropped']}
- Outlier duration rows flagged: {audit['activity']['duration_outliers_flagged']} (>480 min)
- Employees with no metadata: {audit['no_metadata_employees']}
- Employees in HRMS but no activity: {list(audit['no_activity_employees'])}
"""


async def stream_ai_response(
    messages: List[Dict],
    data: dict,
) -> AsyncGenerator[str, None]:
    """
    Stream AI response using Groq API.
    Injects grounded system prompt with dataset context.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        yield "data: " + json.dumps({"error": "GROQ_API_KEY not configured"}) + "\n\n"
        return

    system_prompt = _build_system_prompt(data)

    full_messages = [{"role": "system", "content": system_prompt}] + messages

    payload = {
        "model": MODEL,
        "messages": full_messages,
        "max_tokens": 1024,
        "temperature": 0.3,
        "stream": True,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST", GROQ_API_URL, json=payload, headers=headers
            ) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    yield f"data: {json.dumps({'error': f'Groq API error {resp.status_code}: {body.decode()}'})}\n\n"
                    return

                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        raw = line[6:]
                        if raw.strip() == "[DONE]":
                            yield "data: [DONE]\n\n"
                            return
                        try:
                            chunk = json.loads(raw)
                            delta = (
                                chunk.get("choices", [{}])[0]
                                .get("delta", {})
                                .get("content", "")
                            )
                            if delta:
                                yield f"data: {json.dumps({'content': delta})}\n\n"
                        except json.JSONDecodeError:
                            continue
    except httpx.TimeoutException:
        yield f"data: {json.dumps({'error': 'Request timed out. Please try again.'})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


async def get_ai_response(
    messages: List[Dict],
    data: dict,
) -> str:
    """Non-streaming version for simple use cases."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return "Error: GROQ_API_KEY not configured"

    system_prompt = _build_system_prompt(data)
    full_messages = [{"role": "system", "content": system_prompt}] + messages

    payload = {
        "model": MODEL,
        "messages": full_messages,
        "max_tokens": 1024,
        "temperature": 0.3,
        "stream": False,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(GROQ_API_URL, json=payload, headers=headers)
        resp.raise_for_status()
        result = resp.json()
        return result["choices"][0]["message"]["content"]
