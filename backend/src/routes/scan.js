import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import supabase from '../utils/supabase.js'
import { enqueueJob, getProgress } from '../workers/scanWorker.js'

const router = Router()

// POST /scan — start a new scan
router.post('/', async (req, res) => {
  const { url_a, url_b } = req.body

  if (!url_a) {
    return res.status(400).json({ error: 'url_a is required' })
  }

  // Validate URLs
  for (const url of [url_a, url_b].filter(Boolean)) {
    try { new URL(url) } catch {
      return res.status(400).json({ error: `Invalid URL: ${url}` })
    }
  }

  const scanId = uuid()

  const { error } = await supabase.from('scans').insert({
    id: scanId,
    url_a,
    url_b: url_b || null,
    status: 'pending',
  })

  if (error) {
    return res.status(500).json({ error: 'Failed to create scan record', detail: error.message })
  }

  enqueueJob(scanId, url_a, url_b || null)

  res.status(201).json({ scanId })
})

// GET /scan/:id — poll status + progress
router.get('/:id', async (req, res) => {
  const { id } = req.params

  const { data, error } = await supabase
    .from('scans')
    .select('id, url_a, url_b, status, created_at, completed_at, error')
    .eq('id', id)
    .single()

  if (error || !data) {
    return res.status(404).json({ error: 'Scan not found' })
  }

  const progress = getProgress(id)

  res.json({ ...data, progress })
})

// GET /scan/:id/report — full report
router.get('/:id/report', async (req, res) => {
  const { id } = req.params

  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('scan_id', id)
    .single()

  if (error || !data) {
    return res.status(404).json({ error: 'Report not found. Scan may still be running.' })
  }

  res.json(data)
})

// GET /scan — list recent scans
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('scans')
    .select('id, url_a, url_b, status, created_at, completed_at')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  res.json(data)
})

export default router
