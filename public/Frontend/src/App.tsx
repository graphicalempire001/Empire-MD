import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Transformation from './sections/Transformation'
import Features from './sections/Features'
import Pricing from './sections/Pricing'
import CustomerCare from './sections/CustomerCare'
import Footer from './sections/Footer'
import WhatsAppChat from './components/WhatsAppChat'

export default function App() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#EDEEF5' }}>
      <Navbar />
      <main>
        <Hero />
        <Transformation />
        <Features />
        <Pricing />
        <CustomerCare />
      </main>
      <Footer />
      <WhatsAppChat />
    </div>
  )
}
