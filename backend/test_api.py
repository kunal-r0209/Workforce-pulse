import urllib.request, json, sys

# Force UTF-8 output on Windows
sys.stdout.reconfigure(encoding='utf-8')

print("=" * 55)
print("  WORKFORCE PULSE -- SMOKE TEST")
print("=" * 55)

tests = [
    ("Health",              "http://localhost:8000/health"),
    ("Headline (all)",      "http://localhost:8000/api/dashboard/headline"),
    ("Headline (Finance)",  "http://localhost:8000/api/dashboard/headline?department=Finance"),
    ("Headline (Week 1)",   "http://localhost:8000/api/dashboard/headline?week=1"),
    ("Breakdown tasks",     "http://localhost:8000/api/dashboard/breakdown?dimension=task_category"),
    ("Breakdown apps",      "http://localhost:8000/api/dashboard/breakdown?dimension=app_used"),
    ("Breakdown depts",     "http://localhost:8000/api/dashboard/breakdown?dimension=department"),
    ("Automation priority", "http://localhost:8000/api/dashboard/automation-priority"),
    ("Employees list",      "http://localhost:8000/api/dashboard/employees-list"),
    ("Employee drill E001", "http://localhost:8000/api/dashboard/employee-drill?employee_id=E001"),
    ("Weekly trend",        "http://localhost:8000/api/dashboard/weekly-trend"),
    ("Anomalies",           "http://localhost:8000/api/dashboard/anomalies"),
    ("Filters",             "http://localhost:8000/api/dashboard/filters"),
    ("Data quality",        "http://localhost:8000/api/data-quality"),
    ("Export summary",      "http://localhost:8000/api/export/summary"),
]

passed = 0
failed = 0

for name, url in tests:
    try:
        r = urllib.request.urlopen(url, timeout=8)
        d = json.load(r)

        detail = ""
        if "recoverable_hours_month" in d:
            detail = f" -> {d['recoverable_hours_month']}h recoverable, {d['repetitive_share']*100:.1f}% rep"
        elif "data" in d and isinstance(d["data"], list):
            detail = f" -> {len(d['data'])} rows"
        elif "departments" in d:
            detail = f" -> depts={d['departments']}"
        elif "duration_outliers" in d:
            detail = f" -> {len(d['duration_outliers'])} outliers, {len(d['high_repetitive_employees'])} high-rep emps"
        elif "activity" in d:
            detail = f" -> {d['activity']['total_raw_rows']} raw -> {d['activity']['total_clean_rows']} clean rows"
        elif "headline" in d:
            detail = f" -> recoverable INR={d['headline']['recoverable_inr_month']:,.0f}"
        elif "employee_id" in d:
            detail = f" -> {d.get('name', d['employee_id'])}, rep={d.get('repetitive_share', 0)*100:.1f}%"
        elif "trend" in d:
            detail = f" -> {len(d['trend'])} trend pts, top={d['top_items'][:3]}"
        elif "status" in d:
            detail = f" -> {d['status']}"

        print(f"  [PASS] {name}{detail}")
        passed += 1
    except Exception as e:
        print(f"  [FAIL] {name}: {e}")
        failed += 1

print("=" * 55)
print(f"  RESULTS: {passed}/{passed+failed} passed")
if failed == 0:
    print("  ALL TESTS PASSED")
else:
    print(f"  {failed} TESTS FAILED")
print("=" * 55)
sys.exit(0 if failed == 0 else 1)
