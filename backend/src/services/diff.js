import { createHash } from 'crypto'

/**
 * Generate a stable fingerprint for an issue.
 * Used to match the same issue across scans (for resolved/new tracking).
 * Fingerprint is based on type + url_target + location (not description,
 * which can vary slightly between scans).
 */
export function fingerprint(issue) {
  const key = `${issue.type}::${issue.url_target || ''}::${issue.location || ''}`
  return createHash('sha1').update(key).digest('hex').slice(0, 16)
}

/**
 * Compute a QA score (0–100) from a list of issues.
 * Deductions: critical=-20, high=-10, medium=-4, low=-1
 * Floor at 0.
 */
export function computeScore(issues) {
  const deductions = { critical: 20, high: 10, medium: 4, low: 1 }
  const total = issues.reduce((sum, i) => sum + (deductions[i.severity] || 0), 0)
  return Math.max(0, 100 - total)
}

/**
 * Diff two sets of issues (previous scan vs current scan).
 * Returns { new[], resolved[], regressed[], unchanged[] }
 *
 * - new: in current but not in previous
 * - resolved: in previous (open) but not in current
 * - regressed: in previous (was resolved/ignored) but back in current
 * - unchanged: in both
 */
export function diffIssues(previousIssues, currentIssues) {
  const prevMap = new Map(previousIssues.map(i => [i.fingerprint, i]))
  const currMap = new Map(currentIssues.map(i => [i.fingerprint, i]))

  const result = {
    new: [],
    resolved: [],
    regressed: [],
    unchanged: [],
  }

  // Current issues
  for (const [fp, issue] of currMap) {
    if (!prevMap.has(fp)) {
      result.new.push(issue)
    } else {
      const prev = prevMap.get(fp)
      if (prev.status === 'resolved' || prev.status === 'ignored') {
        result.regressed.push(issue)
      } else {
        result.unchanged.push(issue)
      }
    }
  }

  // Previous open issues not in current = resolved
  for (const [fp, issue] of prevMap) {
    if (!currMap.has(fp) && issue.status === 'open') {
      result.resolved.push(issue)
    }
  }

  return result
}

/**
 * Summarize a diff for storage/display.
 */
export function summarizeDiff(diff) {
  return {
    new: diff.new.length,
    resolved: diff.resolved.length,
    regressed: diff.regressed.length,
    unchanged: diff.unchanged.length,
    newIssues: diff.new.map(i => ({
      type: i.type,
      severity: i.severity,
      description: i.description,
      location: i.location,
    })),
    resolvedIssues: diff.resolved.map(i => ({
      type: i.type,
      severity: i.severity,
      description: i.description,
    })),
    regressedIssues: diff.regressed.map(i => ({
      type: i.type,
      severity: i.severity,
      description: i.description,
      location: i.location,
    })),
  }
}
