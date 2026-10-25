// Netflix only keeps the title overlay in the DOM while the player controls
// are visible, and the text it returns is messy. The page script grabs raw
// strings; the parsing lives here so it can be tested.

const GENERIC_TITLES = new Set([
  'netflix',
  'home',
  'home - netflix',
  'startseite',
  'accueil',
  'inicio',
  'início',
]);

const SEASON_WORD = '(?:Season|Saison|Staffel|Temporada|Stagione|Sezon|Seizoen)';
const EPISODE_WORD = '(?:Episode|Épisode|Episodio|Episódio|Folge|Flg|Afl|Ep)';

// Netflix's short form, localised: S2:E5, S2E5, T2:E5 (es/pt), St. 2 Flg. 5.
// Only matched against text we know is the season/episode line, otherwise a
// title like "F1" reads as episode 1.
const COMPACT_BOTH = `(?:S|T|St)\\.?\\s*(\\d{1,3})\\s*[:·.\\-\\s]*\\s*(?:E|F|${EPISODE_WORD})\\.?\\s*(\\d{1,4})`;
const COMPACT_SEASON = `(?:S|T|St)\\.?\\s*(\\d{1,3})`;
const COMPACT_EPISODE = `(?:E|F|${EPISODE_WORD})\\.?\\s*(\\d{1,4})`;

// Spelled out, so safe to look for anywhere.
const VERBOSE_BOTH = `${SEASON_WORD}\\s*(\\d{1,3})\\s*[:,·\\-]?\\s*${EPISODE_WORD}\\.?\\s*(\\d{1,4})`;
const VERBOSE_SEASON = `${SEASON_WORD}\\s*(\\d{1,3})`;
const VERBOSE_EPISODE = `${EPISODE_WORD}\\.?\\s*(\\d{1,4})`;

const anywhere = (source) => new RegExp(`\\b${source}\\b`, 'i');
const whole = (source) => new RegExp(`^${source}$`, 'i');

const PATTERNS = {
  compactBoth: anywhere(COMPACT_BOTH),
  compactSeason: anywhere(COMPACT_SEASON),
  compactEpisode: anywhere(COMPACT_EPISODE),
  verboseBoth: anywhere(VERBOSE_BOTH),
  verboseSeason: anywhere(VERBOSE_SEASON),
  verboseEpisode: anywhere(VERBOSE_EPISODE),
};

// A line that is only a marker is the one place the short form is safe.
const MARKER_ONLY = [
  whole(COMPACT_BOTH),
  whole(VERBOSE_BOTH),
  whole(COMPACT_SEASON),
  whole(VERBOSE_SEASON),
  whole(COMPACT_EPISODE),
  whole(VERBOSE_EPISODE),
];

// Netflix lays the overlay out as inline spans, so innerText glues them
// together and we get "Stranger ThingsS2:E5Dig Dug" with no word boundary for
// the patterns above to catch. Put the spaces back, but only next to
// something that really looks like a marker, so "Se7en" and "3Below" survive.
const MARKER_RUN = `(?:St|S|T|E|F|${EPISODE_WORD}|${SEASON_WORD})\\.?\\s*\\d`;
const BEFORE_MARKER = new RegExp(`([a-zà-öø-ÿ])(?=${MARKER_RUN})`, 'g');
// \b matters here: without it the "e7" in "Se7en" looks like an episode.
const AFTER_MARKER = new RegExp(
  `\\b(?:${COMPACT_BOTH}|${VERBOSE_BOTH}|${COMPACT_EPISODE}|${VERBOSE_EPISODE})(?=[A-Za-zÀ-ÿ])`,
  'g'
);

function separateMarkers(text) {
  return text.replace(BEFORE_MARKER, '$1 ').replace(AFTER_MARKER, '$& ');
}

function normalizeText(value) {
  return separateMarkers(String(value ?? '').replace(/\s+/g, ' ')).trim();
}

function stripNetflixSuffix(value) {
  return normalizeText(value).replace(/\s*[-–—|]\s*Netflix\s*$/i, '');
}

function isGenericTitle(value) {
  const text = stripNetflixSuffix(value).toLowerCase();
  if (!text) return true;
  return GENERIC_TITLES.has(text);
}

function isSeasonEpisodeMarker(value) {
  const text = normalizeText(value);
  if (!text) return false;
  return MARKER_ONLY.some((pattern) => pattern.test(text));
}

function toCount(value) {
  const number = parseInt(value, 10);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return null;
}

function sameText(a, b) {
  return String(a || '').toLowerCase() === String(b || '').toLowerCase();
}

/**
 * Season and episode numbers out of one piece of text. `compact` turns on the
 * short "S2:E5" form; callers pass false for anything that could be a real
 * title, where a letter followed by a number is probably just the name.
 */
function parseSeasonEpisode(text, { compact = true } = {}) {
  const value = normalizeText(text);
  if (!value) return { season: null, episode: null };

  const both = firstMatch(
    value,
    compact ? [PATTERNS.compactBoth, PATTERNS.verboseBoth] : [PATTERNS.verboseBoth]
  );
  if (both) {
    return { season: toCount(both[1]), episode: toCount(both[2]) };
  }

  const season = firstMatch(
    value,
    compact ? [PATTERNS.verboseSeason, PATTERNS.compactSeason] : [PATTERNS.verboseSeason]
  );
  const episode = firstMatch(
    value,
    compact ? [PATTERNS.verboseEpisode, PATTERNS.compactEpisode] : [PATTERNS.verboseEpisode]
  );

  return {
    season: season ? toCount(season[1]) : null,
    episode: episode ? toCount(episode[1]) : null,
  };
}

/**
 * Split "Stranger Things S2:E5 Dig Dug" into the show and the episode name.
 * Empty strings when there is no marker to split on.
 *
 * The episode-only forms are in the list because shows split into parts
 * rather than seasons get no season at all ("Lupin E3 Chapter 3"), as do some
 * locales ("The Night Agent Flg. 7 Es war einmal"). A film called "F1" is not
 * at risk from that: the marker lands at index 0, which leaves no show name,
 * and the caller ignores a split without both halves.
 */
function splitShowAndEpisode(text) {
  const value = normalizeText(text);
  if (!value) return { show: '', episodeTitle: '' };

  const match = firstMatch(value, [
    PATTERNS.compactBoth,
    PATTERNS.verboseBoth,
    PATTERNS.verboseEpisode,
    PATTERNS.compactEpisode,
  ]);
  if (!match) return { show: '', episodeTitle: '' };

  const show = normalizeText(value.slice(0, match.index));
  const rest = normalizeText(value.slice(match.index + match[0].length)).replace(
    /^[\s:·.\-–—]+/,
    ''
  );

  return { show, episodeTitle: normalizeText(rest) };
}

function uniqueLines(lines) {
  const seen = new Set();
  const result = [];
  for (const line of lines || []) {
    const text = normalizeText(line);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function sessionCandidates(session) {
  if (!session) return [];
  // When Netflix sets these at all, album/artist hold the show name, so they
  // beat the document title.
  return [session.album, session.artist, session.title].map(normalizeText);
}

/**
 * The raw page reading turned into one shape: a show (or film) name, an
 * episode name, and the numbers.
 */
function resolveTrack(raw = {}) {
  const lines = uniqueLines(raw.titleLines);
  const metaText = normalizeText(raw.metaText);
  const documentTitle = stripNetflixSuffix(raw.documentTitle);
  const session = raw.session || null;

  const contentLines = lines.filter(
    (line) => !isSeasonEpisodeMarker(line) && !isGenericTitle(line)
  );

  let show = contentLines[0] || '';
  let episodeTitle = contentLines.length > 1 ? contentLines[contentLines.length - 1] : '';
  // a line that splits into show + episode is carrying a marker worth trusting
  let combined = '';

  if (show && !episodeTitle) {
    const split = splitShowAndEpisode(show);
    if (split.show && split.episodeTitle) {
      combined = show;
      show = split.show;
      episodeTitle = split.episodeTitle;
    }
  }

  if (!show) {
    const fallback = [...sessionCandidates(session), documentTitle].find(
      (text) => text && !isGenericTitle(text) && !isSeasonEpisodeMarker(text)
    );
    if (fallback) {
      const split = splitShowAndEpisode(fallback);
      if (split.show) {
        combined = fallback;
        show = split.show;
        if (!episodeTitle) episodeTitle = split.episodeTitle;
      } else {
        show = fallback;
      }
    }
  }

  if (!episodeTitle && session) {
    const sessionTitle = normalizeText(session.title);
    if (sessionTitle && !sameText(sessionTitle, show) && !isGenericTitle(sessionTitle)) {
      episodeTitle = sessionTitle;
    }
  }

  if (episodeTitle && sameText(episodeTitle, show)) {
    episodeTitle = '';
  }

  const numbers = resolveNumbers({ lines, metaText, documentTitle, session, combined });

  return {
    show,
    episodeTitle,
    season: numbers.season,
    episode: numbers.episode,
  };
}

// Best source for the numbers first: the meta element, then a line that is
// only a marker, then a line that split around one, then the spelled-out form
// anywhere at all.
function resolveNumbers({ lines, metaText, documentTitle, session, combined }) {
  const found = (numbers) => numbers.season !== null || numbers.episode !== null;

  const fromMeta = parseSeasonEpisode(metaText);
  if (found(fromMeta)) return fromMeta;

  const marker = lines.find(isSeasonEpisodeMarker);
  if (marker) {
    const fromMarker = parseSeasonEpisode(marker);
    if (found(fromMarker)) return fromMarker;
  }

  if (combined) {
    const fromCombined = parseSeasonEpisode(combined);
    if (found(fromCombined)) return fromCombined;
  }

  for (const text of [...lines, ...sessionCandidates(session), documentTitle]) {
    const parsed = parseSeasonEpisode(text, { compact: false });
    if (found(parsed)) return parsed;
  }

  return { season: null, episode: null };
}

/**
 * Read Netflix's title block into separate lines.
 *
 * The block is
 *   <div data-uia="video-title"><h4>Lupin</h4><span>E3</span><span>Chapter 3</span></div>
 * and innerText returns "LupinE3Chapter 3" with no separator of any kind, so
 * take one line per child element rather than splitting text that has nothing
 * to split on.
 *
 * MprisManager keeps a copy of this inside its injected page script, because
 * stringifying this one breaks under coverage instrumentation. Its test runs
 * both against the same DOM so the two cannot drift apart.
 */
function readTitleLines(doc, selectors) {
  function linesOf(element) {
    const lines = [];
    for (const child of element.children || []) {
      const text = (child.textContent || '').trim();
      if (text) lines.push(text);
    }
    if (lines.length) return lines;

    const own = (element.innerText || element.textContent || '').trim();
    return own
      .split('\n')
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);
  }

  // First element giving more than one piece wins. Taking every match would
  // let an outer container add the whole title back as one glued line, which
  // then reads as the episode name.
  const singles = [];
  for (const selector of selectors) {
    for (const element of doc.querySelectorAll(selector)) {
      const lines = linesOf(element);
      if (lines.length > 1) return lines;
      if (lines.length === 1) singles.push(lines[0]);
    }
  }
  return singles;
}

/**
 * Read the page and resolve it in one call, for callers that run in the
 * renderer and can require this module.
 *
 * MprisManager can't use this: its reading happens inside the page, where the
 * module doesn't exist. It stringifies readTitleLines and calls resolveTrack
 * in the main process instead.
 */
function readTrack(doc, titleSelectors, metaSelector) {
  const meta = metaSelector ? doc.querySelector(metaSelector) : null;
  return resolveTrack({
    titleLines: readTitleLines(doc, titleSelectors),
    metaText: (meta && (meta.innerText || meta.textContent)) || '',
    documentTitle: doc.title,
  });
}

/**
 * Keep what we already knew when a later read comes back emptier.
 *
 * The overlay disappears a few seconds after the controls hide, so most polls
 * during normal playback resolve nothing. Without this the metadata falls back
 * to "Netflix" every time that happens.
 */
function mergeTrack(previous, current) {
  if (!previous || !previous.show) return current;
  if (!current.show) return previous;
  if (!sameText(current.show, previous.show)) return current;

  const season = current.season ?? previous.season;
  const episode = current.episode ?? previous.episode;
  const sameEpisode = season === previous.season && episode === previous.episode;

  return {
    show: current.show,
    episodeTitle: current.episodeTitle || (sameEpisode ? previous.episodeTitle : ''),
    season,
    episode,
  };
}

/** "S2:E5", "S2", "E5" — whatever is known. */
function formatEpisodeLabel(track) {
  const parts = [];
  if (Number.isInteger(track.season)) parts.push(`S${track.season}`);
  if (Number.isInteger(track.episode)) parts.push(`E${track.episode}`);
  return parts.join(':');
}

function isEpisode(track) {
  return Boolean(
    track.episodeTitle || Number.isInteger(track.season) || Number.isInteger(track.episode)
  );
}

/**
 * The Player.Metadata map.
 *
 * Widgets show the title on one line and the artist underneath, so the
 * numbers go in the title where they are visible, and the show goes in the
 * artist. Nothing repeats the word "Netflix" more than once.
 */
function buildMetadata(track, options = {}) {
  const { trackId, lengthMicros = 0, url = '', artUrl = '' } = options;
  const show = normalizeText(track.show) || 'Netflix';
  const label = formatEpisodeLabel(track);
  const episode = isEpisode(track);

  const title = episode
    ? [label, normalizeText(track.episodeTitle)].filter(Boolean).join(' · ')
    : show;

  const metadata = {
    'mpris:trackid': trackId,
    'mpris:length': Math.max(0, Math.floor(lengthMicros) || 0),
    'xesam:title': title || show,
    'xesam:artist': [episode ? show : 'Netflix'],
  };

  // Only when it adds something. "Netflix" in the artist and the album as
  // well just reads as "Netflix Netflix" in a widget.
  if (episode && Number.isInteger(track.season)) {
    metadata['xesam:album'] = `Season ${track.season}`;
  }

  if (artUrl) metadata['mpris:artUrl'] = artUrl;
  if (url) metadata['xesam:url'] = url;
  if (Number.isInteger(track.episode)) metadata['xesam:trackNumber'] = track.episode;
  if (Number.isInteger(track.season)) metadata['xesam:discNumber'] = track.season;

  return metadata;
}

module.exports = {
  buildMetadata,
  formatEpisodeLabel,
  isEpisode,
  isGenericTitle,
  isSeasonEpisodeMarker,
  mergeTrack,
  normalizeText,
  parseSeasonEpisode,
  readTitleLines,
  readTrack,
  resolveTrack,
  separateMarkers,
  splitShowAndEpisode,
  stripNetflixSuffix,
};
