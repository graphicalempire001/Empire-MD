import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Transformation from './sections/Transformation'
import Features from './sections/Features'
import LiveBots from './sections/LiveBots'
import Pricing from './sections/Pricing'
import CustomerCare from './sections/CustomerCare'
import Footer from './sections/Footer'
import WhatsAppChat from './components/WhatsAppChat'
import PairingFlow from './components/PairingFlow' // adjust path if it lives elsewhere
import Admin from './pages/Admin'

function Landing({ onGetBot }: { onGetBot: () => void }) {
  return (
    <>
      <Navbar />
      <Hero onGetBot={onGetBot} />
      <Transformation />
      <Features />
      <LiveBots />
      <Pricing />
      <CustomerCare />
      <Footer />
      <WhatsAppChat />
    </>
  )
}

export default function App() {
  const [pairingOpen, setPairingOpen] = useState(false)
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing onGetBot={() => setPairingOpen(true)} />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
      <PairingFlow open={pairingOpen} onClose={() => setPairingOpen(false)} />
    </BrowserRouter>
  )
}
