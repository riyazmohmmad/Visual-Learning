import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Activity } from 'lucide-react';

interface Props {
  onInteraction?: () => void;
  onRecordProgress?: (timeSeconds: number, completed: boolean, params: any) => void;
}

export const PendulumSimulation: React.FC<Props> = ({ onInteraction, onRecordProgress }) => {
  const [length, setLength] = useState<number>(2.0); // meters
  const [gravity, setGravity] = useState<number>(9.8); // m/s²
  const [mass, setMass] = useState<number>(1.5); // kg
  const [initialAngleDeg, setInitialAngleDeg] = useState<number>(30); // degrees
  const [damping, setDamping] = useState<number>(0.05); // damping coefficient
  const [isRunning, setIsRunning] = useState<boolean>(false);

  // Dynamic simulation state: angle theta (radians), angular velocity omega (rad/s)
  const [theta, setTheta] = useState<number>((30 * Math.PI) / 180);
  const [omega, setOmega] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const startTimeRef = useRef<number>(Date.now());

  // Analytical Period for small angles: T = 2*pi*sqrt(L/g)
  const theoreticalPeriod = 2 * Math.PI * Math.sqrt(Math.max(0.1, length) / Math.max(0.1, gravity));
  const frequency = 1 / theoreticalPeriod;

  // Real-time Energies
  const thetaRad = theta;
  // Height above lowest point: h = L * (1 - cos(theta))
  const height = length * (1 - Math.cos(thetaRad));
  const potentialEnergy = mass * gravity * Math.max(0, height);
  const linearVelocity = length * omega;
  const kineticEnergy = 0.5 * mass * linearVelocity * linearVelocity;
  const totalEnergy = potentialEnergy + kineticEnergy;

  // Runge-Kutta 4th order (RK4) integration for real-time pendulum physics
  const getDerivatives = (th: number, om: number) => {
    // d(theta)/dt = omega
    // d(omega)/dt = -(g/L)*sin(theta) - damping * omega
    const dTheta = om;
    const dOmega = -(gravity / length) * Math.sin(th) - damping * om;
    return { dTheta, dOmega };
  };

  useEffect(() => {
    const loop = (now: number) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.04);
      lastTimeRef.current = now;

      if (isRunning) {
        setTheta((curTh) => {
          setOmega((curOm) => {
            // RK4 integration
            const k1 = getDerivatives(curTh, curOm);
            const k2 = getDerivatives(curTh + 0.5 * dt * k1.dTheta, curOm + 0.5 * dt * k1.dOmega);
            const k3 = getDerivatives(curTh + 0.5 * dt * k2.dTheta, curOm + 0.5 * dt * k2.dOmega);
            const k4 = getDerivatives(curTh + dt * k3.dTheta, curOm + dt * k3.dOmega);

            const nextOm = curOm + (dt / 6) * (k1.dOmega + 2 * k2.dOmega + 2 * k3.dOmega + k4.dOmega);
            const nextTh = curTh + (dt / 6) * (k1.dTheta + 2 * k2.dTheta + 2 * k3.dTheta + k4.dTheta);

            // Notify parent on periodic completion
            return nextOm;
          });

          const k1 = getDerivatives(curTh, omega);
          const nextTh = curTh + dt * k1.dTheta;
          return nextTh;
        });

        setElapsedTime((prev) => prev + dt);
      }

      requestRef.current = requestAnimationFrame(loop);
    };

    lastTimeRef.current = performance.now();
    requestRef.current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isRunning, gravity, length, damping]);

  // Canvas drawing
  const canvasWidth = 600;
  const canvasHeight = 340;
  const pivotX = canvasWidth / 2;
  const pivotY = 50;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Dark sleek background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Support ceiling bracket
    ctx.fillStyle = '#334155';
    ctx.fillRect(pivotX - 50, pivotY - 14, 100, 14);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.strokeRect(pivotX - 50, pivotY - 14, 100, 14);

    // Pivot bearing
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 6, 0, Math.PI * 2);
    ctx.fill();

    // Equilibrium reference line (dashed vertical)
    ctx.save();
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.5)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(pivotX, pivotY + 230);
    ctx.stroke();
    ctx.restore();

    // Scale length: 2m maps to ~190px
    const pixelLength = Math.min(220, Math.max(90, length * 75));
    const bobX = pivotX + pixelLength * Math.sin(theta);
    const bobY = pivotY + pixelLength * Math.cos(theta);

    // String / Rod
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(bobX, bobY);
    ctx.stroke();

    // Arc track indicating angle
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.beginPath();
    const startAngle = Math.PI / 2;
    const endAngle = Math.PI / 2 - theta;
    ctx.arc(pivotX, pivotY, 45, Math.min(startAngle, endAngle), Math.max(startAngle, endAngle));
    ctx.stroke();
    ctx.restore();

    // Bob shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(bobX, canvasHeight - 25, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bob body
    const bobRadius = Math.min(22, Math.max(12, 10 + mass * 4));
    const gradient = ctx.createRadialGradient(bobX - 4, bobY - 4, 2, bobX, bobY, bobRadius);
    gradient.addColorStop(0, '#38bdf8');
    gradient.addColorStop(1, '#0284c7');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(bobX, bobY, bobRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Velocity vector arrow from bob
    if (Math.abs(omega) > 0.05) {
      // Perpendicular to string: (cos(theta), -sin(theta)) * v
      const vDirX = Math.cos(theta) * linearVelocity * 10;
      const vDirY = -Math.sin(theta) * linearVelocity * 10;
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(bobX, bobY);
      ctx.lineTo(bobX + vDirX, bobY + vDirY);
      ctx.stroke();
    }
  }, [theta, length, mass, omega, linearVelocity]);

  const handleReset = () => {
    setIsRunning(false);
    const rad = (initialAngleDeg * Math.PI) / 180;
    setTheta(rad);
    setOmega(0);
    setElapsedTime(0);
    if (onInteraction) onInteraction();
  };

  const handlePlayToggle = () => {
    setIsRunning(!isRunning);
    if (!isRunning && onRecordProgress) {
      onRecordProgress(15, true, { length, gravity, mass, period: theoreticalPeriod.toFixed(2) });
    }
    if (onInteraction) onInteraction();
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl text-white">
      {/* Simulation Header */}
      <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-slate-950/70">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">Simple Harmonic Pendulum Simulator</h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Non-linear pendulum with Runge-Kutta numerical integration and dynamic energy transformation.
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="px-3 py-1 rounded-full bg-slate-800 text-cyan-300 border border-slate-700">
            T = 2π√(L/g) = {theoreticalPeriod.toFixed(2)}s
          </span>
          <span className="px-3 py-1 rounded-full bg-slate-800 text-emerald-300 border border-slate-700">
            f = {frequency.toFixed(2)} Hz
          </span>
        </div>
      </div>

      {/* Main Viewport & Energy Meters */}
      <div className="p-4 bg-slate-950 flex flex-col md:flex-row items-center justify-center gap-6">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="w-full max-w-[540px] rounded-xl border border-slate-800/80 shadow-inner"
        />

        {/* Energy Exchange Bar Meters */}
        <div className="w-full md:w-56 bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-4">
          <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">Energy Transformation</div>

          {/* Kinetic Energy */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-rose-400">Kinetic (Ek)</span>
              <span>{kineticEnergy.toFixed(1)} J</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-rose-500 transition-all duration-75"
                style={{ width: `${Math.min(100, (kineticEnergy / Math.max(1, totalEnergy)) * 100)}%` }}
              />
            </div>
          </div>

          {/* Potential Energy */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-cyan-400">Potential (Ep)</span>
              <span>{potentialEnergy.toFixed(1)} J</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 transition-all duration-75"
                style={{ width: `${Math.min(100, (potentialEnergy / Math.max(1, totalEnergy)) * 100)}%` }}
              />
            </div>
          </div>

          {/* Total Mechanical Energy */}
          <div className="pt-2 border-t border-slate-800 text-xs font-mono space-y-1">
            <div className="flex justify-between text-slate-400">
              <span>Total Energy (E):</span>
              <span className="text-amber-300 font-bold">{totalEnergy.toFixed(1)} J</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Angle θ:</span>
              <span className="text-white font-bold">{((theta * 180) / Math.PI).toFixed(1)}°</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Angular Velocity ω:</span>
              <span className="text-white font-bold">{omega.toFixed(2)} rad/s</span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Strip */}
      <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePlayToggle}
            className={`py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              isRunning ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{isRunning ? 'Pause' : 'Start Oscillations'}</span>
          </button>

          <button
            onClick={handleReset}
            className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Position</span>
          </button>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Timer: {elapsedTime.toFixed(1)}s
        </div>
      </div>

      {/* Sliders Deck */}
      <div className="p-6 bg-slate-900 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Length */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">String Length (L)</span>
            <span className="font-mono text-cyan-400 font-bold">{length} m</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="3.5"
            step="0.1"
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
        </div>

        {/* Gravity */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Gravity (g)</span>
            <span className="font-mono text-amber-400 font-bold">{gravity} m/s²</span>
          </div>
          <input
            type="range"
            min="1.6"
            max="25"
            step="0.2"
            value={gravity}
            onChange={(e) => setGravity(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
          />
        </div>

        {/* Release Angle */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Initial Angle (θ₀)</span>
            <span className="font-mono text-rose-400 font-bold">{initialAngleDeg}°</span>
          </div>
          <input
            type="range"
            min="5"
            max="75"
            step="1"
            value={initialAngleDeg}
            onChange={(e) => {
              setInitialAngleDeg(Number(e.target.value));
              const rad = (Number(e.target.value) * Math.PI) / 180;
              setTheta(rad);
              setOmega(0);
            }}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-400"
          />
        </div>

        {/* Damping */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Air Damping (b)</span>
            <span className="font-mono text-emerald-400 font-bold">{damping}</span>
          </div>
          <input
            type="range"
            min="0"
            max="0.2"
            step="0.01"
            value={damping}
            onChange={(e) => setDamping(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
          />
        </div>
      </div>
    </div>
  );
};
