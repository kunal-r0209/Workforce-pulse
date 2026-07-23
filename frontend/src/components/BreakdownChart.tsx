import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend
} from 'recharts'
import { dashboardApi, BreakdownRow } from '../services/api'
import { FilterState } from '../App'

interface Props {
  filters: FilterState
  onDeptClick: (dept: string) => void
  onTaskClick: (task: string) => void
  activeDept: string
  activeTask: string
}

const CHART_COLORS = [
  '#4f8ef7', '#7b6cf7', '#34d399', '#fbbf24', '#f472b6',
  '#22d3ee', '#fb923c', '#a78bfa', '#f87171', '#84cc16'
]

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="custom-tooltip">
      <div className="tooltip-label">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="tooltip-row">
          <span className="tooltip-key">{p.name}</span>
          <span className="tooltip-val">
            {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

type Dimension = 'task_category' | 'app_used' | 'department'

export default function BreakdownChart({ filters, onDeptClick, onTaskClick, activeDept, activeTask }: Props) {
  const [dimension, setDimension] = useState<Dimension>('task_category')
  const [data, setData] = useState<BreakdownRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    dashboardApi
      .getBreakdown(dimension, {
        department: filters.department || undefined,
        task_category: filters.task_category || undefined,
        week: filters.week ? Number(filters.week) : undefined,
      })
      .then(r => setData(r.data.data.slice(0, 12)))
      .finally(() => setLoading(false))
  }, [dimension, filters.department, filters.task_category, filters.week])

  const handleClick = (d: BreakdownRow) => {
    const val = String(d[dimension] ?? '')
    if (!val) return
    if (dimension === 'department') onDeptClick(val)
    else if (dimension === 'task_category') onTaskClick(val)
  }

  const isActive = (row: BreakdownRow) => {
    const val = String(row[dimension] ?? '')
    if (dimension === 'department') return activeDept === val
    if (dimension === 'task_category') return activeTask === val
    return false
  }

  const chartData = data.map(d => ({
    name: String(d[dimension] ?? ''),
    'Total Min': Math.round(d.total_minutes),
    'Repetitive Min': Math.round(d.repetitive_minutes),
    cost: Math.round(d.total_cost_inr),
    raw: d,
  }))

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <div className="chart-title">Time-Sink Breakdown</div>
          <div className="chart-subtitle">
            Click a bar to cross-filter the dashboard
          </div>
        </div>
        <div className="tab-group">
          {(['task_category', 'app_used', 'department'] as Dimension[]).map(d => (
            <button
              key={d}
              className={`tab-btn ${dimension === d ? 'active' : ''}`}
              onClick={() => setDimension(d)}
            >
              {d === 'task_category' ? 'Task' : d === 'app_used' ? 'App' : 'Dept'}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-body">
        {loading ? (
          <div className="loading-screen" style={{ minHeight: 260 }}>
            <div className="spinner" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ left: 0, right: 20, top: 4, bottom: 4 }}
              barCategoryGap="20%"
            >
              <XAxis type="number" tick={{ fill: '#8b9ac4', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={130}
                tick={{ fill: '#8b9ac4', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(79,142,247,0.06)' }} />
              <Bar
                dataKey="Total Min"
                radius={[0, 4, 4, 0]}
                onClick={(_: unknown, idx: number) => handleClick(data[idx])}
                cursor="pointer"
              >
                {chartData.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={isActive(data[idx]) ? '#fbbf24' : CHART_COLORS[idx % CHART_COLORS.length]}
                    opacity={isActive(data[idx]) ? 1 : 0.85}
                  />
                ))}
              </Bar>
              <Bar
                dataKey="Repetitive Min"
                radius={[0, 4, 4, 0]}
                fill="#f87171"
                opacity={0.6}
              />
            </BarChart>
          </ResponsiveContainer>
        )}

        <div style={{ display: 'flex', gap: 16, marginTop: 10, justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: '#4f8ef7' }} />
            <span className="text-sm text-muted">Total minutes</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: '#f87171' }} />
            <span className="text-sm text-muted">Repetitive minutes</span>
          </div>
        </div>
      </div>
    </div>
  )
}
