"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
} from "lucide-react";

const videoPlayerVariants = cva(
  "relative w-full bg-black rounded-card overflow-hidden group outline-none focus-visible:ring-2 focus-visible:ring-[#6250f5]",
  {
    variants: {
      size: {
        sm: "max-w-md",
        default: "max-w-2xl",
        lg: "max-w-4xl",
        full: "w-full",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export interface VideoPlayerProps
  extends React.VideoHTMLAttributes<HTMLVideoElement>,
    VariantProps<typeof videoPlayerVariants> {
  src: string;
  poster?: string;
  showControls?: boolean;
  autoHide?: boolean;
  fit?: "cover" | "contain";
  videoClassName?: string;
  className?: string;
}

const VideoPlayer = React.forwardRef<HTMLVideoElement, VideoPlayerProps>(
  (
    {
      className,
      videoClassName,
      size,
      src,
      poster,
      showControls = true,
      autoHide = true,
      fit = "cover",
      muted: mutedProp,
      ...props
    },
    ref,
  ) => {
    const [isPlaying, setIsPlaying] = React.useState(false);
    const [currentTime, setCurrentTime] = React.useState(0);
    const [duration, setDuration] = React.useState(0);
    const [volume, setVolume] = React.useState(1);
    const [isMuted, setIsMuted] = React.useState(Boolean(mutedProp));
    const [isFullscreen, setIsFullscreen] = React.useState(false);
    const [showControlsState, setShowControlsState] = React.useState(true);

    const videoRef = React.useRef<HTMLVideoElement>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const hideControlsTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useImperativeHandle(ref, () => videoRef.current!, []);

    React.useEffect(() => {
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
      setShowControlsState(true);
      const video = videoRef.current;
      if (!video) return;
      if (mutedProp) {
        video.muted = true;
        video.defaultMuted = true;
      }
      if (props.autoPlay) {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
      }
    }, [src, mutedProp, props.autoPlay]);

    const formatTime = (time: number) => {
      if (!Number.isFinite(time) || time < 0) return "0:00";
      const hours = Math.floor(time / 3600);
      const minutes = Math.floor((time % 3600) / 60);
      const seconds = Math.floor(time % 60);

      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
          .toString()
          .padStart(2, "0")}`;
      }
      return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    };

    const togglePlay = React.useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      if (!video.paused && !video.ended) {
        video.pause();
      } else {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
      }
    }, []);

    const toggleMute = React.useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      const nextMuted = !video.muted;
      video.muted = nextMuted;
      if (!nextMuted && video.volume === 0) {
        video.volume = 0.8;
        setVolume(0.8);
      }
      setIsMuted(nextMuted);
    }, []);

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseFloat(e.target.value);
      setVolume(newVolume);
      if (videoRef.current) {
        videoRef.current.volume = newVolume;
        videoRef.current.muted = newVolume === 0;
        setIsMuted(newVolume === 0);
      }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTime = parseFloat(e.target.value);
      setCurrentTime(newTime);
      if (videoRef.current) {
        videoRef.current.currentTime = newTime;
      }
    };

    const toggleFullscreen = React.useCallback(() => {
      if (!document.fullscreenElement) {
        containerRef.current?.requestFullscreen?.().catch(() => {});
        setIsFullscreen(true);
      } else {
        document.exitFullscreen?.().catch(() => {});
        setIsFullscreen(false);
      }
    }, []);

    const skip = React.useCallback((seconds: number) => {
      const video = videoRef.current;
      if (!video) return;
      const maxDuration = Number.isFinite(video.duration) ? video.duration : 0;
      video.currentTime = Math.max(0, Math.min(maxDuration, video.currentTime + seconds));
    }, []);

    const resetHideControlsTimeout = React.useCallback(() => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }

      if (autoHide && isPlaying) {
        hideControlsTimeoutRef.current = setTimeout(() => {
          setShowControlsState(false);
        }, 3000);
      }
    }, [autoHide, isPlaying]);

    const handleMouseMove = () => {
      setShowControlsState(true);
      resetHideControlsTimeout();
    };

    React.useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const handleLoadedMetadata = () => {
        setDuration(Number.isFinite(video.duration) ? video.duration : 0);
        setVolume(video.volume);
        setIsMuted(video.muted);
      };

      const handleTimeUpdate = () => {
        setCurrentTime(video.currentTime);
      };

      const handlePlay = () => {
        setIsPlaying(true);
        resetHideControlsTimeout();
      };

      const handlePause = () => {
        setIsPlaying(false);
        setShowControlsState(true);
        if (hideControlsTimeoutRef.current) {
          clearTimeout(hideControlsTimeoutRef.current);
        }
      };

      const handleVolumeChangeEvent = () => {
        setVolume(video.volume);
        setIsMuted(video.muted);
      };

      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      video.addEventListener("timeupdate", handleTimeUpdate);
      video.addEventListener("play", handlePlay);
      video.addEventListener("pause", handlePause);
      video.addEventListener("volumechange", handleVolumeChangeEvent);

      return () => {
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
        video.removeEventListener("timeupdate", handleTimeUpdate);
        video.removeEventListener("play", handlePlay);
        video.removeEventListener("pause", handlePause);
        video.removeEventListener("volumechange", handleVolumeChangeEvent);
        if (hideControlsTimeoutRef.current) {
          clearTimeout(hideControlsTimeoutRef.current);
        }
      };
    }, [autoHide, isPlaying, resetHideControlsTimeout]);

    React.useEffect(() => {
      const handleFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
      };

      document.addEventListener("fullscreenchange", handleFullscreenChange);
      return () => {
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
      };
    }, []);

    React.useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (!containerRef.current?.contains(document.activeElement)) return;

        switch (e.key) {
          case " ":
          case "k":
            e.preventDefault();
            togglePlay();
            break;
          case "m":
            e.preventDefault();
            toggleMute();
            break;
          case "f":
            e.preventDefault();
            toggleFullscreen();
            break;
          case "ArrowLeft":
            e.preventDefault();
            e.stopPropagation();
            skip(-10);
            break;
          case "ArrowRight":
            e.preventDefault();
            e.stopPropagation();
            skip(10);
            break;
          case "ArrowUp":
            e.preventDefault();
            if (videoRef.current) {
              const next = Math.min(1, videoRef.current.volume + 0.1);
              videoRef.current.volume = next;
              videoRef.current.muted = false;
              setVolume(next);
              setIsMuted(false);
            }
            break;
          case "ArrowDown":
            e.preventDefault();
            if (videoRef.current) {
              const next = Math.max(0, videoRef.current.volume - 0.1);
              videoRef.current.volume = next;
              videoRef.current.muted = next === 0;
              setVolume(next);
              setIsMuted(next === 0);
            }
            break;
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }, [skip, toggleFullscreen, toggleMute, togglePlay]);

    const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
    const volumePercent = (isMuted ? 0 : volume) * 100;

    return (
      <div
        ref={containerRef}
        className={cn(videoPlayerVariants({ size }), className)}
        onMouseMove={handleMouseMove}
        onMouseLeave={() =>
          autoHide && isPlaying && setShowControlsState(false)
        }
        tabIndex={0}
      >
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          muted={mutedProp}
          className={cn(
            "w-full h-full",
            fit === "contain" ? "object-contain" : "object-cover",
            videoClassName,
          )}
          onClick={togglePlay}
          {...props}
        />
        {showControls && (
          <>
            {/* Play/Pause Overlay - Only visible when not playing or on hover */}
            <div
              className={cn(
                "absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300",
                !isPlaying || showControlsState ? "opacity-100" : "opacity-0",
              )}
            >
              <button
                type="button"
                aria-label={isPlaying ? "Pause video" : "Play video"}
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center text-white hover:bg-white/30 transition-all duration-200 pointer-events-auto cursor-pointer"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6" />
                ) : (
                  <Play className="w-6 h-6 ml-0.5" />
                )}
              </button>
            </div>

            {/* Controls Bar */}
            <div
              className={cn(
                "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent",
                "transition-opacity duration-300 pointer-events-none",
                showControlsState ? "opacity-100" : "opacity-0",
              )}
            >
              <div className="p-4 space-y-3 pointer-events-auto">
                {/* Progress Bar */}
                <div className="flex items-center gap-2 text-white text-sm">
                  <span className="min-w-0 text-xs font-mono tabular-nums">
                    {formatTime(currentTime)}
                  </span>
                  <div className="flex-1 relative group/progress flex items-center">
                    <input
                      type="range"
                      aria-label="Seek video"
                      min={0}
                      max={duration || 0}
                      step={0.1}
                      value={currentTime}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleSeek(e);
                      }}
                      className="w-full h-1 bg-white/30 rounded-full appearance-none cursor-pointer
                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                        [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-pointer
                        [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:duration-200
                        group-hover/progress:[&::-webkit-slider-thumb]:scale-125"
                      style={{
                        background: `linear-gradient(to right, #ffffff 0%, #ffffff ${progressPercent}%, rgba(255,255,255,0.3) ${progressPercent}%, rgba(255,255,255,0.3) 100%)`,
                      }}
                    />
                  </div>
                  <span className="min-w-0 text-xs font-mono tabular-nums">
                    {formatTime(duration)}
                  </span>
                </div>

                {/* Control Buttons */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Skip back 10 seconds"
                      onClick={(e) => {
                        e.stopPropagation();
                        skip(-10);
                      }}
                      className="p-2 text-white hover:bg-white/20 rounded-md transition-colors cursor-pointer"
                    >
                      <SkipBack className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={isPlaying ? "Pause" : "Play"}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePlay();
                      }}
                      className="p-2 text-white hover:bg-white/20 rounded-md transition-colors cursor-pointer"
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4 ml-0.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label="Skip forward 10 seconds"
                      onClick={(e) => {
                        e.stopPropagation();
                        skip(10);
                      }}
                      className="p-2 text-white hover:bg-white/20 rounded-md transition-colors cursor-pointer"
                    >
                      <SkipForward className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-2 group/volume">
                      <button
                        type="button"
                        aria-label={isMuted || volume === 0 ? "Unmute" : "Mute"}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMute();
                        }}
                        className="p-2 text-white hover:bg-white/20 rounded-md transition-colors cursor-pointer"
                      >
                        {isMuted || volume === 0 ? (
                          <VolumeX className="w-4 h-4" />
                        ) : (
                          <Volume2 className="w-4 h-4" />
                        )}
                      </button>
                      <div className="w-0 group-hover/volume:w-20 transition-all duration-200 overflow-hidden flex items-center">
                        <input
                          type="range"
                          aria-label="Volume"
                          min={0}
                          max={1}
                          step={0.1}
                          value={isMuted ? 0 : volume}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleVolumeChange(e);
                          }}
                          className="w-full h-1 bg-white/30 rounded-full appearance-none cursor-pointer
                            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                            [&::-webkit-slider-thumb]:cursor-pointer"
                          style={{
                            background: `linear-gradient(to right, #ffffff 0%, #ffffff ${volumePercent}%, rgba(255,255,255,0.3) ${volumePercent}%, rgba(255,255,255,0.3) 100%)`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFullscreen();
                      }}
                      className="p-2 text-white hover:bg-white/20 rounded-md transition-colors cursor-pointer"
                    >
                      {isFullscreen ? (
                        <Minimize className="w-4 h-4" />
                      ) : (
                        <Maximize className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  },
);

VideoPlayer.displayName = "VideoPlayer";

export { VideoPlayer, videoPlayerVariants };
