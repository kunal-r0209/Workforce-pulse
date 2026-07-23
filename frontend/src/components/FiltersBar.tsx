import { FilterState } from '../App'
import { FiltersData } from '../services/api'

interface Props {
  filters: FilterState
  filterOptions: FiltersData | null
  onSetFilter: (key: keyof FilterState, val: string) => void
  onClear: () => void
}

const FILTER_LABELS: Record<string, string> = {
  department: 'Dept',
  task_category: 'Task',
  week: 'Week',
  employee_id: 'Employee',
}

export default function FiltersBar({ filters, onSetFilter, onClear }: Props) {
  const active = Object.entries(filters).filter(([, v]) => v !== '')

  return (
    <div className="filters-bar">
      <span className="filter-label">Active Filters:</span>
      {active.map(([key, val]) => (
        <div key={key} className="filter-chip">
          <span>{FILTER_LABELS[key] || key}: {key === 'week' ? `Week ${val}` : val}</span>
          <span className="clear" onClick={() => onSetFilter(key as keyof FilterState, '')}>×</span>
        </div>
      ))}
      <button className="btn-clear-filters" onClick={onClear}>
        Clear All
      </button>
    </div>
  )
}
