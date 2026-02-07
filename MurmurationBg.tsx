"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Boid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  energy: number; // 0 = frozen, 1 = fully alive
}

export default function MurmurationBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const volumeRef = useRef(0);
  const smoothVolumeRef = useRef(0);
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({
    x: -1000,
    y: -1000,
    active: false,
  });
  const [micActive, setMicActive] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  const stopMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    streamRef.current = null;
    volumeRef.current = 0;
    smoothVolumeRef.current = 0;
    setMicActive(false);
  }, []);

  const toggleMic = useCallback(async () => {
    if (micActive) {
      stopMic();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      streamRef.current = stream;
      setMicActive(true);
    } catch {
      // User denied mic or not available
    }
  }, [micActive, stopMic]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let boids: Boid[] = [];

    const NUM_BOIDS = 300;
    const BASE_MAX_SPEED = 2.5;
    const VISUAL_RANGE = 75;
    const SEPARATION_DIST = 20;
    const BASE_COHESION = 0.003;
    const ALIGNMENT_FACTOR = 0.04;
    const SEPARATION_FACTOR = 0.05;
    const EDGE_MARGIN = 100;
    const EDGE_TURN = 0.3;
    const MOUSE_RADIUS = 300;
    const MOUSE_FORCE = 4;
    const ENERGY_SPREAD_RANGE = 180;

    const dataArray = new Uint8Array(128);

    function sampleVolume() {
      const analyser = analyserRef.current;
      if (!analyser) {
        // Decay smoothly to 0 when mic is off
        smoothVolumeRef.current *= 0.9;
        volumeRef.current = smoothVolumeRef.current;
        return;
      }
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const avg = sum / dataArray.length;
      const normalized = Math.min(avg / 100, 1);
      smoothVolumeRef.current +=
        (normalized - smoothVolumeRef.current) * 0.15;
      volumeRef.current = smoothVolumeRef.current;
    }

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas!.getBoundingClientRect();
      canvas!.width = rect.width * dpr;
      canvas!.height = rect.height * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function init() {
      resize();
      const rect = canvas!.getBoundingClientRect();
      boids = [];
      for (let i = 0; i < NUM_BOIDS; i++) {
        boids.push({
          x: Math.random() * rect.width,
          y: Math.random() * rect.height,
          vx: 0,
          vy: 0,
          energy: 0,
        });
      }
    }

    function update() {
      sampleVolume();
      const vol = volumeRef.current;

      const rect = canvas!.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2;

      const mouse = mouseRef.current;

      // Audio-reactive parameters
      const maxSpeed = BASE_MAX_SPEED + vol * 4;
      const cohesion = BASE_COHESION * (1 - vol * 0.8);
      const separationDist = SEPARATION_DIST + vol * 30;
      const pulseForce = vol * vol * 0.8;

      for (let i = 0; i < boids.length; i++) {
        const b = boids[i];

        // Mouse proximity: wake up boids near cursor
        if (mouse.active) {
          const dxM = b.x - mouse.x;
          const dyM = b.y - mouse.y;
          const distM = Math.sqrt(dxM * dxM + dyM * dyM);

          if (distM < MOUSE_RADIUS) {
            // Activate this boid
            b.energy = Math.min(b.energy + 0.35, 1);

            // Push away from cursor to create a "wake" effect
            const force =
              MOUSE_FORCE * (1 - distM / MOUSE_RADIUS);
            b.vx += (dxM / (distM || 1)) * force;
            b.vy += (dyM / (distM || 1)) * force;
          }
        }

        // Energy spreads between nearby boids (chain reaction)
        if (b.energy > 0.1) {
          for (let j = 0; j < boids.length; j++) {
            if (i === j) continue;
            const other = boids[j];
            if (other.energy >= b.energy) continue;
            const dx = other.x - b.x;
            const dy = other.y - b.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < ENERGY_SPREAD_RANGE) {
              other.energy = Math.min(
                other.energy + b.energy * 0.03,
                1
              );
            }
          }
        }

        // If not yet activated, stay frozen
        if (b.energy < 0.01) continue;

        // Apply boid rules scaled by energy
        let cohX = 0, cohY = 0, cohCount = 0;
        let aliVx = 0, aliVy = 0, aliCount = 0;
        let sepX = 0, sepY = 0;

        for (let j = 0; j < boids.length; j++) {
          if (i === j) continue;
          const other = boids[j];
          const dx = other.x - b.x;
          const dy = other.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < VISUAL_RANGE) {
            cohX += other.x;
            cohY += other.y;
            cohCount++;

            aliVx += other.vx;
            aliVy += other.vy;
            aliCount++;

            if (dist < separationDist) {
              sepX -= dx;
              sepY -= dy;
            }
          }
        }

        const e = b.energy;

        if (cohCount > 0) {
          cohX /= cohCount;
          cohY /= cohCount;
          b.vx += (cohX - b.x) * cohesion * e;
          b.vy += (cohY - b.y) * cohesion * e;
        }

        if (aliCount > 0) {
          aliVx /= aliCount;
          aliVy /= aliCount;
          b.vx += (aliVx - b.vx) * ALIGNMENT_FACTOR * e;
          b.vy += (aliVy - b.vy) * ALIGNMENT_FACTOR * e;
        }

        b.vx += sepX * SEPARATION_FACTOR * e;
        b.vy += sepY * SEPARATION_FACTOR * e;

        // Audio pulse
        if (pulseForce > 0.01) {
          const dxC = b.x - cx;
          const dyC = b.y - cy;
          const distC = Math.sqrt(dxC * dxC + dyC * dyC) || 1;
          b.vx += (dxC / distC) * pulseForce * e;
          b.vy += (dyC / distC) * pulseForce * e;
        }

        // Edge avoidance
        if (b.x < EDGE_MARGIN) b.vx += EDGE_TURN * e;
        if (b.x > w - EDGE_MARGIN) b.vx -= EDGE_TURN * e;
        if (b.y < EDGE_MARGIN) b.vy += EDGE_TURN * e;
        if (b.y > h - EDGE_MARGIN) b.vy -= EDGE_TURN * e;

        // Clamp speed (scaled by energy)
        const effMaxSpeed = maxSpeed * e;
        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (speed > effMaxSpeed) {
          b.vx = (b.vx / speed) * effMaxSpeed;
          b.vy = (b.vy / speed) * effMaxSpeed;
        }

        // Minimum speed only for sufficiently energized boids
        if (e > 0.3) {
          const MIN_SPEED = 0.5 * e;
          if (speed < MIN_SPEED && speed > 0) {
            b.vx = (b.vx / speed) * MIN_SPEED;
            b.vy = (b.vy / speed) * MIN_SPEED;
          }
        }

        b.x += b.vx;
        b.y += b.vy;
      }
    }

    function draw() {
      const vol = volumeRef.current;
      const rect = canvas!.getBoundingClientRect();
      const maxSpeed = BASE_MAX_SPEED + vol * 4;

      ctx!.clearRect(0, 0, rect.width, rect.height);

      // Global glow on sound
      if (vol > 0.05) {
        const gx = rect.width / 2;
        const gy = rect.height / 2;
        const gradient = ctx!.createRadialGradient(
          gx, gy, 0, gx, gy, rect.width * 0.5
        );
        gradient.addColorStop(0, `rgba(249, 115, 22, ${vol * 0.08})`);
        gradient.addColorStop(1, "transparent");
        ctx!.fillStyle = gradient;
        ctx!.fillRect(0, 0, rect.width, rect.height);
      }

      for (const b of boids) {
        const e = b.energy;
        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);

        // Frozen boids: just a dim dot
        if (e < 0.01) {
          ctx!.fillStyle = "rgba(249, 115, 22, 0.15)";
          ctx!.beginPath();
          ctx!.arc(b.x, b.y, 1.5, 0, Math.PI * 2);
          ctx!.fill();
          continue;
        }

        const baseAlpha = 0.15 + e * (0.3 + (speed / maxSpeed) * 0.4);
        const alpha = Math.min(baseAlpha + vol * 0.3, 1);
        const radius = 1.5 + e * (1.5 + vol * 1.5);

        ctx!.fillStyle = `rgba(249, 115, 22, ${alpha})`;
        ctx!.beginPath();
        ctx!.arc(b.x, b.y, radius, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Connection lines
      const lineAlpha = 0.04 + vol * 0.08;
      const lineRange = 40 + vol * 20;
      ctx!.strokeStyle = `rgba(249, 115, 22, ${lineAlpha})`;
      ctx!.lineWidth = 0.5 + vol;
      for (let i = 0; i < boids.length; i++) {
        if (boids[i].energy < 0.2) continue;
        for (let j = i + 1; j < boids.length; j++) {
          if (boids[j].energy < 0.2) continue;
          const dx = boids[i].x - boids[j].x;
          const dy = boids[i].y - boids[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < lineRange) {
            ctx!.beginPath();
            ctx!.moveTo(boids[i].x, boids[i].y);
            ctx!.lineTo(boids[j].x, boids[j].y);
            ctx!.stroke();
          }
        }
      }
    }

    function loop() {
      update();
      draw();
      animationId = requestAnimationFrame(loop);
    }

    // Mouse tracking relative to the section
    function handleMouseMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        active: true,
      };
    }
    function handleMouseLeave() {
      mouseRef.current.active = false;
    }

    wrapper!.addEventListener("mousemove", handleMouseMove);
    wrapper!.addEventListener("mouseleave", handleMouseLeave);

    init();
    loop();

    const handleResize = () => resize();
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
      wrapper!.removeEventListener("mousemove", handleMouseMove);
      wrapper!.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioContextRef.current?.close();
    };
  }, []);

  return (
    <div ref={wrapperRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className={`pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-500 ${hidden ? "opacity-0" : "opacity-100"}`}
        aria-hidden="true"
      />
      <div className="absolute bottom-6 right-6 z-10 flex items-center gap-2">
        {/* Info popup */}
        {infoOpen && (
          <div
            onClick={() => setInfoOpen(false)}
            className="absolute bottom-full right-0 mb-3 w-72 cursor-pointer rounded-xl border border-white/10 bg-blue-dark/95 p-4 text-sm leading-relaxed text-gray-300 shadow-xl backdrop-blur-md transition-opacity"
          >
            <p className="mb-2 font-semibold text-orange-brand">
              Murmuration
            </p>
            <p>
              Cette animation s&apos;inspire de la murmuration des
              étourneaux&nbsp;: des milliers d&apos;oiseaux qui se coordonnent
              sans chef d&apos;orchestre, créant des formes collectives
              spectaculaires.
            </p>
            <p className="mt-2">
              C&apos;est exactement ce que produit une bonne facilitation&nbsp;:
              quand les bonnes conditions sont réunies, l&apos;intelligence
              collective émerge naturellement.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Passez votre souris pour réveiller les particules. Activez le micro
              pour les voir réagir à votre voix.
            </p>
            <div
              className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 border-b border-r border-white/10 bg-blue-dark/95"
              aria-hidden="true"
            />
          </div>
        )}

        {/* Visibility toggle */}
        <button
          onClick={() => setHidden(!hidden)}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-blue-dark/80 text-gray-400 backdrop-blur-sm transition-all hover:border-orange-brand/30 hover:text-orange-brand"
          aria-label={hidden ? "Afficher l'animation" : "Masquer l'animation"}
        >
          {hidden ? (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
            </svg>
          )}
        </button>

        {/* ? button */}
        <button
          onClick={() => setInfoOpen(!infoOpen)}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-blue-dark/80 text-xs text-gray-400 backdrop-blur-sm transition-all hover:border-orange-brand/30 hover:text-orange-brand"
          aria-label="En savoir plus sur cette animation"
        >
          ?
        </button>

        {/* Mic toggle */}
        <button
          onClick={toggleMic}
          className={`flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition-all ${
            micActive
              ? "border border-orange-brand/30 bg-blue-dark/80 text-orange-brand hover:border-red-400/30 hover:text-red-400"
              : "border border-white/10 bg-blue-dark/80 text-gray-400 hover:border-orange-brand/30 hover:text-orange-brand"
          }`}
          aria-label={micActive ? "Désactiver le micro" : "Activer le micro"}
        >
          {micActive ? (
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-brand opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-orange-brand" />
            </span>
          ) : (
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
