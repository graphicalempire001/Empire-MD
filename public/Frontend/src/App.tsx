import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import HowToConnect from './sections/HowToConnect'
import Transformation from './sections/Transformation'
import Features from './sections/Features'
import LiveBots from './sections/LiveBots'
import Pricing from './sections/Pricing'
import CustomerCare from './sections/CustomerCare'
import Footer from './sections/Footer'
import WhatsAppChat from './components/WhatsAppChat'
import PairingFlow from './components/PairingFlow'
import Admin from './pages/Admin'

function Landing({ onGetBot, onOpenChat }: { onGetBot: () => void; onOpenChat: () => void }) {
  return (
    <>
      <Navbar />
      <Hero onGetBot={onGetBot} onOpenChat={onOpenChat} />
      <HowToConnect />
      <Transformation />
      <Features />
      <LiveBots />
      <Pricing />
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
      <Routes>
        <Route path="/" element={<Landing onGetBot={() => setPairingOpen(true)} onOpenChat={() => setChatOpen(true)} />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
      <PairingFlow open={pairingOpen} onClose={() => setPairingOpen(false)} />
      <WhatsAppChat open={chatOpen} onOpenChange={setChatOpen} />
    </BrowserRouter>
  )
}
