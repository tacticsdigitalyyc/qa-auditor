import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { getProject, startScan, deleteProject } from '../lib/api.js'
import QAScore from '../components/QAScore.jsx'
import DiffSummary from '../components/DiffSummary.jsx'

export default function ProjectPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanLabel, setScanLabel] = useState('')
  const [error, setError] = useState(null)

  const load = () => getProject(id).then(setProject).catch(() => setError('Project not found')).finally(() => setLoading(false))

  useEffect(() => { load() }, [id])

  const handleScan = async () => {
    if (!project) return
    setScanning(true)
    try {
      const { scanId } = await startScan(project.url, null, project.id, scanLabel || null)
      navigate(`/scan/${scanId}`)
    } catch (e) {
      setError(e.message)
      setScanning(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete project "${project.name}"? This will also delete all scan history.`)) return
    await deleteProject(id)
    navigate('/projects')
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-400">{error}</div>

  const scans = project.scans || []
  const latestReport = scans[0]?.reports?.[0]

  return (
    <div className="min-h-screen px-4 py-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <Link to="/projects" className="text-gray-500 hover:text-gray-300 text-sm mt-1 transition-colors">← Projects</Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{project.name}</h1>
          <a href={project.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-sm hover:underline">
            {project.url}
          </a>
          {project.description && <p className="text-gray-500 text-sm mt-0.5">{project.description}</p>}
        </div>
        {latestReport && <QAScore score={latestReport.score_a} size="lg" />}
      </div>

      {/* Run scan */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 flex items-center gap-3">
        <input
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500"
          placeholder='Scan label (optional) — e.g. "pre-deploy v2.1"'
          value={scanLabel}
          onChange={e => setScanLabel(e.target.value)}
        />
        <button
          onClick={handleScan}
          disabled={scanning}
          className="text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
        >
          {scanning ? 'Starting...' : 'Run scan'}
        </button>
      </div>

      {/* Scan history timeline */}
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Scan history</h2>

      {scans.length === 0 ? (
        <div className="text-center py-16 text-gray-600">
          <p>No scans yet. Run your first scan above.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-800" />

          <div className="space-y-3 pl-10">
            {scans.map((scan, i) => {
              const report = scan.reports?.[0]
              const prevReport = scans[i + 1]?.reports?.[0]
              const prevScore = prevReport?.score_a ?? null

              return (
                <div key={scan.id} className="relative">
                  {/* Timeline dot */}
                  <div className={`absolute -left-7 top-3.5 w-2.5 h-2.5 rounded-full border-2 border-gray-950 ${
                    scan.status === 'done' ? 'bg-blue-400' :
                    scan.status === 'failed' ? 'bg-red-500' :
                    scan.status === 'running' ? 'bg-amber-400 animate-pulse' :
                    'bg-gray-600'
                  }`} />

                  <Link to={`/scan/${scan.id}`}
                    className="block bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-4 transition-colors group">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {scan.label && (
                            <span className="text-xs bg-gray-800 text-gray-300 border border-gray-700 px-2 py-0.5 rounded-full">
                              {scan.label}
                            </span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            scan.status === 'done' ? 'bg-green-900/40 text-green-400' :
                            scan.status === 'failed' ? 'bg-red-900/40 text-red-400' :
                            scan.status === 'running' ? 'bg-amber-900/40 text-amber-400' :
                            'bg-gray-800 text-gray-500'
                          }`}>
                            {scan.status}
                          </span>
                          <span className="text-xs text-gray-600">
                            {new Date(scan.created_at).toLocaleDateString()} {new Date(scan.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {report?.diff && <DiffSummary diff={report.diff} />}

                        {scan.status === 'failed' && (
                          <p className="text-xs text-red-400 mt-1">{scan.error}</p>
                        )}
                      </div>

                      {report && (
                        <QAScore score={report.score_a} prev={prevScore} />
                      )}
                    </div>
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Danger zone */}
      <div className="mt-12 border-t border-gray-800 pt-6">
        <button onClick={handleDelete} className="text-xs text-red-500 hover:text-red-400 transition-colors">
          Delete project
        </button>
      </div>
    </div>
  )
}
