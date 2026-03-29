/**
 * Scheduler service
 * Runs every 60 minutes, checks which projects are due for a scan,
 * triggers them automatically, sends email alerts on regression.
 */

import supabase from '../utils/supabase.js'
import { enqueueJob } from '../workers/scanWorker.js'
import { sendRegressionAlert, sendWeeklyDigest } from './emailService.js'
import { v4 as uuid } from 'uuid'

const APP_URL = process.env.APP_URL || 'https://qa-auditor.vercel.app'
const CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

let schedulerTimer = null

export function startScheduler() {
  console.log('[scheduler] Starting — checks every 60 minutes')
  runSchedulerCycle()
  schedulerTimer = setInterval(runSchedulerCycle, CHECK_INTERVAL_MS)
}

export function stopScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer)
}

async function runSchedulerCycle() {
  console.log(`[scheduler] Running cycle at ${new Date().toISOString()}`)

  try {
    await triggerDueScans()
    await sendWeeklyDigests()
  } catch (err) {
    console.error('[scheduler] Cycle error:', err.message)
  }
}

/**
 * Find projects due for a scheduled scan and trigger them.
 */
async function triggerDueScans() {
  const now = new Date()

  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .in('schedule', ['daily', 'weekly'])

  if (error || !projects?.length) return

  for (const project of projects) {
    try {
      const isDue = isScanDue(project, now)
      if (!isDue) continue

      console.log(`[scheduler] Triggering scan for project: ${project.name} (${project.schedule})`)

      const scanId = uuid()
      const label = `Scheduled — ${now.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}`

      const { error: scanError } = await supabase.from('scans').insert({
        id: scanId,
        url_a: project.url,
        url_b: null,
        project_id: project.id,
        label,
        status: 'pending',
      })

      if (scanError) {
        console.error(`[scheduler] Failed to create scan for ${project.name}:`, scanError.message)
        continue
      }

      // Enqueue with callback to send alert on completion
      enqueueJob(scanId, project.url, null, project.id, async (result) => {
        await handleScanComplete(project, scanId, result)
      })

    } catch (err) {
      console.error(`[scheduler] Error processing project ${project.name}:`, err.message)
    }
  }
}

/**
 * Determine if a project is due for a scan.
 */
function isScanDue(project, now) {
  if (!project.last_scanned_at) return true // never scanned

  const lastScanned = new Date(project.last_scanned_at)
  const hoursSince = (now - lastScanned) / (1000 * 60 * 60)

  if (project.schedule === 'daily') return hoursSince >= 23
  if (project.schedule === 'weekly') return hoursSince >= 167 // ~7 days
  return false
}

/**
 * Called after a scheduled scan completes.
 * Sends regression alert if new critical/high issues found.
 */
async function handleScanComplete(project, scanId, result) {
  if (!project.notify_email) return
  if (!result?.diff) return

  const { diff, scoreA } = result
  const hasNewCritical = diff.newIssues?.some(i => i.severity === 'critical' || i.severity === 'high')

  if (hasNewCritical && diff.new > 0) {
    console.log(`[scheduler] Sending regression alert for ${project.name} to ${project.notify_email}`)
    await sendRegressionAlert({
      to: project.notify_email,
      projectName: project.name,
      siteUrl: project.url,
      scanId,
      diff,
      scoreA,
      appUrl: APP_URL,
    })
  }
}

/**
 * Send weekly digest every Monday between 8-9am server time.
 */
async function sendWeeklyDigests() {
  const now = new Date()
  const isMonday = now.getDay() === 1
  const isDigestHour = now.getHours() === 9

  if (!isMonday || !isDigestHour) return

  console.log('[scheduler] Sending weekly digests...')

  // Get all projects with notify_email set
  const { data: projects } = await supabase
    .from('projects')
    .select(`
      id, name, url, notify_email,
      scans (
        id, status, completed_at,
        reports ( score_a, diff )
      )
    `)
    .not('notify_email', 'is', null)

  if (!projects?.length) return

  // Group by email — one digest per email covering all their projects
  const byEmail = new Map()

  for (const project of projects) {
    const email = project.notify_email
    if (!email) continue

    // Get latest completed scan
    const latestScan = project.scans
      ?.filter(s => s.status === 'done')
      ?.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))[0]

    const report = latestScan?.reports?.[0]

    // Count open issues
    const { count } = await supabase
      .from('issues')
      .select('id', { count: 'exact', head: true })
      .eq('scan_id', latestScan?.id || '')
      .eq('status', 'open')

    if (!byEmail.has(email)) byEmail.set(email, [])
    byEmail.get(email).push({
      id: project.id,
      name: project.name,
      url: project.url,
      score: report?.score_a ?? null,
      openIssues: count ?? 0,
    })
  }

  for (const [email, projectList] of byEmail) {
    await sendWeeklyDigest({
      to: email,
      projects: projectList,
      appUrl: APP_URL,
    })
  }
}
