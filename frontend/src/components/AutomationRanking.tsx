import { useState, useEffect } from 'react'
import { dashboardApi, AutomationRow } from '../services/api'
import { FilterState } from '../App'

interface Props {
  filters: FilterState
  onTaskClick: (task: string) => void
  activeTask: string
}

function rankColor(i: number) {
  if (i === 0) return 'gold'
  if (i === 1) return 'silver'
  if (i === 2) return 'bronze'
  return 'default'
}

function fmtInr(n: number) {
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(0)}K`
  return `₹${n.toFixed(0)}`
}

export default function AutomationRanking({ filters, onTaskClick, activeTask }: Props) {
  const [data, setData] = useState<AutomationRow[]>([])
  const [formula, setFormula] = useState('')
  const [loading, setLoading] = useState(true)
  const [showFormula, setShowFormula] = useState(false)

  useEffect(() => {
    setLoading(true)
    dashboardApi
      .getAutomationPriority({
        department: filters.department || undefined,
        week: filters.week ? Number(filters.week) : undefined,
      })
      .then(r => {
        setData(r.data.data.slice(0, 10))
        setFormula(r.data.formula)
      })
      .finally(() => setLoading(false))
  }, [filters.department, filters.week])

  const maxScore = data[0]?.automation_score || 1

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <div className="chart-title">🎯 Automation Priority</div>
          <div className="chart-subtitle">
            Click any task to cross-filter
          </div>
        </div>
        <button
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontFamily: 'Inter' }}
          onClick={() => setShowFormula(v => !v)}
        >
          {showFormula ? '▲ formula' : '▼ formula'}
        </button>
      </div>

      {showFormula && (
        <div style={{ padding: '0 24px 12px', fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono', lineHeight: 1.7 }}>
          {formula}
          <br />
          Weights: volume(0.30) × rep_rate(0.35) × emp_spread(0.20) × rupee(0.15)
        </div>
      )}

      <div className="chart-body" style={{ paddingTop: 4 }}>
        {loading ? (
          <div className="loading-screen" style={{ minHeight: 280 }}>
            <div className="spinner" />
          </div>
        ) : (
          <div className="ranking-table">
            {data.map((row, i) => (
              <div
                key={row.task_category}
                className={`ranking-row clickable-filter ${activeTask === row.task_category ? 'active-filter' : ''}`}
                onClick={() => onTaskClick(row.task_category)}
                title={`Click to filter by ${row.task_category}`}
                style={activeTask === row.task_category ? { background: 'rgba(79,142,247,0.08)', borderRadius: 8, paddingLeft: 8 } : {}}
              >
                <div className={`rank-num ${rankColor(i)}`}>{i + 1}</div>
                <div className="rank-info">
                  <div className="rank-name">{row.task_category}</div>
                  <div className="rank-meta">
                    {Math.round(row.total_minutes)} min ·&nbsp;
                    <span className="text-danger">{(row.repetitive_rate * 100).toFixed(0)}% rep</span> ·&nbsp;
                    {row.unique_employees} employees ·&nbsp;
                    {fmtInr(row.total_cost_inr)}
                  </div>
                </div>
                <div className="rank-score-bar">
                  <div
                    className="rank-score-fill"
                    style={{ width: `${(row.automation_score / maxScore) * 100}%` }}
                  />
                </div>
                <div className="rank-score-val">{row.automation_score.toFixed(2)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
