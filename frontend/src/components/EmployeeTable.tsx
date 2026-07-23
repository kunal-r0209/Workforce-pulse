import { useState, useEffect } from 'react'
import { dashboardApi, EmployeeRow, DrillData } from '../services/api'
import { FilterState } from '../App'

interface Props {
  filters: FilterState
  selectedEmployee: string | null
  onSelectEmployee: (id: string | null) => void
  onTaskFilter: (task: string) => void
}

function RepBar({ share }: { share: number }) {
  const pct = Math.round(share * 100)
  const color = pct > 65 ? '#f87171' : pct > 40 ? '#fbbf24' : '#34d399'
  return (
    <div className="rep-share-bar">
      <div className="rep-bar-track">
        <div className="rep-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span style={{ fontSize: 11, color, fontFamily: 'JetBrains Mono', minWidth: 32 }}>{pct}%</span>
    </div>
  )
}

function DrillPanel({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const [drill, setDrill] = useState<DrillData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    dashboardApi.getEmployeeDrill(employeeId)
      .then(r => setDrill(r.data))
      .finally(() => setLoading(false))
  }, [employeeId])

  if (loading) return <div className="drill-panel"><div className="loading-screen"><div className="spinner" /></div></div>
  if (!drill) return null

  const fmtInr = (n: number | null) => n ? `₹${(n / 1e5).toFixed(1)}L/yr` : 'N/A'
  const repPct = (drill.repetitive_share * 100).toFixed(1)
  const peerPct = (drill.peer_repetitive_share * 100).toFixed(1)
  const diff = drill.repetitive_share - drill.peer_repetitive_share
  const diffColor = diff > 0.05 ? '#f87171' : diff < -0.05 ? '#34d399' : '#fbbf24'

  return (
    <div className="drill-panel">
      <div className="drill-header">
        <div>
          <div className="drill-name">{drill.name || drill.employee_id}</div>
          <div className="drill-role">{drill.role} · {drill.department} · {fmtInr(drill.annual_inr)}</div>
        </div>
        <button className="drill-close" onClick={onClose}>✕ Close</button>
      </div>

      <div className="drill-stats">
        <div className="drill-stat">
          <div className="drill-stat-val">{Math.round(drill.total_minutes / 60)}h</div>
          <div className="drill-stat-label">Total Logged</div>
        </div>
        <div className="drill-stat">
          <div className="drill-stat-val">{Math.round(drill.repetitive_minutes / 60)}h</div>
          <div className="drill-stat-label">Repetitive Hours</div>
        </div>
        <div className="drill-stat">
          <div className="drill-stat-val" style={{ color: diffColor }}>{repPct}%</div>
          <div className="drill-stat-label">Rep Share</div>
        </div>
      </div>

      <div className="peer-compare">
        <div className="peer-bar-group">
          <div className="peer-bar-label">vs. Dept Peers</div>
          <div className="peer-bar-row">
            <div className="peer-bar-name">{drill.employee_id}</div>
            <div className="peer-bar-track">
              <div className="peer-bar-fill" style={{ width: `${drill.repetitive_share * 100}%`, background: diffColor }} />
            </div>
            <div className="peer-bar-val">{repPct}%</div>
          </div>
          <div className="peer-bar-row">
            <div className="peer-bar-name">Peers avg</div>
            <div className="peer-bar-track">
              <div className="peer-bar-fill" style={{ width: `${drill.peer_repetitive_share * 100}%`, background: '#4f8ef7' }} />
            </div>
            <div className="peer-bar-val">{peerPct}%</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: diffColor, fontWeight: 700, minWidth: 80, textAlign: 'right' }}>
          {diff > 0 ? `+${(diff * 100).toFixed(0)}%` : `${(diff * 100).toFixed(0)}%`} vs peers
        </div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Top Repetitive Tasks
      </div>
      {drill.top_tasks.slice(0, 6).map((task, i) => {
        const repPct = task.total_minutes > 0 ? Math.round(task.repetitive_minutes / task.total_minutes * 100) : 0
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{task.task_category || '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{task.total_minutes}min</div>
            <div className={`badge ${repPct > 50 ? 'badge-rep' : 'badge-auto'}`}>{repPct}% rep</div>
          </div>
        )
      })}
    </div>
  )
}

export default function EmployeeTable({ filters, selectedEmployee, onSelectEmployee, onTaskFilter }: Props) {
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    dashboardApi
      .getEmployeeList({
        department: filters.department || undefined,
        task_category: filters.task_category || undefined,
      })
      .then(r => setEmployees(r.data.data))
      .finally(() => setLoading(false))
  }, [filters.department, filters.task_category])

  return (
    <>
      <div className="chart-card">
        <div className="chart-header">
          <div>
            <div className="chart-title">👥 Employee Activity</div>
            <div className="chart-subtitle">Click a row to drill down · {employees.length} employees shown</div>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div className="loading-screen" style={{ minHeight: 200 }}>
              <div className="spinner" />
            </div>
          ) : (
            <table className="emp-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Dept</th>
                  <th>Role</th>
                  <th>Total (min)</th>
                  <th>Rep. Share</th>
                  <th>Annual</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => (
                  <tr
                    key={emp.employee_id}
                    className={selectedEmployee === emp.employee_id ? 'selected' : ''}
                    onClick={() => onSelectEmployee(selectedEmployee === emp.employee_id ? null : emp.employee_id)}
                  >
                    <td><span className="emp-id-badge">{emp.employee_id}</span></td>
                    <td style={{ fontWeight: 600 }}>{emp.name || '—'}</td>
                    <td>{emp.department || '—'}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{emp.role || '—'}</td>
                    <td style={{ fontFamily: 'JetBrains Mono', fontSize: 12 }}>{Math.round(emp.total_minutes)}</td>
                    <td><RepBar share={emp.repetitive_share} /></td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {emp.annual_inr ? `₹${(emp.annual_inr / 1e5).toFixed(1)}L` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedEmployee && (
        <DrillPanel
          employeeId={selectedEmployee}
          onClose={() => onSelectEmployee(null)}
        />
      )}
    </>
  )
}
