/**
 * Simple JSON file store — replaces Supabase for local/MVP use.
 * All data lives in ./data/*.json next to this file.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dir, '../../data')

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

function filePath(name) {
  return join(DATA_DIR, `${name}.json`)
}

function readStore(name) {
  const fp = filePath(name)
  if (!existsSync(fp)) return []
  try { return JSON.parse(readFileSync(fp, 'utf8')) } catch { return [] }
}

function writeStore(name, data) {
  writeFileSync(filePath(name), JSON.stringify(data, null, 2))
}

// ── Screenshots stored as base64 in a separate store ────────────────────────
const SCREENSHOTS_DIR = join(DATA_DIR, 'screenshots')
if (!existsSync(SCREENSHOTS_DIR)) mkdirSync(SCREENSHOTS_DIR, { recursive: true })

function screenshotPath(scanId, label) {
  return join(SCREENSHOTS_DIR, `${scanId}-${label}.png`)
}

// ── Scans ────────────────────────────────────────────────────────────────────
export function createScan({ id, url_a, url_b }) {
  const scans = readStore('scans')
  const scan = { id, url_a, url_b: url_b || null, status: 'pending', created_at: new Date().toISOString(), completed_at: null, error: null }
  scans.push(scan)
  writeStore('scans', scans)
  return scan
}

export function updateScan(id, updates) {
  const scans = readStore('scans')
  const idx = scans.findIndex(s => s.id === id)
  if (idx === -1) return null
  scans[idx] = { ...scans[idx], ...updates }
  writeStore('scans', scans)
  return scans[idx]
}

export function getScan(id) {
  return readStore('scans').find(s => s.id === id) || null
}

export function listScans() {
  return readStore('scans').sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20)
}

// ── Issues ───────────────────────────────────────────────────────────────────
export function insertIssues(issues) {
  const store = readStore('issues')
  store.push(...issues)
  writeStore('issues', store)
}

export function getIssuesByScan(scanId) {
  return readStore('issues').filter(i => i.scan_id === scanId)
}

// ── Reports ──────────────────────────────────────────────────────────────────
export function createReport(report) {
  const reports = readStore('reports')
  reports.push(report)
  writeStore('reports', reports)
}

export function getReportByScan(scanId) {
  return readStore('reports').find(r => r.scan_id === scanId) || null
}

// ── Screenshots (saved as PNG files, served as static) ───────────────────────
import { writeFileSync as wf } from 'fs'

export function saveScreenshot(scanId, label, buffer) {
  if (!buffer) return null
  const p = screenshotPath(scanId, label)
  wf(p, buffer)
  return `/screenshots/${scanId}-${label}.png`
}
