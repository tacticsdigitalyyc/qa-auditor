import { useState } from 'react'
import SeverityBadge from './SeverityBadge.jsx'
import { updateIssueStatus } from '../lib/api.js'

const TYPE_LABELS = {
  broken_link: 'Broken Link',
  missing_image: 'Missing Image',
  seo: 'SEO',
  console_error: 'Console Error',
}

const SEVERITIES = ['critical', 'high', 'medium', 'low']

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
        <span className="text-gray-500 text-xs self-center">{filtered.length} issue{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wide">
              <th className="text-left px-3 py-2">Severity</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2">Description</th>
              <th className="text-left px-3 py-2 hidden md:table-cell">Location</th>
              <th className="text-left px-3 py-2 hidden lg:table-cell">Suggested fix</th>
              {scanId && <th className="text-left px-3 py-2">Status</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((issue, i) => (
              <tr key={i} className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${
                issue.status === 'resolved' ? 'opacity-50' : ''
              }`}>
                <td className="px-3 py-2 whitespace-nowrap"><SeverityBadge severity={issue.severity} /></td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="font-mono text-xs text-blue-400">{TYPE_LABELS[issue.type] || issue.type}</span>
                </td>
                <td className="px-3 py-2 text-gray-300 max-w-xs break-words">{issue.description}</td>
                <td className="px-3 py-2 hidden md:table-cell">
                  <code className="text-xs text-gray-500 break-all">{issue.location}</code>
                </td>
                <td className="px-3 py-2 hidden lg:table-cell text-gray-400 text-xs">{issue.suggested_fix}</td>
                {scanId && (
                  <td className="px-3 py-2 whitespace-nowrap">
                    <select
                      value={issue.status || 'open'}
                      onChange={e => handleStatus(issue, e.target.value)}
                      className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-1.5 py-0.5 cursor-pointer"
                    >
                      <option value="open">Open</option>
                      <option value="resolved">Resolved</option>
                      <option value="ignored">Ignored</option>
                    </select>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
