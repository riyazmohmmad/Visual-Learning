import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Volume2,
  Settings,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  HelpCircle,
  ArrowLeft,
  Sliders,
  Headphones,
  Radio,
  SwitchCamera,
} from 'lucide-react';
import {
  PermissionStateStatus,
  CameraFacingMode,
  checkMediaSecurity,
  checkAllMediaPermissions,
  subscribeToMediaPermissionChanges,
  requestCameraAndMicAccess,
  switchCameraTrack,
  stopMediaStream,
  getDetailedMediaErrorMessage,
  enumerateLiveDevices,
  playTestSpeakerChime,
  createRealMicrophoneMeter,
  assignAudioOutputSink,
  canOpenNativeDeviceSettings,
  openNativeDeviceSettings,
  detectMediaPlatform,
} from '../../utils/mediaUtils';
import { PermissionHelpModal } from './PermissionHelpModal';
import { DeviceSettingsModal } from '../DeviceSettingsModal';

export interface SelectedLiveDevices {
  cameraId: string;
  micId: string;
  speakerId: string;
  facingMode: CameraFacingMode;
}

interface Props {
  isTeacher: boolean;
  classId: string;
  className?: string;
  sessionTitle?: string;
  section?: string;
  onNavigateBack: () => void;
  onJoinSuccess: (
    mediaStream: MediaStream | null,
    isAudioMuted: boolean,
    isVideoMuted: boolean,
    devices?: SelectedLiveDevices
  ) => void;
  onStartLiveSuccess?: (
    mediaStream: MediaStream,
    isAudioMuted: boolean,
    isVideoMuted: boolean,
    sessionData: any,
    devices?: SelectedLiveDevices
  ) => void;
}

function getPermissionLabel(status: PermissionStateStatus): { text: string; tone: string } {
  switch (status) {
    case 'granted':
      return { text: 'Granted', tone: 'text-emerald-400' };
    case 'denied':
      return { text: 'Denied', tone: 'text-amber-400' };
    case 'permanently_denied':
    case 'blocked':
      return { text: 'Blocked in Settings', tone: 'text-red-400' };
    case 'unavailable':
      return { text: 'Unavailable', tone: 'text-amber-400' };
    case 'prompt':
    case 'not_requested':
    default:
      return { text: 'Not Requested', tone: 'text-slate-400' };
  }
}

export const LiveClassPreJoinView: React.FC<Props> = ({
  isTeacher,
  classId,
  className,
  sessionTitle,
  section,
  onNavigateBack,
  onJoinSuccess,
  onStartLiveSuccess,
}) => {
  const [securityStatus, setSecurityStatus] = useState<{ isSecure: boolean; error: string | null }>(
    checkMediaSecurity()
  );

  // Separate, truthful permission states for camera & microphone
  const [cameraPermissionStatus, setCameraPermissionStatus] = useState<PermissionStateStatus>('not_requested');
  const [micPermissionStatus, setMicPermissionStatus] = useState<PermissionStateStatus>('not_requested');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  // Hardware Devices
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [availableMics, setAvailableMics] = useState<MediaDeviceInfo[]>([]);
  const [availableSpeakers, setAvailableSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('default');
  const [selectedMicId, setSelectedMicId] = useState<string>('default');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>('default');
  const [facingMode, setFacingMode] = useState<CameraFacingMode>('user');
  const [isSwitchingCamera, setIsSwitchingCamera] = useState<boolean>(false);

  const isSinkIdSupported = typeof window !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  const nativeSettingsSupported = canOpenNativeDeviceSettings();
  const platform = detectMediaPlatform();
  const isMobileDevice =
    platform === 'android_capacitor' ||
    platform === 'ios_capacitor' ||
    platform === 'android_browser' ||
    platform === 'ios_browser';

  // Media Stream & Active Toggles
  const [isCameraActive, setIsCameraActive] = useState<boolean>(true);
  const [isMicActive, setIsMicActive] = useState<boolean>(true);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);

  // Refs to prevent duplicate streams & ensure clean teardown on unmount
  const localStreamRef = useRef<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const handedOffRef = useRef<boolean>(false);
  const hasAutoInitiatedRef = useRef<boolean>(false);
  const isRequestInFlightRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  // Real Web Audio API Microphone Level
  const [micLevelPercent, setMicLevelPercent] = useState<number>(0);
  const micMeterCleanupRef = useRef<(() => void) | null>(null);

  // Real Speaker Test State
  const [isTestingSpeaker, setIsTestingSpeaker] = useState<boolean>(false);
  const [speakerTestFeedback, setSpeakerTestFeedback] = useState<string | null>(null);

  // Loading & Modal States
  const [isRequestingPermission, setIsRequestingPermission] = useState<boolean>(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isLaunchingSession, setIsLaunchingSession] = useState<boolean>(false);

  const refreshDevices = useCallback(async () => {
    const { cameras, microphones, speakers } = await enumerateLiveDevices();
    if (!isMountedRef.current) return;
    setAvailableCameras(cameras);
    setAvailableMics(microphones);
    setAvailableSpeakers(speakers);
  }, []);

  /**
   * Core unified permission & hardware initialization flow
   */
  const initializeMediaAccess = useCallback(
    async (opts?: {
      targetCamId?: string;
      targetMicId?: string;
      targetFacingMode?: CameraFacingMode;
      wantVideo?: boolean;
      wantAudio?: boolean;
    }): Promise<MediaStream | null> => {
      if (isRequestInFlightRef.current) {
        return localStreamRef.current;
      }

      const sec = checkMediaSecurity();
      setSecurityStatus(sec);
      if (!sec.isSecure) {
        setCameraPermissionStatus('blocked');
        setMicPermissionStatus('blocked');
        setCameraError(sec.error);
        setMicError(sec.error);
        return null;
      }

      isRequestInFlightRef.current = true;
      setIsRequestingPermission(true);
      setLaunchError(null);

      try {
        const result = await requestCameraAndMicAccess({
          cameraId: opts?.targetCamId ?? selectedCameraId,
          micId: opts?.targetMicId ?? selectedMicId,
          facingMode: opts?.targetFacingMode ?? facingMode,
          wantVideo: opts?.wantVideo ?? true,
          wantAudio: opts?.wantAudio ?? true,
          existingStream: localStreamRef.current,
        });

        // If component unmounted while OS permission prompt was open, immediately release hardware tracks
        if (!isMountedRef.current) {
          stopMediaStream(result.stream);
          return null;
        }

        localStreamRef.current = result.stream;
        setActiveStream(result.stream);
        setCameraPermissionStatus(result.cameraStatus);
        setMicPermissionStatus(result.micStatus);
        setCameraError(result.cameraError);
        setMicError(result.micError);
        setFacingMode(result.facingMode);

        const videoTrack = result.stream?.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = isCameraActive;
          if (result.resolvedCameraId && result.resolvedCameraId !== 'default') {
            setSelectedCameraId(result.resolvedCameraId);
          }
        } else if (result.cameraStatus !== 'granted') {
          setIsCameraActive(false);
        }

        const audioTrack = result.stream?.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = isMicActive;
          if (result.resolvedMicId && result.resolvedMicId !== 'default') {
            setSelectedMicId(result.resolvedMicId);
          }
        } else if (result.micStatus !== 'granted') {
          setIsMicActive(false);
        }

        await refreshDevices();
        return result.stream;
      } catch (err: any) {
        if (!isMountedRef.current) return null;
        const msg = getDetailedMediaErrorMessage(err, 'both');
        setCameraError(msg);
        setMicError(msg);
        return null;
      } finally {
        isRequestInFlightRef.current = false;
        if (isMountedRef.current) {
          setIsRequestingPermission(false);
        }
      }
    },
    [selectedCameraId, selectedMicId, facingMode, isCameraActive, isMicActive, refreshDevices]
  );

  /**
   * Automatic permission check + automatic native permission request on entering the Live Class screen.
   * Also automatically recovers if the user grants permission in Device Settings and returns to the app.
   */
  useEffect(() => {
    isMountedRef.current = true;
    handedOffRef.current = false;

    const autoCheckAndRequest = async () => {
      if (hasAutoInitiatedRef.current) return;
      hasAutoInitiatedRef.current = true;

      const sec = checkMediaSecurity();
      setSecurityStatus(sec);
      if (!sec.isSecure) {
        setCameraPermissionStatus('blocked');
        setMicPermissionStatus('blocked');
        setCameraError(sec.error);
        return;
      }

      const snapshot = await checkAllMediaPermissions();
      if (!isMountedRef.current) return;

      setCameraPermissionStatus(snapshot.camera);
      setMicPermissionStatus(snapshot.microphone);

      const camPermBlocked = snapshot.camera === 'permanently_denied' || snapshot.camera === 'blocked';
      const micPermBlocked = snapshot.microphone === 'permanently_denied' || snapshot.microphone === 'blocked';

      if (camPermBlocked && micPermBlocked) {
        // Both are permanently denied at OS/browser level -> display clear settings action without useless loop
        setCameraError(getDetailedMediaErrorMessage({ name: 'NotAllowedError' }, 'camera', true));
        setMicError(getDetailedMediaErrorMessage({ name: 'NotAllowedError' }, 'microphone', true));
        await refreshDevices();
        return;
      }

      // Automatically trigger native OS/browser permission dialog (or initialize immediately if already granted)
      await initializeMediaAccess({
        wantVideo: !camPermBlocked,
        wantAudio: !micPermBlocked,
      });
    };

    autoCheckAndRequest();

    // Auto-detect when user returns from Android/iOS Device Settings or changes browser permission
    const handlePermissionRecovery = async () => {
      if (!isMountedRef.current || isRequestInFlightRef.current) return;
      const snapshot = await checkAllMediaPermissions();
      if (!isMountedRef.current) return;

      const hasVideoTrack = Boolean(localStreamRef.current?.getVideoTracks().length);
      const hasAudioTrack = Boolean(localStreamRef.current?.getAudioTracks().length);
      const needsVideoInit = snapshot.camera === 'granted' && !hasVideoTrack;
      const needsAudioInit = snapshot.microphone === 'granted' && !hasAudioTrack;

      if (needsVideoInit || needsAudioInit) {
        setIsCameraActive(snapshot.camera === 'granted');
        setIsMicActive(snapshot.microphone === 'granted');
        await initializeMediaAccess({
          wantVideo: snapshot.camera === 'granted' || hasVideoTrack,
          wantAudio: snapshot.microphone === 'granted' || hasAudioTrack,
        });
      } else {
        setCameraPermissionStatus((prev) => (prev === 'unavailable' ? prev : snapshot.camera));
        setMicPermissionStatus((prev) => (prev === 'unavailable' ? prev : snapshot.microphone));
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handlePermissionRecovery();
      }
    };
    const onWindowFocus = () => {
      handlePermissionRecovery();
    };
    const unsubscribePermissions = subscribeToMediaPermissionChanges(handlePermissionRecovery);

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onWindowFocus);

    const handleDeviceChange = async () => {
      await refreshDevices();
    };
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }

    return () => {
      isMountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onWindowFocus);
      unsubscribePermissions();
      if (navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
      if (micMeterCleanupRef.current) {
        micMeterCleanupRef.current();
        micMeterCleanupRef.current = null;
      }
      // Critical: if user leaves without entering the live room, release camera & microphone hardware immediately
      if (!handedOffRef.current && localStreamRef.current) {
        stopMediaStream(localStreamRef.current);
        localStreamRef.current = null;
      }
    };
  }, []);

  // Attach activeStream to local preview video element
  useEffect(() => {
    const videoEl = videoPreviewRef.current;
    if (!videoEl) return;

    if (activeStream && activeStream.getVideoTracks().length > 0) {
      if (videoEl.srcObject !== activeStream) {
        videoEl.srcObject = activeStream;
      }
      videoEl.play().catch((err) => {
        console.warn('Video preview play notice:', err?.message);
      });
    } else {
      videoEl.srcObject = null;
    }
  }, [activeStream, isCameraActive]);

  // Hook up real microphone volume meter to active audio track
  useEffect(() => {
    if (micMeterCleanupRef.current) {
      micMeterCleanupRef.current();
      micMeterCleanupRef.current = null;
    }

    if (activeStream && activeStream.getAudioTracks().length > 0 && isMicActive) {
      const cleanup = createRealMicrophoneMeter(activeStream, (percent) => {
        setMicLevelPercent(percent);
      });
      micMeterCleanupRef.current = cleanup;
    } else {
      setMicLevelPercent(0);
    }

    return () => {
      if (micMeterCleanupRef.current) {
        micMeterCleanupRef.current();
        micMeterCleanupRef.current = null;
      }
    };
  }, [activeStream, isMicActive]);

  // Camera ON / OFF Toggle (re-requests camera if not yet acquired)
  const handleToggleCamera = async () => {
    const existingVideoTrack = activeStream?.getVideoTracks()[0];
    if (existingVideoTrack) {
      const nextState = !isCameraActive;
      existingVideoTrack.enabled = nextState;
      setIsCameraActive(nextState);
      return;
    }

    // No camera track yet -> attempt to acquire camera
    setIsCameraActive(true);
    await initializeMediaAccess({
      wantVideo: true,
      wantAudio: Boolean(activeStream?.getAudioTracks().length) || micPermissionStatus === 'granted',
    });
  };

  // Microphone Mute / Unmute Toggle (re-requests mic if not yet acquired)
  const handleToggleMic = async () => {
    const existingAudioTrack = activeStream?.getAudioTracks()[0];
    if (existingAudioTrack) {
      const nextState = !isMicActive;
      existingAudioTrack.enabled = nextState;
      setIsMicActive(nextState);
      return;
    }

    // No audio track yet -> attempt to acquire microphone
    setIsMicActive(true);
    await initializeMediaAccess({
      wantVideo: Boolean(activeStream?.getVideoTracks().length) || cameraPermissionStatus === 'granted',
      wantAudio: true,
    });
  };

  // One-tap Front / Rear Camera Flip (mobile + multi-camera devices)
  const handleFlipCamera = async () => {
    if (isSwitchingCamera || cameraPermissionStatus !== 'granted') return;
    setIsSwitchingCamera(true);
    setCameraError(null);

    try {
      const nextFacing: CameraFacingMode = facingMode === 'user' ? 'environment' : 'user';

      // If multiple enumerated cameras exist, find the next distinct deviceId too
      let targetDeviceId: string | undefined;
      if (availableCameras.length > 1) {
        const currentIndex = availableCameras.findIndex((c) => c.deviceId === selectedCameraId);
        const nextCam = availableCameras[(currentIndex + 1) % availableCameras.length];
        if (nextCam?.deviceId && !isMobileDevice) {
          targetDeviceId = nextCam.deviceId;
        }
      }

      const switched = await switchCameraTrack({
        currentStream: localStreamRef.current,
        targetDeviceId,
        targetFacingMode: nextFacing,
        isCamEnabled: true,
      });

      localStreamRef.current = switched.stream;
      setActiveStream(switched.stream);
      setSelectedCameraId(switched.deviceId);
      setFacingMode(switched.facingMode);
      setIsCameraActive(true);
      await refreshDevices();
    } catch (err: any) {
      setCameraError(getDetailedMediaErrorMessage(err, 'camera'));
    } finally {
      setIsSwitchingCamera(false);
    }
  };

  // Change Camera Device from Dropdown
  const handleSelectCamera = async (newCamId: string) => {
    setSelectedCameraId(newCamId);
    if (cameraPermissionStatus !== 'granted') return;
    setCameraError(null);

    try {
      const switched = await switchCameraTrack({
        currentStream: localStreamRef.current,
        targetDeviceId: newCamId,
        targetFacingMode: facingMode,
        isCamEnabled: isCameraActive,
      });

      localStreamRef.current = switched.stream;
      setActiveStream(switched.stream);
      setSelectedCameraId(switched.deviceId);
      setFacingMode(switched.facingMode);
    } catch (err: any) {
      setCameraError(getDetailedMediaErrorMessage(err, 'camera'));
    }
  };

  // Change Microphone Device from Dropdown
  const handleSelectMic = async (newMicId: string) => {
    setSelectedMicId(newMicId);
    if (!localStreamRef.current || micPermissionStatus !== 'granted') return;
    setMicError(null);

    try {
      const oldAudioTracks = localStreamRef.current.getAudioTracks();
      oldAudioTracks.forEach((t) => {
        t.stop();
        localStreamRef.current?.removeTrack(t);
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: newMicId === 'default' ? true : { deviceId: { exact: newMicId } },
        video: false,
      });
      const newTrack = stream.getAudioTracks()[0];
      if (newTrack) {
        newTrack.enabled = isMicActive;
        const nextStream = new MediaStream([
          ...(localStreamRef.current?.getVideoTracks() || []),
          newTrack,
        ]);
        localStreamRef.current = nextStream;
        setActiveStream(nextStream);
      }
    } catch (err: any) {
      setMicError(getDetailedMediaErrorMessage(err, 'microphone'));
    }
  };

  // Change Speaker Device
  const handleSelectSpeaker = async (newSpeakerId: string) => {
    setSelectedSpeakerId(newSpeakerId);
    if (videoPreviewRef.current) {
      const res = await assignAudioOutputSink(videoPreviewRef.current, newSpeakerId);
      if (!res.supported) {
        setSpeakerTestFeedback('Device routes audio to system default speaker.');
        setTimeout(() => setSpeakerTestFeedback(null), 3000);
      }
    }
  };

  const handleTestSpeaker = async () => {
    setIsTestingSpeaker(true);
    setSpeakerTestFeedback('Playing test chime...');
    await playTestSpeakerChime(selectedSpeakerId);
    setSpeakerTestFeedback('Test complete. Did you hear the chime?');
    setIsTestingSpeaker(false);
    setTimeout(() => setSpeakerTestFeedback(null), 4000);
  };

  const handleRetryPermissions = async () => {
    setCameraError(null);
    setMicError(null);
    setLaunchError(null);
    setIsCameraActive(true);
    setIsMicActive(true);
    await initializeMediaAccess({ wantVideo: true, wantAudio: true });
  };

  const handleOpenDeviceSettings = async () => {
    const opened = await openNativeDeviceSettings();
    if (!opened) {
      setIsHelpModalOpen(true);
    }
  };

  const handleNavigateBackSafe = () => {
    handedOffRef.current = false;
    stopMediaStream(localStreamRef.current);
    localStreamRef.current = null;
    setActiveStream(null);
    onNavigateBack();
  };

  // Student Join Live Class Flow
  const handleStudentJoin = async (listenOnly: boolean = false) => {
    setIsLaunchingSession(true);
    setLaunchError(null);
    try {
      if (listenOnly) {
        stopMediaStream(localStreamRef.current);
        localStreamRef.current = null;
        setActiveStream(null);
        handedOffRef.current = true;
        onJoinSuccess(null, true, true, {
          cameraId: selectedCameraId,
          micId: selectedMicId,
          speakerId: selectedSpeakerId,
          facingMode,
        });
        return;
      }

      let streamToUse = localStreamRef.current;
      if (!streamToUse) {
        streamToUse = await initializeMediaAccess({ wantVideo: true, wantAudio: true });
      }

      handedOffRef.current = true;
      onJoinSuccess(streamToUse, !isMicActive || !streamToUse?.getAudioTracks().length, !isCameraActive || !streamToUse?.getVideoTracks().length, {
        cameraId: selectedCameraId,
        micId: selectedMicId,
        speakerId: selectedSpeakerId,
        facingMode,
      });
    } catch (err: any) {
      setLaunchError(err?.message || 'Unable to join classroom.');
    } finally {
      setIsLaunchingSession(false);
    }
  };

  // Teacher Start Live Class Flow: only creates backend live session once devices are ready
  const handleTeacherStartLive = async () => {
    setIsLaunchingSession(true);
    setLaunchError(null);

    try {
      if (!securityStatus.isSecure) {
        setLaunchError(securityStatus.error);
        return;
      }

      let streamToUse = localStreamRef.current;
      if (!streamToUse || streamToUse.getTracks().length === 0) {
        streamToUse = await initializeMediaAccess({ wantVideo: true, wantAudio: true });
      }

      if (!streamToUse || streamToUse.getTracks().length === 0) {
        setLaunchError(
          'Allow camera or microphone access first so your live lecture can start.'
        );
        return;
      }

      // Devices are verified & active -> now activate the real live session on backend
      const { api } = await import('../../services/api');
      const startRes = await api.startLiveClass(
        classId,
        sessionTitle || `${className || 'Live'} Lecture Session`
      );

      handedOffRef.current = true;
      const devicesPayload: SelectedLiveDevices = {
        cameraId: selectedCameraId,
        micId: selectedMicId,
        speakerId: selectedSpeakerId,
        facingMode,
      };

      const audioMuted = !isMicActive || streamToUse.getAudioTracks().length === 0;
      const videoMuted = !isCameraActive || streamToUse.getVideoTracks().length === 0;

      if (onStartLiveSuccess) {
        onStartLiveSuccess(streamToUse, audioMuted, videoMuted, startRes, devicesPayload);
      } else {
        onJoinSuccess(streamToUse, audioMuted, videoMuted, devicesPayload);
      }
    } catch (err: any) {
      console.warn('Teacher start live session error:', err);
      setLaunchError(err?.message || 'Failed to start live lecture session.');
    } finally {
      setIsLaunchingSession(false);
    }
  };

  const hasLiveVideo = Boolean(activeStream && activeStream.getVideoTracks().length > 0 && isCameraActive);
  const hasLiveAudio = Boolean(activeStream && activeStream.getAudioTracks().length > 0 && isMicActive);

  const isCamBlocked = cameraPermissionStatus === 'permanently_denied' || cameraPermissionStatus === 'blocked';
  const isMicBlocked = micPermissionStatus === 'permanently_denied' || micPermissionStatus === 'blocked';
  const anyPermanentlyDenied = isCamBlocked || isMicBlocked;
  const canFlipCamera =
    cameraPermissionStatus === 'granted' && (availableCameras.length > 1 || isMobileDevice);

  const camBadge = getPermissionLabel(cameraPermissionStatus);
  const micBadge = getPermissionLabel(micPermissionStatus);

  return (
    <div className="min-h-dvh w-full bg-slate-950 text-slate-100 flex flex-col pt-safe">
      {/* Top Bar */}
      <header className="min-h-[56px] sm:min-h-[60px] shrink-0 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md px-3 sm:px-8 py-2 flex items-center justify-between gap-2 sticky top-0 z-30">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <button
            onClick={handleNavigateBackSafe}
            aria-label="Back to Dashboard"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0 cursor-pointer active:scale-95"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
              <h1 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                {isTeacher ? 'Start Live Class' : 'Join Live Class'}
              </h1>
            </div>
            <p className="text-xs text-slate-400 truncate">
              {className ? `${className} ${section ? `· Sec ${section}` : ''}` : 'Interactive Classroom'}
              {sessionTitle ? ` · ${sessionTitle}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95"
            title="Device Settings"
          >
            <Settings className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Device Settings</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-3 pt-4 pb-12 sm:p-8 sm:pb-14 pb-safe-lg flex flex-col lg:flex-row items-stretch lg:items-center justify-start lg:justify-center gap-5 sm:gap-8">
        {/* Left Side: Real Camera Video Preview & Quick Controls */}
        <div className="w-full lg:w-3/5 flex flex-col items-center">
          <div className="relative w-full min-h-[240px] sm:min-h-0 aspect-video max-w-xl bg-slate-900 border-2 border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex items-center justify-center group">
            {/* Real HTML5 Video Preview Element (Muted locally to prevent echo) */}
            <video
              ref={videoPreviewRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                hasLiveVideo
                  ? facingMode === 'user'
                    ? 'opacity-100 scale-x-[-1]'
                    : 'opacity-100'
                  : 'opacity-0'
              }`}
            />

            {/* Calm Preview Overlay ONLY when requesting, turned off, or denied */}
            {!hasLiveVideo && (
              <div className="absolute inset-0 flex flex-col items-center justify-center px-4 pt-4 pb-16 sm:p-6 sm:pb-16 text-center bg-slate-900/95 space-y-2.5">
                {isRequestingPermission ? (
                  <>
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
                      <RefreshCw className="w-6 h-6 animate-spin" />
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-white">
                        Requesting Camera &amp; Microphone Access...
                      </h3>
                      <p className="text-[11px] sm:text-xs text-slate-400 mt-1 max-w-xs">
                        Tap Allow in the system permission popup to start your live preview.
                      </p>
                    </div>
                  </>
                ) : cameraPermissionStatus === 'granted' ? (
                  <>
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
                      <VideoOff className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-white">Camera Paused</h3>
                      <p className="text-[11px] sm:text-xs text-slate-400 mt-1 max-w-xs">
                        Tap the camera icon below whenever you are ready to turn video back on.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400">
                      {isCamBlocked ? <ShieldAlert className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-white">
                        {cameraPermissionStatus === 'unavailable'
                          ? 'Camera Unavailable'
                          : isCamBlocked
                          ? 'Camera Permission Blocked'
                          : 'Camera Access Needed'}
                      </h3>
                      <p className="text-[11px] sm:text-xs text-slate-400 mt-1 max-w-xs">
                        {cameraError || 'Grant camera access to preview your live video before starting.'}
                      </p>
                    </div>

                    {isCamBlocked ? (
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        <button
                          onClick={handleOpenDeviceSettings}
                          className="min-h-[40px] px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                        >
                          <Settings className="w-3.5 h-3.5" />
                          <span>{nativeSettingsSupported ? 'Open Device Settings' : 'Enable in Browser'}</span>
                        </button>
                        <button
                          onClick={handleRetryPermissions}
                          className="min-h-[40px] px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Try Again</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleRetryPermissions}
                        disabled={isRequestingPermission}
                        className="min-h-[40px] px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Allow Camera &amp; Microphone</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Bottom In-Preview Quick Controls */}
            <div className="absolute bottom-2.5 sm:bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 sm:gap-2.5 z-20 bg-slate-950/85 backdrop-blur-md px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl border border-slate-800 shadow-xl">
              <button
                onClick={handleToggleMic}
                className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl transition-all cursor-pointer active:scale-95 ${
                  hasLiveAudio
                    ? 'bg-slate-800 text-white hover:bg-slate-700'
                    : 'bg-red-600 text-white hover:bg-red-500'
                }`}
                title={hasLiveAudio ? 'Mute Microphone' : 'Unmute Microphone'}
              >
                {hasLiveAudio ? (
                  <Mic className="w-5 h-5 text-emerald-400" />
                ) : (
                  <MicOff className="w-5 h-5" />
                )}
              </button>

              <button
                onClick={handleToggleCamera}
                className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl transition-all cursor-pointer active:scale-95 ${
                  hasLiveVideo
                    ? 'bg-slate-800 text-white hover:bg-slate-700'
                    : 'bg-red-600 text-white hover:bg-red-500'
                }`}
                title={hasLiveVideo ? 'Turn Camera Off' : 'Turn Camera On'}
              >
                {hasLiveVideo ? (
                  <Video className="w-5 h-5 text-cyan-300" />
                ) : (
                  <VideoOff className="w-5 h-5" />
                )}
              </button>

              {canFlipCamera && (
                <button
                  onClick={handleFlipCamera}
                  disabled={isSwitchingCamera}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  title="Switch Front / Rear Camera"
                >
                  <SwitchCamera className={`w-5 h-5 ${isSwitchingCamera ? 'animate-spin text-cyan-400' : ''}`} />
                </button>
              )}

              <button
                onClick={() => setIsSettingsModalOpen(true)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-all cursor-pointer active:scale-95"
                title="Audio & Video Settings"
              >
                <Sliders className="w-5 h-5" />
              </button>
            </div>

            {/* Real Audio Level Indicator Floating Tag */}
            {hasLiveAudio && (
              <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 flex items-center gap-1.5 sm:gap-2 bg-slate-950/80 backdrop-blur-md px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-slate-800 text-[11px] font-mono">
                <Mic className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="hidden sm:inline text-slate-300">Mic Active</span>
                <div className="w-12 sm:w-16 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-75"
                    style={{ width: `${micLevelPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Secure Context Notification ONLY if Insecure */}
          {!securityStatus.isSecure && (
            <div className="w-full max-w-xl mt-4 p-3.5 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-3 text-xs text-red-300">
              <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
              <p>{securityStatus.error}</p>
            </div>
          )}

          {/* Dedicated Live Session Launch / Authorization Error Banner */}
          {launchError && (
            <div className="w-full max-w-xl mt-4 p-4 bg-red-950/50 border border-red-500/40 rounded-2xl space-y-3">
              <div className="flex items-start gap-2.5 text-xs">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="min-w-0 space-y-1">
                  <div className="font-semibold text-red-200">
                    {isTeacher ? 'Unable to Start Live Session' : 'Unable to Join Live Class'}
                  </div>
                  <p className="text-red-300/95 leading-relaxed break-words">{launchError}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-red-500/20">
                <button
                  type="button"
                  onClick={() => {
                    if (isTeacher) {
                      void handleTeacherStartLive();
                    } else {
                      void handleStudentJoin(false);
                    }
                  }}
                  disabled={isLaunchingSession || isRequestingPermission}
                  className="min-h-[40px] px-3.5 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLaunchingSession ? 'animate-spin' : ''}`} />
                  <span>{isLaunchingSession ? 'Retrying...' : 'Try Again'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleNavigateBackSafe}
                  className="min-h-[40px] px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer active:scale-95"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          )}

          {/* Clean, Separate Camera / Microphone Error Banner — shown ONLY when a real device/permission issue exists */}
          {(cameraError || micError) && securityStatus.isSecure && (
            <div className="w-full max-w-xl mt-4 p-4 bg-slate-900 border border-amber-500/35 rounded-2xl space-y-3">
              <div className="space-y-2">
                {cameraError && (
                  <div className="flex items-start gap-2.5 text-xs">
                    <VideoOff className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="font-semibold text-white">Camera: </span>
                      <span className="text-slate-300">{cameraError}</span>
                    </div>
                  </div>
                )}

                {micError && (
                  <div className="flex items-start gap-2.5 text-xs">
                    <MicOff className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="font-semibold text-white">Microphone: </span>
                      <span className="text-slate-300">{micError}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={handleRetryPermissions}
                  disabled={isRequestingPermission}
                  className="min-h-[40px] px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRequestingPermission ? 'animate-spin' : ''}`} />
                  <span>Try Again</span>
                </button>

                {anyPermanentlyDenied && nativeSettingsSupported && (
                  <button
                    onClick={handleOpenDeviceSettings}
                    className="min-h-[40px] px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Open Device Settings</span>
                  </button>
                )}

                {anyPermanentlyDenied && !nativeSettingsSupported && (
                  <button
                    onClick={() => setIsHelpModalOpen(true)}
                    className="min-h-[40px] px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Permission Settings Guide</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Device Selection & Join Action Card */}
        <div className="w-full lg:w-2/5 max-w-md bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl flex flex-col space-y-5">
          <div>
            <h2 className="type-card-title text-white">
              {isTeacher ? 'Ready to Start Lecture?' : 'Ready to Join Class?'}
            </h2>
            <p className="type-helper text-slate-400 mt-1">
              Verify your camera, microphone, and speaker before entering the room.
            </p>
          </div>

          {/* Device Selection Pickers */}
          <div className="space-y-4">
            {/* Camera Picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <Video className="w-3.5 h-3.5 text-cyan-400" /> Camera
                </span>
                <span className={`text-[11px] font-semibold ${camBadge.tone}`}>
                  {camBadge.text}
                </span>
              </label>
              <select
                value={selectedCameraId}
                onChange={(e) => handleSelectCamera(e.target.value)}
                disabled={cameraPermissionStatus !== 'granted'}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-hidden focus:border-cyan-500 transition-colors disabled:opacity-60"
              >
                <option value="default">Default Camera</option>
                {availableCameras.map((cam, idx) => (
                  <option key={cam.deviceId || idx} value={cam.deviceId}>
                    {cam.label || `Camera ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Microphone Picker + Real Activity Meter */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-emerald-400" /> Microphone
                </span>
                <span className={`text-[11px] font-semibold ${micBadge.tone}`}>
                  {micBadge.text}
                </span>
              </label>
              <select
                value={selectedMicId}
                onChange={(e) => handleSelectMic(e.target.value)}
                disabled={micPermissionStatus !== 'granted'}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-hidden focus:border-cyan-500 transition-colors disabled:opacity-60"
              >
                <option value="default">Default Microphone</option>
                {availableMics.map((mic, idx) => (
                  <option key={mic.deviceId || idx} value={mic.deviceId}>
                    {mic.label || `Microphone ${idx + 1}`}
                  </option>
                ))}
              </select>

              <div className="pt-1 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-75"
                    style={{ width: `${micLevelPercent}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-400 font-mono w-8 text-right">
                  {micLevelPercent}%
                </span>
              </div>
            </div>

            {/* Speaker Picker + Test Button */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" /> Speaker
                </span>
                <span className="text-[11px] text-slate-400">
                  {isSinkIdSupported ? 'Custom Output' : 'System Default'}
                </span>
              </label>
              <div className="flex gap-2 min-w-0">
                <select
                  value={selectedSpeakerId}
                  onChange={(e) => handleSelectSpeaker(e.target.value)}
                  className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-hidden focus:border-cyan-500 transition-colors"
                >
                  <option value="default">Default Speaker</option>
                  {availableSpeakers.map((spk, idx) => (
                    <option key={spk.deviceId || idx} value={spk.deviceId}>
                      {spk.label || `Speaker ${idx + 1}`}
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleTestSpeaker}
                  disabled={isTestingSpeaker}
                  className="min-h-[42px] px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors shrink-0 flex items-center gap-1 cursor-pointer active:scale-95"
                  title="Test Speaker Audio"
                >
                  {isTestingSpeaker ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  ) : (
                    <Headphones className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <span>Test</span>
                </button>
              </div>
              {speakerTestFeedback && (
                <p className="text-[11px] text-amber-300 italic pt-0.5">{speakerTestFeedback}</p>
              )}
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div className="space-y-2.5 pt-2">
            {isTeacher ? (
              <button
                onClick={handleTeacherStartLive}
                disabled={isLaunchingSession || isRequestingPermission}
                className="w-full min-h-[48px] py-3 px-4 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] disabled:opacity-60 text-white rounded-xl text-sm font-bold shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLaunchingSession ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Radio className="w-4 h-4 animate-pulse" />
                )}
                <span>{isLaunchingSession ? 'Starting Live Class...' : 'Start Live Class'}</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleStudentJoin(false)}
                  disabled={isLaunchingSession || isRequestingPermission}
                  className="w-full min-h-[48px] py-3 px-4 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] disabled:opacity-60 text-white rounded-xl text-sm font-bold shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLaunchingSession ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>{isLaunchingSession ? 'Joining Classroom...' : 'Join Live Class'}</span>
                </button>

                <button
                  onClick={() => handleStudentJoin(true)}
                  disabled={isLaunchingSession}
                  className="w-full min-h-[44px] py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                >
                  <span>Join Without Camera &amp; Microphone (Listen Only)</span>
                </button>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Permission Help Modal (Only opened manually when permanently denied) */}
      <PermissionHelpModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        onRetry={handleRetryPermissions}
      />

      {/* Device Settings Modal */}
      <DeviceSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        availableCameras={availableCameras}
        availableMics={availableMics}
        availableSpeakers={availableSpeakers}
        currentCameraId={selectedCameraId}
        currentMicId={selectedMicId}
        currentSpeakerId={selectedSpeakerId}
        isSinkIdSupported={isSinkIdSupported}
        onRefreshDevices={refreshDevices}
        onApplySettings={async (camId, micId, spkId) => {
          setSelectedCameraId(camId);
          setSelectedMicId(micId);
          setSelectedSpeakerId(spkId);
          await initializeMediaAccess({
            targetCamId: camId,
            targetMicId: micId,
            wantVideo: true,
            wantAudio: true,
          });
          setIsSettingsModalOpen(false);
        }}
      />
    </div>
  );
};
