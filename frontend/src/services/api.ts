// API service layer – all calls go through here
import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({ baseURL: BASE, timeout: 30000 })

export interface HeadlineData {
  recoverable_hours_month: number
  recoverable_inr_month: number
  total_minutes: number
  repetitive_share: number
  total_employees: number
  total_rows: number
  methodology: string
  date_range: { start: string; end: string }
  automation_capture_rate: number
  scale_factor: number
  dataset_days: number
}

export interface BreakdownRow {
  task_category?: string
  app_used?: string
  department?: string
  total_minutes: number
  repetitive_minutes: number
  unique_employees: number
  total_cost_inr: number
  row_count: number
  repetitive_rate: number
  [key: string]: unknown
}

export interface AutomationRow {
  task_category: string
  total_minutes: number
  total_cost_inr: number
  total_rows: number
  repetitive_rows: number
  repetitive_rate: number
  unique_employees: number
  volume_weight: number
  employee_spread: number
  rupee_weight: number
  automation_score: number
}

export interface EmployeeRow {
  employee_id: string
  name: string
  department: string
  role: string
  total_minutes: number
  repetitive_minutes: number
  annual_inr: number | null
  row_count: number
  repetitive_share: number
}

export interface DrillData {
  employee_id: string
  name: string
  role: string
  department: string
  annual_inr: number | null
  total_minutes: number
  repetitive_minutes: number
  repetitive_share: number
  peer_repetitive_share: number
  top_tasks: Array<{
    task_category: string
    total_minutes: number
    repetitive_minutes: number
    row_count: number
  }>
  weekly_trend: Array<{
    week: number
    total_minutes: number
    repetitive_minutes: number
  }>
}

export interface WeeklyTrendData {
  trend: Array<{ week: number; task_category: string; total_minutes: number; rep_share: number }>
  overall_weekly: Array<{ week: number; total_minutes: number; rep_minutes: number; rep_share: number }>
  top_items: string[]
  dimension: string
}

export interface AnomalyData {
  duration_outliers: Array<{
    employee_id: string
    name: string
    role?: string
    department: string
    task_category: string
    duration_minutes: number
    annual_inr?: number | null
    z_score: number
  }>
  high_repetitive_departments: Array<{
    department: string
    total_minutes: number
    rep_minutes: number
    rep_share: number
  }>
  high_repetitive_employees: Array<{
    employee_id: string
    name: string
    department: string
    total_minutes: number
    repetitive_minutes: number
    rep_share: number
  }>
  summary: string
}

export interface FiltersData {
  departments: string[]
  task_categories: string[]
  employees: string[]
  weeks: number[]
}

export interface ExportSummary {
  headline: {
    recoverable_hours_month: number
    recoverable_inr_month: number
    total_employees: number
    total_rows: number
  }
  top_automation_opportunities: AutomationRow[]
  date_range: { start: string; end: string }
  methodology: string
  active_filters: { department: string; task_category: string; week: string }
  generated_at: string
}

const withFilters = (params: Record<string, string | number | undefined | null>) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== 'all' && v !== ''))

export const dashboardApi = {
  getHeadline: (filters: Record<string, string | number | undefined | null>) =>
    api.get<HeadlineData>('/dashboard/headline', { params: withFilters(filters) }),

  getBreakdown: (dimension: string, filters: Record<string, string | number | undefined | null>) =>
    api.get<{ data: BreakdownRow[]; dimension: string }>('/dashboard/breakdown', {
      params: { dimension, ...withFilters(filters) },
    }),

  getAutomationPriority: (filters: Record<string, string | number | undefined | null>) =>
    api.get<{ data: AutomationRow[]; formula: string }>('/dashboard/automation-priority', {
      params: withFilters(filters),
    }),

  getEmployeeList: (filters: Record<string, string | number | undefined | null>) =>
    api.get<{ data: EmployeeRow[] }>('/dashboard/employees-list', {
      params: withFilters(filters),
    }),

  getEmployeeDrill: (employeeId: string) =>
    api.get<DrillData>(`/dashboard/employee-drill`, { params: { employee_id: employeeId } }),

  getWeeklyTrend: (dimension: string, filters: Record<string, string | number | undefined | null>) =>
    api.get<WeeklyTrendData>('/dashboard/weekly-trend', {
      params: { dimension, ...withFilters(filters) },
    }),

  getAnomalies: () => api.get<AnomalyData>('/dashboard/anomalies'),

  getEmployeeRawActivity: (employeeId: string) =>
    api.get<{
      employee_id: string; name: string; role: string; department: string;
      annual_inr: number | null; total_minutes: number; repetitive_minutes: number;
      total_rows: number;
      rows: Array<Record<string, unknown>>;
    }>(`/dashboard/employee-raw-activity`, { params: { employee_id: employeeId } }),

  getFilters: () => api.get<FiltersData>('/dashboard/filters'),

  getExportSummary: (filters: Record<string, string | number | undefined | null>) =>
    api.get<ExportSummary>('/export/summary', { params: withFilters(filters) }),
}

export const aiApi = {
  streamChat: (messages: Array<{ role: string; content: string }>) => {
    const GROQ_URL = '/api/ai/chat/stream'
    return fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    })
  },
}
