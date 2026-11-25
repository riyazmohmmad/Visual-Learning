import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, FastForward, Grid, Sparkles, Sliders } from 'lucide-react';

interface Props {
  onInteraction?: () => void;
  onRecordProgress?: (timeSeconds: number, completed: boolean, params: any) => void;
}

export const CellularAutomataSimulation: React.FC<Props> = ({ onInteraction, onRecordProgress }) => {
  const [gridSize, setGridSize] = useState<number>(36);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [generation, setGeneration] = useState<number>(0);
  const [speedMs, setSpeedMs] = useState<number>(100);
  const [nutrientDiffusion, setNutrientDiffusion] = useState<boolean>(true);
  const [aliveCount, setAliveCount] = useState<number>(0);

  // 2D grid matrix of 0 (dead) or 1 (living biological cell)
  const [grid, setGrid] = useState<number[][]>(() => createInitialGrid(36, 'glider'));

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<any>(null);
  const startTimeRef = useRef<number>(Date.now());

  function createEmptyGrid(size: number): number[][] {
    return Array.from({ length: size }, () => Array(size).fill(0));
  }

  function createInitialGrid(size: number, preset: 'glider' | 'pulsar' | 'colony' | 'random'): number[][] {
    const g = createEmptyGrid(size);
    const mid = Math.floor(size / 2);

    if (preset === 'glider') {
      // Glider colony
      const coords = [
        [mid - 1, mid],
        [mid, mid + 1],
        [mid + 1, mid - 1],
        [mid + 1, mid],
        [mid + 1, mid + 1],
      ];
      coords.forEach(([r, c]) => {
        if (r >= 0 && r < size && c >= 0 && c < size) g[r][c] = 1;
      });
    } else if (preset === 'colony') {
      // Clustered cell colony
      for (let r = mid - 4; r <= mid + 4; r++) {
        for (let c = mid - 4; c <= mid + 4; c++) {
          if (Math.random() > 0.45) g[r][c] = 1;
        }
      }
    } else if (preset === 'random') {
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (Math.random() > 0.75) g[r][c] = 1;
        }
      }
    }
    return g;
  }

  // Count active cells
  useEffect(() => {
    let count = 0;
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        if (grid[r]?.[c] === 1) count++;
      }
    }
    setAliveCount(count);
  }, [grid, gridSize]);

  // Step simulation forward one generation (Conway's Game of Life + biological diffusion rule)
  const stepSimulation = () => {
    setGrid((currentGrid) => {
      const nextGrid = createEmptyGrid(gridSize);

      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          let neighbors = 0;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = (r + dr + gridSize) % gridSize;
              const nc = (c + dc + gridSize) % gridSize;
              neighbors += currentGrid[nr][nc];
            }
          }

          // Biological Rules:
          // 1. Any live cell with 2 or 3 neighbors survives.
          // 2. Any dead cell with exactly 3 neighbors becomes a live cell (mitosis).
          // 3. Otherwise underpopulation (<2) or overpopulation (>3) causes cell death.
          if (currentGrid[r][c] === 1) {
            nextGrid[r][c] = neighbors === 2 || neighbors === 3 ? 1 : 0;
          } else {
            nextGrid[r][c] = neighbors === 3 ? 1 : 0;
          }
        }
      }
      return nextGrid;
    });

    setGeneration((g) => g + 1);
  };

  // Interval timer for playback
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        stepSimulation();
      }, speedMs);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, speedMs, gridSize]);

  // Canvas rendering
  const canvasPixelSize = 440;
  const cellSize = canvasPixelSize / gridSize;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasPixelSize, canvasPixelSize);

    // Dark petri-dish background
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, canvasPixelSize, canvasPixelSize);

    // Subtle grid lines
    ctx.strokeStyle = '#111a2e';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gridSize; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, canvasPixelSize);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(canvasPixelSize, i * cellSize);
      ctx.stroke();
    }

    // Draw living cells
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        if (grid[r]?.[c] === 1) {
          const x = c * cellSize;
          const y = r * cellSize;

          // Bioluminescent glowing cell
          ctx.fillStyle = '#10b981';
          ctx.shadowColor = '#059669';
          ctx.shadowBlur = 4;
          ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);

          // Internal core organelle dot
          ctx.fillStyle = '#a7f3d0';
          ctx.beginPath();
          ctx.arc(x + cellSize / 2, y + cellSize / 2, Math.max(1.5, cellSize / 5), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.shadowBlur = 0;
  }, [grid, gridSize, cellSize]);

  // Toggle cell on canvas click
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const scaleX = canvasPixelSize / rect.width;
    const scaleY = canvasPixelSize / rect.height;

    const col = Math.floor((clickX * scaleX) / cellSize);
    const row = Math.floor((clickY * scaleY) / cellSize);

    if (row >= 0 && row < gridSize && col >= 0 && col < gridSize) {
      setGrid((prev) => {
        const next = prev.map((arr) => [...arr]);
        next[row][col] = next[row][col] === 1 ? 0 : 1;
        return next;
      });
      if (onInteraction) onInteraction();
    }
  };

  const handleReset = () => {
    setIsRunning(false);
    setGeneration(0);
    setGrid(createInitialGrid(gridSize, 'glider'));
    if (onInteraction) onInteraction();
  };

  const handlePreset = (preset: 'glider' | 'colony' | 'random') => {
    setIsRunning(false);
    setGeneration(0);
    setGrid(createInitialGrid(gridSize, preset));
    if (onInteraction) onInteraction();
  };

  const handlePlayToggle = () => {
    setIsRunning(!isRunning);
    if (!isRunning && onRecordProgress) {
      const elapsedSec = Math.round((Date.now() - startTimeRef.current) / 1000);
      onRecordProgress(Math.max(10, elapsedSec), true, {
        gridSize,
        aliveCount,
        generation,
      });
    }
    if (onInteraction) onInteraction();
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl text-white">
      {/* Simulation Header */}
      <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-slate-950/70">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">Cellular Automata & Microbial Colony Growth</h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Deterministic cellular morphogenesis model simulating neighbor-dependent mitosis and environmental apoptosis.
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="px-3 py-1 rounded-full bg-slate-800 text-emerald-300 border border-slate-700">
            Alive Cells: {aliveCount}
          </span>
          <span className="px-3 py-1 rounded-full bg-slate-800 text-cyan-300 border border-slate-700">
            Generation: #{generation}
          </span>
        </div>
      </div>

      {/* Main Grid Viewport */}
      <div className="p-4 bg-slate-950 flex flex-col items-center justify-center">
        <canvas
          ref={canvasRef}
          width={canvasPixelSize}
          height={canvasPixelSize}
          onClick={handleCanvasClick}
          className="rounded-xl border border-slate-800/80 shadow-2xl cursor-pointer hover:border-emerald-500/50 transition-colors"
          title="Click to seed or clear cells"
        />
        <p className="text-[11px] text-slate-400 mt-2 font-mono">
          Click any grid cell to seed or remove living biological specimens.
        </p>
      </div>

      {/* Control Strip */}
      <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePlayToggle}
            className={`py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              isRunning ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{isRunning ? 'Pause Colony' : 'Start Evolution'}</span>
          </button>

          <button
            onClick={stepSimulation}
            disabled={isRunning}
            className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <FastForward className="w-3.5 h-3.5" />
            <span>Step +1</span>
          </button>

          <button
            onClick={handleReset}
            className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>

        {/* Colony Presets */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 font-mono">Presets:</span>
          <button
            onClick={() => handlePreset('glider')}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-xs"
          >
            Migrating Glider
          </button>
          <button
            onClick={() => handlePreset('colony')}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-xs"
          >
            Dense Colony
          </button>
          <button
            onClick={() => handlePreset('random')}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-xs"
          >
            Random Seed
          </button>
        </div>
      </div>

      {/* Control Sliders */}
      <div className="p-6 bg-slate-900 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Evolution Cycle Speed</span>
            <span className="font-mono text-emerald-400 font-bold">{speedMs} ms / gen</span>
          </div>
          <input
            type="range"
            min="30"
            max="300"
            step="10"
            value={speedMs}
            onChange={(e) => setSpeedMs(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Grid Resolution</span>
            <span className="font-mono text-cyan-400 font-bold">{gridSize} x {gridSize}</span>
          </div>
          <input
            type="range"
            min="20"
            max="50"
            step="2"
            value={gridSize}
            onChange={(e) => {
              const sz = Number(e.target.value);
              setGridSize(sz);
              setGrid(createInitialGrid(sz, 'glider'));
              setGeneration(0);
            }}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
        </div>
      </div>
    </div>
  );
};
