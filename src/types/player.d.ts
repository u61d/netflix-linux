export interface PlayerState {
  title: string;
  season: number | null;
  episode: number | null;
  episodeTitle: string | null;
  duration: number;
  position: number;
  volume: number;
  muted: boolean;
  playing: boolean;
}

export interface PlaybackState {
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  buffered: number;
}

export interface VideoStats {
  currentTime: string;
  duration: string;
  buffered: string;
  playbackRate: number;
  volume: number;
  resolution: string;
  fps: number | string;
  dropped: number | string;
}