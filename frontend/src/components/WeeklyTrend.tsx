import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid, Area, AreaChart
} from 'recharts'
import { dashboardApi, WeeklyTrendData } from '../services/api'
import { FilterState } from '../App'

interface Props { filters: FilterState }

const COLORS = ['#4f8ef7', '#7b6cf7', '#34d399', '#fbbf24', '#f472b6']
const WEEK_LABELS: Record<number, string> = { 1: 'Oct 6–12', 2: 'Oct 13–19', 3: 'Oct 20–24' }

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="custom-tooltip">
      <div className="tooltip-label">Week {label}: {WEEK_LABELS[Number(label)] || ''}</div>
      {payload.map((p, i) => (
        <div key={i} className="tooltip-row">
          <span className="tooltip-key" style={{ color: p.color }}>{p.name}</span>
          <span className="tooltip-val">{typeof p.value === 'number' && p.value < 1 ? `${(p.value * 100).toFixed(0)}%` : Math.round(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function WeeklyTrend({ filters }: Props) {
  const [trendData, setTrendData] = useState<WeeklyTrendData | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'volume' | 'rep_share'>('volume')

  useEffect(() => {
    setLoading(true)
    dashboardApi
      .getWeeklyTrend('task_category', {
        department: filters.department || undefined,
      })
      .then(r => setTrendData(r.data))
      .finally(() => setLoading(false))
  }, [filters.department])

  if (loading || !trendData) {
    return (
      <div className="chart-card">
        <div className="chart-header"><div className="chart-title">📈 Week-over-Week Trend</div></div>
        <div className="chart-body">
          <div className="loading-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
        </div>
      </div>
    )
  }

  // Pivot: week → {task1: mins, task2: mins, ...}
  const weeks = [1, 2, 3]
  const topTasks = trendData.top_items

  const pivoted = weeks.map(w => {
    const weekRows = trendData.trend.filter(r => r.week === w)
    const overall = trendData.overall_weekly.find(r => r.week === w)
    const entry: Record<string, number | string> = {
      week: w,
      label: WEEK_LABELS[w] || `Wk ${w}`,
      rep_share: overall ? overall.rep_share : 0,
      total: overall ? overall.total_minutes : 0,
    }
    topTasks.forEach(task => {
      const row = weekRows.find(r => r.task_category === task)
      if (mode === 'volume') {
        entry[task] = row ? Math.round(row.total_minutes) : 0
      } else {
        entry[task] = row ? row.rep_share : 0
      }
    })
    return entry
  })

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <div className="chart-title">📈 Week-over-Week Trend</div>
          <div className="chart-subtitle">Top 5 task categories across 3 weeks of data</div>
        </div>
        <div className="tab-group">
          <button className={`tab-btn ${mode === 'volume' ? 'active' : ''}`} onClick={() => setMode('volume')}>
            Volume
          </button>
          <button className={`tab-btn ${mode === 'rep_share' ? 'active' : ''}`} onClick={() => setMode('rep_share')}>
            Rep Share
          </button>
        </div>
      </div>
      <div className="chart-body">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
          {/* Top tasks trend */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Top 5 Tasks — {mode === 'volume' ? 'Total Minutes' : 'Repetitive Share'}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={pivoted} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(79,142,247,0.08)" />
                <XAxis dataKey="week" tick={{ fill: '#8b9ac4', fontSize: 11 }} tickFormatter={v => WEEK_LABELS[v] || `Wk ${v}`} />
                <YAxis tick={{ fill: '#8b9ac4', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => mode === 'rep_share' ? `${(v * 100).toFixed(0)}%` : String(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#8b9ac4' }} />
                {topTasks.map((task, i) => (
                  <Line
                    key={task}
                    type="monotone"
                    dataKey={task}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 4, fill: COLORS[i % COLORS.length] }}
                    activeDot={{ r: 6 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Overall rep share trend */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Overall Repetitive Share
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData.overall_weekly} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="repGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f87171" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(79,142,247,0.08)" />
                <XAxis dataKey="week" tick={{ fill: '#8b9ac4', fontSize: 11 }} tickFormatter={v => WEEK_LABELS[v] || `Wk ${v}`} />
                <YAxis tick={{ fill: '#8b9ac4', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${(v * 100).toFixed(0)}%`} domain={[0, 1]} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="rep_share"
                  name="Rep Share"
                  stroke="#f87171"
                  fill="url(#repGrad)"
                  strokeWidth={2}
                  dot={{ r: 5, fill: '#f87171' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
