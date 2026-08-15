import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import HowToConnect from './sections/HowToConnect'
import Transformation from './sections/Transformation'
import Features from './sections/Features'
import LiveBots from './sections/LiveBots'
import Pricing from './sections/Pricing'
import Testimonials from './sections/Testimonials'
import CustomerCare from './sections/CustomerCare'
import Footer from './sections/Footer'
import WhatsAppChat from './components/WhatsAppChat'
import PairingFlow from './components/PairingFlow'
import Admin from './pages/AdminDashboard'
import Upgrade from './components/Upgrade'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import HelpCenter from './pages/HelpCenter'
import Status from './pages/Status'
import Reconnect from './pages/Reconnect'
import Dashboard from './pages/Dashboard'
import Plugins from './pages/Plugins'
import ScrollToHash from './components/ScrollToHash'

function Landing({
  onGetBot,
  onOpenChat,
}: {
  onGetBot: () => void
  onOpenChat: () => void
}) {
  return (
    <>
      <Navbar />
      <Hero onGetBot={onGetBot} onOpenChat={onOpenChat} />
      <HowToConnect />
      <Transformation />
      <Features />
      <LiveBots />
      <Pricing onGetBot={onGetBot} />
      <Testimonials />
      <CustomerCare />
      <Footer />
    </>
  )
}

export default function App() {
  const [pairingOpen, setPairingOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)

  return (
    <BrowserRouter>
      <ScrollToHash />
      <Routes>
        <Route
          path="/"
          element={
            <Landing
              onGetBot={() => setPairingOpen(true)}
              onOpenChat={() => setChatOpen(true)}
            />
          }
        />
        <Route path="/admin" element={<Admin />} />
        <Route path="/upgrade" element={<Upgrade />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/help" element={<HelpCenter />} />
        <Route path="/status" element={<Status />} />
        <Route path="/reconnect" element={<Reconnect />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/plugins" element={<Plugins />} />
      </Routes>

      <PairingFlow open={pairingOpen} onClose={() => setPairingOpen(false)} />
      <WhatsAppChat open={chatOpen} onOpenChange={setChatOpen} />
    </BrowserRouter>
  )
}
