import { useState, useEffect, useCallback } from 'react'
import { dashboardApi, FiltersData } from './services/api'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import HeadlineKPIs from './components/HeadlineKPIs'
import BreakdownChart from './components/BreakdownChart'
import AutomationRanking from './components/AutomationRanking'
import EmployeeTable from './components/EmployeeTable'
import WeeklyTrend from './components/WeeklyTrend'
import AnomalyCard from './components/AnomalyCard'
import DataQualityPanel from './components/DataQualityPanel'
import AIAssistant from './components/AIAssistant'
import ExportModal from './components/ExportModal'

export interface FilterState {
  department: string
  task_category: string
  week: string
  employee_id: string
}

const EMPTY_FILTERS: FilterState = {
  department: '',
  task_category: '',
  week: '',
  employee_id: '',
}

export default function App() {
  const [page, setPage] = useState<'dashboard' | 'quality'>('dashboard')
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [filterOptions, setFilterOptions] = useState<FiltersData | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null)

  useEffect(() => {
    dashboardApi.getFilters().then(r => setFilterOptions(r.data))
  }, [])

  const setFilter = useCallback((key: keyof FilterState, val: string) => {
    setFilters(prev => ({ ...prev, [key]: val }))
  }, [])

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS)
    setSelectedEmployee(null)
  }, [])

  // Cross-filter: clicking department card
  const handleDeptFilter = useCallback((dept: string) => {
    setFilters(prev => ({
      ...prev,
      department: prev.department === dept ? '' : dept,
    }))
  }, [])

  // Cross-filter: clicking task category
  const handleTaskFilter = useCallback((task: string) => {
    setFilters(prev => ({
      ...prev,
      task_category: prev.task_category === task ? '' : task,
    }))
    setSelectedEmployee(null)
  }, [])

  const hasActiveFilters = Object.values(filters).some(v => v !== '')

  return (
    <div className="app-layout">
      <Sidebar page={page} onPageChange={setPage} />

      <div className="main-content">
        <TopBar
          onExport={() => setExportOpen(true)}
          dateRange={{ start: '2025-10-06', end: '2025-10-24' }}
        />

        {filterOptions && (
          <div className="filters-bar">
            <span className="filter-label">Filter:</span>

            <select
              id="filter-dept"
              className="filter-select"
              value={filters.department}
              onChange={e => setFilter('department', e.target.value)}
            >
              <option value="">All Departments</option>
              {filterOptions.departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select
              id="filter-task"
              className="filter-select"
              value={filters.task_category}
              onChange={e => setFilter('task_category', e.target.value)}
            >
              <option value="">All Task Categories</option>
              {filterOptions.task_categories.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <select
              id="filter-week"
              className="filter-select"
              value={filters.week}
              onChange={e => setFilter('week', e.target.value)}
            >
              <option value="">All Weeks</option>
              {filterOptions.weeks.map(w => (
                <option key={w} value={String(w)}>
                  Week {w} (Oct {6 + (w - 1) * 7}–{Math.min(12 + (w - 1) * 7, 24)})
                </option>
              ))}
            </select>

            {hasActiveFilters && (
              <>
                <div style={{ width: 1, height: 22, background: 'var(--border-subtle)', margin: '0 4px' }} />
                {filters.department && (
                  <div className="filter-chip">
                    <span>Dept: {filters.department}</span>
                    <span className="clear" onClick={() => setFilter('department', '')}>×</span>
                  </div>
                )}
                {filters.task_category && (
                  <div className="filter-chip">
                    <span>Task: {filters.task_category}</span>
                    <span className="clear" onClick={() => setFilter('task_category', '')}>×</span>
                  </div>
                )}
                {filters.week && (
                  <div className="filter-chip">
                    <span>Week {filters.week}</span>
                    <span className="clear" onClick={() => setFilter('week', '')}>×</span>
                  </div>
                )}
                <button className="btn-clear-filters" onClick={clearFilters}>
                  Clear All
                </button>
              </>
            )}
          </div>
        )}

        <div className="dashboard-content">
          {page === 'dashboard' && (
            <>
              <div className="mb-28">
                <p className="section-title">Headline KPIs</p>
                <HeadlineKPIs filters={filters} />
              </div>

              <div className="mb-28">
                <AnomalyCard />
              </div>

              <div className="grid-2 mb-28">
                <BreakdownChart
                  filters={filters}
                  onDeptClick={handleDeptFilter}
                  onTaskClick={handleTaskFilter}
                  activeDept={filters.department}
                  activeTask={filters.task_category}
                />
                <AutomationRanking
                  filters={filters}
                  onTaskClick={handleTaskFilter}
                  activeTask={filters.task_category}
                />
              </div>

              <div className="mb-28">
                <WeeklyTrend filters={filters} />
              </div>

              <div className="mb-28">
                <EmployeeTable
                  filters={filters}
                  selectedEmployee={selectedEmployee}
                  onSelectEmployee={setSelectedEmployee}
                  onTaskFilter={handleTaskFilter}
                />
              </div>
            </>
          )}

          {page === 'quality' && (
            <DataQualityPanel />
          )}
        </div>
      </div>

      <AIAssistant open={aiOpen} onClose={() => setAiOpen(false)} filters={filters} />

      <button
        id="ai-toggle-btn"
        className={`ai-toggle-btn ${aiOpen ? 'open' : ''}`}
        onClick={() => setAiOpen(o => !o)}
        title="AI Assistant"
      >
        {aiOpen ? '×' : '🤖'}
      </button>

      {exportOpen && (
        <ExportModal
          filters={filters}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  )
}
