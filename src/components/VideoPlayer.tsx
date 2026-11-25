import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, RotateCcw, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { VideoContent } from '../types';
import { api } from '../services/api';

interface Props {
  subtopicId: string;
  video: VideoContent;
  poster?: string;
  previewMode?: boolean;
  initialProgress?: number;
  initialSeconds?: number;
  onProgressUpdate?: (percent: number) => void;
  onSaveProgress?: (watchedSeconds: number, durationSeconds: number, percent: number) => void;
}

function getYouTubeEmbedUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com')) {
      const v = parsed.searchParams.get('v');
      if (v) return `https://www.youtube.com/embed/${v}?rel=0`;
      const parts = parsed.pathname.split('/').filter(Boolean);
      if ((parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') && parts[1]) {
        return `https://www.youtube.com/embed/${parts[1]}?rel=0`;
      }
    }
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace(/^\//, '').split('/')[0]?.trim();
      if (id) return `https://www.youtube.com/embed/${id}?rel=0`;
    }
  } catch {
    return null;
  }
  return null;
}

export const VideoPlayer: React.FC<Props> = ({
  subtopicId,
  video,
  poster,
  previewMode = false,
  initialProgress = 0,
  initialSeconds = 0,
  onProgressUpdate,
  onSaveProgress,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastSavedSecRef = useRef<number>(initialSeconds);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(initialSeconds);
  const [duration, setDuration] = useState<number>(video.duration_seconds || 0);
  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [watchedPercent, setWatchedPercent] = useState<number>(initialProgress);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const rawUrl = (video.video_url || '').trim();
  const youtubeEmbedUrl = getYouTubeEmbedUrl(rawUrl);
  const hasDirectVideoSource = Boolean(rawUrl) && !youtubeEmbedUrl;

  useEffect(() => {
    setMediaError(null);
    setIsPlaying(false);
    setCurrentTime(initialSeconds);
    setWatchedPercent(initialProgress);
    setDuration(video.duration_seconds || 0);
    lastSavedSecRef.current = initialSeconds;
  }, [rawUrl, initialSeconds, initialProgress, video.duration_seconds]);

  // Restore playback position when source or initialSeconds updates
  useEffect(() => {
    if (videoRef.current && initialSeconds > 0 && hasDirectVideoSource) {
      try {
        videoRef.current.currentTime = initialSeconds;
      } catch {
        // will apply onLoadedMetadata
      }
    }
  }, [initialSeconds, hasDirectVideoSource, rawUrl]);

  const persistProgress = (secs: number, dur: number, pct: number) => {
    if (previewMode) return;
    lastSavedSecRef.current = secs;
    api.updateVideoProgress(subtopicId, pct, Math.round(secs)).catch(() => {});
    if (onSaveProgress) {
      onSaveProgress(Math.round(secs), Math.round(dur), pct);
    }
  };

  // Sync video time
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    const dur = videoRef.current.duration || duration || 1;
    setCurrentTime(cur);
    if (videoRef.current.duration && !Number.isNaN(videoRef.current.duration)) {
      setDuration(videoRef.current.duration);
    }

    const percent = Math.min(100, Math.round((cur / dur) * 100));
    const nextWatched = Math.max(watchedPercent, percent);
    if (nextWatched > watchedPercent) {
      setWatchedPercent(nextWatched);
      if (onProgressUpdate) onProgressUpdate(nextWatched);
    }

    // Persist every ~8 seconds of playback or near completion for smooth resume watching
    if (!previewMode && (Math.abs(cur - lastSavedSecRef.current) >= 8 || percent >= 95)) {
      persistProgress(cur, dur, nextWatched);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current || !hasDirectVideoSource || mediaError) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      persistProgress(
        videoRef.current.currentTime,
        videoRef.current.duration || duration,
        watchedPercent
      );
    } else {
      videoRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          setMediaError(null);
        })
        .catch(() => {
          setIsPlaying(false);
          setMediaError('This video source cannot be played in your browser. Please verify the video URL or format (MP4/WebM).');
        });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = Number(e.target.value);
    setCurrentTime(targetTime);
    if (videoRef.current) {
      videoRef.current.currentTime = targetTime;
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const formatTime = (secs: number) => {
    const safe = Number.isFinite(secs) && secs >= 0 ? secs : 0;
    const mins = Math.floor(safe / 60);
    const remainingSecs = Math.floor(safe % 60);
    return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
  };

  return (
    <div
      ref={containerRef}
      className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl transition-all"
    >
      {/* Video Viewport */}
      <div className="relative aspect-video bg-black flex items-center justify-center group overflow-hidden">
        {youtubeEmbedUrl ? (
          <iframe
            src={youtubeEmbedUrl}
            title={video.title || 'Lesson Video'}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            onLoad={() => {
              if (!previewMode && watchedPercent < 25) {
                setWatchedPercent(25);
                if (onProgressUpdate) onProgressUpdate(25);
                persistProgress(0, duration || 0, 25);
              }
            }}
          />
        ) : !hasDirectVideoSource || mediaError ? (
          <div className="flex flex-col items-center justify-center text-center p-6 space-y-2.5 text-slate-300 max-w-md">
            <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400">
              <AlertCircle className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-white">Video Source Unavailable</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              {mediaError || 'No supported video source has been attached to this lesson yet.'}
            </p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              src={rawUrl}
              poster={poster}
              preload="metadata"
              playsInline
              className="w-full h-full object-contain cursor-pointer"
              onClick={togglePlay}
              onTimeUpdate={handleTimeUpdate}
              onError={() => {
                setIsPlaying(false);
                setMediaError('This video source is unavailable or in an unsupported format.');
              }}
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  setMediaError(null);
                  const loadedDur = videoRef.current.duration || video.duration_seconds || 0;
                  setDuration(loadedDur);
                  if (initialSeconds > 0 && initialSeconds < loadedDur - 2) {
                    videoRef.current.currentTime = initialSeconds;
                  }
                }
              }}
              onEnded={() => {
                setIsPlaying(false);
                setWatchedPercent(100);
                if (onProgressUpdate) onProgressUpdate(100);
                persistProgress(duration, duration, 100);
              }}
            />

            {/* Center Big Play Button Overlay when paused */}
            {!isPlaying && (
              <button
                type="button"
                onClick={togglePlay}
                className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-cyan-500/90 hover:bg-cyan-400 text-slate-950 flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                aria-label="Play Video"
              >
                <Play className="w-8 h-8 fill-current ml-1" />
              </button>
            )}

            {/* Floating Top Header */}
            <div className="absolute top-0 inset-x-0 p-2.5 sm:p-4 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <div className="text-xs sm:text-sm font-semibold text-white drop-shadow truncate min-w-0">
                {video.title}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-mono bg-black/60 backdrop-blur px-2 py-1 rounded text-cyan-300 border border-cyan-500/20 shrink-0">
                <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span>{watchedPercent}%</span>
              </div>
            </div>

            {/* Bottom Control Bar */}
            <div className="absolute bottom-0 inset-x-0 p-2.5 sm:p-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              {/* Progress Scrubber */}
              <div className="relative mb-2 flex items-center">
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  step="1"
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full h-1.5 sm:h-1 bg-slate-700 hover:h-2 rounded-lg appearance-none cursor-pointer accent-cyan-400 transition-all"
                />
              </div>

              <div className="flex items-center justify-between gap-2 text-xs text-white">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <button
                    onClick={togglePlay}
                    className="p-1.5 hover:text-cyan-400 transition-colors cursor-pointer"
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                  </button>

                  <button
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = 0;
                        setCurrentTime(0);
                      }
                    }}
                    className="p-1.5 hover:text-cyan-400 transition-colors cursor-pointer"
                    title="Restart"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button onClick={toggleMute} className="p-1.5 hover:text-cyan-400 transition-colors cursor-pointer" aria-label={isMuted ? 'Unmute' : 'Mute'}>
                      {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="hidden sm:block w-16 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                    />
                  </div>

                  <div className="text-[11px] font-mono text-slate-300 whitespace-nowrap">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {watchedPercent >= 80 && (
                    <span className="hidden sm:flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Lesson Video Completed
                    </span>
                  )}

                  <button
                    onClick={toggleFullscreen}
                    className="p-1 hover:text-cyan-400 transition-colors"
                    title={isFullscreen ? 'Exit Fullscreen' : 'Toggle Fullscreen'}
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Video Details & Study Guidance */}
      <div className="p-3.5 sm:p-4 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 sm:gap-4 text-xs">
        <div className="min-w-0 flex-1">
          <h4 className="font-semibold text-white text-sm break-words">{video.title}</h4>
          <p className="text-slate-400 mt-0.5 line-clamp-2 sm:line-clamp-1">{video.description}</p>
        </div>

        {/* Watched Progress Indicator */}
        <div className="flex items-center gap-3 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
          <div className="text-right">
            <div className="text-[11px] text-slate-400">Study Progress</div>
            <div className="font-mono font-semibold text-cyan-400">{watchedPercent}% Watched</div>
          </div>
          <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-400 rounded-full transition-all duration-300"
              style={{ width: `${watchedPercent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
