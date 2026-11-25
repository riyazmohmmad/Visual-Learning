import React, { useState, useEffect } from 'react';
import { Dna, Play, Pause, Zap, Info, ZoomIn, Layers } from 'lucide-react';

interface Props {
  onInteraction?: () => void;
}

type OrganelleSection = 'outer_membrane' | 'intermembrane_space' | 'cristae' | 'matrix' | 'atp_synthase';

export const MitochondriaSimulation: React.FC<Props> = ({ onInteraction }) => {
  const [selectedSection, setSelectedSection] = useState<OrganelleSection>('cristae');
  const [metabolicActivity, setMetabolicActivity] = useState<number>(65); // 20 to 100
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [rotationAngle, setRotationAngle] = useState<number>(0);

  // Rotate ATP rotor and proton pulses
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setRotationAngle((prev) => (prev + (metabolicActivity / 20)) % 360);
    }, 40);
    return () => clearInterval(interval);
  }, [isPlaying, metabolicActivity]);

  const atpRate = Math.round(metabolicActivity * 1.8);

  const sectionDetails: Record<OrganelleSection, { title: string; subtitle: string; description: string; role: string }> = {
    outer_membrane: {
      title: 'Outer Mitochondrial Membrane',
      subtitle: 'Permeable Lipid Bilayer with Porin Channels',
      description: 'Contains specialized transmembrane channels (porins) that freely allow ions, nutrient metabolites, and small proteins up to 5,000 Daltons to enter from the cytosol.',
      role: 'Protective enclosure & molecular gateway.',
    },
    intermembrane_space: {
      title: 'Intermembrane Space',
      subtitle: 'High-Concentration Proton (H⁺) Reservoir',
      description: 'The narrow physical zone between the outer and inner membranes. Electron transport chain complexes pump protons into this space, creating a potent electrochemical gradient (proton-motive force).',
      role: 'Electrochemical potential energy storage.',
    },
    cristae: {
      title: 'Inner Membrane & Cristae Folds',
      subtitle: 'Massive Surface Area Expansion for ETC Complexes',
      description: 'The inner membrane is intricately folded into deep convolutions called cristae. This maximizes catalytic surface area, hosting millions of Electron Transport Chain complexes (I-IV) and ATP Synthase motors.',
      role: 'Host site for oxidative phosphorylation.',
    },
    matrix: {
      title: 'Mitochondrial Matrix',
      subtitle: 'Dense Gel Containing mtDNA & Krebs Cycle Enzymes',
      description: 'The interior compartment enclosed by the inner membrane. Contains hundreds of metabolic enzymes, the Citric Acid Cycle (Krebs cycle), mitochondrial ribosomes (70S), and maternal circular mtDNA.',
      role: 'Acetyl-CoA oxidation and electron carrier generation (NADH & FADH₂).',
    },
    atp_synthase: {
      title: 'ATP Synthase Molecular Turbine',
      subtitle: 'F₀F₁ Rotational Nanomotor',
      description: 'Protons flow through the membrane-bound F₀ rotor channel down their electrochemical gradient. This mechanical torque rotates the catalytic F₁ head, driving phosphorylation of ADP + Pᵢ into high-energy ATP.',
      role: 'Primary cellular energy synthesis (~90% of body ATP).',
    },
  };

  const handleSelect = (sec: OrganelleSection) => {
    setSelectedSection(sec);
    if (onInteraction) onInteraction();
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      {/* Simulation Header */}
      <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-slate-900/80">
        <div>
          <div className="flex items-center gap-2">
            <Dna className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-semibold text-white">Interactive Mitochondria Bioenergetics Model</h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Explore organelle compartments, proton gradient pumping, and ATP synthase rotation</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setIsPlaying(!isPlaying);
              if (onInteraction) onInteraction();
            }}
            className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors ${
              isPlaying
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold'
            }`}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isPlaying ? 'Pause Flux' : 'Resume Flux'}
          </button>
        </div>
      </div>

      {/* Two-Zone Layout: Interactive Visual SVG on Left, Concept Inspector on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 border-b border-slate-800">
        {/* Interactive SVG Stage (7 cols) */}
        <div className="lg:col-span-7 bg-slate-950 p-6 flex flex-col items-center justify-center relative min-h-[360px]">
          {/* SVG Organelle Graphic with interactive clickable path regions */}
          <svg viewBox="0 0 600 360" className="w-full max-w-[540px] drop-shadow-2xl">
            <defs>
              <radialGradient id="matrixGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#1e1b4b" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#0f172a" stopOpacity="0.9" />
              </radialGradient>
              <linearGradient id="cristaeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0ea5e9" />
                <stop offset="100%" stopColor="#0284c7" />
              </linearGradient>
            </defs>

            {/* Cytosol Background Field */}
            <rect width="600" height="360" fill="#090d16" rx="8" />

            {/* Outer Membrane Capsule */}
            <path
              d="M 120,80 C 180,50 420,50 480,80 C 550,120 550,240 480,280 C 420,310 180,310 120,280 C 50,240 50,120 120,80 Z"
              fill={selectedSection === 'outer_membrane' ? '#1e293b' : '#0f172a'}
              stroke={selectedSection === 'outer_membrane' ? '#38bdf8' : '#334155'}
              strokeWidth={selectedSection === 'outer_membrane' ? 4 : 2}
              className="cursor-pointer transition-all duration-300"
              onClick={() => handleSelect('outer_membrane')}
            />

            {/* Intermembrane Space Zone */}
            <path
              d="M 130,95 C 190,70 410,70 470,95 C 530,130 530,230 470,265 C 410,290 190,290 130,265 C 70,230 70,130 130,95 Z"
              fill={selectedSection === 'intermembrane_space' ? '#0369a1' : 'none'}
              fillOpacity={selectedSection === 'intermembrane_space' ? 0.25 : 0}
              stroke={selectedSection === 'intermembrane_space' ? '#38bdf8' : '#1e293b'}
              strokeWidth="1.5"
              strokeDasharray="4 4"
              className="cursor-pointer transition-all"
              onClick={() => handleSelect('intermembrane_space')}
            />

            {/* Matrix & Cristae Inner Shell */}
            <g onClick={() => handleSelect('cristae')} className="cursor-pointer">
              {/* Cristae Folds (Extensive convolutions) */}
              <path
                d="M 150,120 
                   Q 190,120 220,160 
                   Q 190,200 150,200
                   Q 190,220 260,220
                   Q 300,160 300,100
                   Q 330,160 350,220
                   Q 390,220 420,180
                   Q 390,140 440,140
                   Q 470,180 430,240
                   Q 350,270 240,260
                   Q 160,250 140,220
                   Z"
                fill="url(#matrixGrad)"
                stroke={selectedSection === 'cristae' ? '#06b6d4' : '#0284c7'}
                strokeWidth={selectedSection === 'cristae' ? 3.5 : 2}
                className="transition-all duration-300 hover:opacity-90"
              />

              {/* Individual Cristae Finger Infoldings */}
              <path
                d="M 170,110 C 220,110 240,160 210,180"
                stroke="#38bdf8"
                strokeWidth="3"
                fill="none"
              />
              <path
                d="M 430,110 C 370,110 350,170 380,190"
                stroke="#38bdf8"
                strokeWidth="3"
                fill="none"
              />
              <path
                d="M 280,240 C 280,180 320,160 320,240"
                stroke="#38bdf8"
                strokeWidth="3"
                fill="none"
              />
            </g>

            {/* Matrix Core Label & Hotspot */}
            <circle
              cx="250"
              cy="180"
              r="22"
              fill={selectedSection === 'matrix' ? '#3b82f6' : '#1e1b4b'}
              fillOpacity={selectedSection === 'matrix' ? 0.4 : 0.6}
              stroke={selectedSection === 'matrix' ? '#60a5fa' : '#4338ca'}
              strokeWidth="2"
              className="cursor-pointer transition-colors"
              onClick={() => handleSelect('matrix')}
            />
            <text
              x="250"
              y="184"
              fill="#93c5fd"
              fontSize="10"
              fontFamily="Plus Jakarta Sans"
              textAnchor="middle"
              className="pointer-events-none font-semibold"
            >
              Matrix
            </text>

            {/* ATP Synthase Complex Hotspot */}
            <g
              transform="translate(410, 200)"
              onClick={() => handleSelect('atp_synthase')}
              className="cursor-pointer"
            >
              {/* Base Stator */}
              <rect x="-10" y="-12" width="20" height="24" rx="4" fill="#047857" stroke="#10b981" strokeWidth="1.5" />
              {/* Rotating F1 Head */}
              <g transform={`rotate(${rotationAngle})`}>
                <circle cx="0" cy="0" r="14" fill="#10b981" fillOpacity="0.8" stroke="#34d399" strokeWidth="2" />
                <line x1="-12" y1="0" x2="12" y2="0" stroke="#064e3b" strokeWidth="2" />
                <line x1="0" y1="-12" x2="0" y2="12" stroke="#064e3b" strokeWidth="2" />
              </g>
              <text x="0" y="26" fill="#34d399" fontSize="9" textAnchor="middle" fontWeight="bold">
                ATP Synthase
              </text>
            </g>

            {/* Flowing H+ Protons */}
            {isPlaying && (
              <g>
                <circle cx={(180 + (rotationAngle * 0.8) % 180)} cy="90" r="3.5" fill="#38bdf8" opacity="0.9" />
                <circle cx={(300 + (rotationAngle * 0.6) % 140)} cy="80" r="3" fill="#38bdf8" opacity="0.8" />
                <circle cx={(220 + (rotationAngle * 0.7) % 160)} cy="275" r="3.5" fill="#38bdf8" opacity="0.9" />
                <circle cx="410" cy={(175 + (rotationAngle * 0.4) % 25)} r="3" fill="#10b981" opacity="0.9" />
              </g>
            )}
          </svg>

          {/* Quick Hotspot Bar */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
            {(['outer_membrane', 'intermembrane_space', 'cristae', 'matrix', 'atp_synthase'] as OrganelleSection[]).map((sec) => (
              <button
                key={sec}
                onClick={() => handleSelect(sec)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                  selectedSection === sec
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
              >
                {sec.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </button>
            ))}
          </div>
        </div>

        {/* Concept Inspector Deck (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400">
              <Layers className="w-4 h-4" />
              <span>ORGANELLE COMPARTMENT INSPECTION</span>
            </div>

            <div>
              <h4 className="text-lg font-bold text-white tracking-tight">
                {sectionDetails[selectedSection].title}
              </h4>
              <p className="text-xs text-cyan-300 font-medium mt-0.5">
                {sectionDetails[selectedSection].subtitle}
              </p>
            </div>

            <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 text-xs text-slate-300 leading-relaxed space-y-2">
              <p>{sectionDetails[selectedSection].description}</p>
              <div className="pt-2 border-t border-slate-800/80 text-[11px] flex items-center gap-1.5 text-emerald-400 font-medium">
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>Primary Role: {sectionDetails[selectedSection].role}</span>
              </div>
            </div>

            {/* Metabolic Activity Slider */}
            <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800/60 space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-medium">Metabolic Demand</span>
                <span className="font-mono text-cyan-400 font-semibold">{metabolicActivity}% Activity</span>
              </div>
              <input
                type="range"
                min="20"
                max="100"
                value={metabolicActivity}
                onChange={(e) => {
                  setMetabolicActivity(Number(e.target.value));
                  if (onInteraction) onInteraction();
                }}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <div className="flex justify-between items-center text-[11px] text-slate-400">
                <span>Resting Cell</span>
                <span>Aerobic Exercise</span>
                <span>Max Output</span>
              </div>
            </div>
          </div>

          {/* Real-time Bioenergetic Metric */}
          <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400 animate-pulse" />
              <div>
                <div className="text-[11px] text-slate-400">ATP Synthesis Rate</div>
                <div className="font-mono text-base font-bold text-emerald-400 tabular-nums">
                  ~{atpRate} nmol / s
                </div>
              </div>
            </div>
            <div className="text-right text-[11px] text-slate-400">
              ADP + Pᵢ ➔ ATP
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
