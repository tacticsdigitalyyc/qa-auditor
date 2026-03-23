import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import scanRoutes from './routes/scan.js'
import projectRoutes from './routes/projects.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
}))

app.use(express.json())

app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

app.use('/scan', scanRoutes)
app.use('/projects', projectRoutes)

app.listen(PORT, () => {
  console.log(`QA Auditor backend running on port ${PORT}`)
})
