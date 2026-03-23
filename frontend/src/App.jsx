import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import ScanPage from './pages/ScanPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/scan/:id" element={<ScanPage />} />
    </Routes>
  )
}
