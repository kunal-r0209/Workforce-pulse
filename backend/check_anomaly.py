import urllib.request, json

for eid in ['E012', 'E013']:
    r = urllib.request.urlopen(
        f'http://localhost:8000/api/dashboard/employee-raw-activity?employee_id={eid}',
        timeout=10
    )
    d = json.load(r)
    mins = d['total_minutes']
    h = int(mins // 60)
    m = int(mins % 60)
    print(f"{eid} ({d['name']}) | {d['role']} | {d['department']}")
    print(f"  Total: {h}h {m}min | Rep: {d['repetitive_minutes']}min | Rows: {d['total_rows']}")

    tasks = {}
    for row in d['rows']:
        t = row.get('task_category') or 'Unknown'
        dur = float(row.get('duration_minutes') or 0)
        rep = bool(row.get('is_repetitive') or row.get('is_automatable'))
        if t not in tasks:
            tasks[t] = {'total': 0, 'rep': 0, 'rows': 0}
        tasks[t]['total'] += dur
        if rep:
            tasks[t]['rep'] += dur
        tasks[t]['rows'] += 1

    for t, v in sorted(tasks.items(), key=lambda x: -x[1]['total']):
        th = int(v['total'] // 60)
        tm = int(v['total'] % 60)
        print(f"    {t}: {th}h {tm}min total ({v['rows']} rows, {v['rep']:.0f}min rep)")
    print()
