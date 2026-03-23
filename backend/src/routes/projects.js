import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import supabase from '../utils/supabase.js'

const router = Router()

// POST /projects — create a project
router.post('/', async (req, res) => {
  const { name, url, description } = req.body
  if (!name || !url) return res.status(400).json({ error: 'name and url are required' })
  try { new URL(url) } catch { return res.status(400).json({ error: 'Invalid URL' }) }

  const { data, error } = await supabase
    .from('projects')
    .insert({ id: uuid(), name, url, description: description || null })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// GET /projects — list all projects
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// GET /projects/:id — get project with scan history
router.get('/:id', async (req, res) => {
  const { data: project, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', req.params.id)
    .single()

  if (error || !project) return res.status(404).json({ error: 'Project not found' })

  const { data: scans } = await supabase
    .from('scans')
    .select(`
      id, url_a, url_b, status, label, created_at, completed_at,
      reports ( score_a, score_b, diff )
    `)
    .eq('project_id', req.params.id)
    .order('created_at', { ascending: false })
    .limit(20)

  res.json({ ...project, scans: scans || [] })
})

// PATCH /projects/:id — update project
router.patch('/:id', async (req, res) => {
  const { name, url, description } = req.body
  const updates = {}
  if (name) updates.name = name
  if (url) updates.url = url
  if (description !== undefined) updates.description = description

  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /projects/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('projects').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ deleted: true })
})

export default router
