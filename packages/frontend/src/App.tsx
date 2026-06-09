import { Routes, Route } from 'react-router-dom'
import PageWrapper from '@/components/layout/PageWrapper'
import Landing from '@/pages/Landing'
import Marketplace from '@/pages/Marketplace'
import MarketDetail from '@/pages/MarketDetail'
import UserDashboard from '@/pages/UserDashboard'
import Docs from '@/pages/Docs'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route element={<PageWrapper />}>
        <Route path="/markets" element={<Marketplace />} />
        <Route path="/markets/:marketId" element={<MarketDetail />} />
        <Route path="/dashboard" element={<UserDashboard />} />
        <Route path="/docs" element={<Docs />} />
      </Route>
    </Routes>
  )
}
