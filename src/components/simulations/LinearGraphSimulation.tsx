import React, { useState } from 'react';
import { TrendingUp, RefreshCw, Compass, CheckCircle2 } from 'lucide-react';

interface Props {
  onInteraction?: () => void;
}

export const LinearGraphSimulation: React.FC<Props> = ({ onInteraction }) => {
  const [slope, setSlope] = useState<number>(2); // m
  const [intercept, setIntercept] = useState<number>(1); // b
  const [mode, setMode] = useState<'linear' | 'quadratic'>('linear');
  const [quadA, setQuadA] = useState<number>(0.5); // a
  const [testCoordX, setTestCoordX] = useState<number>(2);

  // Coordinate plane dimensions: -10 to +10
  const width = 500;
  const height = 320;
  const originX = width / 2;
  const originY = height / 2;
  const scale = 20; // 20px per coordinate unit

  const toScreenX = (x: number) => originX + x * scale;
  const toScreenY = (y: number) => originY - y * scale;

  // Linear endpoints: x = -12 to +12
  const x1 = -12;
  const y1 = slope * x1 + intercept;
  const x2 = 12;
  const y2 = slope * x2 + intercept;

  // Intercept calculation
  const yInterceptCoord = `(0, ${intercept.toFixed(1)})`;
  const xInterceptVal = slope !== 0 ? (-intercept / slope).toFixed(2) : 'None (Parallel)';

  // Quadratic path generation
  const generateParabolaPath = () => {
    const points: string[] = [];
    for (let x = -10; x <= 10; x += 0.4) {
      const y = quadA * Math.pow(x, 2) + intercept;
      const sx = toScreenX(x);
      const sy = toScreenY(y);
      if (points.length === 0) {
        points.push(`M ${sx} ${sy}`);
      } else {
        points.push(`L ${sx} ${sy}`);
      }
    }
    return points.join(' ');
  };

  const handleSlopeChange = (val: number) => {
    setSlope(val);
    if (onInteraction) onInteraction();
  };

  const handleInterceptChange = (val: number) => {
    setIntercept(val);
    if (onInteraction) onInteraction();
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      {/* Simulation Header */}
      <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-slate-900/80">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-semibold text-white">Dynamic Cartesian Coordinate Grapher</h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Explore how slope (m) and intercept (b) transform the line in real-time</p>
        </div>

        {/* Mode Selector */}
        <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
          <button
            onClick={() => setMode('linear')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'linear' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Linear (y = mx + b)
          </button>
          <button
            onClick={() => setMode('quadratic')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'quadratic' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Parabolic (y = ax² + b)
          </button>
        </div>
      </div>

      {/* Main Grid Viewport */}
      <div className="relative bg-slate-950 flex justify-center p-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[540px] drop-shadow-md">
          {/* Background grid */}
          <rect width={width} height={height} fill="#090d16" rx="8" />

          {/* Grid lines (-10 to 10) */}
          {Array.from({ length: 25 }, (_, i) => i - 12).map((coord) => (
            <g key={coord}>
              {/* Vertical grid line */}
              <line
                x1={toScreenX(coord)}
                y1={0}
                x2={toScreenX(coord)}
                y2={height}
                stroke={coord === 0 ? '#475569' : '#1e293b'}
                strokeWidth={coord === 0 ? 2 : 1}
              />
              {/* Horizontal grid line */}
              <line
                x1={0}
                y1={toScreenY(coord)}
                x2={width}
                y2={toScreenY(coord)}
                stroke={coord === 0 ? '#475569' : '#1e293b'}
                strokeWidth={coord === 0 ? 2 : 1}
              />
            </g>
          ))}

          {/* Coordinate Axis Labels */}
          <text x={width - 24} y={originY - 8} fill="#94a3b8" fontSize="11" fontFamily="JetBrains Mono">+X</text>
          <text x={originX + 8} y={20} fill="#94a3b8" fontSize="11" fontFamily="JetBrains Mono">+Y</text>

          {/* The Function Graph Line */}
          {mode === 'linear' ? (
            <line
              x1={toScreenX(x1)}
              y1={toScreenY(y1)}
              x2={toScreenX(x2)}
              y2={toScreenY(y2)}
              stroke="#38bdf8"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          ) : (
            <path
              d={generateParabolaPath()}
              fill="none"
              stroke="#a855f7"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          )}

          {/* Highlight Y-Intercept point */}
          <circle
            cx={toScreenX(0)}
            cy={toScreenY(intercept)}
            r="6"
            fill="#10b981"
            stroke="#ffffff"
            strokeWidth="2"
          />
          <text
            x={toScreenX(0) + 12}
            y={toScreenY(intercept) - 8}
            fill="#34d399"
            fontSize="10"
            fontFamily="JetBrains Mono"
            fontWeight="bold"
          >
            {yInterceptCoord}
          </text>

          {/* Highlight Slope Triangle if in Linear mode */}
          {mode === 'linear' && slope !== 0 && (
            <polygon
              points={`
                ${toScreenX(0)},${toScreenY(intercept)} 
                ${toScreenX(2)},${toScreenY(intercept)} 
                ${toScreenX(2)},${toScreenY(intercept + slope * 2)}
              `}
              fill="#0284c7"
              fillOpacity="0.25"
              stroke="#0ea5e9"
              strokeDasharray="3 3"
              strokeWidth="1.5"
            />
          )}
        </svg>

        {/* Live Equation Badge */}
        <div className="absolute top-7 left-7 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-lg px-3 py-2 text-xs shadow-lg">
          <div className="text-[11px] text-slate-400">Current Equation:</div>
          <div className="font-mono text-sm font-bold text-cyan-300">
            {mode === 'linear'
              ? `y = ${slope === 0 ? '' : `${slope}x`} ${intercept >= 0 ? `+ ${intercept}` : `- ${Math.abs(intercept)}`}`
              : `y = ${quadA}x² ${intercept >= 0 ? `+ ${intercept}` : `- ${Math.abs(intercept)}`}`}
          </div>
        </div>
      </div>

      {/* Control Deck */}
      <div className="p-6 bg-slate-900 grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-slate-800">
        {mode === 'linear' ? (
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-300 font-medium">Slope / Gradient (m)</span>
              <span className="font-mono text-cyan-400 font-semibold">{slope}</span>
            </div>
            <input
              type="range"
              min="-4"
              max="4"
              step="0.5"
              value={slope}
              onChange={(e) => handleSlopeChange(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <p className="text-[11px] text-slate-400">Steepness: Rise over Run (Δy / Δx).</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-300 font-medium">Curvature (a)</span>
              <span className="font-mono text-purple-400 font-semibold">{quadA}</span>
            </div>
            <input
              type="range"
              min="-2"
              max="2"
              step="0.25"
              value={quadA}
              onChange={(e) => {
                setQuadA(Number(e.target.value));
                if (onInteraction) onInteraction();
              }}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-400"
            />
            <p className="text-[11px] text-slate-400">Positive opens upward; negative opens downward.</p>
          </div>
        )}

        {/* Intercept Slider */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Y-Intercept (b)</span>
            <span className="font-mono text-emerald-400 font-semibold">{intercept}</span>
          </div>
          <input
            type="range"
            min="-8"
            max="8"
            step="1"
            value={intercept}
            onChange={(e) => handleInterceptChange(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
          />
          <p className="text-[11px] text-slate-400">Vertical offset crossing the Y-axis.</p>
        </div>

        {/* Quick Presets */}
        <div className="space-y-2">
          <div className="text-xs text-slate-300 font-medium">Instant Presets</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setSlope(1);
                setIntercept(0);
                if (onInteraction) onInteraction();
              }}
              className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700"
            >
              y = x (Identity)
            </button>
            <button
              onClick={() => {
                setSlope(0);
                setIntercept(3);
                if (onInteraction) onInteraction();
              }}
              className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700"
            >
              y = 3 (Horizontal)
            </button>
            <button
              onClick={() => {
                setSlope(-2);
                setIntercept(4);
                if (onInteraction) onInteraction();
              }}
              className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700"
            >
              y = -2x + 4 (Negative)
            </button>
          </div>
        </div>
      </div>

      {/* Guided Takeaways */}
      <div className="px-6 py-3 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <div>
          X-Intercept: <span className="font-mono text-cyan-300 font-semibold">{xInterceptVal}</span>
        </div>
        <div className="text-slate-400">
          Parallel lines share identical slope <span className="font-mono text-cyan-300">m₁ = m₂</span>.
        </div>
      </div>
    </div>
  );
};
