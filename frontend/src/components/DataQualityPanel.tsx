import { useState, useEffect } from 'react'
import axios from 'axios'

interface AuditData {
  activity: {
    total_raw_rows: number
    total_clean_rows: number
    unknown_employee_rows_dropped: number
    duration_negatives_dropped: number
    duration_zeros_dropped: number
    duration_outliers_flagged: number
    blank_duration_dropped: number
    duplicate_rows_dropped: number
    bool_nulls: number
    timestamp_unparseable?: number
  }
  employee: {
    duplicates_found: Array<{ employee_id: string; decision: string }>
    compensation_conflicts: Array<{ employee_id: string; resolution: string }>
  }
  no_metadata_employees: string[]
  no_activity_employees: string[]
}

export default function DataQualityPanel() {
  const [data, setData] = useState<AuditData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get('/api/data-quality')
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading-screen"><div className="spinner" /><div className="loading-text">Loading data quality report...</div></div>
  if (!data) return <div className="empty-state"><div className="empty-icon">❌</div>Failed to load</div>

  const act = data.activity
  const rows_dropped = act.unknown_employee_rows_dropped + act.duration_negatives_dropped +
    act.duration_zeros_dropped + act.blank_duration_dropped + (act.duplicate_rows_dropped || 0) + (act.timestamp_unparseable || 0)

  return (
    <div>
      <p className="section-title">Data Ingestion Report</p>

      <div className="card mb-20">
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>📊 Activity Log (activity_logs.csv)</div>
        <div className="dq-grid">
          <div className="dq-stat">
            <div className="dq-val blue">{act.total_raw_rows}</div>
            <div className="dq-label">Raw Rows</div>
          </div>
          <div className="dq-stat">
            <div className="dq-val green">{act.total_clean_rows}</div>
            <div className="dq-label">Clean Rows</div>
          </div>
          <div className="dq-stat">
            <div className="dq-val red">{rows_dropped}</div>
            <div className="dq-label">Rows Dropped</div>
          </div>
          <div className="dq-stat">
            <div className="dq-val yellow">{act.duration_outliers_flagged}</div>
            <div className="dq-label">Outliers Flagged</div>
          </div>
          <div className="dq-stat">
            <div className="dq-val yellow">{act.bool_nulls}</div>
            <div className="dq-label">Boolean Nulls</div>
          </div>
          <div className="dq-stat">
            <div className="dq-val red">{act.unknown_employee_rows_dropped}</div>
            <div className="dq-label">Unknown IDs Dropped</div>
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Drop Breakdown
          </div>
          {[
            { label: 'Unknown employee_id ("?")', val: act.unknown_employee_rows_dropped, color: 'red' },
            { label: 'Negative durations', val: act.duration_negatives_dropped, color: 'red' },
            { label: 'Zero durations', val: act.duration_zeros_dropped, color: 'yellow' },
            { label: 'Blank durations', val: act.blank_duration_dropped, color: 'yellow' },
            { label: 'Duplicate rows (same id+ts+app+task)', val: act.duplicate_rows_dropped || 0, color: 'yellow' },
            { label: 'Unparseable timestamps', val: act.timestamp_unparseable || 0, color: 'red' },
            { label: 'Duration outliers flagged (>480min, kept)', val: act.duration_outliers_flagged, color: 'green' },
          ].map(({ label, val, color }, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13 }}>
              <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
              <span style={{ fontWeight: 700, fontFamily: 'JetBrains Mono', color: color === 'red' ? 'var(--accent-danger)' : color === 'yellow' ? 'var(--accent-warning)' : 'var(--accent-success)' }}>
                {val}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card mb-20">
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>👤 HRMS Export (employees.json)</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Duplicates Found & Resolved
            </div>
            {data.employee.duplicates_found.map((d, i) => (
              <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-warning)' }}>{d.employee_id}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{d.decision}</div>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Join Issues
            </div>
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-danger)' }}>No Metadata (in logs, not HRMS)</div>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, marginTop: 4, color: 'var(--text-secondary)' }}>
                {data.no_metadata_employees.length > 0 ? data.no_metadata_employees.join(', ') : 'None'}
              </div>
            </div>
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-warning)' }}>No Activity (in HRMS, not in logs)</div>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, marginTop: 4, color: 'var(--text-secondary)' }}>
                {data.no_activity_employees.length > 0 ? data.no_activity_employees.join(', ') : 'None'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>📏 Normalization Rules Applied</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['Timestamps', 'Parsed ISO, DD/MM/YYYY, MM/DD/YYYY formats → converted to IST. Day>12 used to disambiguate DD/MM vs MM/DD.'],
            ['App Names', '25+ aliases canonicalized: "sfdc"→Salesforce, "ppt"→PowerPoint, "Sales Force"→Salesforce, "MS Excel"→Excel, etc.'],
            ['Task Categories', '30+ aliases canonicalized: "cal mgmt"→Calendar Management, "lead-entry"→Lead Entry, "CRM Update"→CRM Updates, etc.'],
            ['Durations', 'Negatives dropped. Zeros dropped. Blanks dropped. >480min flagged as outlier (kept with flag).'],
            ['is_repetitive', 'TRUE/true/1/yes → true. FALSE/false/0/no → false. Empty/NA/- → null → treated as false.'],
            ['Compensation', 'LPA×100k, hourly×8×22×12, annual as-is. Duplicate records averaged.'],
            ['Working Hours', '"9-18" string + {start,end} object both normalized to daily_hours float.'],
          ].map(([label, desc], i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-primary)', minWidth: 120 }}>{label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
