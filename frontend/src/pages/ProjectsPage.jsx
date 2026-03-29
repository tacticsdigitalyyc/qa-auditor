import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listProjects, createProject } from '../lib/api.js'
import QAScore from '../components/QAScore.jsx'

export default function ProjectsPage() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: '', url: '', description: '', schedule: 'none', notify_email: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    listProjects().then(setProjects).finally(() => setLoading(false))
  }, [])

  const handleCreate = async () => {
    setError(null)
    if (!form.name.trim() || !form.url.trim()) return setError('Name and URL are required.')
    try { new URL(form.url) } catch { return setError('Invalid URL.') }
    setSaving(true)
    try {
      const project = await createProject(form.name, form.url, form.description, form.schedule, form.notify_email)
      setProjects(p => [project, ...p])
      setShowNew(false)
      setForm({ name: '', url: '', description: '' })
      navigate(`/projects/${project.id}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen px-4 py-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-gray-500 text-sm mt-0.5">Track QA history for each site</p>
        </div>
        <div className="flex gap-2">
          <Link to="/scan" className="text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors">
            Quick scan
          </Link>
          <button
            onClick={() => setShowNew(true)}
            className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            + New project
          </button>
        </div>
      </div>

      {/* New project form */}
      {showNew && (
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">New project</h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Project name</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                placeholder="My Client Site"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">URL</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                placeholder="https://example.com"
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              />
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">Description (optional)</label>
            <input
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              placeholder="e.g. Calgary cabinetry client"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Auto-scan schedule</label>
              <select
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                value={form.schedule}
                onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))}
              >
                <option value="none">Off</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly (Monday)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Alert email (optional)</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                placeholder="you@example.com"
                type="email"
                value={form.notify_email}
                onChange={e => setForm(f => ({ ...f, notify_email: e.target.value }))}
              />
            </div>
          </div>
          {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving}
              className="text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-1.5 rounded-lg transition-colors">
              {saving ? 'Creating...' : 'Create project'}
            </button>
            <button onClick={() => { setShowNew(false); setError(null) }}
              className="text-sm text-gray-400 hover:text-gray-200 px-3 py-1.5 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Projects grid */}
      {loading ? (
        <div className="text-gray-500 text-sm">Loading...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20 text-gray-600">
          <p className="text-lg mb-2">No projects yet</p>
          <p className="text-sm">Create a project to start tracking QA history for a site.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map(p => (
            <Link key={p.id} to={`/projects/${p.id}`}
              className="bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-4 flex items-center gap-4 transition-colors group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-white group-hover:text-blue-400 transition-colors">{p.name}</span>
                  {p.description && <span className="text-gray-600 text-xs">— {p.description}</span>}
                </div>
                <a href={p.url} target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-xs text-gray-500 hover:text-blue-400 truncate block">
                  {p.url}
                </a>
              </div>
              <div className="text-right shrink-0">
                {p.last_scanned_at ? (
                  <p className="text-xs text-gray-600">
                    Last scanned {new Date(p.last_scanned_at).toLocaleDateString()}
                  </p>
                ) : (
                  <p className="text-xs text-gray-700">Never scanned</p>
                )}
              </div>
              <span className="text-gray-700 group-hover:text-gray-400 transition-colors text-lg">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
