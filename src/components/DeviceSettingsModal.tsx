import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Camera,
  Mic,
  Volume2,
  VideoOff,
  MicOff,
  VolumeX,
  Check,
  X,
  Play,
  Square,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Info
} from 'lucide-react';
import { ResponsiveModal } from './ResponsiveModal';

export interface DeviceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableCameras: MediaDeviceInfo[];
  availableMics: MediaDeviceInfo[];
  availableSpeakers: MediaDeviceInfo[];
  currentCameraId: string;
  currentMicId: string;
  currentSpeakerId: string;
  onApplySettings: (cameraId: string, micId: string, speakerId: string) => Promise<void>;
  isSinkIdSupported: boolean;
  onRefreshDevices: () => Promise<void>;
}

export function getMediaErrorMessage(err: any, deviceType: 'camera' | 'microphone' | 'speaker' | 'both' = 'both'): string {
  if (!err) return `${deviceType === 'both' ? 'Media' : deviceType} error occurred.`;
  switch (err.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera or microphone permission was denied. Please allow access in your browser settings.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera or microphone was detected.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The camera or microphone is already being used by another application.';
    case 'SecurityError':
      return 'Camera and microphone access is blocked by the browser or security settings.';
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'The selected camera or microphone is not available.';
    case 'AbortError':
      return 'Hardware access was aborted. Please try again.';
    default:
      return err.message || `Unable to access ${deviceType === 'both' ? 'camera and microphone' : deviceType}.`;
  }
}

export const DeviceSettingsModal: React.FC<DeviceSettingsModalProps> = ({
  isOpen,
  onClose,
  availableCameras,
  availableMics,
  availableSpeakers,
  currentCameraId,
  currentMicId,
  currentSpeakerId,
  onApplySettings,
  isSinkIdSupported,
  onRefreshDevices,
}) => {
  // Temporary selection states while in the dialog
  const [selectedCameraId, setSelectedCameraId] = useState<string>(currentCameraId || 'default');
  const [selectedMicId, setSelectedMicId] = useState<string>(currentMicId || 'default');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>(currentSpeakerId || 'default');

  // Saving state
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Real Camera Preview
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const [isCameraPreviewActive, setIsCameraPreviewActive] = useState<boolean>(true);
  const [cameraPreviewError, setCameraPreviewError] = useState<string | null>(null);

  // Real Microphone Test
  const [isTestingMic, setIsTestingMic] = useState<boolean>(false);
  const [micVolume, setMicVolume] = useState<number>(0);
  const micAudioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnimFrameRef = useRef<number | null>(null);

  // Real Speaker Test
  const [isTestingSpeaker, setIsTestingSpeaker] = useState<boolean>(false);
  const [speakerTestFeedback, setSpeakerTestFeedback] = useState<string | null>(null);
  const testAudioRef = useRef<HTMLAudioElement | null>(null);

  // Synchronize on modal open
  useEffect(() => {
    if (isOpen) {
      setSelectedCameraId(currentCameraId || 'default');
      setSelectedMicId(currentMicId || 'default');
      setSelectedSpeakerId(currentSpeakerId || 'default');
      setErrorMessage(null);
      setIsCameraPreviewActive(true);
      startCameraPreview(currentCameraId || 'default');
    } else {
      stopCameraPreview();
      stopMicTest();
      stopSpeakerTest();
    }
  }, [isOpen, currentCameraId, currentMicId, currentSpeakerId]);

  // Clean up when modal closes or unmounts
  useEffect(() => {
    return () => {
      stopCameraPreview();
      stopMicTest();
      stopSpeakerTest();
    };
  }, []);

  // ==========================================
  // REAL CAMERA PREVIEW
  // ==========================================
  const startCameraPreview = async (camId: string) => {
    stopCameraPreview();
    setCameraPreviewError(null);

    try {
      const constraints: MediaStreamConstraints = {
        video: camId === 'default' ? true : { deviceId: { exact: camId } },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      previewStreamRef.current = stream;

      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        previewVideoRef.current.play().catch(() => {});
      }
      setIsCameraPreviewActive(true);
    } catch (err: any) {
      console.warn('Camera preview notice:', err);
      setCameraPreviewError(getMediaErrorMessage(err, 'camera'));
      setIsCameraPreviewActive(false);
    }
  };

  const stopCameraPreview = () => {
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach((t) => t.stop());
      previewStreamRef.current = null;
    }
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
  };

  const handleTestCameraToggle = () => {
    if (isCameraPreviewActive) {
      stopCameraPreview();
      setIsCameraPreviewActive(false);
    } else {
      startCameraPreview(selectedCameraId);
    }
  };

  // When camera selection changes, update preview
  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    if (isCameraPreviewActive) {
      startCameraPreview(newId);
    }
  };

  // ==========================================
  // REAL MICROPHONE TEST (Volume Meter)
  // ==========================================
  const startMicTest = async (micId: string) => {
    stopMicTest();
    try {
      const constraints: MediaStreamConstraints = {
        audio: micId === 'default' ? true : { deviceId: { exact: micId } },
        video: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micStreamRef.current = stream;

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) {
        setErrorMessage('Web Audio API not supported on this browser.');
        return;
      }

      const audioCtx = new AudioCtxClass();
      micAudioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      setIsTestingMic(true);

      const updateMeter = () => {
        if (!analyser) return;
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        // Normalize 0-255 to 0-100% with amplification for visual responsiveness
        const level = Math.min(100, Math.round((average / 128) * 100));
        setMicVolume(level);

        micAnimFrameRef.current = requestAnimationFrame(updateMeter);
      };

      updateMeter();
    } catch (err: any) {
      console.warn('Mic test error:', err);
      setErrorMessage(getMediaErrorMessage(err, 'microphone'));
      stopMicTest();
    }
  };

  const stopMicTest = () => {
    if (micAnimFrameRef.current) {
      cancelAnimationFrame(micAnimFrameRef.current);
      micAnimFrameRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (micAudioContextRef.current) {
      micAudioContextRef.current.close().catch(() => {});
      micAudioContextRef.current = null;
    }
    setIsTestingMic(false);
    setMicVolume(0);
  };

  const handleTestMicToggle = () => {
    if (isTestingMic) {
      stopMicTest();
    } else {
      startMicTest(selectedMicId);
    }
  };

  const handleMicChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedMicId(newId);
    if (isTestingMic) {
      startMicTest(newId);
    }
  };

  // ==========================================
  // REAL SPEAKER TEST (Real Sound Output)
  // ==========================================
  const startSpeakerTest = async () => {
    if (isTestingSpeaker) {
      stopSpeakerTest();
      return;
    }

    setIsTestingSpeaker(true);
    setSpeakerTestFeedback('Playing speaker test sound...');

    try {
      // Generate a pleasant two-tone chime audio clip via AudioContext to Audio Element for setSinkId
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtxClass();

      // Create an oscillator chime
      const osc = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.15); // E5
      osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.35); // G5

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1046.5, audioCtx.currentTime + 0.35); // C6

      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);

      osc.connect(gain);
      osc2.connect(gain);

      // Where setSinkId is supported on AudioContext
      if ('setSinkId' in (audioCtx as any) && selectedSpeakerId && selectedSpeakerId !== 'default') {
        try {
          await (audioCtx as any).setSinkId(selectedSpeakerId);
        } catch (e) {
          console.warn('AudioContext.setSinkId notice:', e);
        }
      }

      gain.connect(audioCtx.destination);

      osc.start(audioCtx.currentTime);
      osc2.start(audioCtx.currentTime + 0.35);

      osc.stop(audioCtx.currentTime + 1.2);
      osc2.stop(audioCtx.currentTime + 1.2);

      // Also synthesize short voice confirmation if speech synthesis is available
      if ('speechSynthesis' in window) {
        try {
          const utterance = new SpeechSynthesisUtterance('Speaker test');
          utterance.rate = 1.1;
          utterance.volume = 0.5;
          window.speechSynthesis.speak(utterance);
        } catch (e) {}
      }

      setTimeout(() => {
        setIsTestingSpeaker(false);
        setSpeakerTestFeedback('Speaker test completed. Sound played successfully.');
        setTimeout(() => setSpeakerTestFeedback(null), 4000);
      }, 1500);
    } catch (err: any) {
      console.warn('Speaker test error:', err);
      setIsTestingSpeaker(false);
      setSpeakerTestFeedback('Speaker test: ' + err.message);
    }
  };

  const stopSpeakerTest = () => {
    setIsTestingSpeaker(false);
    if (testAudioRef.current) {
      testAudioRef.current.pause();
    }
  };

  // ==========================================
  // SAVE / APPLY SETTINGS
  // ==========================================
  const handleSave = async () => {
    setSaving(true);
    setErrorMessage(null);
    try {
      // Stop local settings preview tracks BEFORE applying to the main live stream
      // so mobile hardware sensors are released cleanly without NotReadableError.
      stopCameraPreview();
      stopMicTest();
      stopSpeakerTest();

      await onApplySettings(selectedCameraId, selectedMicId, selectedSpeakerId);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to apply device settings.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const headerContent = (
    <div className="px-4 py-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/50">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
          <Settings className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h3 className="type-card-title text-slate-900 tracking-tight">Device Settings</h3>
          <p className="text-xs text-slate-500">Configure and test your camera, microphone, and speaker</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close device settings"
        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer shrink-0 active:scale-95"
        title="Close"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );

  const footerContent = (
    <div className="px-4 sm:px-5 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] bg-slate-50/80 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
      <button
        type="button"
        onClick={async () => {
          await onRefreshDevices();
        }}
        className="min-h-[40px] px-2 text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center justify-center sm:justify-start gap-1.5 transition-colors cursor-pointer"
        title="Scan for connected devices"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>Detect Devices</span>
      </button>

      <div className="grid grid-cols-2 sm:flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] py-2 px-3.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-2xs active:scale-[0.98]"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="min-h-[44px] py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98]"
        >
          {saving ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Applying...</span>
            </>
          ) : (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Save</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Device Settings"
      maxWidthClass="max-w-[540px]"
      header={headerContent}
      footer={footerContent}
      bodyClassName="p-4 sm:p-6 space-y-5 sm:space-y-6"
    >
          {/* General Error Message */}
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">{errorMessage}</div>
            </div>
          )}

          {/* ========================================================
              1. CAMERA SELECTION & LIVE PREVIEW
             ======================================================== */}
          <div className="space-y-3 p-3.5 sm:p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <Camera className="w-4 h-4 text-blue-600" />
                <span>Camera</span>
              </label>

              <button
                type="button"
                onClick={handleTestCameraToggle}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer transition-colors"
              >
                {isCameraPreviewActive ? <VideoOff className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isCameraPreviewActive ? 'Turn Preview Off' : 'Test Camera'}</span>
              </button>
            </div>

            {/* Camera Dropdown (Default device is first) */}
            <select
              value={selectedCameraId}
              onChange={handleCameraChange}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 transition-colors cursor-pointer"
            >
              <option value="default">Default Camera</option>
              {availableCameras.map((device, idx) => {
                if (device.deviceId === 'default') return null;
                const label = device.label || `Camera ${idx + 1}`;
                return (
                  <option key={device.deviceId || idx} value={device.deviceId}>
                    {label}
                  </option>
                );
              })}
            </select>

            {/* Real Live Camera Preview Tile */}
            <div className="relative w-full h-36 bg-slate-900 border border-slate-200 rounded-xl overflow-hidden flex items-center justify-center">
              {isCameraPreviewActive && !cameraPreviewError ? (
                <video
                  ref={previewVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center space-y-1.5 p-4 text-slate-400">
                  <VideoOff className="w-6 h-6 mx-auto text-slate-500" />
                  <div className="text-xs font-medium text-slate-300">
                    {cameraPreviewError || 'Camera preview is off'}
                  </div>
                  <button
                    type="button"
                    onClick={() => startCameraPreview(selectedCameraId)}
                    className="text-[11px] text-blue-400 hover:underline inline-block mt-1 cursor-pointer"
                  >
                    Click to test camera
                  </button>
                </div>
              )}

              {isCameraPreviewActive && !cameraPreviewError && (
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-slate-900/80 backdrop-blur-xs border border-slate-700 text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Live Preview</span>
                </div>
              )}
            </div>
          </div>

          {/* ========================================================
              2. MICROPHONE SELECTION & REAL VOLUME METER
             ======================================================== */}
          <div className="space-y-3 p-3.5 sm:p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <Mic className="w-4 h-4 text-emerald-600" />
                <span>Microphone</span>
              </label>

              <button
                type="button"
                onClick={handleTestMicToggle}
                className={`text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                  isTestingMic ? 'text-amber-600 hover:text-amber-700' : 'text-emerald-600 hover:text-emerald-700'
                }`}
              >
                {isTestingMic ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isTestingMic ? 'Stop Test' : 'Test Microphone'}</span>
              </button>
            </div>

            {/* Mic Dropdown (Default device is first) */}
            <select
              value={selectedMicId}
              onChange={handleMicChange}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 transition-colors cursor-pointer"
            >
              <option value="default">Default Microphone</option>
              {availableMics.map((device, idx) => {
                if (device.deviceId === 'default') return null;
                const label = device.label || `Microphone ${idx + 1}`;
                return (
                  <option key={device.deviceId || idx} value={device.deviceId}>
                    {label}
                  </option>
                );
              })}
            </select>

            {/* Real Microphone Volume Meter */}
            <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Mic className={`w-3.5 h-3.5 ${isTestingMic ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span>Input Volume Meter</span>
                </span>
                <span className="font-semibold text-slate-700">
                  {isTestingMic
                    ? micVolume > 15
                      ? 'Good'
                      : 'Speak to test...'
                    : 'Click "Test Microphone"'}
                </span>
              </div>

              {/* Dynamic Meter Bar */}
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200 p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-75 ${
                    micVolume > 65
                      ? 'bg-amber-500'
                      : micVolume > 20
                      ? 'bg-emerald-500'
                      : 'bg-emerald-600'
                  }`}
                  style={{ width: `${isTestingMic ? Math.max(3, micVolume) : 0}%` }}
                />
              </div>
            </div>
          </div>

          {/* ========================================================
              3. SPEAKER SELECTION & REAL SPEAKER TEST
             ======================================================== */}
          <div className="space-y-3 p-3.5 sm:p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-blue-600" />
                <span>Speaker</span>
              </label>

              <button
                type="button"
                onClick={startSpeakerTest}
                disabled={isTestingSpeaker}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{isTestingSpeaker ? 'Playing Sound...' : 'Test Speaker'}</span>
              </button>
            </div>

            {/* Speaker Dropdown (Default device is first) */}
            <select
              value={selectedSpeakerId}
              onChange={(e) => setSelectedSpeakerId(e.target.value)}
              disabled={!isSinkIdSupported}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 transition-colors cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <option value="default">Default Speaker</option>
              {availableSpeakers.map((device, idx) => {
                if (device.deviceId === 'default') return null;
                const label = device.label || `Speaker / Headphone ${idx + 1}`;
                return (
                  <option key={device.deviceId || idx} value={device.deviceId}>
                    {label}
                  </option>
                );
              })}
            </select>

            {/* Browser Support Feedback */}
            {!isSinkIdSupported ? (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>Speaker selection is not supported by this browser. Using the system default speaker.</span>
              </div>
            ) : (
              speakerTestFeedback && (
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-700 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>{speakerTestFeedback}</span>
                </div>
              )
            )}
          </div>
    </ResponsiveModal>
  );
};
