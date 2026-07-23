import { useState, useEffect, useCallback } from 'react'
import { dashboardApi, AnomalyData } from '../services/api'

// ── helpers ──────────────────────────────────────────────
function fmtDuration(minutes: number | null | undefined) {
  if (minutes == null || isNaN(minutes)) return '—'
  const m = Math.round(minutes)
  const h = Math.floor(m / 60)
  const mins = m % 60
  if (h === 0) return `${mins}min`
  if (mins === 0) return `${h}h`
  return `${h}h ${mins}min`
}

function fmtINR(n: number | null | undefined) {
  if (!n) return '—'
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${Math.round(n)}`
}

function downloadCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const csv = [
    headers.join(','),
    ...rows.map(row => headers.map(h => escape(row[h])).join(',')),
  ].join('\r\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Types ─────────────────────────────────────────────────
type RawActivityResponse = {
  employee_id: string
  name: string
  role: string
  department: string
  annual_inr: number | null
  total_minutes: number
  repetitive_minutes: number
  total_rows: number
  rows: Array<Record<string, unknown>>
}

// ── AnomalyCard ───────────────────────────────────────────
export default function AnomalyCard() {
  const [data, setData] = useState<AnomalyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  // drill panel state: employee_id → raw data
  const [activeId, setActiveId] = useState<string | null>(null)
  const [drillData, setDrillData] = useState<RawActivityResponse | null>(null)
  const [drillLoading, setDrillLoading] = useState(false)
  const [exportingId, setExportingId] = useState<string | null>(null)

  useEffect(() => {
    dashboardApi.getAnomalies()
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [])

  // Click pill → expand drill panel for that employee
  const handlePillClick = useCallback(async (employeeId: string) => {
    if (activeId === employeeId) {
      setActiveId(null)
      setDrillData(null)
      return
    }
    setActiveId(employeeId)
    setDrillData(null)
    setDrillLoading(true)
    try {
      const r = await dashboardApi.getEmployeeRawActivity(employeeId)
      setDrillData(r.data)
    } finally {
      setDrillLoading(false)
    }
  }, [activeId])

  // Export full raw activity CSV for a given employee
  const handleExportCSV = useCallback(async (employeeId: string, name: string) => {
    setExportingId(employeeId)
    try {
      let rawData: RawActivityResponse | null = null
      // reuse already-loaded drill data if it matches
      if (drillData && drillData.employee_id === employeeId) {
        rawData = drillData
      } else {
        const r = await dashboardApi.getEmployeeRawActivity(employeeId)
        rawData = r.data
      }
      if (!rawData || !rawData.rows.length) return

      // Build clean CSV rows with human-readable extras
      const csvRows = rawData.rows.map(row => ({
        employee_id: row.employee_id ?? '',
        name: row.name ?? '',
        role: row.role ?? '',
        department: row.department ?? '',
        annual_inr: row.annual_inr ?? '',
        hourly_rate_inr: row.hourly_rate_inr != null ? Number(row.hourly_rate_inr).toFixed(2) : '',
        timestamp_ist: row.timestamp_ist ?? '',
        week: row.week ?? '',
        task_category: row.task_category ?? '',
        app_used: row.app_used ?? '',
        duration_minutes: row.duration_minutes ?? '',
        duration_formatted: fmtDuration(row.duration_minutes as number),
        is_repetitive: row.is_repetitive ?? '',
        is_automatable: row.is_automatable ?? '',
        is_duration_outlier: row.is_duration_outlier ?? '',
        z_score: row.z_score != null ? Number(row.z_score).toFixed(2) : '',
        minute_cost_inr: row.minute_cost_inr != null ? Number(row.minute_cost_inr).toFixed(2) : '',
      }))

      const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_')
      downloadCSV(csvRows, `activity_${employeeId}_${safeName}_all_weeks.csv`)
    } finally {
      setExportingId(null)
    }
  }, [drillData])

  if (loading || !data) return null

  const top = data.duration_outliers[0]
  const topHighRepEmp = data.high_repetitive_employees[0]
  const topHighRepDept = data.high_repetitive_departments[0]

  // Deduplicate outlier pills by employee_id (show each employee once)
  const uniqueOutliers = data.duration_outliers.reduce<typeof data.duration_outliers>((acc, o) => {
    if (!acc.find(x => x.employee_id === o.employee_id)) acc.push(o)
    return acc
  }, [])

  return (
    <div className="anomaly-banner">
      <div className="anomaly-icon">⚠️</div>
      <div style={{ flex: 1 }}>
        <div className="anomaly-title">Anomaly Alert — Action Required</div>

        {/* ── Primary headline ── */}
        <div className="anomaly-body">
          {top && (
            <>
              <strong>{top.name || top.employee_id}</strong>{' '}
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                ({top.employee_id} · {top.role || top.department})
              </span>{' '}
              logged{' '}
              <strong style={{ color: 'var(--accent-danger)' }}>
                {fmtDuration(top.duration_minutes)}
              </strong>{' '}
              on <em>{top.task_category}</em>
              {top.z_score != null && (
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  {' '}— {top.z_score.toFixed(1)}σ above category mean. Likely a data entry error or test record.
                </span>
              )}
            </>
          )}
          {topHighRepEmp && (
            <>
              {' '}Additionally,{' '}
              <strong>{topHighRepEmp.name}</strong>{' '}
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                ({topHighRepEmp.employee_id} · {topHighRepEmp.department})
              </span>{' '}
              has a{' '}
              <strong style={{ color: 'var(--accent-warning)' }}>
                {(topHighRepEmp.rep_share * 100).toFixed(0)}% repetitive share
              </strong>{' '}
              — {fmtDuration(topHighRepEmp.repetitive_minutes)} of{' '}
              {fmtDuration(topHighRepEmp.total_minutes)} total — highest in the company.
            </>
          )}
        </div>

        {/* ── Outlier pills — one per unique employee, showing THEIR actual outlier duration ── */}
        <div className="anomaly-detail" style={{ marginTop: 10, flexWrap: 'wrap', gap: 6 }}>
          {uniqueOutliers.slice(0, 4).map((o, i) => (
            <button
              key={i}
              className={`anomaly-pill${activeId === o.employee_id ? ' active' : ''}`}
              style={{ cursor: 'pointer', border: 'none', background: 'none', padding: 0, font: 'inherit', textAlign: 'left' }}
              onClick={() => handlePillClick(o.employee_id)}
              title="Click to see full activity profile"
            >
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>{o.employee_id}</span>
              {o.name && <span> ({o.name})</span>}:{' '}
              <strong style={{ color: 'var(--accent-danger)' }}>{fmtDuration(o.duration_minutes)}</strong>
              {' '}· {o.task_category}
            </button>
          ))}
          {topHighRepDept && (
            <div className="anomaly-pill">
              {topHighRepDept.department}:{' '}
              <strong>{(topHighRepDept.rep_share * 100).toFixed(0)}%</strong> rep share
            </div>
          )}
        </div>

        {/* ── Drill panel for clicked employee — full raw activity profile ── */}
        {activeId && (
          <div style={{
            marginTop: 12, background: 'rgba(0,0,0,0.28)', borderRadius: 10,
            padding: '14px 16px', border: '1px solid rgba(255,80,80,0.18)',
          }}>
            {drillLoading && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading activity data…</div>
            )}
            {!drillLoading && drillData && (() => {
              const d = drillData

              // Aggregate task-level summary from raw rows
              const taskMap: Record<string, { total: number; rep: number; cost: number; count: number; apps: Set<string>; weeks: Set<number> }> = {}
              d.rows.forEach(row => {
                const cat = String(row.task_category || 'Unknown')
                if (!taskMap[cat]) taskMap[cat] = { total: 0, rep: 0, cost: 0, count: 0, apps: new Set(), weeks: new Set() }
                const dur = Number(row.duration_minutes) || 0
                taskMap[cat].total += dur
                if (row.is_repetitive === true || row.is_automatable === true) taskMap[cat].rep += dur
                taskMap[cat].cost += Number(row.minute_cost_inr) || 0
                taskMap[cat].count++
                if (row.app_used) taskMap[cat].apps.add(String(row.app_used))
                if (row.week) taskMap[cat].weeks.add(Number(row.week))
              })
              const taskRows = Object.entries(taskMap)
                .map(([cat, v]) => ({ cat, ...v }))
                .sort((a, b) => b.total - a.total)

              // Week summary
              const weekMap: Record<number, { total: number; rep: number; count: number }> = {}
              d.rows.forEach(row => {
                const w = Number(row.week) || 0
                if (!weekMap[w]) weekMap[w] = { total: 0, rep: 0, count: 0 }
                const dur = Number(row.duration_minutes) || 0
                weekMap[w].total += dur
                if (row.is_repetitive === true || row.is_automatable === true) weekMap[w].rep += dur
                weekMap[w].count++
              })
              const weekRows = Object.entries(weekMap)
                .map(([w, v]) => ({ week: Number(w), ...v }))
                .sort((a, b) => a.week - b.week)

              return (
                <>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {d.name}
                        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{d.employee_id}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {d.role} · {d.department}
                        {d.annual_inr && <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>· {fmtINR(d.annual_inr)} p.a.</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleExportCSV(d.employee_id, d.name)}
                      disabled={exportingId === d.employee_id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        background: exportingId === d.employee_id ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)',
                        border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6,
                        padding: '6px 12px', color: 'var(--text-primary)', fontSize: 12,
                        cursor: exportingId === d.employee_id ? 'wait' : 'pointer',
                        fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap',
                      }}
                      title={`Download all ${d.total_rows} activity rows for ${d.name}`}
                    >
                      {exportingId === d.employee_id ? '⏳ Exporting…' : `⬇ Export CSV (${d.total_rows} rows)`}
                    </button>
                  </div>

                  {/* KPI tiles */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
                    {[
                      { label: 'Total Time', value: fmtDuration(d.total_minutes), color: 'var(--text-primary)' },
                      { label: 'Repetitive', value: fmtDuration(d.repetitive_minutes), color: 'var(--accent-danger)' },
                      { label: 'Rep Share', value: `${d.total_minutes > 0 ? ((d.repetitive_minutes / d.total_minutes) * 100).toFixed(0) : 0}%`, color: 'var(--accent-warning)' },
                      { label: 'Activity Rows', value: String(d.total_rows), color: 'var(--text-secondary)' },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: 'JetBrains Mono' }}>{value}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Task breakdown table */}
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                    All Tasks · {taskRows.length} categories across {d.total_rows} rows
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 70px 70px 45px 55px 60px',
                    gap: 6, fontSize: 10, color: 'var(--text-muted)',
                    padding: '0 0 4px', borderBottom: '1px solid rgba(255,255,255,0.07)',
                    textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4,
                  }}>
                    <span>Task</span><span style={{ textAlign: 'right' }}>Total</span>
                    <span style={{ textAlign: 'right' }}>Repetitive</span>
                    <span style={{ textAlign: 'right' }}>Rep%</span>
                    <span style={{ textAlign: 'right' }}>Rows</span>
                    <span style={{ textAlign: 'right' }}>Cost ₹</span>
                  </div>
                  <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                    {taskRows.map((t, i) => {
                      const repPct = t.total > 0 ? (t.rep / t.total) * 100 : 0
                      return (
                        <div key={i} style={{
                          display: 'grid', gridTemplateColumns: '1fr 70px 70px 45px 55px 60px',
                          gap: 6, fontSize: 12, padding: '5px 0',
                          borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center',
                        }}>
                          <span style={{ color: 'var(--text-primary)' }}>{t.cat}</span>
                          <span style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono', textAlign: 'right' }}>
                            {fmtDuration(t.total)}
                          </span>
                          <span style={{ color: 'var(--accent-danger)', fontFamily: 'JetBrains Mono', textAlign: 'right' }}>
                            {t.rep > 0 ? fmtDuration(t.rep) : '—'}
                          </span>
                          <span style={{
                            fontFamily: 'JetBrains Mono', textAlign: 'right',
                            color: repPct > 70 ? 'var(--accent-danger)' : repPct > 40 ? 'var(--accent-warning)' : 'var(--text-muted)',
                          }}>
                            {repPct.toFixed(0)}%
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', textAlign: 'right', fontSize: 11 }}>
                            {t.count}
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', textAlign: 'right', fontSize: 11 }}>
                            {t.cost > 0 ? fmtINR(t.cost) : '—'}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Week-over-week */}
                  {weekRows.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 14, marginBottom: 6 }}>
                        Week-over-Week Breakdown
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {weekRows.map(w => (
                          <div key={w.week} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Week {w.week}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono' }}>
                              {fmtDuration(w.total)}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--accent-danger)', fontFamily: 'JetBrains Mono' }}>
                              {fmtDuration(w.rep)} rep
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                              {w.count} rows
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )
            })()}
          </div>
        )}

        {/* ── Full report toggle ── */}
        <button
          style={{
            background: 'none', border: 'none', color: 'var(--accent-danger)',
            fontSize: 11, cursor: 'pointer', marginTop: 12, fontFamily: 'Inter',
            padding: 0, display: 'flex', alignItems: 'center', gap: 4,
          }}
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? '▲ Show less' : '▼ Full anomaly report'}
        </button>

        {expanded && (
          <div style={{ marginTop: 12, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>{data.summary}</div>

            {/* High-rep employees table */}
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              High Repetitive-Share Employees
            </div>
            {/* Column headers */}
            <div style={{
              display: 'grid', gridTemplateColumns: '90px 1fr 85px 85px 70px 80px',
              gap: 8, fontSize: 10, color: 'var(--text-muted)', padding: '0 0 5px',
              borderBottom: '1px solid rgba(255,255,255,0.07)', textTransform: 'uppercase', letterSpacing: '0.4px',
            }}>
              <span>ID</span><span>Name / Dept</span><span style={{ textAlign: 'right' }}>Total Time</span>
              <span style={{ textAlign: 'right' }}>Rep Time</span><span style={{ textAlign: 'right' }}>Rep %</span><span style={{ textAlign: 'right' }}>Export</span>
            </div>
            {data.high_repetitive_employees.map((e, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '90px 1fr 85px 85px 70px 80px',
                gap: 8, fontSize: 12, padding: '7px 0',
                borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center',
              }}>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--text-muted)' }}>{e.employee_id}</span>
                <span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{e.name}</span>
                  {' '}
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({e.department})</span>
                </span>
                <span style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono', textAlign: 'right' }}>
                  {fmtDuration(e.total_minutes)}
                </span>
                <span style={{ color: 'var(--accent-danger)', fontFamily: 'JetBrains Mono', textAlign: 'right' }}>
                  {fmtDuration(e.repetitive_minutes)}
                </span>
                <span style={{ color: 'var(--accent-warning)', fontFamily: 'JetBrains Mono', fontWeight: 700, textAlign: 'right' }}>
                  {(e.rep_share * 100).toFixed(0)}%
                </span>
                <div style={{ textAlign: 'right' }}>
                  <button
                    onClick={() => handleExportCSV(e.employee_id, e.name)}
                    disabled={exportingId === e.employee_id}
                    style={{
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 5, padding: '3px 8px', color: 'var(--text-primary)',
                      fontSize: 10, cursor: exportingId === e.employee_id ? 'wait' : 'pointer',
                      fontFamily: 'Inter',
                    }}
                  >
                    {exportingId === e.employee_id ? '⏳' : '⬇ CSV'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
