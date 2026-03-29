const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// Scans
export const startScan = (urlA, urlB, projectId, label) =>
  req('/scan', { method: 'POST', body: JSON.stringify({ url_a: urlA, url_b: urlB || undefined, project_id: projectId || undefined, label: label || undefined }) })

export const getScan = (id) => req(`/scan/${id}`)
export const getReport = (id) => req(`/scan/${id}/report`)
export const listScans = (projectId) => req(`/scan${projectId ? `?project_id=${projectId}` : ''}`)
export const runDeepScan = (scanId) =>
  req(`/deep-scan/${scanId}`, { method: 'POST' })

export const updateIssueStatus = (scanId, issueId, status) =>
  req(`/scan/${scanId}/issues/${issueId}`, { method: 'PATCH', body: JSON.stringify({ status }) })

// Projects
export const createProject = (name, url, description, schedule, notify_email) =>
  req('/projects', { method: 'POST', body: JSON.stringify({ name, url, description, schedule, notify_email }) })

export const updateProject = (id, updates) =>
  req(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(updates) })

export const listProjects = () => req('/projects')
export const getProject = (id) => req(`/projects/${id}`)
export const deleteProject = (id) => req(`/projects/${id}`, { method: 'DELETE' })
