import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Smartphone, CheckCircle2, Copy, AlertCircle, Loader2, X, RefreshCw } from 'lucide-react';
import * as THREE from 'three';

// ── Three.js animated background canvas ──────────────────────────
function ThreeBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, canvas.offsetWidth / canvas.offsetHeight, 0.1, 100);
    camera.position.z = 5;
    const geometry = new THREE.IcosahedronGeometry(1.5, 1);
    const material = new THREE.MeshStandardMaterial({
      color: 0x00c2ff,
      wireframe: true,
      transparent: true,
      opacity: 0.18,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      mesh.rotation.x += 0.003;
      mesh.rotation.y += 0.005;
      renderer.render(scene, camera);
    };
    animate();
    return () => {
      cancelAnimationFrame(animId);
      renderer.dispose();
    };
  }, []);
  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none rounded-3xl"
      style={{ opacity: 0.55 }}
    />
  );
}

// ── Step indicators ───────────────────────────────────────────────
function Steps({ current }: { current: number }) {
  const labels = ['Details', 'Pair', 'Done'];
  return (
    <div className="flex items-center justify-center gap-3 mb-6">
      {labels.map((label, i) => {
        const idx = i + 1;
        const done = current > idx;
        const active = current === idx;
        return (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
              ${done ? 'bg-
