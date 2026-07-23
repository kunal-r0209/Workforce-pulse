import { useState, useEffect } from 'react'
import { dashboardApi, HeadlineData } from '../services/api'
import { FilterState } from '../App'

interface Props { filters: FilterState }

function fmt(n: number) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(0)}K`
  return `₹${n.toFixed(0)}`
}

export default function HeadlineKPIs({ filters }: Props) {
  const [data, setData] = useState<HeadlineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showMethod, setShowMethod] = useState(false)

  useEffect(() => {
    setLoading(true)
    dashboardApi
      .getHeadline({
        department: filters.department || undefined,
        task_category: filters.task_category || undefined,
        week: filters.week ? Number(filters.week) : undefined,
      })
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [filters.department, filters.task_category, filters.week])

  if (loading || !data) {
    return (
      <div className="grid-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="kpi-card" style={{ minHeight: 140 }}>
            <div className="loading-screen" style={{ minHeight: 100 }}>
              <div className="spinner" style={{ width: 28, height: 28 }} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  const repPct = (data.repetitive_share * 100).toFixed(1)

  return (
    <>
      <div className="grid-4">
        <div className="kpi-card primary">
          <div className="kpi-header">
            <div className="kpi-label">Recoverable Hours / Mo</div>
            <div className="kpi-icon primary">⏰</div>
          </div>
          <div className="kpi-value primary">
            {data.recoverable_hours_month.toFixed(0)}
            <span className="kpi-unit">hrs</span>
          </div>
          <div className="kpi-sub">via automation × {(data.automation_capture_rate * 100).toFixed(0)}% capture rate</div>
          <button className="kpi-method-btn" onClick={() => setShowMethod(v => !v)}>
            {showMethod ? '▲ Hide methodology' : '▼ How is this calculated?'}
          </button>
          {showMethod && (
            <div className="methodology-drawer">
              {data.methodology}
              <br /><br />
              Scale factor: {data.scale_factor.toFixed(2)}× ({data.dataset_days} days → 30 day month)
            </div>
          )}
        </div>

        <div className="kpi-card success">
          <div className="kpi-header">
            <div className="kpi-label">Recoverable Cost / Mo</div>
            <div className="kpi-icon success">💰</div>
          </div>
          <div className="kpi-value success">
            {fmt(data.recoverable_inr_month)}
          </div>
          <div className="kpi-sub">based on each employee's actual hourly rate</div>
        </div>

        <div className="kpi-card warning">
          <div className="kpi-header">
            <div className="kpi-label">Repetitive Task Share</div>
            <div className="kpi-icon warning">🔁</div>
          </div>
          <div className="kpi-value warning">
            {repPct}<span className="kpi-unit">%</span>
          </div>
          <div className="kpi-sub">of all logged work hours</div>
        </div>

        <div className="kpi-card danger">
          <div className="kpi-header">
            <div className="kpi-label">Total Activities</div>
            <div className="kpi-icon danger">📋</div>
          </div>
          <div className="kpi-value danger">
            {data.total_rows.toLocaleString()}
          </div>
          <div className="kpi-sub">
            {data.total_employees} employees · {(data.total_minutes / 60).toFixed(0)} hrs logged
          </div>
        </div>
      </div>
    </>
  )
}
