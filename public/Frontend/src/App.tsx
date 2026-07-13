import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Transformation from './sections/Transformation';
import Features from './sections/Features';
import LiveBots from './sections/LiveBots';
import Pricing from './sections/Pricing';
import CustomerCare from './sections/CustomerCare';
import Footer from './sections/Footer';
import WhatsAppChat from './components/WhatsAppChat';
import Admin from './pages/Admin';

function Landing() {
  return (
    <>
      <Navbar />
      <Hero />
      <Transformation />
      <Features />
      <LiveBots />
      <Pricing />
      <CustomerCare />
      <Footer />
      <WhatsAppChat />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  );
}
