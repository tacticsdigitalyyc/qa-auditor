import { Routes, Route, Navigate } from 'react-router-dom'
import ProjectsPage from './pages/ProjectsPage.jsx'
import ProjectPage from './pages/ProjectPage.jsx'
import HomePage from './pages/HomePage.jsx'
import ScanPage from './pages/ScanPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/projects" replace />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/projects/:id" element={<ProjectPage />} />
      <Route path="/scan" element={<HomePage />} />
      <Route path="/scan/:id" element={<ScanPage />} />
    </Routes>
  )
}
