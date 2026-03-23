import { useState } from 'react'
import SeverityBadge from './SeverityBadge.jsx'
import { updateIssueStatus } from '../lib/api.js'

const TYPE_LABELS = {
  broken_link: 'Broken Link',
  missing_image: 'Missing Image',
  seo: 'SEO',
  console_error: 'Console Error',
}

const EFFORT_COLORS = {
  quick: 'text-green-400 bg-green-900/30 border-green-900/50',
  medium: 'text-amber-400 bg-amber-900/30 border-amber-900/50',
  complex: 'text-red-400 bg-red-900/30 border-red-900/50',
}

const SEVERITIES = ['critical', 'high', 'medium', 'low']

function IssueRow({ issue, scanId, onStatusChange }) {
  const [expanded, setExpanded] = useState(false)
  const explanation = issue.explanation

  return (
    <>
      <tr
        className={`border-b border-gray-800/50 transition-colors cursor-pointer ${
          issue.status === 'resolved' ? 'opacity-40' : 'hover:bg-gray-800/30'
        } ${expanded ? 'bg-gray-800/20' : ''}`}
        onClick={() => explanation && setExpanded(e => !e)}
      >
        <td className="px-3 py-2.5 whitespace-nowrap">
          <SeverityBadge severity={issue.severity} />
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          <span className="font-mono text-xs text-blue-400">{TYPE_LABELS[issue.type] || issue.type}</span>
        </td>
        <td className="px-3 py-2.5 text-gray-300 max-w-xs">
          <div className="break-words">{issue.description}</div>
          {explanation && (
            <div className="text-xs text-gray-600 mt-0.5">
              {expanded ? '▲ collapse' : '▼ see explanation'}
            </div>
          )}
        </td>
        <td className="px-3 py-2.5 hidden md:table-cell">
          <code className="text-xs text-gray-500 break-all">{issue.location}</code>
        </td>
        <td className="px-3 py-2.5 hidden lg:table-cell">
          {explanation ? (
            <span className={`text-xs px-2 py-0.5 rounded border font-medium ${EFFORT_COLORS[explanation.effort] || EFFORT_COLORS.medium}`}>
              {explanation.effort}
            </span>
          ) : (
            <span className="text-xs text-gray-600">{issue.suggested_fix}</span>
          )}
        </td>
        {scanId && (
          <td className="px-3 py-2.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
            <select
              value={issue.status || 'open'}
              onChange={e => onStatusChange(issue, e.target.value)}
              className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-1.5 py-0.5 cursor-pointer"
            >
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="ignored">Ignored</option>
            </select>
          </td>
        )}
      </tr>

      {/* Expanded explanation row */}
      {expanded && explanation && (
        <tr className="border-b border-gray-800/50 bg-gray-800/10">
          <td colSpan={scanId ? 6 : 5} className="px-4 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Impact */}
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Why this matters
                </h4>
                <p className="text-sm text-gray-300 leading-relaxed">{explanation.impact}</p>
              </div>

              {/* Steps */}
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  How to fix it
                </h4>
                <ol className="space-y-1">
                  {(explanation.steps || []).map((step, i) => (
                    <li key={i} className="text-sm text-gray-300 flex gap-2">
                      <span className="text-blue-500 font-semibold shrink-0">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Code example */}
              {explanation.codeExample && (
                <div className="lg:col-span-2">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    Code example
                  </h4>
                  <pre className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-xs text-green-300 overflow-x-auto font-mono leading-relaxed">
                    {explanation.codeExample}
                  </pre>
                </div>
              )}

              {/* Effort note */}
              {explanation.effortNote && (
                <div className="lg:col-span-2 flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded border font-medium ${EFFORT_COLORS[explanation.effort] || EFFORT_COLORS.medium}`}>
                    {explanation.effort} effort
                  </span>
                  <span className="text-xs text-gray-500">{explanation.effortNote}</span>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function IssuesTable({ issues: initialIssues, scanId }) {
  const [issues, setIssues] = useState(initialIssues)
  const [filter, setFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('open')

  const types = [...new Set(issues.map(i => i.type))]

  const filtered = issues.filter(i => {
    if (filter !== 'all' && i.severity !== filter) return false
    if (typeFilter !== 'all' && i.type !== typeFilter) return false
    if (statusFilter !== 'all' && (i.status || 'open') !== statusFilter) return false
    return true
  })

  const handleStatus = async (issue, newStatus) => {
    if (!scanId) return
    try {
      await updateIssueStatus(scanId, issue.id, newStatus)
      setIssues(prev => prev.map(i => i.id === issue.id ? { ...i, status: newStatus } : i))
    } catch (e) {
      console.error('Failed to update issue status', e)
    }
  }

  if (issues.length === 0) {
    return <p className="text-green-400 text-sm py-2">No issues found.</p>
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <select className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1"
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="ignored">Ignored</option>
        </select>
        <select className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1"
          value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All severities</option>
          {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1"
          value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">All types</option>
          {types.map(t => <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>)}
        </select>
        <span className="text-gray-500 text-xs self-center">
          {filtered.length} issue{filtered.length !== 1 ? 's' : ''}
        </span>
        {filtered.some(i => i.explanation) && (
          <span className="text-gray-600 text-xs self-center">· click any row to expand explanation</span>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wide">
              <th className="text-left px-3 py-2">Severity</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2">Description</th>
              <th className="text-left px-3 py-2 hidden md:table-cell">Location</th>
              <th className="text-left px-3 py-2 hidden lg:table-cell">Effort</th>
              {scanId && <th className="text-left px-3 py-2">Status</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((issue, i) => (
              <IssueRow
                key={issue.id || i}
                issue={issue}
                scanId={scanId}
                onStatusChange={handleStatus}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
