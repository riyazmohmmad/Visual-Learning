import React, { useState } from 'react';
import {
  TrendingUp,
  RotateCcw,
  Plus,
  Trash2,
  Maximize2,
  ZoomIn,
  ZoomOut,
  MousePointer,
  Crosshair,
} from 'lucide-react';

interface Point {
  id: string;
  x: number;
  y: number;
  label?: string;
}

interface Props {
  onInteraction?: () => void;
  onRecordProgress?: (timeSeconds: number, completed: boolean, params: any) => void;
}

export const CoordinateGrapherSimulation: React.FC<Props> = ({ onInteraction, onRecordProgress }) => {
  // Graph Mode: Function graphing vs Point plotting & Slope/Distance
  const [mode, setMode] = useState<'points' | 'linear' | 'quadratic'>('points');

  // Interactive plotted points
  const [points, setPoints] = useState<Point[]>([
    { id: 'p1', x: 2, y: 3, label: 'A' },
    { id: 'p2', x: 6, y: 7, label: 'B' },
  ]);

  // Function parameters
  const [slope, setSlope] = useState<number>(1.5);
  const [intercept, setIntercept] = useState<number>(-1);
  const [quadA, setQuadA] = useState<number>(0.5);

  // Zoom / Pan / Grid scale
  const [gridScale, setGridScale] = useState<number>(24); // pixels per unit
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);

  // Hover coordinate tracker
  const [cursorCoord, setCursorCoord] = useState<{ x: number; y: number } | null>(null);

  // Manual input form for points
  const [newPtX, setNewPtX] = useState<string>('4');
  const [newPtY, setNewPtY] = useState<string>('5');

  // Dimensions
  const width = 640;
  const height = 360;
  const originX = width / 2 + panX;
  const originY = height / 2 + panY;

  const toScreenX = (x: number) => originX + x * gridScale;
  const toScreenY = (y: number) => originY - y * gridScale;
  const toCoordX = (sx: number) => (sx - originX) / gridScale;
  const toCoordY = (sy: number) => (originY - sy) / gridScale;

  // Track cursor movement on SVG
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (width / rect.width);
    const sy = (e.clientY - rect.top) * (height / rect.height);
    const cx = Number(toCoordX(sx).toFixed(2));
    const cy = Number(toCoordY(sy).toFixed(2));
    setCursorCoord({ x: cx, y: cy });
  };

  const handleMouseLeave = () => {
    setCursorCoord(null);
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (mode !== 'points') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (width / rect.width);
    const sy = (e.clientY - rect.top) * (height / rect.height);
    const cx = Math.round(toCoordX(sx) * 2) / 2; // snap to 0.5 grid
    const cy = Math.round(toCoordY(sy) * 2) / 2;

    const nextLabel = String.fromCharCode(65 + (points.length % 26));
    const newPoint: Point = {
      id: `pt_${Date.now()}`,
      x: cx,
      y: cy,
      label: nextLabel,
    };

    setPoints((prev) => [...prev, newPoint]);
    if (onInteraction) onInteraction();
    if (onRecordProgress) {
      onRecordProgress(10, true, { pointsCount: points.length + 1 });
    }
  };

  const handleAddManualPoint = (e: React.FormEvent) => {
    e.preventDefault();
    const x = parseFloat(newPtX);
    const y = parseFloat(newPtY);
    if (isNaN(x) || isNaN(y)) return;

    const nextLabel = String.fromCharCode(65 + (points.length % 26));
    const newPoint: Point = {
      id: `pt_${Date.now()}`,
      x,
      y,
      label: nextLabel,
    };
    setPoints((prev) => [...prev, newPoint]);
    setNewPtX('');
    setNewPtY('');
    if (onInteraction) onInteraction();
  };

  const handleRemovePoint = (id: string) => {
    setPoints((prev) => prev.filter((p) => p.id !== id));
    if (onInteraction) onInteraction();
  };

  // Distance & Slope between first two points
  const pA = points[0];
  const pB = points[1];
  let calculatedDistance: number | null = null;
  let calculatedSlope: number | null = null;

  if (pA && pB) {
    const dx = pB.x - pA.x;
    const dy = pB.y - pA.y;
    calculatedDistance = Math.sqrt(dx * dx + dy * dy);
    calculatedSlope = dx !== 0 ? dy / dx : null;
  }

  // Parabolic path
  const generateParabola = () => {
    const pts: string[] = [];
    const minX = -15;
    const maxX = 15;
    for (let x = minX; x <= maxX; x += 0.25) {
      const y = quadA * x * x + intercept;
      const sx = toScreenX(x);
      const sy = toScreenY(y);
      if (pts.length === 0) pts.push(`M ${sx} ${sy}`);
      else pts.push(`L ${sx} ${sy}`);
    }
    return pts.join(' ');
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl text-white">
      {/* Simulation Header */}
      <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-slate-950/70">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">Interactive Cartesian Coordinate Grapher</h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Plot points, inspect coordinates, draw lines, and evaluate slope (Δy/Δx) and Euclidean distance in real time.
          </p>
        </div>

        {/* Mode Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800">
          <button
            onClick={() => setMode('points')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              mode === 'points' ? 'bg-cyan-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            Point Plotter & Distance
          </button>
          <button
            onClick={() => setMode('linear')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              mode === 'linear' ? 'bg-cyan-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            Linear (y = mx + b)
          </button>
          <button
            onClick={() => setMode('quadratic')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              mode === 'quadratic' ? 'bg-cyan-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            Parabolic (y = ax² + b)
          </button>
        </div>
      </div>

      {/* Main Coordinate Plane SVG */}
      <div className="relative bg-slate-950 flex justify-center p-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleSvgClick}
          className="w-full max-w-[640px] rounded-xl border border-slate-800/80 shadow-2xl cursor-crosshair select-none"
        >
          {/* Deep slate plane background */}
          <rect width={width} height={height} fill="#060913" rx="8" />

          {/* Grid lines */}
          {Array.from({ length: 41 }, (_, i) => i - 20).map((coord) => (
            <g key={coord}>
              {/* Vertical line */}
              <line
                x1={toScreenX(coord)}
                y1={0}
                x2={toScreenX(coord)}
                y2={height}
                stroke={coord === 0 ? '#475569' : '#111827'}
                strokeWidth={coord === 0 ? 2 : 1}
              />
              {/* Horizontal line */}
              <line
                x1={0}
                y1={toScreenY(coord)}
                x2={width}
                y2={toScreenY(coord)}
                stroke={coord === 0 ? '#475569' : '#111827'}
                strokeWidth={coord === 0 ? 2 : 1}
              />
              {/* Numbers on axes */}
              {coord !== 0 && coord % 2 === 0 && (
                <>
                  <text
                    x={toScreenX(coord)}
                    y={originY + 14}
                    fill="#475569"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {coord}
                  </text>
                  <text
                    x={originX - 12}
                    y={toScreenY(coord) + 3}
                    fill="#475569"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {coord}
                  </text>
                </>
              )}
            </g>
          ))}

          {/* Axis Labels */}
          <text x={width - 25} y={originY - 8} fill="#94a3b8" fontSize="11" fontFamily="monospace" fontWeight="bold">+X</text>
          <text x={originX + 8} y={20} fill="#94a3b8" fontSize="11" fontFamily="monospace" fontWeight="bold">+Y</text>

          {/* Connect points A and B if in point mode */}
          {mode === 'points' && pA && pB && (
            <line
              x1={toScreenX(pA.x)}
              y1={toScreenY(pA.y)}
              x2={toScreenX(pB.x)}
              y2={toScreenY(pB.y)}
              stroke="#38bdf8"
              strokeWidth="2.5"
              strokeDasharray="4 4"
            />
          )}

          {/* Linear Line */}
          {mode === 'linear' && (
            <line
              x1={toScreenX(-15)}
              y1={toScreenY(slope * -15 + intercept)}
              x2={toScreenX(15)}
              y2={toScreenY(slope * 15 + intercept)}
              stroke="#06b6d4"
              strokeWidth="3.5"
            />
          )}

          {/* Quadratic Parabola */}
          {mode === 'quadratic' && (
            <path d={generateParabola()} fill="none" stroke="#a855f7" strokeWidth="3.5" />
          )}

          {/* Draw all user points */}
          {mode === 'points' &&
            points.map((pt, idx) => {
              const sx = toScreenX(pt.x);
              const sy = toScreenY(pt.y);
              const isHighlight = idx === 0 || idx === 1;

              return (
                <g key={pt.id}>
                  <circle
                    cx={sx}
                    cy={sy}
                    r="6"
                    fill={idx === 0 ? '#10b981' : idx === 1 ? '#f43f5e' : '#38bdf8'}
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                  <text
                    x={sx + 9}
                    y={sy - 8}
                    fill="#ffffff"
                    fontSize="11"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {pt.label} ({pt.x}, {pt.y})
                  </text>
                </g>
              );
            })}
        </svg>

        {/* Live Cursor Coordinate Tracker */}
        {cursorCoord && (
          <div className="absolute top-7 left-7 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl px-3 py-2 text-xs shadow-lg font-mono">
            <span className="text-slate-400">Cursor: </span>
            <span className="text-cyan-300 font-bold">
              ({cursorCoord.x.toFixed(1)}, {cursorCoord.y.toFixed(1)})
            </span>
          </div>
        )}

        {/* Zoom Controls Overlay */}
        <div className="absolute bottom-7 right-7 flex items-center gap-1 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-1 shadow-lg">
          <button
            onClick={() => setGridScale((s) => Math.min(40, s + 4))}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setGridScale((s) => Math.max(14, s - 4))}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setPanX(0);
              setPanY(0);
              setGridScale(24);
            }}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
            title="Reset View"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mode Controls & Calculations Deck */}
      <div className="p-6 bg-slate-900 border-t border-slate-800 space-y-4">
        {mode === 'points' ? (
          <div className="space-y-4">
            {/* Real-time Math Output Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Distance A ↔ B</span>
                <span className="font-mono text-base font-bold text-cyan-300 mt-0.5 block">
                  {calculatedDistance !== null ? `${calculatedDistance.toFixed(3)} units` : 'Plot ≥ 2 points'}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">d = √((Δx)² + (Δy)²)</span>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Slope (m) A ↔ B</span>
                <span className="font-mono text-base font-bold text-emerald-300 mt-0.5 block">
                  {calculatedSlope !== null ? calculatedSlope.toFixed(3) : 'Undefined / Plot ≥ 2'}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">m = (y₂ - y₁) / (x₂ - x₁)</span>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Line Equation</span>
                <span className="font-mono text-base font-bold text-amber-300 mt-0.5 block">
                  {pA && pB && calculatedSlope !== null
                    ? `y = ${calculatedSlope.toFixed(2)}x ${
                        pA.y - calculatedSlope * pA.x >= 0
                          ? `+ ${(pA.y - calculatedSlope * pA.x).toFixed(2)}`
                          : `- ${Math.abs(pA.y - calculatedSlope * pA.x).toFixed(2)}`
                      }`
                    : 'Awaiting points'}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">y - y₁ = m(x - x₁)</span>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Midpoint M</span>
                <span className="font-mono text-base font-bold text-purple-300 mt-0.5 block">
                  {pA && pB ? `(${((pA.x + pB.x) / 2).toFixed(1)}, ${((pA.y + pB.y) / 2).toFixed(1)})` : 'Plot ≥ 2'}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">M = ((x₁+x₂)/2, (y₁+y₂)/2)</span>
              </div>
            </div>

            {/* Plotted Points Chips & Manual Input */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">Plotted Points:</span>
                {points.map((pt) => (
                  <div
                    key={pt.id}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs font-mono"
                  >
                    <span>
                      {pt.label}: ({pt.x}, {pt.y})
                    </span>
                    <button
                      onClick={() => handleRemovePoint(pt.id)}
                      className="text-slate-400 hover:text-red-400 ml-1 cursor-pointer"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              {/* Add Point Form */}
              <form onSubmit={handleAddManualPoint} className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  value={newPtX}
                  onChange={(e) => setNewPtX(e.target.value)}
                  placeholder="X"
                  className="w-16 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-white"
                />
                <input
                  type="number"
                  step="0.5"
                  value={newPtY}
                  onChange={(e) => setNewPtY(e.target.value)}
                  placeholder="Y"
                  className="w-16 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-white"
                />
                <button
                  type="submit"
                  className="py-1 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Point</span>
                </button>
              </form>
            </div>
          </div>
        ) : mode === 'linear' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-medium">Slope / Gradient (m)</span>
                <span className="font-mono text-cyan-400 font-bold">{slope}</span>
              </div>
              <input
                type="range"
                min="-4"
                max="4"
                step="0.5"
                value={slope}
                onChange={(e) => setSlope(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-medium">Y-Intercept (b)</span>
                <span className="font-mono text-emerald-400 font-bold">{intercept}</span>
              </div>
              <input
                type="range"
                min="-8"
                max="8"
                step="1"
                value={intercept}
                onChange={(e) => setIntercept(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-medium">Curvature Factor (a)</span>
                <span className="font-mono text-purple-400 font-bold">{quadA}</span>
              </div>
              <input
                type="range"
                min="-2"
                max="2"
                step="0.25"
                value={quadA}
                onChange={(e) => setQuadA(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-400"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-medium">Vertex Offset (b)</span>
                <span className="font-mono text-emerald-400 font-bold">{intercept}</span>
              </div>
              <input
                type="range"
                min="-8"
                max="8"
                step="1"
                value={intercept}
                onChange={(e) => setIntercept(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
