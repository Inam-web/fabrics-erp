"use client";
import { useEffect, useRef } from "react";

// Cinematic living-fabric backdrop: layered silk ribbons with emerald lighting,
// golden threads, cursor-reactive folds and a slow light sweep.
// Honors prefers-reduced-motion (renders a single static frame).
export default function LoginBackdrop() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0, t = Math.random() * 10;
    const pointer = { x: 0.5, y: 0.45, tx: 0.5, ty: 0.45 };
    const RIBBONS = 8;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.max(1, w * dpr); canvas.height = Math.max(1, h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function ribbonY(x, i, time) {
      const base = (i / (RIBBONS - 1)) * h * 1.15 - h * 0.075;
      const amp = h * (0.045 + 0.028 * Math.sin(i * 1.7 + 0.6));
      let y = base
        + Math.sin(x * 0.0042 + time * 0.55 + i * 0.9) * amp
        + Math.sin(x * 0.0016 - time * 0.32 + i * 2.1) * amp * 1.7
        + Math.sin(x * 0.011 + time * 0.9 + i * 0.5) * amp * 0.25;
      // cursor-reactive fold (gaussian falloff around pointer)
      const dx = x / w - pointer.x;
      const dy = y / h - pointer.y;
      const fall = Math.exp(-(dx * dx * 2.4 + dy * dy * 3.6) * 6);
      return y + fall * h * 0.07 * Math.sin(time * 2.2 + i * 1.3);
    }

    function draw() {
      // deep forest base
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, "#050f0b");
      bg.addColorStop(0.45, "#0a1f16");
      bg.addColorStop(1, "#061410");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // silk ribbons with 3D depth (thicker + brighter toward the front)
      for (let i = 0; i < RIBBONS; i++) {
        const depth = i / (RIBBONS - 1);
        ctx.beginPath();
        const step = Math.max(14, w / 90);
        for (let x = -30; x <= w + 30; x += step) {
          const y = ribbonY(x, i, t);
          if (x === -30) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        const thick = (h / RIBBONS) * (0.85 + depth * 0.6);
        const a = 0.05 + depth * 0.11;
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, `rgba(14,74,56,${a})`);
        g.addColorStop(0.35, `rgba(38,150,113,${a + 0.07})`);
        g.addColorStop(0.62, `rgba(10,58,44,${a})`);
        g.addColorStop(0.85, `rgba(24,110,82,${a + 0.04})`);
        g.addColorStop(1, `rgba(12,66,50,${a})`);
        ctx.strokeStyle = g;
        ctx.lineWidth = thick;
        ctx.lineCap = "round";
        ctx.stroke();
        // fold highlight
        ctx.save();
        ctx.globalAlpha = 0.10 + depth * 0.10;
        ctx.strokeStyle = "rgba(190,240,215,0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      // golden threads woven through the silk
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        const step = Math.max(10, w / 120);
        for (let x = -20; x <= w + 20; x += step) {
          const y = ribbonY(x, 2 + k * 2.3, t * 1.12 + k * 0.7) + Math.sin(x * 0.012 + t * 2 + k * 2.2) * 7;
          if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        const gg = ctx.createLinearGradient(0, 0, w, 0);
        gg.addColorStop(0, "rgba(212,175,55,0)");
        gg.addColorStop(0.5, `rgba(232,201,138,${0.34 - k * 0.08})`);
        gg.addColorStop(1, "rgba(212,175,55,0)");
        ctx.strokeStyle = gg;
        ctx.lineWidth = 1.1;
        ctx.shadowColor = "rgba(232,201,138,0.45)";
        ctx.shadowBlur = 7;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // slow emerald light sweep
      const sx = (Math.sin(t * 0.22) * 0.5 + 0.5) * w;
      const sy = h * (0.3 + 0.12 * Math.sin(t * 0.17));
      const lg = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(w, h) * 0.55);
      lg.addColorStop(0, "rgba(127,196,168,0.10)");
      lg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, w, h);

      // vignette for depth
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(2,8,5,0.55)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }

    function loop() {
      t += 0.008;
      pointer.x += (pointer.tx - pointer.x) * 0.06;
      pointer.y += (pointer.ty - pointer.y) * 0.06;
      draw();
      raf = requestAnimationFrame(loop);
    }
    function onMove(e) {
      pointer.tx = e.clientX / window.innerWidth;
      pointer.ty = e.clientY / window.innerHeight;
    }

    resize();
    draw();
    window.addEventListener("resize", resize);
    if (!reduced) {
      window.addEventListener("pointermove", onMove);
      loop();
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
