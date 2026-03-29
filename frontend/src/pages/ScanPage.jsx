import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getScan, getReport, updateIssueStatus, runDeepScan } from '../lib/api.js'
import IssuesTable from '../components/IssuesTable.jsx'
import SeoTable from '../components/SeoTable.jsx'
import SeverityBadge from '../components/SeverityBadge.jsx'
import QAScore from '../components/QAScore.jsx'
import DiffSummary from '../components/DiffSummary.jsx'

const SEVERITIES = ['critical', 'high', 'medium', 'low']

export default function ScanPage() {
  const { id } = useParams()
  const [scan, setScan] = useState(null)
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  const [deepScanning, setDeepScanning] = useState(false)
  const [deepScanDone, setDeepScanDone] = useState(false)

  const handleDeepScan = async () => {
    setDeepScanning(true)
    try {
      await runDeepScan(id)
      setDeepScanDone(true)
      setTimeout(() => {
        getReport(id).then(setReport)
      }, 5000)
    } catch (e) {
      console.error('Deep scan failed', e)
    } finally {
      setDeepScanning(false)
    }
  }
  const [tab, setTab] = useState('a')
  const pollRef = useRef(null)

  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const s = await getScan(id)
        setScan(s)
        if (s.status === 'done') {
          clearInterval(pollRef.current)
          const r = await getReport(id)
          setReport(r)
        } else if (s.status === 'failed') {
          clearInterval(pollRef.current)
          setError(s.error || 'Scan failed.')
        }
      } catch (err) {
        setError(err.message)
        clearInterval(pollRef.current)
      }
    }, 2000)
    return () => clearInterval(pollRef.current)
  }, [id])

  const isRunning = !scan || scan.status === 'pending' || scan.status === 'running'
  const diff = report?.diff
  const issuesForTab = (t) => report?.json_report?.results?.[t]?.issues || []
  const seoForTab = (t) => t === 'a' ? report?.seo_a : report?.seo_b
  const screenshotForTab = (t) => t === 'a' ? report?.screenshot_a : report?.screenshot_b
  const scoreForTab = (t) => t === 'a' ? report?.score_a : report?.score_b

  return (
    <div className="min-h-screen px-4 py-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          to={scan?.project_id ? `/projects/${scan.project_id}` : '/projects'}
          className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
        >
          ← {scan?.project_id ? 'Project' : 'Projects'}
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">QA Scan</h1>
          <p className="text-gray-500 text-xs font-mono">{id}</p>
        </div>
        {report?.json_report && (
          <a
            href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(report.json_report, null, 2))}`}
            download={`qa-report-${id}.json`}
            className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            Export JSON
          </a>
        )}
        {report && !isRunning && (
          <button
            onClick={handleDeepScan}
            disabled={deepScanning || deepScanDone}
            className="text-xs bg-red-900/40 hover:bg-red-900/60 disabled:bg-gray-800 disabled:text-gray-600 border border-red-900/60 text-red-400 px-3 py-1.5 rounded-lg transition-colors"
          >
            {deepScanning ? 'Running deep scan...' : deepScanDone ? 'Deep scan complete' : 'Run deep scan'}
          </button>
        )}
        {report?.html_report_path && (
          <a href={report.html_report_path} target="_blank" rel="noopener noreferrer"
            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors">
            HTML report
          </a>
        )}
      </div>

      {/* Progress */}
      {isRunning && !error && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-white font-medium">
              {!scan ? 'Loading...' : scan.status === 'pending' ? 'Queued' : 'Scanning...'}
            </span>
            {scan && <span className="text-gray-500 text-sm">{scan.progress ?? 0}%</span>}
          </div>
          {scan && (
            <div className="w-full bg-gray-800 rounded-full h-1.5 mb-3">
              <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${scan.progress ?? 0}%` }} />
            </div>
          )}
          {scan && (
            <div className="text-xs text-gray-500 space-y-0.5">
              <p>URL A: <span className="text-gray-400">{scan.url_a}</span></p>
              {scan.url_b && <p>URL B: <span className="text-gray-400">{scan.url_b}</span></p>}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-900/40 rounded-2xl p-6 mb-6 text-red-400">
          <p className="font-semibold mb-1">Scan failed</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Diff banner */}
      {diff && (diff.new > 0 || diff.resolved > 0 || diff.regressed > 0) && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
          <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">vs previous scan</span>
          <DiffSummary diff={diff} />
        </div>
      )}

      {/* Report */}
      {report && (
        <>
          {scan?.url_b && (
            <div className="flex gap-2 mb-4">
              {['a', 'b'].map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    tab === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}>
                  URL {t.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {['a', scan?.url_b ? 'b' : null].filter(Boolean).map(t => {
            if (scan?.url_b && t !== tab) return null
            const url = t === 'a' ? scan?.url_a : scan?.url_b
            const issues = issuesForTab(t)
            const score = scoreForTab(t)

            return (
              <div key={t} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-4">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">URL {t.toUpperCase()}</span>
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="text-blue-400 text-sm hover:underline truncate">{url}</a>
                  <div className="ml-auto">
                    <QAScore score={score} size="md" />
                  </div>
                </div>

                {/* Severity counts */}
                <div className="flex gap-3 flex-wrap mb-5">
                  {SEVERITIES.map(sev => (
                    <div key={sev} className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-3 py-1.5">
                      <SeverityBadge severity={sev} />
                      <span className="text-white font-bold text-lg">
                        {report.json_report?.summary?.[t]?.bySeverity?.[sev] ?? 0}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Screenshot */}
                {screenshotForTab(t) && (
                  <div className="mb-5">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Screenshot</h3>
                    <div className="rounded-xl overflow-hidden border border-gray-800 max-h-80 overflow-y-auto">
                      <img src={screenshotForTab(t)} alt={`Screenshot URL ${t.toUpperCase()}`} className="w-full" />
                    </div>
                  </div>
                )}

                {/* SEO */}
                <div className="mb-5">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">SEO</h3>
                  <SeoTable seoA={seoForTab('a')} seoB={scan?.url_b ? seoForTab('b') : null} />
                </div>

                {/* Issues */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Issues ({issues.length})
                  </h3>
                  <IssuesTable issues={issues} scanId={id} />
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
