import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, FastForward, Sliders, Compass, Target, ArrowRight } from 'lucide-react';

interface Props {
  onInteraction?: () => void;
  onRecordProgress?: (timeSeconds: number, completed: boolean, params: any) => void;
}

interface TrajectoryPoint {
  x: number; // meters
  y: number; // meters
  t: number; // seconds
  vx: number;
  vy: number;
}

export const ProjectileMotionSimulation: React.FC<Props> = ({ onInteraction, onRecordProgress }) => {
  // Parameters
  const [angleDeg, setAngleDeg] = useState<number>(45); // degrees
  const [initialVelocity, setInitialVelocity] = useState<number>(20); // m/s
  const [gravity, setGravity] = useState<number>(9.8); // m/s²
  const [initialHeight, setInitialHeight] = useState<number>(0); // meters
  const [mass, setMass] = useState<number>(2.0); // kg
  const [simSpeed, setSimSpeed] = useState<number>(1.0); // multiplier

  // State of active playback
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [trajectory, setTrajectory] = useState<TrajectoryPoint[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const startTimeRef = useRef<number>(Date.now());

  // Analytical physics metrics
  const rad = (angleDeg * Math.PI) / 180;
  const v0x = initialVelocity * Math.cos(rad);
  const v0y = initialVelocity * Math.sin(rad);

  // Time of flight: solve 0 = h0 + v0y*t - 0.5*g*t²
  // 0.5*g*t² - v0y*t - h0 = 0 -> quadratic formula: t = (v0y + sqrt(v0y² + 2*g*h0)) / g
  const discriminant = v0y * v0y + 2 * gravity * initialHeight;
  const timeOfFlight = (v0y + Math.sqrt(Math.max(0, discriminant))) / gravity;
  const maxRange = v0x * timeOfFlight;
  const timeAtPeak = Math.max(0, v0y / gravity);
  const maxHeight = initialHeight + (v0y * v0y) / (2 * gravity);

  // Current physical state at currentTime
  const currentT = Math.min(currentTime, timeOfFlight);
  const currentX = v0x * currentT;
  const currentY = Math.max(0, initialHeight + v0y * currentT - 0.5 * gravity * currentT * currentT);
  const currentVx = v0x;
  const currentVy = v0y - gravity * currentT;
  const currentSpeed = Math.sqrt(currentVx * currentVx + currentVy * currentVy);

  // Canvas bounds setup
  const canvasWidth = 640;
  const canvasHeight = 360;
  const originX = 50;
  const groundY = 310;

  // Dynamic scaling based on range and height
  const scaleX = Math.min(12, Math.max(2, (canvasWidth - 100) / Math.max(30, maxRange * 1.15)));
  const scaleY = Math.min(12, Math.max(2, (groundY - 50) / Math.max(20, maxHeight * 1.25)));
  const scale = Math.min(scaleX, scaleY);

  const toCanvasX = (mX: number) => originX + mX * scale;
  const toCanvasY = (mY: number) => groundY - mY * scale;

  // Animation Loop
  useEffect(() => {
    const loop = (now: number) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = now;

      if (isRunning) {
        setCurrentTime((prevT) => {
          const nextT = prevT + dt * simSpeed;
          if (nextT >= timeOfFlight) {
            setIsRunning(false);
            if (onRecordProgress) {
              const elapsedSec = Math.round((Date.now() - startTimeRef.current) / 1000);
              onRecordProgress(Math.max(5, elapsedSec), true, {
                angle: angleDeg,
                v0: initialVelocity,
                gravity,
                mass,
                range: maxRange.toFixed(2),
              });
            }
            return timeOfFlight;
          }
          return nextT;
        });
      }

      requestRef.current = requestAnimationFrame(loop);
    };

    lastTimeRef.current = performance.now();
    requestRef.current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isRunning, simSpeed, timeOfFlight, angleDeg, initialVelocity, gravity, mass, maxRange, onRecordProgress]);

  // Keep trajectory history updated
  useEffect(() => {
    if (currentTime > 0) {
      setTrajectory((prev) => {
        const last = prev[prev.length - 1];
        if (!last || Math.abs(last.t - currentT) > 0.03) {
          return [...prev, { x: currentX, y: currentY, t: currentT, vx: currentVx, vy: currentVy }];
        }
        return prev;
      });
    }
  }, [currentT, currentX, currentY, currentVx, currentVy]);

  // Render to Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Deep slate background
    ctx.fillStyle = '#0a0f1d';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Coordinate grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let x = originX; x < canvasWidth; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 20);
      ctx.lineTo(x, groundY);
      ctx.stroke();
    }
    for (let y = groundY; y >= 20; y -= 40) {
      ctx.beginPath();
      ctx.moveTo(originX, y);
      ctx.lineTo(canvasWidth - 20, y);
      ctx.stroke();
    }

    // Ground line
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, groundY);
    ctx.lineTo(canvasWidth - 20, groundY);
    ctx.stroke();

    // Ground measurement ticks
    ctx.fillStyle = '#64748b';
    ctx.font = '10px "JetBrains Mono", monospace';
    const distStep = Math.max(5, Math.round(maxRange / 6));
    for (let d = 0; d <= maxRange * 1.2; d += distStep) {
      const cx = toCanvasX(d);
      if (cx > canvasWidth - 30) break;
      ctx.beginPath();
      ctx.moveTo(cx, groundY);
      ctx.lineTo(cx, groundY + 6);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillText(`${d}m`, cx - 10, groundY + 20);
    }

    // Launch Cannon Platform
    const launchBaseX = toCanvasX(0);
    const launchBaseY = toCanvasY(initialHeight);
    ctx.fillStyle = '#475569';
    ctx.fillRect(launchBaseX - 16, launchBaseY, 20, groundY - launchBaseY);

    // Cannon barrel angled
    ctx.save();
    ctx.translate(launchBaseX, launchBaseY);
    ctx.rotate(-rad);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, -5, 24, 10);
    ctx.restore();

    // Theoretical Full Parabola Arc (dashed guide)
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let stepT = 0; stepT <= timeOfFlight; stepT += 0.05) {
      const px = v0x * stepT;
      const py = initialHeight + v0y * stepT - 0.5 * gravity * stepT * stepT;
      const cx = toCanvasX(px);
      const cy = toCanvasY(py);
      if (stepT === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    ctx.restore();

    // Drawn active trajectory trail
    if (trajectory.length > 1) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      trajectory.forEach((pt, idx) => {
        const cx = toCanvasX(pt.x);
        const cy = toCanvasY(pt.y);
        if (idx === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.stroke();
    }

    // Peak altitude marker
    if (timeAtPeak <= timeOfFlight) {
      const peakX = toCanvasX(v0x * timeAtPeak);
      const peakY = toCanvasY(maxHeight);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(peakX, peakY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(`Max H: ${maxHeight.toFixed(1)}m`, peakX - 25, peakY - 10);
    }

    // The Projectile (Cannonball)
    const ballX = toCanvasX(currentX);
    const ballY = toCanvasY(currentY);

    // Ball shadow on ground
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(ballX, groundY, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cannonball body
    const ballRadius = Math.min(12, Math.max(6, 6 + mass * 1.5));
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(ballX, ballY, ballRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Velocity Vector arrows (Vx and Vy components)
    if (isRunning || currentT > 0) {
      // Vx vector arrow (blue)
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ballX, ballY);
      ctx.lineTo(ballX + currentVx * 1.5, ballY);
      ctx.stroke();

      // Vy vector arrow (emerald / amber)
      ctx.strokeStyle = currentVy >= 0 ? '#10b981' : '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(ballX, ballY);
      ctx.lineTo(ballX, ballY - currentVy * 1.5);
      ctx.stroke();
    }
  }, [trajectory, currentX, currentY, currentVx, currentVy, angleDeg, initialVelocity, gravity, initialHeight, mass, maxHeight, maxRange, scale, timeOfFlight, timeAtPeak, isRunning, rad, v0x, v0y, currentT]);

  const handlePlayPause = () => {
    if (!isRunning && currentTime >= timeOfFlight) {
      handleReset();
      setIsRunning(true);
    } else {
      setIsRunning(!isRunning);
    }
    if (onInteraction) onInteraction();
  };

  const handleReset = () => {
    setIsRunning(false);
    setCurrentTime(0);
    setTrajectory([]);
    startTimeRef.current = Date.now();
    if (onInteraction) onInteraction();
  };

  const handleStep = () => {
    setIsRunning(false);
    setCurrentTime((t) => Math.min(timeOfFlight, t + 0.1));
    if (onInteraction) onInteraction();
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl text-white">
      {/* Simulation Header */}
      <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-slate-950/70">
        <div>
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-rose-400" />
            <h3 className="text-base font-bold text-white">2D Projectile Motion & Kinematics Calculator</h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time differential solver evaluating position r(t), velocity v(t), and acceleration a(t) = (0, -g).
          </p>
        </div>

        {/* Live Status Pill */}
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-mono text-cyan-300">
            t = {currentT.toFixed(2)}s / {timeOfFlight.toFixed(2)}s
          </div>
        </div>
      </div>

      {/* Main Interactive Canvas */}
      <div className="relative bg-slate-950 flex justify-center p-4">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="w-full max-w-[640px] rounded-xl border border-slate-800/80 shadow-inner"
        />

        {/* Instantaneous Readout Overlay */}
        <div className="absolute top-7 left-7 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-3 text-xs shadow-lg space-y-1">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Live Dynamics</div>
          <div className="font-mono text-cyan-300">x = {currentX.toFixed(2)} m</div>
          <div className="font-mono text-emerald-300">y = {currentY.toFixed(2)} m</div>
          <div className="font-mono text-rose-300">|v| = {currentSpeed.toFixed(2)} m/s</div>
          <div className="font-mono text-slate-400 text-[11px]">
            vx: {currentVx.toFixed(1)} | vy: {currentVy.toFixed(1)}
          </div>
        </div>

        {/* Analytical Totals Overlay */}
        <div className="absolute top-7 right-7 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-3 text-xs shadow-lg space-y-1 text-right">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Analytical Trajectory</div>
          <div className="font-mono text-amber-300">Max Height: {maxHeight.toFixed(2)} m</div>
          <div className="font-mono text-blue-300">Total Range: {maxRange.toFixed(2)} m</div>
          <div className="font-mono text-slate-400">Total Time: {timeOfFlight.toFixed(2)} s</div>
        </div>
      </div>

      {/* Playback Controls Strip */}
      <div className="px-6 py-3 bg-slate-950 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePlayPause}
            className={`py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
              isRunning ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{isRunning ? 'Pause' : currentTime >= timeOfFlight ? 'Launch Again' : 'Launch'}</span>
          </button>

          <button
            onClick={handleStep}
            disabled={isRunning || currentTime >= timeOfFlight}
            className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <FastForward className="w-3.5 h-3.5" />
            <span>Step (0.1s)</span>
          </button>

          <button
            onClick={handleReset}
            className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>

        {/* Speed Controls */}
        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
          <span>Speed:</span>
          {[0.5, 1.0, 2.0].map((spd) => (
            <button
              key={spd}
              onClick={() => setSimSpeed(spd)}
              className={`px-2.5 py-1 rounded-lg border text-xs font-mono transition-colors ${
                simSpeed === spd
                  ? 'bg-blue-600 text-white border-blue-500 font-bold'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>
      </div>

      {/* Physics Sliders / Variable Deck */}
      <div className="p-6 bg-slate-900 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Angle Slider */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Launch Angle (θ)</span>
            <span className="font-mono text-rose-400 font-bold">{angleDeg}°</span>
          </div>
          <input
            type="range"
            min="5"
            max="85"
            step="1"
            value={angleDeg}
            onChange={(e) => {
              setAngleDeg(Number(e.target.value));
              handleReset();
            }}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
          />
          <p className="text-[11px] text-slate-500">Optimum range at 45° without drag.</p>
        </div>

        {/* Initial Velocity */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Initial Speed (v₀)</span>
            <span className="font-mono text-cyan-400 font-bold">{initialVelocity} m/s</span>
          </div>
          <input
            type="range"
            min="5"
            max="50"
            step="1"
            value={initialVelocity}
            onChange={(e) => {
              setInitialVelocity(Number(e.target.value));
              handleReset();
            }}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
          <p className="text-[11px] text-slate-500">Muzzle velocity of the cannon.</p>
        </div>

        {/* Gravity Slider */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Gravitational Accel (g)</span>
            <span className="font-mono text-amber-400 font-bold">{gravity} m/s²</span>
          </div>
          <input
            type="range"
            min="1.6"
            max="25"
            step="0.2"
            value={gravity}
            onChange={(e) => {
              setGravity(Number(e.target.value));
              handleReset();
            }}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
          <p className="text-[11px] text-slate-500">Earth: 9.8 | Moon: 1.62 | Jupiter: 24.8</p>
        </div>

        {/* Mass Slider */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Mass (m)</span>
            <span className="font-mono text-emerald-400 font-bold">{mass} kg</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="10"
            step="0.5"
            value={mass}
            onChange={(e) => {
              setMass(Number(e.target.value));
              if (onInteraction) onInteraction();
            }}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
          <p className="text-[11px] text-slate-500">Affects projectile size and momentum.</p>
        </div>
      </div>
    </div>
  );
};
