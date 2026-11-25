import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  Hand,
  PhoneOff,
  Volume2,
  VolumeX,
  Users,
  MessageSquare,
  Shield,
  CheckCircle2,
  AlertCircle,
  Clock,
  Send,
  User,
  Maximize2,
  Minimize2,
  X,
  ArrowLeft,
  UserMinus,
  Sparkles,
  Radio,
  Settings,
  HelpCircle,
  SwitchCamera,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { LiveParticipant } from '../types';
import { DeviceSettingsModal } from '../components/DeviceSettingsModal';
import { LiveClassPreJoinView, SelectedLiveDevices } from '../components/live/LiveClassPreJoinView';
import { PermissionHelpModal } from '../components/live/PermissionHelpModal';
import {
  CameraFacingMode,
  getDetailedMediaErrorMessage,
  switchCameraTrack,
  stopMediaStream,
  canOpenNativeDeviceSettings,
  openNativeDeviceSettings,
  detectMediaPlatform,
} from '../utils/mediaUtils';

interface Props {
  classId: string;
  sessionId?: string;
  sessionTitle?: string;
  onNavigate: (view: string, params?: any) => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};

// ========================================================
// PARTICIPANT VIDEO TILE COMPONENT (Google Meet Style)
// ========================================================
interface VideoTileProps {
  participant: LiveParticipant;
  stream: MediaStream | null;
  isSelf: boolean;
  isTeacherUser: boolean;
  isSpeakerMuted: boolean;
  isSpeaking: boolean;
  isMirrored?: boolean;
  selectedSpeakerId?: string;
  onMuteStudent?: (userId: string) => void;
  onLowerHand?: (userId: string) => void;
  onRemoveStudent?: (userId: string, name: string) => void;
}

const ParticipantVideoTile: React.FC<VideoTileProps> = ({
  participant,
  stream,
  isSelf,
  isTeacherUser,
  isSpeakerMuted,
  isSpeaking,
  isMirrored,
  selectedSpeakerId,
  onMuteStudent,
  onLowerHand,
  onRemoveStudent,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isInstructor = participant.role === 'teacher';

  useEffect(() => {
    if (!videoRef.current) return;
    if (stream && stream.getTracks().length > 0) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
      videoRef.current.play().catch((err) => {
        console.warn('Video tile playback notice:', err.message);
      });
    } else {
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  // Route remote audio to selected audio output device where supported (HTMLMediaElement.setSinkId)
  useEffect(() => {
    if (videoRef.current && typeof (videoRef.current as any).setSinkId === 'function' && selectedSpeakerId) {
      (videoRef.current as any).setSinkId(selectedSpeakerId === 'default' ? '' : selectedSpeakerId).catch((err: any) => {
        console.warn('Video tile setSinkId notice:', err.message);
      });
    }
  }, [selectedSpeakerId, stream]);

  const hasVideoTrack = stream && stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled && !participant.isCamOff;

  return (
    <div
      className={`relative w-full h-full min-h-[140px] rounded-2xl overflow-hidden bg-slate-900 border transition-all flex items-center justify-center group ${
        isSpeaking
          ? 'border-emerald-400 ring-2 ring-emerald-400/50 shadow-[0_0_20px_rgba(52,211,153,0.3)]'
          : isInstructor
          ? 'border-cyan-500/40'
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isSelf || isSpeakerMuted} // Mute self to prevent feedback loop
        className={`w-full h-full object-contain bg-black ${hasVideoTrack ? 'block' : 'hidden'} ${isMirrored ? 'scale-x-[-1]' : ''}`}
      />

      {/* Camera OFF Placeholder (Google Meet Style Avatar Card) */}
      {!hasVideoTrack && (
        <div className="text-center space-y-2.5 p-4 z-10 select-none">
          <div className="relative inline-block">
            <div
              className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-xl sm:text-2xl font-bold shadow-xl mx-auto ${
                isInstructor
                  ? 'bg-gradient-to-tr from-cyan-600 to-cyan-400 text-slate-950 font-bold ring-4 ring-cyan-500/20'
                  : 'bg-gradient-to-tr from-slate-700 to-slate-800 text-white ring-4 ring-slate-800'
              }`}
            >
              {participant.userName?.[0] || 'U'}
            </div>

            {isSpeaking && (
              <span
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-slate-950 flex items-center justify-center text-slate-950 shadow-md"
                title="Speaking"
              >
                <Mic className="w-3.5 h-3.5" />
              </span>
            )}
          </div>

          <div className="space-y-0.5">
            <div className="text-xs sm:text-sm font-bold text-white truncate max-w-[180px] mx-auto">
              {participant.userName}
            </div>
            <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
              <VideoOff className="w-3 h-3 text-slate-500" />
              <span>Camera OFF</span>
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY: Top-Left (Name & Role Tag) */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 z-20">
        <div className="px-2.5 py-1 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800 text-xs font-semibold text-white flex items-center gap-1.5 shadow-md">
          {isInstructor && <Shield className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
          <span className="truncate max-w-[130px] sm:max-w-[180px]">{participant.userName}</span>
          {isSelf && <span className="text-[10px] text-cyan-400 font-normal">(You)</span>}
        </div>

        {isInstructor ? (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950/90 text-cyan-300 border border-cyan-500/40">
            Instructor
          </span>
        ) : (
          <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-800/90 text-slate-300 border border-slate-700">
            Student
          </span>
        )}
      </div>

      {/* OVERLAY: Top-Right (Hand Raised Badge) */}
      {participant.hasRaisedHand && (
        <div className="absolute top-3 right-3 z-20">
          <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 animate-bounce">
            <span className="text-sm">✋</span>
            <span className="text-[11px]">Hand Raised</span>
          </span>
        </div>
      )}

      {/* OVERLAY: Bottom-Left (Mic Status & Speaking Wave) */}
      <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5">
        <div
          className={`p-1.5 rounded-lg backdrop-blur-md border shadow-md flex items-center gap-1 text-[11px] ${
            participant.isMuted
              ? 'bg-red-950/80 border-red-500/40 text-red-400'
              : 'bg-slate-950/80 border-slate-800 text-emerald-400'
          }`}
          title={participant.isMuted ? 'Microphone Muted' : 'Microphone Active'}
        >
          {participant.isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          {isSpeaking && !participant.isMuted && (
            <span className="font-semibold text-[10px] animate-pulse">Speaking</span>
          )}
        </div>
      </div>

      {/* OVERLAY: Bottom-Right (Teacher Moderation Controls on Students) */}
      {isTeacherUser && !isInstructor && !isSelf && (
        <div className="absolute bottom-2.5 right-2.5 z-20 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-slate-950/90 p-1 rounded-xl border border-slate-800 shadow-xl backdrop-blur-md">
          {!participant.isMuted && onMuteStudent && (
            <button
              onClick={() => onMuteStudent(participant.userId)}
              className="px-2 py-1 bg-red-950 hover:bg-red-900 text-red-300 border border-red-500/40 rounded-lg text-[10px] font-bold transition-colors"
              title="Mute Student"
            >
              Mute
            </button>
          )}

          {participant.hasRaisedHand && onLowerHand && (
            <button
              onClick={() => onLowerHand(participant.userId)}
              className="px-2 py-1 bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-500/40 rounded-lg text-[10px] font-bold transition-colors"
              title="Lower Hand"
            >
              Lower
            </button>
          )}

          {onRemoveStudent && (
            <button
              onClick={() => onRemoveStudent(participant.userId, participant.userName)}
              className="p-1 bg-slate-800 hover:bg-red-950 hover:text-red-400 text-slate-400 rounded-lg transition-colors"
              title="Remove student from classroom"
            >
              <UserMinus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ========================================================
// MAIN FULL-SCREEN LIVE CLASSROOM VIEW
// ========================================================
export const LiveClassroomView: React.FC<Props> = ({ classId, sessionId, sessionTitle, onNavigate }) => {
  const { user } = useAuth();
  const isTeacher = user?.role === 'teacher';

  // Google Meet Green Room / Pre-Join State (Requirement #14 & #15)
  const [isJoined, setIsJoined] = useState<boolean>(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState<boolean>(false);

  // Room & Connection states
  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error'
  >('connecting');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [roomInfo, setRoomInfo] = useState<any | null>(null);
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [newChatMessage, setNewChatMessage] = useState<string>('');
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);

  // Local Media states
  const [isMicOn, setIsMicOn] = useState<boolean>(isTeacher);
  const [isCamOn, setIsCamOn] = useState<boolean>(true);
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [hasRaisedHand, setHasRaisedHand] = useState<boolean>(false);

  // Speaker & Audio states
  const [isSpeakerMuted, setIsSpeakerMuted] = useState<boolean>(false);
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState<boolean>(false);
  const [isAudioTesting, setIsAudioTesting] = useState<boolean>(false);
  const [audioTestStatus, setAudioTestStatus] = useState<string | null>(null);

  // Voice-driven active speaker detection
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);

  // Permission error states
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [screenShareError, setScreenShareError] = useState<string | null>(null);

  // Device Selection & Hardware States (Requirements #1, #2, #3, #4, #5, #6, #7, #8, #13)
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [availableMics, setAvailableMics] = useState<MediaDeviceInfo[]>([]);
  const [availableSpeakers, setAvailableSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('default');
  const [selectedMicId, setSelectedMicId] = useState<string>('default');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>('default');
  const [facingMode, setFacingMode] = useState<CameraFacingMode>('user');
  const [isSwitchingCamera, setIsSwitchingCamera] = useState<boolean>(false);
  const [localMediaVersion, setLocalMediaVersion] = useState<number>(0);
  const [isDeviceSettingsOpen, setIsDeviceSettingsOpen] = useState<boolean>(false);
  const [deviceNotification, setDeviceNotification] = useState<string | null>(null);
  const isSinkIdSupported = typeof window !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  const nativeSettingsSupported = canOpenNativeDeviceSettings();
  const currentPlatform = detectMediaPlatform();
  const isMobileDevice =
    currentPlatform === 'android_capacitor' ||
    currentPlatform === 'ios_capacitor' ||
    currentPlatform === 'android_browser' ||
    currentPlatform === 'ios_browser';

  // Modals & Notices
  const [isEndModalOpen, setIsEndModalOpen] = useState<boolean>(false);
  const [participantToRemove, setParticipantToRemove] = useState<{ id: string; name: string } | null>(null);
  const [handRaisedNotice, setHandRaisedNotice] = useState<{ userId: string; userName: string } | null>(null);
  const [classEndedNotice, setClassEndedNotice] = useState<string | null>(null);
  const [removedNotice, setRemovedNotice] = useState<string | null>(null);

  // Sidebar visibility and tabs (Google Meet style)
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [sidebarTab, setSidebarTab] = useState<'participants' | 'chat'>('chat');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Browser Fullscreen API state
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState<boolean>(false);

  // Remote WebRTC Media Streams map: userId -> MediaStream
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});

  // Stream & Hardware Refs
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceCandidateQueuesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const isCamRequestInFlightRef = useRef<boolean>(false);
  const isMicRequestInFlightRef = useRef<boolean>(false);

  // Prevent outer page scrolling while inside classroom and stop hardware on sudden page close
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onPageHide = () => {
      stopMediaStream(localStreamRef.current);
      stopMediaStream(screenStreamRef.current);
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  // Sync browser fullscreen state changes
  useEffect(() => {
    const onFsChange = () => {
      setIsBrowserFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleToggleBrowserFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('Fullscreen request blocked:', err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isSidebarOpen, sidebarTab]);

  // Session duration timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Enumerate & Refresh Available Media Devices
  const refreshDeviceList = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === 'videoinput');
      const mics = devices.filter((d) => d.kind === 'audioinput');
      const speakers = devices.filter((d) => d.kind === 'audiooutput');
      setAvailableCameras(cams);
      setAvailableMics(mics);
      setAvailableSpeakers(speakers);
    } catch (err) {
      console.warn('enumerateDevices notice:', err);
    }
  };

  // Listen for device connects / disconnects (Requirement #13)
  useEffect(() => {
    refreshDeviceList();

    const handleDeviceChange = async () => {
      await refreshDeviceList();
      setDeviceNotification('Your camera/microphone/audio device changed.');
      setTimeout(() => setDeviceNotification(null), 4000);
    };

    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      };
    }
  }, []);

  // Device Switching without leaving room or reloading page
  const handleApplyDeviceSettings = async (
    newCamId: string,
    newMicId: string,
    newSpeakerId: string
  ) => {
    // 1. Camera switch (stops previous sensor first so mobile front/rear sensors never collide)
    if (newCamId !== selectedCameraId || !localStreamRef.current?.getVideoTracks().length) {
      try {
        const switched = await switchCameraTrack({
          currentStream: localStreamRef.current,
          targetDeviceId: newCamId,
          targetFacingMode: facingMode,
          isCamEnabled: isCamOn,
        });

        localStreamRef.current = switched.stream;
        setLocalMediaVersion((v) => v + 1);

        // Update WebRTC senders using RTCRtpSender.replaceTrack()
        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(switched.track).catch((err) => console.warn('replaceTrack video error:', err));
          } else {
            pc.addTrack(switched.track, switched.stream);
          }
        });

        setSelectedCameraId(switched.deviceId);
        setFacingMode(switched.facingMode);
        setCameraError(null);
      } catch (err: any) {
        console.warn('Switch camera error:', err);
        setCameraError(getDetailedMediaErrorMessage(err, 'camera'));
      }
    }

    // 2. Microphone switch
    if (newMicId !== selectedMicId || !localStreamRef.current?.getAudioTracks().length) {
      try {
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach((oldTrack) => {
            oldTrack.stop();
            localStreamRef.current?.removeTrack(oldTrack);
          });
        }

        const constraints: MediaStreamConstraints = {
          audio:
            newMicId === 'default'
              ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
              : { deviceId: { exact: newMicId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        };
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        const newAudioTrack = newStream.getAudioTracks()[0];

        if (newAudioTrack) {
          newAudioTrack.enabled = isMicOn;
          const preservedVideo = localStreamRef.current?.getVideoTracks() || [];
          localStreamRef.current = new MediaStream([...preservedVideo, newAudioTrack]);
          setLocalMediaVersion((v) => v + 1);

          peerConnectionsRef.current.forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
            if (sender) {
              sender.replaceTrack(newAudioTrack).catch((err) => console.warn('replaceTrack audio error:', err));
            } else if (localStreamRef.current) {
              pc.addTrack(newAudioTrack, localStreamRef.current);
            }
          });
        }

        setSelectedMicId(newMicId);
        setMicError(null);
      } catch (err: any) {
        console.warn('Switch microphone error:', err);
        setMicError(getDetailedMediaErrorMessage(err, 'microphone'));
      }
    }

    // 3. Speaker switch
    if (newSpeakerId !== selectedSpeakerId) {
      setSelectedSpeakerId(newSpeakerId);
      if (isSinkIdSupported) {
        document.querySelectorAll('video, audio').forEach((el) => {
          const mediaEl = el as any;
          if (typeof mediaEl.setSinkId === 'function') {
            mediaEl.setSinkId(newSpeakerId === 'default' ? '' : newSpeakerId).catch((e: any) => {
              console.warn('setSinkId element error:', e);
            });
          }
        });
      }
    }

    await refreshDeviceList();
  };

  // One-tap Front <-> Rear camera switch during live session
  const handleFlipCamera = async () => {
    if (isSwitchingCamera || isCamRequestInFlightRef.current) return;
    setIsSwitchingCamera(true);
    setCameraError(null);

    try {
      const nextFacing: CameraFacingMode = facingMode === 'user' ? 'environment' : 'user';
      let targetDeviceId: string | undefined;
      if (availableCameras.length > 1 && !isMobileDevice) {
        const idx = availableCameras.findIndex((c) => c.deviceId === selectedCameraId);
        targetDeviceId = availableCameras[(idx + 1) % availableCameras.length]?.deviceId;
      }

      const switched = await switchCameraTrack({
        currentStream: localStreamRef.current,
        targetDeviceId,
        targetFacingMode: nextFacing,
        isCamEnabled: true,
      });

      localStreamRef.current = switched.stream;
      setSelectedCameraId(switched.deviceId);
      setFacingMode(switched.facingMode);
      setIsCamOn(true);
      setLocalMediaVersion((v) => v + 1);

      peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(switched.track).catch(() => {});
        } else {
          pc.addTrack(switched.track, switched.stream);
        }
      });

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'media-state', isCamOff: false }));
      }
      await refreshDeviceList();
    } catch (err: any) {
      setCameraError(getDetailedMediaErrorMessage(err, 'camera'));
    } finally {
      setIsSwitchingCamera(false);
    }
  };

  // Load metadata passively for Pre-Join screen without capturing media devices
  useEffect(() => {
    let isCancelled = false;
    const loadClassDetails = async () => {
      try {
        const res = await api.getSubject(classId);
        if (!isCancelled && res.subject) {
          setRoomInfo((prev: any) => ({
            ...prev,
            ...res.subject,
            sessionId: sessionId || res.subject.live_session?.id,
            sessionTitle: sessionTitle || res.subject.live_session?.session_title,
            teacherName: (res.subject as any).teacherName || res.subject.teacher_name || res.subject.live_session?.teacher_name,
          }));
        }
      } catch (err) {
        console.warn('Pre-join class metadata notice:', err);
      }
    };
    loadClassDetails();
    return () => {
      isCancelled = true;
    };
  }, [classId, sessionId, sessionTitle]);

  // ========================================================
  // 1. INITIALIZE CLASSROOM & WEBRTC MESH ONCE USER HAS JOINED
  // ========================================================
  useEffect(() => {
    if (!isJoined) return;

    let isCancelled = false;
    let reconnectTimeout: any = null;

    const initClassroom = async () => {
      setConnectionStatus('connecting');
      setStatusMessage('Verifying enrollment and entering live room...');
      setEnrollmentError(null);

      // Verify access on backend first (Security Section 19)
      try {
        const verifyRes = await api.joinLiveClass(classId);
        if (isCancelled) return;
        setRoomInfo((prev: any) => ({
          ...prev,
          ...verifyRes.class,
          sessionId: verifyRes.sessionId || sessionId || prev?.sessionId,
          roomId: verifyRes.roomId || sessionId || prev?.sessionId,
          sessionTitle: verifyRes.live_session?.session_title || prev?.sessionTitle || sessionTitle,
          teacherName: verifyRes.class?.teacherName || verifyRes.live_session?.teacher_name || prev?.teacherName,
        }));
      } catch (err: any) {
        if (isCancelled) return;
        if (err.message?.toLowerCase().includes('not enrolled')) {
          setEnrollmentError('You are not enrolled in this class. Access is restricted to enrolled students.');
          setConnectionStatus('error');
          return;
        } else {
          if (!isTeacher) {
            setEnrollmentError(err.message || 'Live session is not currently active.');
            setConnectionStatus('error');
            return;
          }
        }
      }

      // Populate hardware device names with labels now that permission has been granted
      await refreshDeviceList();

      // Connect to Real-time WebSocket Signaling Gateway
      connectWebSocket();
    };

    const connectWebSocket = async () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/live`;
      const targetRoomId = sessionId || `lsess_${classId}`;
      let token = api.getToken() || '';
      if (!token) {
        try {
          const { auth } = await import('../firebase');
          if (auth.currentUser) {
            token = await auth.currentUser.getIdToken();
          }
        } catch {
          // Handled by server auth rejection
        }
      }

      if (isCancelled) return;
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (isCancelled) return;
        setConnectionStatus('connected');
        setStatusMessage(null);

        socket.send(
          JSON.stringify({
            type: 'join-room',
            roomId: targetRoomId,
            classId,
            token,
          })
        );
      };

      socket.onmessage = async (event) => {
        if (isCancelled) return;
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'joined-success':
              setConnectionStatus('connected');
              setStatusMessage(null);
              setRoomInfo((prev: any) => ({
                ...prev,
                ...data.roomInfo,
              }));
              setParticipants(data.participants || []);
              setChatMessages(data.chatHistory || []);

              // Connect to all existing participants in the room via WebRTC
              if (data.participants && Array.isArray(data.participants)) {
                data.participants.forEach((p: LiveParticipant) => {
                  if (p.userId !== user?.id && !peerConnectionsRef.current.has(p.userId)) {
                    createPeerConnection(p.userId, true, socket, targetRoomId);
                  }
                });
              }
              break;

            case 'user-joined':
              setParticipants(data.participants || []);
              if (data.participant && data.participant.userId !== user?.id) {
                if (!peerConnectionsRef.current.has(data.participant.userId)) {
                  createPeerConnection(data.participant.userId, true, socket, targetRoomId);
                }
              }
              break;

            case 'user-left':
              setParticipants(data.participants || []);
              if (peerConnectionsRef.current.has(data.userId)) {
                peerConnectionsRef.current.get(data.userId)?.close();
                peerConnectionsRef.current.delete(data.userId);
              }
              setRemoteStreams((prev) => {
                const next = { ...prev };
                delete next[data.userId];
                return next;
              });
              break;

            case 'chat-message':
              setChatMessages((prev) => [...prev, data.message]);
              break;

            case 'hand-raise-update':
              setParticipants(data.participants || []);
              if (data.userId === user?.id) {
                setHasRaisedHand(data.hasRaisedHand);
              }
              if (isTeacher && data.hasRaisedHand && data.userId !== user?.id) {
                setHandRaisedNotice({ userId: data.userId, userName: data.userName });
              } else if (isTeacher && !data.hasRaisedHand && handRaisedNotice?.userId === data.userId) {
                setHandRaisedNotice(null);
              }
              break;

            case 'force-mute':
              if (localStreamRef.current) {
                localStreamRef.current.getAudioTracks().forEach((track) => {
                  track.enabled = false;
                });
              }
              setIsMicOn(false);
              setStatusMessage(`You were muted by the instructor (${data.by || 'Teacher'}).`);
              setTimeout(() => setStatusMessage(null), 4000);
              break;

            case 'removed-from-class':
              setRemovedNotice(data.message || 'You have been removed from this live class by the instructor.');
              stopAllMedia();
              setConnectionStatus('disconnected');
              break;

            case 'media-state-update':
              setParticipants(data.participants || []);
              break;

            case 'webrtc-signal':
              handleIncomingWebRtcSignal(data, socket, targetRoomId);
              break;

            case 'class-ended':
              setClassEndedNotice(data.message || 'The instructor has ended this live class session.');
              stopAllMedia();
              setConnectionStatus('disconnected');
              break;

            case 'error':
              setConnectionStatus('error');
              setStatusMessage(data.message);
              if (data.message?.toLowerCase().includes('not enrolled')) {
                setEnrollmentError(data.message);
              }
              break;
          }
        } catch (err) {
          console.error('Socket message parse error:', err);
        }
      };

      socket.onerror = (err) => {
        if (!isCancelled) {
          console.warn('Live classroom socket error event:', err);
          setConnectionStatus('reconnecting');
          setStatusMessage('Connection lost... Reconnecting...');
        }
      };

      socket.onclose = (event) => {
        if (!isCancelled && connectionStatus !== 'disconnected') {
          if (event.code === 4003 || event.code === 4004) {
            setEnrollmentError('You are not authorized to view this classroom.');
            setConnectionStatus('error');
          } else if (event.code === 4005) {
            setRemovedNotice('You have been removed from this live session.');
            setConnectionStatus('disconnected');
          } else {
            setConnectionStatus('reconnecting');
            setStatusMessage('Connection lost... Reconnecting...');
            reconnectTimeout = setTimeout(() => {
              if (!isCancelled) {
                connectWebSocket();
              }
            }, 2000);
          }
        }
      };
    };

    initClassroom();

    return () => {
      isCancelled = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      stopAllMedia();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'leave-room' }));
        wsRef.current.close(1000, 'User left');
      }
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
      iceCandidateQueuesRef.current.clear();
    };
  }, [isJoined, classId, sessionId]);

  // Clean media tracks immediately
  const stopAllMedia = () => {
    stopMediaStream(localStreamRef.current);
    localStreamRef.current = null;
    stopMediaStream(screenStreamRef.current);
    screenStreamRef.current = null;
  };

  // ========================================================
  // 2. WEBRTC MULTI-PEER FULL MESH ARCHITECTURE
  // ========================================================
  const createPeerConnection = async (
    targetUserId: string,
    isInitiator: boolean,
    socket: WebSocket,
    roomId: string
  ) => {
    try {
      if (peerConnectionsRef.current.has(targetUserId)) {
        peerConnectionsRef.current.get(targetUserId)?.close();
      }

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionsRef.current.set(targetUserId, pc);

      // Add local media tracks to peer connection
      const activeStream = screenStreamRef.current || localStreamRef.current;
      if (activeStream) {
        activeStream.getTracks().forEach((track) => {
          pc.addTrack(track, activeStream);
        });
      }

      // Handle remote incoming tracks
      pc.ontrack = (event) => {
        const remoteStream = event.streams[0] || new MediaStream([event.track]);
        setRemoteStreams((prev) => ({
          ...prev,
          [targetUserId]: remoteStream,
        }));
      };

      // ICE candidates exchange
      pc.onicecandidate = (event) => {
        if (event.candidate && socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: 'webrtc-signal',
              roomId,
              toUserId: targetUserId,
              signal: { type: 'candidate', candidate: event.candidate },
            })
          );
        }
      };

      // If initiator, create and send SDP offer
      if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: 'webrtc-signal',
              roomId,
              toUserId: targetUserId,
              signal: offer,
            })
          );
        }
      }

      return pc;
    } catch (err) {
      console.warn('Failed creating peer connection to', targetUserId, err);
      return null;
    }
  };

  const handleIncomingWebRtcSignal = async (data: any, socket: WebSocket, roomId: string) => {
    const { fromUserId, signal } = data;
    if (!fromUserId || !signal) return;

    let pc = peerConnectionsRef.current.get(fromUserId);

    try {
      if (signal.type === 'offer') {
        pc = await createPeerConnection(fromUserId, false, socket, roomId) as RTCPeerConnection;
        if (!pc) return;

        await pc.setRemoteDescription(new RTCSessionDescription(signal));

        // Process queued ice candidates
        const queued = iceCandidateQueuesRef.current.get(fromUserId) || [];
        for (const cand of queued) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch (e) {
            console.warn('Queued candidate resolution notice:', e);
          }
        }
        iceCandidateQueuesRef.current.delete(fromUserId);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: 'webrtc-signal',
              roomId,
              toUserId: fromUserId,
              signal: answer,
            })
          );
        }
      } else if (signal.type === 'answer') {
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));

          const queued = iceCandidateQueuesRef.current.get(fromUserId) || [];
          for (const cand of queued) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (e) {}
          }
          iceCandidateQueuesRef.current.delete(fromUserId);
        }
      } else if (signal.type === 'candidate' && signal.candidate) {
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } else {
          const currentQueue = iceCandidateQueuesRef.current.get(fromUserId) || [];
          currentQueue.push(signal.candidate);
          iceCandidateQueuesRef.current.set(fromUserId, currentQueue);
        }
      }
    } catch (err) {
      console.warn('WebRTC signal handling notice:', err);
    }
  };

  // ========================================================
  // 3. VOICE-DRIVEN ACTIVE SPEAKER DETECTION
  // ========================================================
  useEffect(() => {
    let audioCtx: AudioContext | null = null;
    let intervalId: any = null;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx: AudioContext = new AudioContextClass();
        audioCtx = ctx;
        const analysers = new Map<string, { analyser: AnalyserNode; data: any }>();

        // Local analyser
        if (localStreamRef.current && isMicOn) {
          const audioTracks = localStreamRef.current.getAudioTracks();
          if (audioTracks.length > 0 && audioTracks[0].enabled) {
            try {
              const src = ctx.createMediaStreamSource(localStreamRef.current);
              const node = ctx.createAnalyser();
              node.fftSize = 128;
              src.connect(node);
              analysers.set(user?.id || 'self', {
                analyser: node,
                data: new Uint8Array(node.frequencyBinCount),
              });
            } catch (e) {}
          }
        }

        // Remote analysers
        Object.entries(remoteStreams).forEach(([pId, stream]) => {
          const audioTracks = stream.getAudioTracks();
          if (audioTracks.length > 0 && audioTracks[0].enabled) {
            try {
              const src = ctx.createMediaStreamSource(stream);
              const node = ctx.createAnalyser();
              node.fftSize = 128;
              src.connect(node);
              analysers.set(pId, {
                analyser: node,
                data: new Uint8Array(node.frequencyBinCount),
              });
            } catch (e) {}
          }
        });

        intervalId = setInterval(() => {
          let highestVolume = 0;
          let loudestUserId: string | null = null;

          analysers.forEach(({ analyser, data }, pId) => {
            analyser.getByteFrequencyData(data);
            let total = 0;
            for (let i = 0; i < data.length; i++) {
              total += data[i];
            }
            const avg = total / data.length;
            if (avg > 15 && avg > highestVolume) {
              highestVolume = avg;
              loudestUserId = pId;
            }
          });

          setActiveSpeakerId(loudestUserId);
        }, 300);
      }
    } catch (err) {
      console.warn('Audio analyser setup note:', err);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    };
  }, [remoteStreams, isMicOn, user?.id, localMediaVersion]);

  // ========================================================
  // 4. HARDWARE TOGGLES & SCREEN SHARING
  // ========================================================
  const handleToggleMic = async () => {
    const existingAudioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (existingAudioTrack) {
      const nextState = !isMicOn;
      existingAudioTrack.enabled = nextState;
      setIsMicOn(nextState);
      setMicError(null);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'media-state',
            isMuted: !nextState,
          })
        );
      }
      return;
    }

    // Acquire microphone track on demand if none exists yet (e.g. after user grants permission)
    if (isMicRequestInFlightRef.current) return;
    isMicRequestInFlightRef.current = true;
    try {
      const constraints: MediaStreamConstraints = {
        audio:
          selectedMicId === 'default'
            ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            : { deviceId: { exact: selectedMicId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      };
      const audioStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newAudioTrack = audioStream.getAudioTracks()[0];
      if (!newAudioTrack) {
        throw Object.assign(new Error('No microphone detected.'), { name: 'NotFoundError' });
      }

      const existingVideoTracks = localStreamRef.current?.getVideoTracks() || [];
      localStreamRef.current = new MediaStream([...existingVideoTracks, newAudioTrack]);
      setLocalMediaVersion((v) => v + 1);

      peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
        if (sender) {
          sender.replaceTrack(newAudioTrack).catch(() => {});
        } else if (localStreamRef.current) {
          pc.addTrack(newAudioTrack, localStreamRef.current);
        }
      });

      setIsMicOn(true);
      setMicError(null);
      await refreshDeviceList();

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'media-state', isMuted: false }));
      }
    } catch (err: any) {
      setMicError(getDetailedMediaErrorMessage(err, 'microphone'));
    } finally {
      isMicRequestInFlightRef.current = false;
    }
  };

  const handleToggleCam = async () => {
    const existingVideoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (existingVideoTrack) {
      const nextState = !isCamOn;
      existingVideoTrack.enabled = nextState;
      setIsCamOn(nextState);
      setCameraError(null);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'media-state',
            isCamOff: !nextState,
          })
        );
      }
      return;
    }

    if (isCamRequestInFlightRef.current) return;
    isCamRequestInFlightRef.current = true;
    try {
      const switched = await switchCameraTrack({
        currentStream: localStreamRef.current,
        targetDeviceId: selectedCameraId,
        targetFacingMode: facingMode,
        isCamEnabled: true,
      });

      localStreamRef.current = switched.stream;
      setSelectedCameraId(switched.deviceId);
      setFacingMode(switched.facingMode);
      setLocalMediaVersion((v) => v + 1);

      peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(switched.track).catch(() => {});
        } else {
          pc.addTrack(switched.track, switched.stream);
        }
      });

      setIsCamOn(true);
      setCameraError(null);
      await refreshDeviceList();

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'media-state',
            isCamOff: false,
          })
        );
      }
    } catch (err: any) {
      setCameraError(getDetailedMediaErrorMessage(err, 'camera'));
    } finally {
      isCamRequestInFlightRef.current = false;
    }
  };

  // Screen Sharing
  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
      }
      setIsScreenSharing(false);

      if (localStreamRef.current) {
        const camTrack = localStreamRef.current.getVideoTracks()[0];
        if (camTrack) {
          peerConnectionsRef.current.forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
            if (sender) {
              sender.replaceTrack(camTrack).catch(() => {});
            }
          });
        }
      }

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'media-state',
            isScreenSharing: false,
          })
        );
      }
    } else {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        setScreenShareError('Screen sharing is not supported by your current browser.');
        return;
      }

      try {
        setScreenShareError(null);
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

        screenStreamRef.current = displayStream;
        setIsScreenSharing(true);

        const screenTrack = displayStream.getVideoTracks()[0];

        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender && screenTrack) {
            sender.replaceTrack(screenTrack).catch(() => {});
          }
        });

        screenTrack.onended = () => {
          if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach((track) => track.stop());
            screenStreamRef.current = null;
          }
          setIsScreenSharing(false);

          if (localStreamRef.current) {
            const camTrack = localStreamRef.current.getVideoTracks()[0];
            if (camTrack) {
              peerConnectionsRef.current.forEach((pc) => {
                const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
                if (sender) {
                  sender.replaceTrack(camTrack).catch(() => {});
                }
              });
            }
          }

          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: 'media-state',
                isScreenSharing: false,
              })
            );
          }
        };

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'media-state',
              isScreenSharing: true,
            })
          );
        }
      } catch (err: any) {
        if (err.name !== 'NotAllowedError') {
          setScreenShareError('Unable to share screen: ' + (err.message || 'Permission denied'));
        }
      }
    }
  };

  // Student Raise / Lower Hand
  const handleToggleRaiseHand = () => {
    const nextState = !hasRaisedHand;
    setHasRaisedHand(nextState);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'raise-hand',
          raised: nextState,
        })
      );
    }
  };

  // Speaker Controls & Autoplay Handling
  const handleEnableAudio = () => {
    setIsAutoplayBlocked(false);
    setIsSpeakerMuted(false);
  };

  const handleToggleSpeakerMute = () => {
    setIsSpeakerMuted(!isSpeakerMuted);
  };

  // Audio Chime Test
  const handlePlayAudioTest = () => {
    try {
      setIsAudioTesting(true);
      setAudioTestStatus('Playing speaker check chime...');

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        setAudioTestStatus('Web Audio API not supported on this browser.');
        setIsAudioTesting(false);
        return;
      }

      const ctx = new AudioCtx();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15); // E5

      gainNode.gain.setValueAtTime(0.18, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.3);
      osc2.start(ctx.currentTime + 0.15);
      osc2.stop(ctx.currentTime + 0.6);

      setTimeout(() => {
        setIsAudioTesting(false);
        setAudioTestStatus('Chime played successfully. Speaker is working.');
        setIsAutoplayBlocked(false);
        setTimeout(() => setAudioTestStatus(null), 5000);
      }, 700);
    } catch (err: any) {
      setIsAudioTesting(false);
      setAudioTestStatus('Speaker test issue: ' + err.message);
    }
  };

  // Teacher Moderation Actions
  const handleTeacherMuteStudent = (studentUserId: string) => {
    if (!isTeacher) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'mute-participant',
          targetUserId: studentUserId,
        })
      );
    }
  };

  const handleTeacherLowerHand = (studentUserId: string) => {
    if (!isTeacher) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'lower-hand',
          targetUserId: studentUserId,
        })
      );
    }
    if (handRaisedNotice?.userId === studentUserId) {
      setHandRaisedNotice(null);
    }
  };

  const handleConfirmRemoveParticipant = () => {
    if (!isTeacher || !participantToRemove) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'remove-participant',
          targetUserId: participantToRemove.id,
        })
      );
    }
    setParticipantToRemove(null);
  };

  // Real-time Chat
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatMessage.trim()) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'chat-message',
          text: newChatMessage.trim(),
        })
      );
      setNewChatMessage('');
    }
  };

  // Teacher End Class
  const handleConfirmEndClass = async () => {
    try {
      setIsEndModalOpen(false);
      stopAllMedia();

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'end-class',
            classId,
          })
        );
      }

      await api.endLiveClass(classId);
      onNavigate('teacher_dashboard');
    } catch (err: any) {
      console.error('Error ending class:', err);
      onNavigate('teacher_dashboard');
    }
  };

  // Student Leave Class
  const handleLeaveClass = () => {
    stopAllMedia();
    onNavigate(isTeacher ? 'teacher_dashboard' : 'student_dashboard');
  };

  // Google Meet Green Room / Pre-Join Screen
  if (!isJoined) {
    const syncSelectedDevices = (devices?: SelectedLiveDevices) => {
      if (!devices) return;
      setSelectedCameraId(devices.cameraId);
      setSelectedMicId(devices.micId);
      setSelectedSpeakerId(devices.speakerId);
      setFacingMode(devices.facingMode);
    };

    return (
      <LiveClassPreJoinView
        isTeacher={isTeacher}
        classId={classId}
        className={roomInfo?.name}
        sessionTitle={roomInfo?.sessionTitle || sessionTitle}
        section={roomInfo?.section}
        onNavigateBack={() => onNavigate(isTeacher ? 'teacher_dashboard' : 'student_dashboard')}
        onJoinSuccess={(stream, isAudioMuted, isVideoMuted, devices) => {
          localStreamRef.current = stream;
          setLocalMediaVersion((v) => v + 1);
          syncSelectedDevices(devices);
          setIsMicOn(!isAudioMuted);
          setIsCamOn(!isVideoMuted);
          setIsJoined(true);
        }}
        onStartLiveSuccess={(stream, isAudioMuted, isVideoMuted, sessionData, devices) => {
          localStreamRef.current = stream;
          setLocalMediaVersion((v) => v + 1);
          syncSelectedDevices(devices);
          setIsMicOn(!isAudioMuted);
          setIsCamOn(!isVideoMuted);
          if (sessionData) {
            setRoomInfo((prev: any) => ({
              ...prev,
              sessionId: sessionData.sessionId || sessionData.live_session?.id,
              sessionTitle: sessionData.live_session?.session_title || sessionTitle,
            }));
          }
          setIsJoined(true);
        }}
      />
    );
  }

  // Access restricted view
  if (enrollmentError) {
    return (
      <div className="min-h-dvh w-full bg-slate-950 flex flex-col items-center justify-center p-4 py-8 pt-safe pb-safe-lg">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-2xl p-6 text-center space-y-5 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto shadow-inner">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h2 className="type-section-title text-white">Access Restricted</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              {enrollmentError}
            </p>
          </div>
          <button
            onClick={() => onNavigate(isTeacher ? 'teacher_dashboard' : 'student_dashboard')}
            className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl transition-colors border border-slate-700"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Removed by teacher view
  if (removedNotice) {
    return (
      <div className="min-h-dvh w-full bg-slate-950 flex flex-col items-center justify-center p-4 py-8 pt-safe pb-safe-lg">
        <div className="max-w-md w-full bg-slate-900 border border-amber-500/30 rounded-2xl p-6 text-center space-y-5 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
            <UserMinus className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h2 className="type-section-title text-white">Classroom Session Notice</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              {removedNotice}
            </p>
          </div>
          <button
            onClick={() => onNavigate('student_dashboard')}
            className="w-full py-2.5 px-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold rounded-xl transition-colors"
          >
            Back to Student Portal
          </button>
        </div>
      </div>
    );
  }

  // Active presenter stream check (if screen sharing is active)
  const presenter = participants.find((p) => p.isScreenSharing);
  const isSelfScreenSharing = isScreenSharing;

  // Build the complete list of participants including Self for the Google Meet grid
  const allTiles: Array<{
    participant: LiveParticipant;
    stream: MediaStream | null;
    isSelf: boolean;
  }> = [];

  // Add self
  allTiles.push({
    participant: {
      userId: user?.id || 'self',
      userName: user?.name || (isTeacher ? 'Instructor' : 'Student'),
      role: (user?.role as any) || 'student',
      joined_at: new Date().toISOString(),
      isMuted: !isMicOn,
      isCamOff: !isCamOn,
      hasRaisedHand,
      isScreenSharing,
    },
    stream: localStreamRef.current,
    isSelf: true,
  });

  // Add remote participants
  participants.forEach((p) => {
    if (p.userId !== user?.id) {
      allTiles.push({
        participant: p,
        stream: remoteStreams[p.userId] || null,
        isSelf: false,
      });
    }
  });

  // Dynamic grid class based on tile count
  const getGridClass = (count: number) => {
    if (count <= 1) return 'grid-cols-1 max-w-4xl mx-auto';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2';
    if (count <= 4) return 'grid-cols-1 sm:grid-cols-2';
    if (count <= 6) return 'grid-cols-2 md:grid-cols-3';
    return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
  };

  return (
    <div className="min-h-dvh lg:h-dvh w-full max-w-full lg:overflow-hidden bg-slate-950 text-slate-100 flex flex-col select-none pt-safe">
      {/* ========================================================
          1. COMPACT GOOGLE MEET TOP BAR
         ======================================================== */}
      <header className="min-h-14 py-1.5 shrink-0 sticky top-0 border-b border-slate-800/80 bg-slate-900/95 backdrop-blur-md px-2.5 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 z-30">
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
          <button
            onClick={handleLeaveClass}
            className="p-2 min-w-[38px] min-h-[38px] flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors shrink-0"
            title="Leave Classroom"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* 🔴 LIVE Indicator */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="flex h-2 w-2 sm:h-2.5 sm:w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 sm:h-2.5 sm:w-2.5 bg-red-500" />
            </span>
            <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold bg-red-950 text-red-400 border border-red-500/30 uppercase tracking-wider">
              LIVE
            </span>
          </div>

          {/* Class & Lecture Title */}
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <h1 className="text-xs sm:text-sm font-bold text-white tracking-tight truncate">
              {roomInfo?.name ? `${roomInfo.name} - ${roomInfo?.sessionTitle || 'Interactive Lecture'}` : (roomInfo?.sessionTitle || 'Interactive Live Lecture')}
            </h1>
            {roomInfo?.section && (
              <span className="hidden md:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-cyan-300 border border-slate-700 shrink-0">
                Sec: {roomInfo.section}
              </span>
            )}
          </div>
        </div>

        {/* Top Right Controls: Status & Duration & Fullscreen */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Duration Counter */}
          <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-[11px] sm:text-xs font-mono font-semibold text-slate-300">
            <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyan-400 shrink-0" />
            <span>{formatTimer(elapsedSeconds)}</span>
          </div>

          {/* Connection Status Badge */}
          <div
            className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-semibold"
            title={
              connectionStatus === 'connected'
                ? 'Connected'
                : connectionStatus === 'reconnecting'
                ? 'Reconnecting...'
                : 'Connecting...'
            }
          >
            {connectionStatus === 'connected' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="hidden sm:inline text-emerald-400 text-[11px]">Connected</span>
              </>
            ) : connectionStatus === 'reconnecting' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                <span className="hidden sm:inline text-amber-400 text-[11px]">Reconnecting...</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping shrink-0" />
                <span className="hidden sm:inline text-cyan-400 text-[11px]">Connecting...</span>
              </>
            )}
          </div>

          {/* Audio Chime Test */}
          <button
            onClick={handlePlayAudioTest}
            disabled={isAudioTesting}
            className="hidden sm:flex px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-medium text-slate-300 hover:text-white items-center gap-1.5 transition-colors"
            title="Test Classroom Audio Speaker"
          >
            <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">Audio Test</span>
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={handleToggleBrowserFullscreen}
            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors"
            title={isBrowserFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}
          >
            {isBrowserFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* PROMPT ALERTS & AUTOPLAY UNBLOCK BANNERS */}
      {(isAutoplayBlocked || (isTeacher && handRaisedNotice) || audioTestStatus || cameraError || micError || screenShareError) && (
        <div className="px-2.5 sm:px-6 py-2 space-y-1.5 shrink-0 bg-slate-950/80 border-b border-slate-800/60 z-20 max-h-[26dvh] overflow-y-auto">
          {/* Autoplay Blocked Banner */}
          {isAutoplayBlocked && (
            <div className="p-2.5 bg-cyan-950/80 border border-cyan-400/50 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-cyan-200 shadow-xl animate-pulse">
              <div className="flex items-center gap-2 min-w-0">
                <Volume2 className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Browser paused remote audio. Tap <strong>Enable Audio</strong> to listen.</span>
              </div>
              <button
                onClick={handleEnableAudio}
                className="px-3 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold rounded-lg text-xs shrink-0 transition-colors shadow"
              >
                Enable Audio
              </button>
            </div>
          )}

          {/* Hand Raised Notification Banner for Teacher */}
          {isTeacher && handRaisedNotice && (
            <div className="p-2.5 bg-amber-950/70 border border-amber-500/50 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-amber-300 shadow-lg">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base shrink-0">✋</span>
                <span><strong>{handRaisedNotice.userName}</strong> raised their hand with a question.</span>
              </div>
              <button
                onClick={() => handleTeacherLowerHand(handRaisedNotice.userId)}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-[11px] transition-colors shrink-0"
              >
                Lower Hand
              </button>
            </div>
          )}

          {/* Audio test feedback banner */}
          {audioTestStatus && (
            <div className="p-2 bg-slate-900 border border-cyan-500/40 rounded-xl text-xs text-cyan-300 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Volume2 className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="break-words">{audioTestStatus}</span>
              </div>
              <button onClick={() => setAudioTestStatus(null)} className="text-slate-400 hover:text-white text-xs p-1 shrink-0">✕</button>
            </div>
          )}

          {/* Camera Permission Alert */}
          {cameraError && (
            <div className="p-2 bg-amber-950/40 border border-amber-500/40 rounded-xl text-xs text-amber-300 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="break-words"><strong>Camera:</strong> {cameraError}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  onClick={async () => {
                    const opened = nativeSettingsSupported ? await openNativeDeviceSettings() : false;
                    if (!opened) setIsHelpModalOpen(true);
                  }}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  {nativeSettingsSupported ? <Settings className="w-3 h-3 text-cyan-400" /> : <HelpCircle className="w-3 h-3 text-cyan-400" />}
                  <span>{nativeSettingsSupported ? 'Device Settings' : 'Settings Guide'}</span>
                </button>
                <button
                  onClick={handleToggleCam}
                  className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-lg text-[11px] font-semibold cursor-pointer"
                >
                  Retry Camera
                </button>
              </div>
            </div>
          )}

          {/* Microphone Permission Alert */}
          {micError && (
            <div className="p-2 bg-amber-950/40 border border-amber-500/40 rounded-xl text-xs text-amber-300 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="break-words"><strong>Microphone:</strong> {micError}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  onClick={async () => {
                    const opened = nativeSettingsSupported ? await openNativeDeviceSettings() : false;
                    if (!opened) setIsHelpModalOpen(true);
                  }}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  {nativeSettingsSupported ? <Settings className="w-3 h-3 text-cyan-400" /> : <HelpCircle className="w-3 h-3 text-cyan-400" />}
                  <span>{nativeSettingsSupported ? 'Device Settings' : 'Settings Guide'}</span>
                </button>
                <button
                  onClick={handleToggleMic}
                  className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-lg text-[11px] font-semibold cursor-pointer"
                >
                  Retry Mic
                </button>
              </div>
            </div>
          )}

          {/* Screen share alert */}
          {screenShareError && (
            <div className="p-2 bg-red-950/40 border border-red-500/40 rounded-xl text-xs text-red-300 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span className="break-words">{screenShareError}</span>
              </div>
              <button onClick={() => setScreenShareError(null)} className="text-slate-400 hover:text-white p-1 shrink-0">✕</button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          2. MAIN CLASSROOM VIEWPORT (100% Height Fill)
             - Desktop: Side-by-side Video Stage + Collapsible Sidebar
             - Mobile: Stacked Video Stage (always visible at top) + Chat/People below
         ======================================================== */}
      <main className="flex-1 min-h-0 lg:overflow-hidden flex flex-col lg:flex-row p-2 sm:p-4 gap-2 sm:gap-4 relative">
        {/* ========================================================
            VIDEO / SCREEN AREA (Always visible, even when sidebar is open on mobile)
           ======================================================== */}
        <section
          className={`min-h-0 min-w-0 flex flex-col relative ${
            isSidebarOpen
              ? 'h-[38dvh] min-h-[220px] sm:h-[42dvh] shrink-0 lg:h-full lg:flex-1 lg:overflow-hidden'
              : 'flex-1 min-h-[300px] lg:h-full lg:overflow-hidden'
          }`}
        >
          {/* CASE A: SCREEN SHARING ACTIVE (Presenting Screen is Spotlight) */}
          {(isSelfScreenSharing || presenter) ? (
            <div className="flex flex-col h-full space-y-2.5 min-h-0">
              {/* Main Shared Screen Stage */}
              <div className="relative flex-1 min-h-0 bg-black border border-blue-500/50 rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center">
                <video
                  ref={(el) => {
                    if (el) {
                      const shareStream = isSelfScreenSharing
                        ? screenStreamRef.current
                        : remoteStreams[presenter?.userId || ''];
                      if (shareStream && el.srcObject !== shareStream) {
                        el.srcObject = shareStream;
                        el.play().catch(() => {});
                      }
                    }
                  }}
                  autoPlay
                  playsInline
                  muted={isSelfScreenSharing}
                  className="w-full h-full object-contain"
                />

                {/* Overlaid Banner */}
                <div className="absolute top-3 left-3 flex items-center gap-2 z-20">
                  <span className="px-3 py-1.5 rounded-xl bg-blue-950/90 backdrop-blur-md border border-blue-500/50 text-xs font-bold text-blue-300 flex items-center gap-1.5 shadow-lg">
                    <MonitorUp className="w-4 h-4 animate-pulse text-blue-400" />
                    <span>
                      {isSelfScreenSharing
                        ? 'You are presenting your screen'
                        : `${presenter?.userName || 'Instructor'} is presenting screen`}
                    </span>
                  </span>
                </div>
              </div>

              {/* Filmstrip of Participant Webcams */}
              <div className="h-24 sm:h-32 flex gap-2 overflow-x-auto pb-1 shrink-0">
                {allTiles.map((tile) => (
                  <div key={tile.participant.userId} className="w-36 sm:w-52 h-full shrink-0">
                    <ParticipantVideoTile
                      participant={tile.participant}
                      stream={tile.stream}
                      isSelf={tile.isSelf}
                      isTeacherUser={isTeacher}
                      isSpeakerMuted={isSpeakerMuted}
                      isSpeaking={activeSpeakerId === tile.participant.userId}
                      isMirrored={tile.isSelf && facingMode === 'user'}
                      selectedSpeakerId={selectedSpeakerId}
                      onMuteStudent={handleTeacherMuteStudent}
                      onLowerHand={handleTeacherLowerHand}
                      onRemoveStudent={(uid, uname) => setParticipantToRemove({ id: uid, name: uname })}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* CASE B: STANDARD GOOGLE MEET RESPONSIVE VIDEO GRID */
            <div className={`grid ${getGridClass(allTiles.length)} gap-2.5 sm:gap-3 flex-1 h-full w-full min-h-0 items-stretch overflow-y-auto`}>
              {allTiles.map((tile) => (
                <ParticipantVideoTile
                  key={tile.participant.userId}
                  participant={tile.participant}
                  stream={tile.stream}
                  isSelf={tile.isSelf}
                  isTeacherUser={isTeacher}
                  isSpeakerMuted={isSpeakerMuted}
                  isSpeaking={activeSpeakerId === tile.participant.userId}
                  isMirrored={tile.isSelf && facingMode === 'user'}
                  selectedSpeakerId={selectedSpeakerId}
                  onMuteStudent={handleTeacherMuteStudent}
                  onLowerHand={handleTeacherLowerHand}
                  onRemoveStudent={(uid, uname) => setParticipantToRemove({ id: uid, name: uname })}
                />
              ))}
            </div>
          )}
        </section>

        {/* ========================================================
            RIGHT SIDEBAR: COLLAPSIBLE PARTICIPANTS & CHAT
           ======================================================== */}
        {isSidebarOpen && (
          <aside className="w-full min-h-[300px] flex-1 lg:flex-none lg:w-80 xl:w-96 lg:shrink-0 lg:h-full lg:min-h-0 bg-slate-900/95 border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl z-20 transition-all">
            {/* Sidebar Tab Switcher */}
            <div className="p-2 border-b border-slate-800/80 bg-slate-950 flex items-center justify-between gap-1 shrink-0">
              <div className="flex gap-1 flex-1">
                {/* Tab 1: Participants */}
                <button
                  onClick={() => setSidebarTab('participants')}
                  className={`flex-1 py-1.5 px-2.5 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                    sidebarTab === 'participants'
                      ? 'bg-cyan-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Participants</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      sidebarTab === 'participants' ? 'bg-slate-950 text-cyan-300' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {allTiles.length}
                  </span>
                </button>

                {/* Tab 2: Chat */}
                <button
                  onClick={() => setSidebarTab('chat')}
                  className={`flex-1 py-1.5 px-2.5 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                    sidebarTab === 'chat'
                      ? 'bg-cyan-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Chat</span>
                  {chatMessages.length > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        sidebarTab === 'chat' ? 'bg-slate-950 text-cyan-300' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {chatMessages.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Close Sidebar Button */}
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                title="Close Sidebar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* TAB CONTENT 1: PARTICIPANTS ROSTER */}
            {sidebarTab === 'participants' && (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="px-3.5 py-2 bg-slate-950/60 flex items-center justify-between text-[11px] font-bold text-slate-400 border-b border-slate-800/60 shrink-0">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-cyan-400" />
                    <span>In Classroom ({allTiles.length})</span>
                  </span>
                  <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Live Sync
                  </span>
                </div>

                <div className="flex-1 p-3 overflow-y-auto space-y-2">
                  {allTiles.map((tile) => {
                    const p = tile.participant;
                    const isParticipantTeacher = p.role === 'teacher';
                    const isSpeaking = activeSpeakerId === p.userId;

                    return (
                      <div
                        key={p.userId}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2.5 transition-all ${
                          isParticipantTeacher
                            ? 'bg-slate-950/80 border-cyan-500/30'
                            : p.hasRaisedHand
                            ? 'bg-amber-950/30 border-amber-500/40'
                            : 'bg-slate-950/40 border-slate-800/80'
                        }`}
                      >
                        {/* Avatar & Name */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                              isParticipantTeacher
                                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                : 'bg-slate-800 text-slate-200'
                            }`}
                          >
                            {p.userName?.[0] || 'U'}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                              <span className="truncate">{p.userName}</span>
                              {tile.isSelf && <span className="text-[10px] text-cyan-400 font-normal">(You)</span>}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                              {isParticipantTeacher ? (
                                <span className="text-cyan-400 font-medium">Instructor (Host)</span>
                              ) : (
                                <span>Enrolled Student</span>
                              )}
                              {isSpeaking && (
                                <span className="text-emerald-400 font-bold">· Speaking</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Status Badges & Controls */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {p.hasRaisedHand && (
                            <span
                              className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/40 text-[10px] font-bold flex items-center gap-1"
                              title="Hand Raised"
                            >
                              <span>✋</span>
                            </span>
                          )}

                          {/* Camera Status */}
                          {p.isCamOff ? (
                            <span title="Camera OFF" className="p-1 rounded bg-slate-800 text-slate-500">
                              <VideoOff className="w-3.5 h-3.5" />
                            </span>
                          ) : (
                            <span title="Camera ON" className="p-1 rounded bg-slate-800 text-cyan-400">
                              <Video className="w-3.5 h-3.5" />
                            </span>
                          )}

                          {/* Mic Status */}
                          {p.isMuted ? (
                            <span title="Microphone Muted" className="p-1 rounded bg-slate-800 text-red-400">
                              <MicOff className="w-3.5 h-3.5" />
                            </span>
                          ) : (
                            <span title="Microphone Active" className="p-1 rounded bg-slate-800 text-emerald-400">
                              <Mic className="w-3.5 h-3.5" />
                            </span>
                          )}

                          {/* Teacher Moderation Controls */}
                          {isTeacher && !isParticipantTeacher && !tile.isSelf && (
                            <div className="flex items-center gap-1 pl-1 border-l border-slate-800">
                              {!p.isMuted && (
                                <button
                                  onClick={() => handleTeacherMuteStudent(p.userId)}
                                  className="px-2 py-0.5 bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-300 text-[10px] font-bold rounded transition-colors"
                                  title="Mute student"
                                >
                                  Mute
                                </button>
                              )}

                              {p.hasRaisedHand && (
                                <button
                                  onClick={() => handleTeacherLowerHand(p.userId)}
                                  className="px-2 py-0.5 bg-amber-950 hover:bg-amber-900 border border-amber-500/40 text-amber-300 text-[10px] font-bold rounded transition-colors"
                                  title="Lower hand"
                                >
                                  Lower
                                </button>
                              )}

                              <button
                                onClick={() => setParticipantToRemove({ id: p.userId, name: p.userName })}
                                className="p-1 bg-slate-800 hover:bg-red-950 hover:text-red-400 text-slate-400 rounded transition-colors"
                                title="Remove student from classroom"
                              >
                                <UserMinus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB CONTENT 2: REAL-TIME CHAT */}
            {sidebarTab === 'chat' && (
              <div className="flex-1 min-h-0 flex flex-col justify-between overflow-hidden">
                <div className="px-3.5 py-2 bg-slate-950/60 flex items-center justify-between text-[11px] font-bold text-slate-400 border-b border-slate-800/60 shrink-0">
                  <span className="flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
                    <span>In-Call Messages</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">Real-time room</span>
                </div>

                {/* Messages List */}
                <div className="flex-1 p-3.5 overflow-y-auto space-y-3 min-h-0">
                  {chatMessages.length === 0 ? (
                    <div className="text-center py-10 text-slate-500 text-xs space-y-1">
                      <MessageSquare className="w-7 h-7 mx-auto text-slate-600 mb-2 opacity-60" />
                      <div className="font-semibold text-slate-400">Classroom chat is ready</div>
                      <div>Post a question or comment for the instructor!</div>
                    </div>
                  ) : (
                    chatMessages.map((msg) => {
                      const isOwnMessage = msg.userId === user?.id;
                      const isTeacherMsg = msg.role === 'teacher';

                      return (
                        <div
                          key={msg.id}
                          className={`space-y-1 ${isOwnMessage ? 'text-right' : 'text-left'}`}
                        >
                          <div
                            className={`flex items-center gap-1.5 text-[11px] text-slate-400 ${
                              isOwnMessage ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            <strong className={isTeacherMsg ? 'text-cyan-300' : 'text-white'}>
                              {msg.userName}
                            </strong>
                            {isTeacherMsg && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-500/30">
                                Instructor
                              </span>
                            )}
                            <span className="text-[10px] text-slate-500">
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div
                            className={`inline-block px-3 py-2 rounded-xl text-xs leading-relaxed max-w-[85%] break-words ${
                              isOwnMessage
                                ? 'bg-cyan-500 text-slate-950 font-medium rounded-tr-none'
                                : isTeacherMsg
                                ? 'bg-slate-800 text-cyan-100 border border-cyan-500/30 font-medium rounded-tl-none'
                                : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-tl-none'
                            }`}
                          >
                            {msg.text}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatBottomRef} />
                </div>

                {/* Input Area */}
                <form onSubmit={handleSendChat} className="p-3 bg-slate-950 border-t border-slate-800 flex gap-2 shrink-0">
                  <input
                    type="text"
                    value={newChatMessage}
                    onChange={(e) => setNewChatMessage(e.target.value)}
                    placeholder="Send a message to everyone..."
                    className="flex-1 px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={!newChatMessage.trim()}
                    className="p-2 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-40 text-slate-950 rounded-xl transition-all shadow shrink-0"
                    title="Send message"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}
          </aside>
        )}
      </main>

      {/* ========================================================
          3. GOOGLE MEET-STYLE BOTTOM CONTROL BAR
             MIC | CAMERA | SCREEN | HAND | CHAT | PEOPLE | LEAVE
         ======================================================== */}
      <footer className="min-h-[64px] shrink-0 sticky bottom-0 border-t border-slate-800/90 bg-slate-900/95 backdrop-blur-md px-2 sm:px-6 py-2 pb-safe flex items-center justify-between gap-1.5 sm:gap-3 z-30">
        {/* Left: Device Audio / Speaker State */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Speaker Mute/Unmute */}
          <button
            onClick={handleToggleSpeakerMute}
            className={`p-2.5 min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] sm:px-3 sm:py-2 rounded-xl text-xs font-semibold transition-all border flex items-center justify-center gap-1.5 shadow ${
              isSpeakerMuted
                ? 'bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 hover:text-white'
            }`}
            title={isSpeakerMuted ? 'Unmute Audio Playback' : 'Mute Audio Playback'}
          >
            {isSpeakerMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
            <span className="hidden md:inline">{isSpeakerMuted ? 'Sound Muted' : 'Sound ON'}</span>
          </button>
        </div>

        {/* Center: Primary Google Meet Controls (scroll-safe on 320px phones) */}
        <div className="flex items-center gap-1.5 sm:gap-3 overflow-x-auto scrollbar-none py-1 px-0.5 min-w-0">
          {/* Microphone */}
          <button
            onClick={handleToggleMic}
            className={`p-2.5 sm:p-3 min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] rounded-full transition-all shadow-lg flex items-center justify-center shrink-0 ${
              isMicOn
                ? 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                : 'bg-red-600 hover:bg-red-500 text-white'
            }`}
            title={isMicOn ? 'Turn off microphone' : 'Turn on microphone'}
          >
            {isMicOn ? <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" /> : <MicOff className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>

          {/* Camera */}
          <button
            onClick={handleToggleCam}
            className={`p-2.5 sm:p-3 min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] rounded-full transition-all shadow-lg flex items-center justify-center shrink-0 cursor-pointer ${
              isCamOn
                ? 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                : 'bg-red-600 hover:bg-red-500 text-white'
            }`}
            title={isCamOn ? 'Turn off camera' : 'Turn on camera'}
          >
            {isCamOn ? <Video className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" /> : <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>

          {/* Front / Rear Camera Switch (Mobile or Multi-Camera) */}
          {(isMobileDevice || availableCameras.length > 1) && (
            <button
              onClick={handleFlipCamera}
              disabled={isSwitchingCamera}
              className="p-2.5 sm:p-3 min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all shadow-lg flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50"
              title="Switch Front / Rear Camera"
            >
              <SwitchCamera className={`w-4 h-4 sm:w-5 sm:h-5 ${isSwitchingCamera ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          )}

          {/* Screen Share (Teacher) */}
          {isTeacher && (
            <button
              onClick={handleToggleScreenShare}
              className={`p-2.5 sm:p-3 min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] rounded-full transition-all shadow-lg flex items-center justify-center shrink-0 ${
                isScreenSharing
                  ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
              title={isScreenSharing ? 'Stop presenting' : 'Present now / Share screen'}
            >
              <MonitorUp className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}

          {/* Raise Hand (Student) */}
          {!isTeacher && (
            <button
              onClick={handleToggleRaiseHand}
              className={`p-2.5 sm:p-3 min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] rounded-full transition-all shadow-lg flex items-center justify-center shrink-0 ${
                hasRaisedHand
                  ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
              title={hasRaisedHand ? 'Lower hand' : 'Raise hand'}
            >
              <Hand className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}

          {/* Device Settings (Camera, Mic & Speaker) */}
          <button
            onClick={() => setIsDeviceSettingsOpen(true)}
            className={`p-2.5 sm:p-3 min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] rounded-full transition-all shadow-lg flex items-center justify-center cursor-pointer shrink-0 ${
              isDeviceSettingsOpen
                ? 'bg-cyan-500 text-slate-950 ring-2 ring-cyan-300'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
            title="Device Settings"
          >
            <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {/* People / Participants Toggle */}
          <button
            onClick={() => {
              if (isSidebarOpen && sidebarTab === 'participants') {
                setIsSidebarOpen(false);
              } else {
                setIsSidebarOpen(true);
                setSidebarTab('participants');
              }
            }}
            className={`p-2.5 sm:p-3 min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] rounded-full transition-all shadow-lg relative flex items-center justify-center shrink-0 ${
              isSidebarOpen && sidebarTab === 'participants'
                ? 'bg-cyan-500 text-slate-950'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
            title="People"
          >
            <Users className="w-4 h-4 sm:w-5 sm:h-5" />
            {allTiles.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-cyan-400 text-slate-950 text-[9px] font-bold flex items-center justify-center">
                {allTiles.length}
              </span>
            )}
          </button>

          {/* Chat Toggle */}
          <button
            onClick={() => {
              if (isSidebarOpen && sidebarTab === 'chat') {
                setIsSidebarOpen(false);
              } else {
                setIsSidebarOpen(true);
                setSidebarTab('chat');
              }
            }}
            className={`p-2.5 sm:p-3 min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] rounded-full transition-all shadow-lg relative flex items-center justify-center shrink-0 ${
              isSidebarOpen && sidebarTab === 'chat'
                ? 'bg-cyan-500 text-slate-950'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
            title="In-call messages"
          >
            <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
            {chatMessages.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-cyan-400 text-slate-950 text-[9px] font-bold flex items-center justify-center">
                {chatMessages.length}
              </span>
            )}
          </button>

          {/* Browser Fullscreen API Toggle */}
          <button
            onClick={handleToggleBrowserFullscreen}
            className={`p-3 rounded-full transition-all shadow-lg hidden sm:flex items-center justify-center shrink-0 ${
              isBrowserFullscreen
                ? 'bg-slate-700 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
            title={isBrowserFullscreen ? 'Exit Full Screen' : 'Full Screen'}
          >
            {isBrowserFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>

        {/* Right: Leave Class (Student) or End Class (Teacher) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isTeacher ? (
            <button
              onClick={() => setIsEndModalOpen(true)}
              className="py-2.5 px-3 sm:px-4 min-h-[40px] sm:min-h-[44px] bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-red-600/20 flex items-center gap-1.5 sm:gap-2 cursor-pointer"
              title="End call for everyone"
            >
              <PhoneOff className="w-4 h-4" />
              <span className="hidden sm:inline">End Class</span>
            </button>
          ) : (
            <button
              onClick={handleLeaveClass}
              className="py-2.5 px-3 sm:px-4 min-h-[40px] sm:min-h-[44px] bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-red-600/20 flex items-center gap-1.5 sm:gap-2 cursor-pointer"
              title="Leave call"
            >
              <PhoneOff className="w-4 h-4" />
              <span className="hidden sm:inline">Leave</span>
            </button>
          )}
        </div>
      </footer>

      {/* CONFIRMATION MODAL: TEACHER END CLASS */}
      {isEndModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto">
              <PhoneOff className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="type-card-title text-white">End Live Class Session?</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Ending the class will close the video and audio room, disconnect all connected students, and conclude this live session.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsEndModalOpen(false)}
                className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmEndClass}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs transition-all shadow"
              >
                End Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: REMOVE PARTICIPANT */}
      {participantToRemove && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <UserMinus className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="type-card-title text-white">Remove Student?</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Are you sure you want to remove <strong>{participantToRemove.name}</strong> from this live session?
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setParticipantToRemove(null)}
                className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveParticipant}
                className="flex-1 py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-xl text-xs transition-all shadow"
              >
                Remove Student
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLASS ENDED NOTICE MODAL */}
      {classEndedNotice && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl p-6 text-center space-y-5">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h3 className="type-card-title text-white">Lecture Completed</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                {classEndedNotice}
              </p>
            </div>

            <button
              onClick={() => onNavigate(isTeacher ? 'teacher_dashboard' : 'student_dashboard')}
              className="w-full py-2.5 px-4 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold rounded-xl text-xs transition-all shadow"
            >
              Return to Portal
            </button>
          </div>
        </div>
      )}

      {/* DEVICE CHANGE NOTIFICATION TOAST */}
      {deviceNotification && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 px-4 py-2 bg-slate-900/90 border border-cyan-500/40 rounded-xl text-xs text-cyan-200 shadow-xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
          <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>{deviceNotification}</span>
        </div>
      )}

      {/* DEVICE SETTINGS MODAL */}
      <DeviceSettingsModal
        isOpen={isDeviceSettingsOpen}
        onClose={() => setIsDeviceSettingsOpen(false)}
        availableCameras={availableCameras}
        availableMics={availableMics}
        availableSpeakers={availableSpeakers}
        currentCameraId={selectedCameraId}
        currentMicId={selectedMicId}
        currentSpeakerId={selectedSpeakerId}
        onApplySettings={handleApplyDeviceSettings}
        isSinkIdSupported={isSinkIdSupported}
        onRefreshDevices={refreshDeviceList}
      />

      {/* PERMISSION HELP INSTRUCTIONS MODAL (Requirement #10) */}
      <PermissionHelpModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        onRetry={() => {
          handleToggleCam();
          handleToggleMic();
        }}
      />
    </div>
  );
};
