"use client";


import Image from "next/image";
import { useEffect, useRef } from "react";

export default function LoginBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const sparkleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.closest(".background-container") as HTMLElement | null;
    if (!container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      color: string;
    }> = [];

    const particleCount = 80;
    const connectionDistance = 150;

    const colors = [
      "rgba(102, 126, 234, 0.55)",
      "rgba(139, 92, 246, 0.45)",
      "rgba(236, 72, 153, 0.35)",
    ];


    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: Math.random() * 2 + 1,
        color: "rgba(102, 126, 234, 0.5)",
      });
    }

    const connectParticles = () => {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < connectionDistance) {
            const opacity = (1 - distance / connectionDistance) * 0.3; // demo
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);

            ctx.strokeStyle = `rgba(102, 126, 234, ${opacity})`;
            ctx.lineWidth = 1; // demo uses 1
            ctx.stroke();
          }
        }
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.color = "rgba(102, 126, 234, 0.5)";


        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }

      connectParticles();
      rafRef.current = requestAnimationFrame(animate);
    };

    animate();

    const createSparkle = () => {
      const sparkle = document.createElement("div");
sparkle.className = "sparkle";
      sparkle.style.left = Math.random() * 100 + "%";
      sparkle.style.top = Math.random() * 100 + "%";
      sparkle.style.animationDelay = Math.random() * 3 + "s";
      container.appendChild(sparkle);
      window.setTimeout(() => sparkle.remove(), 3000);
    };

    sparkleTimerRef.current = window.setInterval(createSparkle, 500);

    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (sparkleTimerRef.current) window.clearInterval(sparkleTimerRef.current);
    };
  }, []);

  return (
    <div className="background-container">
      <div className="glow green" />
      <div className="glow white" />
      <div className="glow gray" />

      <div className="gradient-overlay" />

      <canvas id="networkCanvas" ref={canvasRef} />

      <div className="particle" />
      <div className="particle" />
      <div className="particle" />
      <div className="particle" />
      <div className="particle" />

      <div className="shape square"></div>
      <div className="shape circle"></div>
      <div className="shape triangle"></div>

      <div className="chart-container" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="bar" />
        ))}
      </div>
     
    </div>
  );
}
