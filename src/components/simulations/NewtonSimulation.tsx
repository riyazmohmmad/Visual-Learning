import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Activity, ArrowRight, Gauge, HelpCircle } from 'lucide-react';

interface Props {
  onInteraction?: () => void;
}

export const NewtonSimulation: React.FC<Props> = ({ onInteraction }) => {
  const [mass, setMass] = useState<number>(5); // kg
  const [appliedForce, setAppliedForce] = useState<number>(30); // N
  const [frictionCoeff, setFrictionCoeff] = useState<number>(0.1); // mu
  const [isRunning, setIsRunning] = useState<boolean>(false);

  // Physical dynamic state
  const [position, setPosition] = useState<number>(50); // pixels across track
  const [velocity, setVelocity] = useState<number>(0); // m/s
  const [acceleration, setAcceleration] = useState<number>(0); // m/s²
  const [netForce, setNetForce] = useState<number>(0); // N

  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Compute instantaneous net force and acceleration
  const computePhysics = (currentV: number, fApplied: number, m: number, mu: number) => {
    const g = 9.8; // m/s²
    const normalForce = m * g;
    const maxFriction = mu * normalForce;

    let friction = 0;
    if (Math.abs(currentV) > 0.05) {
      // Kinetic friction opposes velocity direction
      friction = -Math.sign(currentV) * maxFriction;
    } else {
      // Static friction opposes applied force up to maxFriction
      if (Math.abs(fApplied) <= maxFriction) {
        friction = -fApplied;
      } else {
        friction = -Math.sign(fApplied) * maxFriction;
      }
    }

    const netF = fApplied + friction;
    const a = netF / m;
    return { netF, a, friction };
  };

  useEffect(() => {
    const { netF, a } = computePhysics(velocity, appliedForce, mass, frictionCoeff);
    setNetForce(netF);
    setAcceleration(a);
  }, [mass, appliedForce, frictionCoeff, velocity]);

  // Main animation simulation loop
  useEffect(() => {
    const updatePhysics = (now: number) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05); // cap at 50ms
      lastTimeRef.current = now;

      if (isRunning) {
        setPosition((prevPos) => {
          const { netF, a } = computePhysics(velocity, appliedForce, mass, frictionCoeff);
          const nextV = velocity + a * dt;
          setVelocity(nextV);

          // Track limits: 40px to 620px
          let nextPos = prevPos + nextV * 40 * dt;
          if (nextPos > 620) {
            nextPos = 620;
            setVelocity(-nextV * 0.4); // bouncy rebound
          } else if (nextPos < 40) {
            nextPos = 40;
            setVelocity(-nextV * 0.4);
          }
          return nextPos;
        });
      }

      requestRef.current = requestAnimationFrame(updatePhysics);
    };

    lastTimeRef.current = performance.now();
    requestRef.current = requestAnimationFrame(updatePhysics);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isRunning, velocity, appliedForce, mass, frictionCoeff]);

  // Canvas renderer for high-fps crisp graphics
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Ground Track
    const groundY = height - 50;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, groundY);
    ctx.lineTo(width - 20, groundY);
    ctx.stroke();

    // Measurement ticks
    ctx.fillStyle = '#64748b';
    ctx.font = '10px "JetBrains Mono"';
    for (let x = 40; x <= width - 40; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, groundY);
      ctx.lineTo(x, groundY + 8);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const meter = ((x - 40) / 60).toFixed(0);
      ctx.fillText(`${meter}m`, x - 8, groundY + 22);
    }

    // Draw Cart
    const cartWidth = 50 + mass * 2.5;
    const cartHeight = 36;
    const cartX = position;
    const cartY = groundY - cartHeight - 12;

    // Cart body gradient
    const grad = ctx.createLinearGradient(cartX, cartY, cartX, cartY + cartHeight);
    grad.addColorStop(0, '#0284c7');
    grad.addColorStop(1, '#0369a1');
    ctx.fillStyle = grad;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cartX, cartY, cartWidth, cartHeight, 6);
    ctx.fill();
    ctx.stroke();

    // Cart Wheels
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    const wheelY = groundY - 6;
    // Left wheel
    ctx.beginPath();
    ctx.arc(cartX + 14, wheelY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Right wheel
    ctx.beginPath();
    ctx.arc(cartX + cartWidth - 14, wheelY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Mass text inside cart
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 12px "Plus Jakarta Sans"';
    ctx.textAlign = 'center';
    ctx.fillText(`${mass} kg`, cartX + cartWidth / 2, cartY + 22);

    // Vector Arrows
    const centerY = cartY + cartHeight / 2;

    // Applied Force Vector (Cyan Arrow)
    if (appliedForce !== 0) {
      const arrowLength = Math.max(15, Math.min(140, Math.abs(appliedForce) * 2));
      const arrowDir = Math.sign(appliedForce);
      const startX = arrowDir > 0 ? cartX + cartWidth : cartX;
      const endX = startX + arrowDir * arrowLength;

      ctx.strokeStyle = '#06b6d4';
      ctx.fillStyle = '#06b6d4';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(startX, centerY);
      ctx.lineTo(endX, centerY);
      ctx.stroke();

      // Arrow head
      ctx.beginPath();
      ctx.moveTo(endX, centerY);
      ctx.lineTo(endX - arrowDir * 8, centerY - 6);
      ctx.lineTo(endX - arrowDir * 8, centerY + 6);
      ctx.closePath();
      ctx.fill();

      // Label
      ctx.font = '11px "JetBrains Mono"';
      ctx.fillText(`F_app = ${appliedForce} N`, (startX + endX) / 2, centerY - 10);
    }

    // Velocity Indicator
    if (Math.abs(velocity) > 0.1) {
      ctx.fillStyle = '#10b981';
      ctx.font = '11px "JetBrains Mono"';
      ctx.fillText(`v = ${velocity.toFixed(2)} m/s`, cartX + cartWidth / 2, cartY - 10);
    }
  }, [position, mass, appliedForce, velocity]);

  const handleReset = () => {
    setIsRunning(false);
    setPosition(50);
    setVelocity(0);
    setNetForce(0);
    setAcceleration(0);
  };

  const handleSliderChange = () => {
    if (onInteraction) onInteraction();
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      {/* Simulation Stage Header */}
      <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-slate-900/80">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-semibold text-white">Newton&apos;s Second Law Interactive Sandbox</h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Explore how Force (N) and Mass (kg) determine Acceleration (F = ma)</p>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setIsRunning(!isRunning);
              if (onInteraction) onInteraction();
            }}
            className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors ${
              isRunning
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold'
            }`}
          >
            {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isRunning ? 'Pause Engine' : 'Run Simulation'}
          </button>
          <button
            onClick={handleReset}
            className="p-2 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            title="Reset to origin"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="relative bg-slate-950 flex justify-center p-3">
        <canvas
          ref={canvasRef}
          width={680}
          height={260}
          className="w-full max-w-[680px] h-[260px] rounded-lg shadow-inner"
        />

        {/* Floating Telemetry HUD */}
        <div className="absolute top-6 right-6 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-lg p-3 text-xs space-y-1.5 shadow-lg min-w-[160px]">
          <div className="flex justify-between items-center text-slate-400">
            <span>Net Force:</span>
            <span className="font-mono text-cyan-300 font-semibold">{netForce.toFixed(1)} N</span>
          </div>
          <div className="flex justify-between items-center text-slate-400">
            <span>Acceleration:</span>
            <span className="font-mono text-emerald-400 font-semibold">{acceleration.toFixed(2)} m/s²</span>
          </div>
          <div className="flex justify-between items-center text-slate-400">
            <span>Velocity:</span>
            <span className="font-mono text-amber-300 font-semibold">{velocity.toFixed(2)} m/s</span>
          </div>
        </div>
      </div>

      {/* Control & Concept Deck */}
      <div className="p-6 bg-slate-900 grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-slate-800">
        {/* Mass Slider */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Cart Mass (m)</span>
            <span className="font-mono text-cyan-400 font-semibold">{mass} kg</span>
          </div>
          <input
            type="range"
            min="1"
            max="20"
            step="1"
            value={mass}
            onChange={(e) => {
              setMass(Number(e.target.value));
              handleSliderChange();
            }}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
          <p className="text-[11px] text-slate-400">Heavier objects resist acceleration (Inertia).</p>
        </div>

        {/* Applied Force Slider */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Applied Force (F)</span>
            <span className="font-mono text-cyan-400 font-semibold">{appliedForce} N</span>
          </div>
          <input
            type="range"
            min="-80"
            max="80"
            step="5"
            value={appliedForce}
            onChange={(e) => {
              setAppliedForce(Number(e.target.value));
              handleSliderChange();
            }}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
          <p className="text-[11px] text-slate-400">Positive pulls right; negative pulls left.</p>
        </div>

        {/* Friction Coefficient */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Surface Friction (μ)</span>
            <span className="font-mono text-cyan-400 font-semibold">{frictionCoeff.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="0.4"
            step="0.05"
            value={frictionCoeff}
            onChange={(e) => {
              setFrictionCoeff(Number(e.target.value));
              handleSliderChange();
            }}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
          <p className="text-[11px] text-slate-400">μ = 0.00 represents a frictionless ice surface.</p>
        </div>
      </div>

      {/* Guided Takeaway Bar */}
      <div className="px-6 py-3 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-cyan-400" />
          <span>Formula: <span className="font-mono text-cyan-300">a = F_net / m</span></span>
        </div>
        <span className="text-slate-400">
          Try doubling the mass and observe that acceleration is halved!
        </span>
      </div>
    </div>
  );
};
