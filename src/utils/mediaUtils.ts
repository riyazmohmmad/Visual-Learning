/**
 * Cross-Platform Media Permission & Device Engine for VisuaLearn Live Classes
 * Supports:
 *  - Capacitor Android APK (native MediaPermissions plugin + WebChromeClient)
 *  - Capacitor iOS / Safari Mobile (WKWebView / native iOS permission prompt)
 *  - Desktop & Mobile Web Browsers (Permissions API + getUserMedia)
 *
 * Security & Integrity Guarantees:
 *  - Never falsely marks permissions as granted.
 *  - Never bypasses operating system or browser consent.
 *  - Prevents duplicate concurrent getUserMedia / native permission requests.
 *  - Isolates camera vs. microphone failures with separate statuses and messages.
 *  - Properly stops old camera tracks before switching front/rear sensors on mobile.
 */

export type PermissionStateStatus =
  | 'not_requested'
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'permanently_denied'
  | 'blocked'
  | 'unavailable';

export type MediaPlatform =
  | 'android_capacitor'
  | 'ios_capacitor'
  | 'android_browser'
  | 'ios_browser'
  | 'desktop_browser';

export type CameraFacingMode = 'user' | 'environment';

export interface MediaPermissionSnapshot {
  camera: PermissionStateStatus;
  microphone: PermissionStateStatus;
  platform: MediaPlatform;
  canOpenNativeSettings: boolean;
  isEmbeddedFrame: boolean;
}

export interface MediaAccessResult {
  stream: MediaStream | null;
  cameraStatus: PermissionStateStatus;
  micStatus: PermissionStateStatus;
  cameraError: string | null;
  micError: string | null;
  resolvedCameraId: string;
  resolvedMicId: string;
  facingMode: CameraFacingMode;
}

interface NativeMediaPermissionsPlugin {
  checkPermissions: () => Promise<{
    camera?: string;
    microphone?: string;
    platform?: string;
    canOpenSettings?: boolean;
  }>;
  requestPermissions: (opts: { camera: boolean; microphone: boolean }) => Promise<{
    camera?: string;
    microphone?: string;
    platform?: string;
    canOpenSettings?: boolean;
  }>;
  openAppSettings: () => Promise<{ opened: boolean }>;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    MediaPermissions?: NativeMediaPermissionsPlugin;
    [key: string]: any;
  };
}

function getCapacitor(): CapacitorGlobal | null {
  if (typeof window === 'undefined') return null;
  return ((window as any).Capacitor as CapacitorGlobal) || null;
}

function getNativePermissionsPlugin(): NativeMediaPermissionsPlugin | null {
  const cap = getCapacitor();
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.MediaPermissions || null;
}

export function detectMediaPlatform(): MediaPlatform {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'desktop_browser';
  }

  const cap = getCapacitor();
  if (cap?.isNativePlatform?.()) {
    const plat = (cap.getPlatform?.() || '').toLowerCase();
    if (plat === 'android') return 'android_capacitor';
    if (plat === 'ios') return 'ios_capacitor';
  }

  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android_browser';
  if (/iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios_browser';
  }
  return 'desktop_browser';
}

export function isEmbeddedIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function canOpenNativeDeviceSettings(): boolean {
  const plugin = getNativePermissionsPlugin();
  return Boolean(plugin && typeof plugin.openAppSettings === 'function');
}

export async function openNativeDeviceSettings(): Promise<boolean> {
  const plugin = getNativePermissionsPlugin();
  if (!plugin || typeof plugin.openAppSettings !== 'function') {
    return false;
  }
  try {
    const res = await plugin.openAppSettings();
    return Boolean(res?.opened);
  } catch (err) {
    console.warn('Unable to open native app settings:', err);
    return false;
  }
}

function normalizeNativeStatus(raw?: string): PermissionStateStatus {
  switch (raw) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    case 'permanently_denied':
      return 'permanently_denied';
    case 'prompt':
      return 'prompt';
    case 'unavailable':
      return 'unavailable';
    case 'blocked':
      return 'blocked';
    default:
      return 'not_requested';
  }
}

/**
 * Secure Context & MediaDevices Support Check
 */
export function checkMediaSecurity(): { isSecure: boolean; error: string | null } {
  if (typeof window === 'undefined') {
    return { isSecure: true, error: null };
  }

  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '[::1]';
  const isHttps = window.location.protocol === 'https:';
  const isCapacitorNative = Boolean(getCapacitor()?.isNativePlatform?.());

  if (!window.isSecureContext && !isLocalhost && !isHttps && !isCapacitorNative) {
    return {
      isSecure: false,
      error: 'Camera and microphone require a secure connection (HTTPS).',
    };
  }

  if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    return {
      isSecure: false,
      error: 'Your browser or WebView does not support live camera and microphone capture (getUserMedia).',
    };
  }

  return { isSecure: true, error: null };
}

/**
 * Granular, separate error messages for camera and microphone failures
 */
export function getDetailedMediaErrorMessage(
  err: any,
  deviceType: 'camera' | 'microphone' | 'both' = 'both',
  isPermanentlyDenied: boolean = false
): string {
  const label =
    deviceType === 'camera'
      ? 'Camera'
      : deviceType === 'microphone'
      ? 'Microphone'
      : 'Camera and microphone';

  if (!err) return `Unable to access ${label.toLowerCase()}.`;

  const name = err.name || '';
  const platform = detectMediaPlatform();

  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      if (isPermanentlyDenied) {
        if (platform === 'android_capacitor') {
          return `${label} permission is disabled in Android settings. Open Device Settings to enable it.`;
        }
        if (platform === 'ios_capacitor' || platform === 'ios_browser') {
          return `${label} permission is turned off in iOS Settings. Enable it under Settings → VisuaLearn / Safari.`;
        }
        return `${label} access is blocked in your browser. Allow ${label.toLowerCase()} in site settings, then tap Try Again.`;
      }
      return `${label} permission was denied. Tap Allow to grant access when prompted.`;
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return deviceType === 'camera'
        ? 'No camera was detected on this device.'
        : deviceType === 'microphone'
        ? 'No microphone was detected on this device.'
        : 'No camera or microphone was detected on this device.';
    case 'NotReadableError':
    case 'TrackStartError':
      return `${label} is currently in use by another app or could not be started. Close other apps using it and try again.`;
    case 'SecurityError':
      return `${label} access is blocked by browser or app security policy.`;
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return `The selected ${label.toLowerCase()} is unavailable. Try switching to Default.`;
    case 'AbortError':
      return `${label} initialization was interrupted. Tap Try Again.`;
    default:
      return err.message || `Unable to access ${label.toLowerCase()}.`;
  }
}

export function mapMediaErrorToStatus(
  err: any,
  queriedBrowserState?: PermissionStateStatus,
  elapsedMs?: number
): PermissionStateStatus {
  const name = err?.name || '';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'unavailable';
  }
  if (name === 'SecurityError') {
    return 'blocked';
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    // If Permissions API already reported denied OR the rejection was instant (< 180ms without user interaction),
    // the browser or OS auto-rejected because permission is permanently denied / blocked.
    if (queriedBrowserState === 'denied' || queriedBrowserState === 'permanently_denied') {
      return 'permanently_denied';
    }
    if (typeof elapsedMs === 'number' && elapsedMs < 150) {
      return 'permanently_denied';
    }
    return 'denied';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'unavailable';
  }
  return 'denied';
}

/**
 * Query a single browser permission via navigator.permissions.query (with safe fallback)
 */
export async function queryMediaPermissionStatus(
  kind: 'camera' | 'microphone'
): Promise<PermissionStateStatus> {
  // 1. Check native Capacitor Android/iOS plugin first
  const plugin = getNativePermissionsPlugin();
  if (plugin) {
    try {
      const nativeRes = await plugin.checkPermissions();
      return normalizeNativeStatus(kind === 'camera' ? nativeRes.camera : nativeRes.microphone);
    } catch {
      // Fallback to browser API
    }
  }

  // 2. Check W3C Permissions API where supported (Chrome, Edge, Android Chrome)
  if (
    typeof navigator !== 'undefined' &&
    navigator.permissions &&
    typeof navigator.permissions.query === 'function'
  ) {
    try {
      const status = await navigator.permissions.query({ name: kind as any });
      if (status.state === 'granted') return 'granted';
      if (status.state === 'denied') return 'permanently_denied';
      if (status.state === 'prompt') return 'prompt';
    } catch {
      // Safari / Firefox throw TypeError for 'camera' / 'microphone' descriptors
    }
  }

  // 3. Fallback: inspect enumerateDevices labels (browsers only expose device labels after real user consent)
  try {
    const devices = await enumerateLiveDevices();
    const list = kind === 'camera' ? devices.cameras : devices.microphones;
    if (list.length > 0 && list.some((d) => Boolean(d.label && d.label.trim().length > 0))) {
      return 'granted';
    }
  } catch {
    // ignore
  }

  return 'not_requested';
}

/**
 * Check both camera and microphone permission states + platform metadata
 */
export async function checkAllMediaPermissions(): Promise<MediaPermissionSnapshot> {
  const platform = detectMediaPlatform();
  const isEmbeddedFrame = isEmbeddedIframe();
  const canOpenSettings = canOpenNativeDeviceSettings();

  const plugin = getNativePermissionsPlugin();
  if (plugin) {
    try {
      const nativeRes = await plugin.checkPermissions();
      return {
        camera: normalizeNativeStatus(nativeRes.camera),
        microphone: normalizeNativeStatus(nativeRes.microphone),
        platform,
        canOpenNativeSettings: Boolean(nativeRes.canOpenSettings ?? canOpenSettings),
        isEmbeddedFrame,
      };
    } catch (err) {
      console.warn('Native checkPermissions notice:', err);
    }
  }

  const [camStatus, micStatus, devices] = await Promise.all([
    queryMediaPermissionStatus('camera'),
    queryMediaPermissionStatus('microphone'),
    enumerateLiveDevices(),
  ]);

  // If browser reports 0 devices AND permissions are already granted, mark as unavailable
  const finalCam: PermissionStateStatus =
    camStatus === 'granted' && devices.cameras.length === 0 ? 'unavailable' : camStatus;
  const finalMic: PermissionStateStatus =
    micStatus === 'granted' && devices.microphones.length === 0 ? 'unavailable' : micStatus;

  return {
    camera: finalCam,
    microphone: finalMic,
    platform,
    canOpenNativeSettings: canOpenSettings,
    isEmbeddedFrame,
  };
}

/**
 * Subscribe to live browser permission state changes (when user updates permissions in browser settings)
 */
export function subscribeToMediaPermissionChanges(
  onChange: () => void
): () => void {
  if (
    typeof navigator === 'undefined' ||
    !navigator.permissions ||
    typeof navigator.permissions.query !== 'function'
  ) {
    return () => {};
  }

  let active = true;
  const cleanups: Array<() => void> = [];

  (['camera', 'microphone'] as const).forEach((name) => {
    navigator.permissions
      .query({ name: name as any })
      .then((permStatus) => {
        if (!active) return;
        const handler = () => onChange();
        if (typeof permStatus.addEventListener === 'function') {
          permStatus.addEventListener('change', handler);
          cleanups.push(() => permStatus.removeEventListener('change', handler));
        } else {
          permStatus.onchange = handler;
          cleanups.push(() => {
            permStatus.onchange = null;
          });
        }
      })
      .catch(() => {
        // Unsupported descriptor (Safari / Firefox)
      });
  });

  return () => {
    active = false;
    cleanups.forEach((fn) => fn());
  };
}

/**
 * Cleanly stop every track in a MediaStream to release camera & microphone hardware immediately
 */
export function stopMediaStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }
}

/**
 * Build optimal video constraint supporting deviceId or mobile facingMode
 */
function buildVideoConstraint(
  cameraId: string,
  facingMode: CameraFacingMode
): MediaTrackConstraints | boolean {
  if (cameraId && cameraId !== 'default') {
    return { deviceId: { exact: cameraId } };
  }
  return {
    facingMode: { ideal: facingMode },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  };
}

function buildAudioConstraint(micId: string): MediaTrackConstraints | boolean {
  if (micId && micId !== 'default') {
    return {
      deviceId: { exact: micId },
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
  }
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
}

// Single-flight promise lock to prevent duplicate concurrent permission prompts & duplicate camera streams
let activeMediaRequestPromise: Promise<MediaAccessResult> | null = null;

/**
 * Unified, single-flight permission & media acquisition flow:
 * 1. On Android Capacitor: triggers real Android OS runtime permissions first via MediaPermissionPlugin.
 * 2. Requests camera + microphone together via navigator.mediaDevices.getUserMedia() where possible.
 * 3. If combined request fails, isolates camera vs. microphone independently so partial access still works
 *    and each hardware device displays its exact truthful status & error message.
 */
export async function requestCameraAndMicAccess(options?: {
  cameraId?: string;
  micId?: string;
  facingMode?: CameraFacingMode;
  wantVideo?: boolean;
  wantAudio?: boolean;
  existingStream?: MediaStream | null;
}): Promise<MediaAccessResult> {
  if (activeMediaRequestPromise) {
    return activeMediaRequestPromise;
  }

  const run = async (): Promise<MediaAccessResult> => {
    const cameraId = options?.cameraId || 'default';
    const micId = options?.micId || 'default';
    const facingMode: CameraFacingMode = options?.facingMode || 'user';
    const wantVideo = options?.wantVideo !== false;
    const wantAudio = options?.wantAudio !== false;

    const sec = checkMediaSecurity();
    if (!sec.isSecure) {
      return {
        stream: null,
        cameraStatus: 'blocked',
        micStatus: 'blocked',
        cameraError: sec.error,
        micError: sec.error,
        resolvedCameraId: cameraId,
        resolvedMicId: micId,
        facingMode,
      };
    }

    // Stop any previous stream before opening fresh tracks (critical on mobile sensors)
    if (options?.existingStream) {
      stopMediaStream(options.existingStream);
    }

    // Step 1: On Capacitor Native Android/iOS, request OS runtime permissions first
    let nativeCamStatus: PermissionStateStatus | null = null;
    let nativeMicStatus: PermissionStateStatus | null = null;

    const plugin = getNativePermissionsPlugin();
    if (plugin) {
      try {
        const nativeRes = await plugin.requestPermissions({
          camera: wantVideo,
          microphone: wantAudio,
        });
        nativeCamStatus = normalizeNativeStatus(nativeRes.camera);
        nativeMicStatus = normalizeNativeStatus(nativeRes.microphone);
      } catch (err) {
        console.warn('Native requestPermissions notice:', err);
      }
    }

    const canTryVideo = wantVideo && (nativeCamStatus === null || nativeCamStatus === 'granted');
    const canTryAudio = wantAudio && (nativeMicStatus === null || nativeMicStatus === 'granted');

    // If user denied both at OS level, return truthful statuses immediately without triggering WebView error
    if (!canTryVideo && !canTryAudio) {
      const camDeniedPerm = nativeCamStatus === 'permanently_denied';
      const micDeniedPerm = nativeMicStatus === 'permanently_denied';
      return {
        stream: null,
        cameraStatus: nativeCamStatus || 'denied',
        micStatus: nativeMicStatus || 'denied',
        cameraError: wantVideo
          ? getDetailedMediaErrorMessage({ name: 'NotAllowedError' }, 'camera', camDeniedPerm)
          : null,
        micError: wantAudio
          ? getDetailedMediaErrorMessage({ name: 'NotAllowedError' }, 'microphone', micDeniedPerm)
          : null,
        resolvedCameraId: cameraId,
        resolvedMicId: micId,
        facingMode,
      };
    }

    // Snapshot pre-call browser states so we can tell denied vs permanently_denied accurately
    const [preCamState, preMicState] = await Promise.all([
      nativeCamStatus ? Promise.resolve(nativeCamStatus) : queryMediaPermissionStatus('camera'),
      nativeMicStatus ? Promise.resolve(nativeMicStatus) : queryMediaPermissionStatus('microphone'),
    ]);

    // Step 2: Request both camera & microphone together when both are eligible (single native browser prompt!)
    if (canTryVideo && canTryAudio) {
      const startedAt = Date.now();
      try {
        const combinedStream = await navigator.mediaDevices.getUserMedia({
          video: buildVideoConstraint(cameraId, facingMode),
          audio: buildAudioConstraint(micId),
        });

        const vTrack = combinedStream.getVideoTracks()[0];
        const aTrack = combinedStream.getAudioTracks()[0];
        const resolvedCam = vTrack?.getSettings?.().deviceId || cameraId;
        const resolvedMic = aTrack?.getSettings?.().deviceId || micId;
        const actualFacing =
          (vTrack?.getSettings?.().facingMode as CameraFacingMode | undefined) || facingMode;

        return {
          stream: combinedStream,
          cameraStatus: vTrack ? 'granted' : 'unavailable',
          micStatus: aTrack ? 'granted' : 'unavailable',
          cameraError: vTrack ? null : 'No camera video track was returned by the device.',
          micError: aTrack ? null : 'No microphone audio track was returned by the device.',
          resolvedCameraId: resolvedCam,
          resolvedMicId: resolvedMic,
          facingMode: actualFacing,
        };
      } catch (combinedErr: any) {
        const elapsed = Date.now() - startedAt;

        // If exact deviceId failed due to OverconstrainedError, retry with relaxed constraints once
        if (
          (combinedErr?.name === 'OverconstrainedError' || combinedErr?.name === 'ConstraintNotSatisfiedError') &&
          (cameraId !== 'default' || micId !== 'default')
        ) {
          try {
            const relaxedStream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true,
            });
            const vTrack = relaxedStream.getVideoTracks()[0];
            const aTrack = relaxedStream.getAudioTracks()[0];
            return {
              stream: relaxedStream,
              cameraStatus: vTrack ? 'granted' : 'unavailable',
              micStatus: aTrack ? 'granted' : 'unavailable',
              cameraError: null,
              micError: null,
              resolvedCameraId: vTrack?.getSettings?.().deviceId || 'default',
              resolvedMicId: aTrack?.getSettings?.().deviceId || 'default',
              facingMode: (vTrack?.getSettings?.().facingMode as CameraFacingMode | undefined) || facingMode,
            };
          } catch {
            // Fall through to per-device isolation below
          }
        }

        // If combined request rejected instantly due to global iframe/browser policy block and both were denied,
        // still probe individually below ONLY when needed to distinguish camera vs. mic failure cleanly.
        console.warn('Combined getUserMedia failed, isolating camera and microphone:', combinedErr?.name, elapsed);
      }
    }

    // Step 3: Isolated per-device acquisition (keeps whichever device works & reports separate errors)
    const tracks: MediaStreamTrack[] = [];
    let cameraStatus: PermissionStateStatus = nativeCamStatus || preCamState;
    let micStatus: PermissionStateStatus = nativeMicStatus || preMicState;
    let cameraError: string | null = null;
    let micError: string | null = null;
    let resolvedCameraId = cameraId;
    let resolvedMicId = micId;
    let resolvedFacing = facingMode;

    // 3a. Camera
    if (canTryVideo) {
      const vStart = Date.now();
      try {
        const vStream = await navigator.mediaDevices.getUserMedia({
          video: buildVideoConstraint(cameraId, facingMode),
          audio: false,
        });
        const vTrack = vStream.getVideoTracks()[0];
        if (vTrack) {
          tracks.push(vTrack);
          cameraStatus = 'granted';
          cameraError = null;
          resolvedCameraId = vTrack.getSettings?.().deviceId || cameraId;
          resolvedFacing = (vTrack.getSettings?.().facingMode as CameraFacingMode | undefined) || facingMode;
        } else {
          cameraStatus = 'unavailable';
          cameraError = 'No camera was detected on this device.';
        }
      } catch (vErr: any) {
        const vElapsed = Date.now() - vStart;
        // Relax OverconstrainedError fallback
        if (vErr?.name === 'OverconstrainedError' || vErr?.name === 'ConstraintNotSatisfiedError') {
          try {
            const fallbackV = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            const vTrack = fallbackV.getVideoTracks()[0];
            if (vTrack) {
              tracks.push(vTrack);
              cameraStatus = 'granted';
              cameraError = null;
              resolvedCameraId = vTrack.getSettings?.().deviceId || 'default';
            }
          } catch (fallbackErr: any) {
            cameraStatus = mapMediaErrorToStatus(fallbackErr, preCamState, vElapsed);
            cameraError = getDetailedMediaErrorMessage(
              fallbackErr,
              'camera',
              cameraStatus === 'permanently_denied'
            );
          }
        } else {
          cameraStatus = mapMediaErrorToStatus(vErr, preCamState, vElapsed);
          cameraError = getDetailedMediaErrorMessage(
            vErr,
            'camera',
            cameraStatus === 'permanently_denied'
          );
        }
      }
    } else if (wantVideo && nativeCamStatus) {
      cameraStatus = nativeCamStatus;
      cameraError = getDetailedMediaErrorMessage(
        { name: 'NotAllowedError' },
        'camera',
        nativeCamStatus === 'permanently_denied'
      );
    }

    // 3b. Microphone
    if (canTryAudio) {
      const aStart = Date.now();
      try {
        const aStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: buildAudioConstraint(micId),
        });
        const aTrack = aStream.getAudioTracks()[0];
        if (aTrack) {
          tracks.push(aTrack);
          micStatus = 'granted';
          micError = null;
          resolvedMicId = aTrack.getSettings?.().deviceId || micId;
        } else {
          micStatus = 'unavailable';
          micError = 'No microphone was detected on this device.';
        }
      } catch (aErr: any) {
        const aElapsed = Date.now() - aStart;
        if (aErr?.name === 'OverconstrainedError' || aErr?.name === 'ConstraintNotSatisfiedError') {
          try {
            const fallbackA = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
            const aTrack = fallbackA.getAudioTracks()[0];
            if (aTrack) {
              tracks.push(aTrack);
              micStatus = 'granted';
              micError = null;
              resolvedMicId = aTrack.getSettings?.().deviceId || 'default';
            }
          } catch (fallbackErr: any) {
            micStatus = mapMediaErrorToStatus(fallbackErr, preMicState, aElapsed);
            micError = getDetailedMediaErrorMessage(
              fallbackErr,
              'microphone',
              micStatus === 'permanently_denied'
            );
          }
        } else {
          micStatus = mapMediaErrorToStatus(aErr, preMicState, aElapsed);
          micError = getDetailedMediaErrorMessage(
            aErr,
            'microphone',
            micStatus === 'permanently_denied'
          );
        }
      }
    } else if (wantAudio && nativeMicStatus) {
      micStatus = nativeMicStatus;
      micError = getDetailedMediaErrorMessage(
        { name: 'NotAllowedError' },
        'microphone',
        nativeMicStatus === 'permanently_denied'
      );
    }

    const finalStream = tracks.length > 0 ? new MediaStream(tracks) : null;
    return {
      stream: finalStream,
      cameraStatus,
      micStatus,
      cameraError,
      micError,
      resolvedCameraId,
      resolvedMicId,
      facingMode: resolvedFacing,
    };
  };

  activeMediaRequestPromise = run().finally(() => {
    activeMediaRequestPromise = null;
  });

  return activeMediaRequestPromise;
}

/**
 * Safely switch camera (front <-> rear or specific deviceId) on mobile & desktop.
 * Stops the existing video track BEFORE opening the new sensor to avoid Android/iOS NotReadableError.
 */
export async function switchCameraTrack(options: {
  currentStream: MediaStream | null;
  targetDeviceId?: string;
  targetFacingMode?: CameraFacingMode;
  isCamEnabled?: boolean;
}): Promise<{
  stream: MediaStream;
  track: MediaStreamTrack;
  deviceId: string;
  facingMode: CameraFacingMode;
}> {
  const { currentStream, targetDeviceId, targetFacingMode = 'user', isCamEnabled = true } = options;

  // Preserve existing audio tracks
  const preservedAudioTracks = currentStream ? currentStream.getAudioTracks() : [];

  // Stop existing video tracks FIRST so mobile OS releases the active hardware sensor
  if (currentStream) {
    currentStream.getVideoTracks().forEach((oldTrack) => {
      try {
        oldTrack.stop();
        currentStream.removeTrack(oldTrack);
      } catch {
        // ignore
      }
    });
  }

  let videoStream: MediaStream;
  if (targetDeviceId && targetDeviceId !== 'default') {
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: targetDeviceId } },
        audio: false,
      });
    } catch {
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: targetFacingMode } },
        audio: false,
      });
    }
  } else {
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: targetFacingMode } },
        audio: false,
      });
    } catch {
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: targetFacingMode } },
        audio: false,
      });
    }
  }

  const newTrack = videoStream.getVideoTracks()[0];
  if (!newTrack) {
    throw Object.assign(new Error('No camera video track available.'), { name: 'NotFoundError' });
  }
  newTrack.enabled = isCamEnabled;

  const combinedStream = new MediaStream([...preservedAudioTracks, newTrack]);
  const settings = newTrack.getSettings?.() || {};

  return {
    stream: combinedStream,
    track: newTrack,
    deviceId: settings.deviceId || targetDeviceId || 'default',
    facingMode: (settings.facingMode as CameraFacingMode | undefined) || targetFacingMode,
  };
}

/**
 * Hardware Device Enumeration
 */
export async function enumerateLiveDevices(): Promise<{
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
}> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return { cameras: [], microphones: [], speakers: [] };
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((d) => d.kind === 'videoinput');
    const microphones = devices.filter((d) => d.kind === 'audioinput');
    const speakers = devices.filter((d) => d.kind === 'audiooutput');
    return { cameras, microphones, speakers };
  } catch (err) {
    console.warn('enumerateDevices error:', err);
    return { cameras: [], microphones: [], speakers: [] };
  }
}

/**
 * Real Speaker Audio Test
 */
export function playTestSpeakerChime(targetSpeakerId?: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) {
        resolve();
        return;
      }

      const ctx = new AudioCtxClass();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      if (
        targetSpeakerId &&
        targetSpeakerId !== 'default' &&
        typeof (ctx as any).setSinkId === 'function'
      ) {
        (ctx as any).setSinkId(targetSpeakerId).catch(() => {});
      }

      const notes = [
        { freq: 523.25, time: 0.0, dur: 0.15 }, // C5
        { freq: 659.25, time: 0.15, dur: 0.15 }, // E5
        { freq: 783.99, time: 0.3, dur: 0.3 }, // G5
      ];

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.2, ctx.currentTime);
      masterGain.connect(ctx.destination);

      notes.forEach((note) => {
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, ctx.currentTime + note.time);

        noteGain.gain.setValueAtTime(0.25, ctx.currentTime + note.time);
        noteGain.gain.exponentialRampToValueAtTime(
          0.001,
          ctx.currentTime + note.time + note.dur
        );

        osc.connect(noteGain);
        noteGain.connect(masterGain);

        osc.start(ctx.currentTime + note.time);
        osc.stop(ctx.currentTime + note.time + note.dur);
      });

      setTimeout(() => {
        ctx.close().catch(() => {});
        resolve();
      }, 750);
    } catch (e) {
      console.warn('Audio test chime notice:', e);
      resolve();
    }
  });
}

/**
 * Real Microphone Audio Level Indicator (Web Audio API AnalyserNode)
 */
export function createRealMicrophoneMeter(
  stream: MediaStream,
  onLevelUpdate: (levelPercent: number, dbLevel: number) => void
): () => void {
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    onLevelUpdate(0, -Infinity);
    return () => {};
  }

  const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtxClass) {
    return () => {};
  }

  let audioCtx: AudioContext | null = null;
  let animFrameId: number | null = null;

  try {
    audioCtx = new AudioCtxClass();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.3;

    // Connect source to analyser ONLY (never to destination to avoid feedback)
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const checkVolume = () => {
      if (!analyser) return;
      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;

      const percent = Math.min(100, Math.round((average / 110) * 100));
      const db = average > 0 ? Math.round(20 * Math.log10(average / 255)) : -60;

      onLevelUpdate(percent, db);
      animFrameId = requestAnimationFrame(checkVolume);
    };

    checkVolume();
  } catch (err) {
    console.warn('Error creating microphone level meter:', err);
  }

  return () => {
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    onLevelUpdate(0, -Infinity);
  };
}

/**
 * HTMLMediaElement.setSinkId() Speaker Output Routing
 */
export async function assignAudioOutputSink(
  element: HTMLMediaElement | null,
  sinkId: string
): Promise<{ supported: boolean; success: boolean; message?: string }> {
  if (!element) {
    return { supported: false, success: false, message: 'No media element provided.' };
  }

  if (typeof (element as any).setSinkId !== 'function') {
    return {
      supported: false,
      success: false,
      message: 'Your browser uses the system default speaker (setSinkId is not supported).',
    };
  }

  try {
    const targetId = sinkId === 'default' ? '' : sinkId;
    await (element as any).setSinkId(targetId);
    return { supported: true, success: true };
  } catch (err: any) {
    console.warn('Failed assigning audio sink:', err);
    return {
      supported: true,
      success: false,
      message: err.message || 'Unable to route audio to selected speaker.',
    };
  }
}
