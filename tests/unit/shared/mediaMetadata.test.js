const {
  buildMetadata,
  formatEpisodeLabel,
  isEpisode,
  isGenericTitle,
  isSeasonEpisodeMarker,
  mergeTrack,
  parseSeasonEpisode,
  readTitleLines,
  readTrack,
  resolveTrack,
  separateMarkers,
  splitShowAndEpisode,
  stripNetflixSuffix,
} = require('../../../src/shared/mediaMetadata');

describe('mediaMetadata', () => {
  describe('parseSeasonEpisode', () => {
    it.each([
      ['S2:E5', 2, 5],
      ['S2 E5', 2, 5],
      ['S2E5', 2, 5],
      ['S10:E12', 10, 12],
      ['Season 2: Episode 5', 2, 5],
      ['Season 2 Episode 5', 2, 5],
      ['Staffel 2: Folge 7', 2, 7],
      ['St. 2 Flg. 7', 2, 7],
      ['Temporada 3: Episodio 1', 3, 1],
      ['Saison 4 : Épisode 2', 4, 2],
      ['T2:E5', 2, 5],
    ])('reads "%s" as season %i episode %i', (text, season, episode) => {
      expect(parseSeasonEpisode(text)).toEqual({ season, episode });
    });

    it('reads a season on its own', () => {
      expect(parseSeasonEpisode('Season 3')).toEqual({ season: 3, episode: null });
      expect(parseSeasonEpisode('S3')).toEqual({ season: 3, episode: null });
    });

    it('reads an episode on its own', () => {
      expect(parseSeasonEpisode('Episode 9')).toEqual({ season: null, episode: 9 });
      expect(parseSeasonEpisode('E9')).toEqual({ season: null, episode: 9 });
    });

    it('finds nothing in a plain title', () => {
      expect(parseSeasonEpisode('Stranger Things')).toEqual({ season: null, episode: null });
      expect(parseSeasonEpisode('')).toEqual({ season: null, episode: null });
    });

    // the whole reason the compact form is opt-in
    it('does not read a title that merely starts with a letter and a number', () => {
      expect(parseSeasonEpisode('F1: The Movie', { compact: false })).toEqual({
        season: null,
        episode: null,
      });
      expect(parseSeasonEpisode('S.W.A.T.', { compact: false })).toEqual({
        season: null,
        episode: null,
      });
    });

    it('still reads the spelled-out form with the compact form disabled', () => {
      expect(parseSeasonEpisode('Season 2: Episode 5', { compact: false })).toEqual({
        season: 2,
        episode: 5,
      });
    });
  });

  describe('isSeasonEpisodeMarker', () => {
    it.each(['S2:E5', 'S2E5', 'Season 2', 'E5', 'Flg. 7'])('recognises "%s"', (text) => {
      expect(isSeasonEpisodeMarker(text)).toBe(true);
    });

    it.each(['Stranger Things', 'Dig Dug', 'F1: The Movie', ''])(
      'does not mistake "%s" for one',
      (text) => {
        expect(isSeasonEpisodeMarker(text)).toBe(false);
      }
    );
  });

  describe('splitShowAndEpisode', () => {
    it('splits a combined one-liner', () => {
      expect(splitShowAndEpisode('Stranger Things S2:E5 Dig Dug')).toEqual({
        show: 'Stranger Things',
        episodeTitle: 'Dig Dug',
      });
    });

    it('drops the separator left behind by the marker', () => {
      expect(splitShowAndEpisode('The Night Agent S1:E3 - The Zipline')).toEqual({
        show: 'The Night Agent',
        episodeTitle: 'The Zipline',
      });
    });

    it('returns empties when there is nothing to split on', () => {
      expect(splitShowAndEpisode('Glass Onion')).toEqual({ show: '', episodeTitle: '' });
    });
  });

  describe('resolveTrack', () => {
    it('reads the three-line title overlay Netflix renders for a series', () => {
      expect(
        resolveTrack({
          titleLines: ['Stranger Things', 'S2:E5', 'Dig Dug'],
          metaText: 'S2:E5',
        })
      ).toEqual({ show: 'Stranger Things', episodeTitle: 'Dig Dug', season: 2, episode: 5 });
    });

    it('ignores duplicated lines from overlapping selectors', () => {
      expect(
        resolveTrack({
          titleLines: ['Stranger Things', 'Stranger Things', 'S2:E5', 'Dig Dug', 'Dig Dug'],
        })
      ).toEqual({ show: 'Stranger Things', episodeTitle: 'Dig Dug', season: 2, episode: 5 });
    });

    it('splits a single combined line', () => {
      expect(resolveTrack({ titleLines: ['Stranger Things S2:E5 Dig Dug'] })).toEqual({
        show: 'Stranger Things',
        episodeTitle: 'Dig Dug',
        season: 2,
        episode: 5,
      });
    });

    it('treats a lone title as a film', () => {
      expect(resolveTrack({ titleLines: ['Glass Onion'] })).toEqual({
        show: 'Glass Onion',
        episodeTitle: '',
        season: null,
        episode: null,
      });
    });

    it('falls back to the Media Session metadata when the overlay is hidden', () => {
      expect(
        resolveTrack({
          titleLines: [],
          documentTitle: 'Netflix',
          session: { album: 'Stranger Things', title: 'Dig Dug', artist: 'Netflix' },
        })
      ).toEqual({ show: 'Stranger Things', episodeTitle: 'Dig Dug', season: null, episode: null });
    });

    it('falls back to the document title, without its Netflix suffix', () => {
      expect(resolveTrack({ titleLines: [], documentTitle: 'Wednesday - Netflix' }).show).toBe(
        'Wednesday'
      );
    });

    it('resolves nothing out of a generic browse page', () => {
      expect(resolveTrack({ titleLines: [], documentTitle: 'Netflix' })).toEqual({
        show: '',
        episodeTitle: '',
        season: null,
        episode: null,
      });
    });

    it('does not repeat the show name as the episode name', () => {
      expect(
        resolveTrack({ titleLines: ['Wednesday'], session: { title: 'Wednesday' } }).episodeTitle
      ).toBe('');
    });

    it('prefers the dedicated meta element over anything in the title lines', () => {
      expect(
        resolveTrack({ titleLines: ['Dark', 'S1:E1', 'Secrets'], metaText: 'S3:E8' })
      ).toMatchObject({ season: 3, episode: 8 });
    });
  });

  // Netflix lays the overlay out as inline spans, so innerText gives one blob
  describe('run-together overlay text', () => {
    it('splits the blob Netflix actually hands back', () => {
      expect(resolveTrack({ titleLines: ['Stranger ThingsS2:E5Dig Dug'] })).toEqual({
        show: 'Stranger Things',
        episodeTitle: 'Dig Dug',
        season: 2,
        episode: 5,
      });
    });

    // Lupin is split into parts, not seasons, so Netflix shows "E3" alone
    it('handles a show with an episode number but no season', () => {
      expect(resolveTrack({ titleLines: ['LupinE3Chapter 3'] })).toEqual({
        show: 'Lupin',
        episodeTitle: 'Chapter 3',
        season: null,
        episode: 3,
      });
    });

    it('names it by the episode alone when there is no season', () => {
      const metadata = buildMetadata(resolveTrack({ titleLines: ['LupinE3Chapter 3'] }), {
        trackId: '/t/1',
      });

      expect(metadata['xesam:title']).toBe('E3 · Chapter 3');
      expect(metadata['xesam:artist']).toEqual(['Lupin']);
      expect(metadata['xesam:trackNumber']).toBe(3);
      expect(metadata).not.toHaveProperty('xesam:album');
      expect(metadata).not.toHaveProperty('xesam:discNumber');
    });

    it('copes with the space already half there', () => {
      expect(resolveTrack({ titleLines: ['Lupin E3Chapter 3'] })).toMatchObject({
        show: 'Lupin',
        episodeTitle: 'Chapter 3',
        episode: 3,
      });
    });

    it('handles the localised forms too', () => {
      expect(resolveTrack({ titleLines: ['La Casa de PapelT2:E5Episodio cinco'] })).toEqual({
        show: 'La Casa de Papel',
        episodeTitle: 'Episodio cinco',
        season: 2,
        episode: 5,
      });

      expect(resolveTrack({ titleLines: ['The Night AgentFlg. 7 Es war einmal'] })).toMatchObject({
        show: 'The Night Agent',
        episodeTitle: 'Es war einmal',
        episode: 7,
      });
    });

    // "F1" matches the episode-only form at index 0, which leaves no show
    // name, and a split without both halves is thrown away
    it('does not cut a film in half on its own name', () => {
      expect(splitShowAndEpisode('F1: The Movie').show).toBe('');
      expect(resolveTrack({ titleLines: ['F1: The Movie'] })).toEqual({
        show: 'F1: The Movie',
        episodeTitle: '',
        season: null,
        episode: null,
      });
    });

    it.each(['Se7en', '3Below', 'F1: The Movie', 'Formula 1: Drive to Survive', '1899', 'iCarly'])(
      'leaves "%s" exactly as it is',
      (title) => {
        expect(separateMarkers(title)).toBe(title);
        expect(resolveTrack({ titleLines: [title] }).show).toBe(title);
      }
    );
  });

  describe('readTitleLines', () => {
    const leaf = (text) => ({ children: [], textContent: text, innerText: text });

    function block(...parts) {
      const children = parts.filter(Boolean).map(leaf);
      const glued = children.map((child) => child.textContent).join('');
      // measured on the real app: innerText and textContent are identical
      return { children, textContent: glued, innerText: glued };
    }

    const docWith = (nodes) => ({
      querySelectorAll: (selector) => nodes[selector] || [],
    });

    it('takes one line per child of the title block', () => {
      const doc = docWith({ '[data-uia="video-title"]': [block('Lupin', 'E3', 'Chapter 3')] });
      expect(readTitleLines(doc, ['[data-uia="video-title"]'])).toEqual([
        'Lupin',
        'E3',
        'Chapter 3',
      ]);
    });

    it('stops at the first element with more than one piece', () => {
      const inner = block('Lupin', 'E3', 'Chapter 3');
      const doc = docWith({
        '[data-uia="video-title"]': [inner],
        '.video-title': [{ children: [inner], textContent: inner.textContent, innerText: '' }],
      });

      expect(readTitleLines(doc, ['[data-uia="video-title"]', '.video-title'])).toEqual([
        'Lupin',
        'E3',
        'Chapter 3',
      ]);
    });

    it('collects single-line matches when nothing yields more', () => {
      const doc = docWith({ h4: [leaf('Glass Onion')], '.other': [leaf('Glass Onion')] });
      expect(readTitleLines(doc, ['h4', '.other'])).toEqual(['Glass Onion', 'Glass Onion']);
    });

    it('falls back to the element text when it has no child elements', () => {
      const doc = docWith({ h4: [{ children: [], innerText: 'A\nB', textContent: 'A\nB' }] });
      expect(readTitleLines(doc, ['h4'])).toEqual(['A', 'B']);
    });

    it('returns nothing when no selector matches', () => {
      expect(readTitleLines(docWith({}), ['h4'])).toEqual([]);
    });

    // MprisManager stringifies this function into the page, so it must not
    // reach anything in module scope or the injected copy throws at runtime
    it('still works with nothing but its arguments in scope', () => {
      const vm = require('vm');
      const doc = {
        querySelectorAll: (selector) =>
          selector === '[data-uia="video-title"]' ? [block('Lupin', 'E3', 'Chapter 3')] : [],
      };

      const injected = vm.runInNewContext(`(${readTitleLines.toString()})`, {});
      expect(JSON.stringify(injected(doc, ['[data-uia="video-title"]']))).toBe(
        JSON.stringify(['Lupin', 'E3', 'Chapter 3'])
      );
    });
  });

  // what the preload calls; the title block shape is the one measured on the
  // real app, where [data-uia="video-meta"] is not present at all
  describe('readTrack', () => {
    const leaf = (text) => ({ children: [], textContent: text, innerText: text });

    function titleBlock(...parts) {
      const children = parts.filter(Boolean).map(leaf);
      const glued = children.map((child) => child.textContent).join('');
      return { children, textContent: glued, innerText: glued };
    }

    const docWith = (nodes, title = 'Netflix') => ({
      title,
      querySelector: (selector) => (nodes[selector] || [])[0] || null,
      querySelectorAll: (selector) => nodes[selector] || [],
    });

    const TITLES = ['h4.ellipsize-text', '[data-uia="video-title"]'];
    const META = '[data-uia="video-meta"]';

    it('resolves a part-numbered show with no season', () => {
      const doc = docWith({ '[data-uia="video-title"]': [titleBlock('Lupin', 'E3', 'Chapter 3')] });

      expect(readTrack(doc, TITLES, META)).toEqual({
        show: 'Lupin',
        episodeTitle: 'Chapter 3',
        season: null,
        episode: 3,
      });
    });

    it('resolves a show with seasons', () => {
      const doc = docWith({
        '[data-uia="video-title"]': [titleBlock('Stranger Things', 'S2:E5', 'Dig Dug')],
      });

      expect(readTrack(doc, TITLES, META)).toEqual({
        show: 'Stranger Things',
        episodeTitle: 'Dig Dug',
        season: 2,
        episode: 5,
      });
    });

    it('resolves the localised episode form', () => {
      const doc = docWith({
        '[data-uia="video-title"]': [
          titleBlock('BAKI-DOU: The Invincible Samurai', 'Flg. 2', 'Der Herzschlag'),
        ],
      });

      expect(readTrack(doc, TITLES, META)).toEqual({
        show: 'BAKI-DOU: The Invincible Samurai',
        episodeTitle: 'Der Herzschlag',
        season: null,
        episode: 2,
      });
    });

    it('resolves a film as a show with nothing else', () => {
      const doc = docWith({ '[data-uia="video-title"]': [titleBlock('Glass Onion')] });

      expect(readTrack(doc, TITLES, META)).toEqual({
        show: 'Glass Onion',
        episodeTitle: '',
        season: null,
        episode: null,
      });
    });

    it('uses the meta element when it is there', () => {
      const doc = docWith({
        '[data-uia="video-title"]': [titleBlock('Dark', 'Secrets')],
        '[data-uia="video-meta"]': [leaf('Season 3: Episode 8')],
      });

      expect(readTrack(doc, TITLES, META)).toMatchObject({ season: 3, episode: 8 });
    });

    it('falls back to the document title when the overlay is not rendered', () => {
      expect(readTrack(docWith({}, 'Wednesday - Netflix'), TITLES, META).show).toBe('Wednesday');
    });

    it('resolves nothing on a generic page', () => {
      expect(readTrack(docWith({}), TITLES, META)).toEqual({
        show: '',
        episodeTitle: '',
        season: null,
        episode: null,
      });
    });
  });

  describe('mergeTrack', () => {
    const resolved = { show: 'Stranger Things', episodeTitle: 'Dig Dug', season: 2, episode: 5 };
    const nothing = { show: '', episodeTitle: '', season: null, episode: null };

    // the overlay leaves the DOM seconds after the controls hide, which is
    // most of the time you are actually watching
    it('keeps what it knew when the overlay is gone', () => {
      expect(mergeTrack(resolved, nothing)).toEqual(resolved);
    });

    it('takes the first real reading', () => {
      expect(mergeTrack(nothing, resolved)).toEqual(resolved);
      expect(mergeTrack(null, resolved)).toEqual(resolved);
    });

    it('fills in only the parts that are missing', () => {
      expect(
        mergeTrack(resolved, { show: 'Stranger Things', episodeTitle: '', season: 2, episode: 5 })
      ).toEqual(resolved);
    });

    it('drops the old episode name once the numbers move on', () => {
      expect(
        mergeTrack(resolved, { show: 'Stranger Things', episodeTitle: '', season: 2, episode: 6 })
      ).toEqual({ show: 'Stranger Things', episodeTitle: '', season: 2, episode: 6 });
    });

    it('starts over for a different show', () => {
      const other = { show: 'Wednesday', episodeTitle: 'Pilot', season: 1, episode: 1 };
      expect(mergeTrack(resolved, other)).toEqual(other);
    });
  });

  describe('formatEpisodeLabel', () => {
    it.each([
      [{ season: 2, episode: 5 }, 'S2:E5'],
      [{ season: 2, episode: null }, 'S2'],
      [{ season: null, episode: 5 }, 'E5'],
      [{ season: null, episode: null }, ''],
    ])('formats %o as "%s"', (track, expected) => {
      expect(formatEpisodeLabel(track)).toBe(expected);
    });
  });

  describe('isEpisode', () => {
    it('is true as soon as any episode detail is known', () => {
      expect(isEpisode({ season: 1 })).toBe(true);
      expect(isEpisode({ episode: 4 })).toBe(true);
      expect(isEpisode({ episodeTitle: 'Pilot' })).toBe(true);
    });

    it('is false for a film', () => {
      expect(isEpisode({ show: 'Glass Onion', episodeTitle: '' })).toBe(false);
    });
  });

  describe('buildMetadata', () => {
    const options = {
      trackId: '/org/node/mediaplayer/netflix-linux/track/1',
      lengthMicros: 100 * 1e6,
      url: 'https://www.netflix.com/watch/123',
      artUrl: 'file:///art.png',
    };

    it('puts the episode numbers where a media widget will show them', () => {
      const metadata = buildMetadata(
        { show: 'Stranger Things', episodeTitle: 'Dig Dug', season: 2, episode: 5 },
        options
      );

      expect(metadata).toEqual({
        'mpris:trackid': options.trackId,
        'mpris:length': 100 * 1e6,
        'mpris:artUrl': 'file:///art.png',
        'xesam:title': 'S2:E5 · Dig Dug',
        'xesam:artist': ['Stranger Things'],
        'xesam:album': 'Season 2',
        'xesam:url': options.url,
        'xesam:trackNumber': 5,
        'xesam:discNumber': 2,
      });
    });

    it('credits a film to Netflix itself', () => {
      const metadata = buildMetadata({ show: 'Glass Onion', episodeTitle: '' }, options);

      expect(metadata['xesam:title']).toBe('Glass Onion');
      expect(metadata['xesam:artist']).toEqual(['Netflix']);
      expect(metadata).not.toHaveProperty('xesam:trackNumber');
      expect(metadata).not.toHaveProperty('xesam:discNumber');
    });

    // the "Netflix Netflix" a widget shows when artist and album both say it
    it('leaves the album out rather than repeating Netflix', () => {
      expect(buildMetadata({ show: 'Glass Onion' }, options)).not.toHaveProperty('xesam:album');
      expect(buildMetadata({ show: '', episodeTitle: '' }, options)).not.toHaveProperty(
        'xesam:album'
      );
      expect(buildMetadata({ show: 'Dark', episode: 3 }, options)).not.toHaveProperty(
        'xesam:album'
      );
    });

    it('never repeats the show name in the album', () => {
      const metadata = buildMetadata(
        { show: 'Stranger Things', episodeTitle: 'Dig Dug', season: 2, episode: 5 },
        options
      );

      expect(metadata['xesam:album']).toBe('Season 2');
      expect(metadata['xesam:album']).not.toContain('Stranger Things');
    });

    it('names an episode with no title by its numbers alone', () => {
      expect(
        buildMetadata({ show: 'Dark', episodeTitle: '', season: 1, episode: 3 }, options)[
          'xesam:title'
        ]
      ).toBe('S1:E3');
    });

    it('falls back to Netflix when even the show is unknown', () => {
      const metadata = buildMetadata({ show: '', episodeTitle: '' }, options);
      expect(metadata['xesam:title']).toBe('Netflix');
      expect(metadata['xesam:artist']).toEqual(['Netflix']);
    });

    it('leaves out an empty artUrl or url rather than publishing blanks', () => {
      const metadata = buildMetadata({ show: 'Dark' }, { trackId: '/t/1' });
      expect(metadata).not.toHaveProperty('mpris:artUrl');
      expect(metadata).not.toHaveProperty('xesam:url');
      expect(metadata['mpris:length']).toBe(0);
    });

    it('never publishes a negative or fractional length', () => {
      expect(buildMetadata({ show: 'Dark' }, { trackId: '/t/1', lengthMicros: -5 })).toMatchObject({
        'mpris:length': 0,
      });
      expect(
        buildMetadata({ show: 'Dark' }, { trackId: '/t/1', lengthMicros: 1234.9 })
      ).toMatchObject({ 'mpris:length': 1234 });
    });
  });

  describe('helpers', () => {
    it('strips a trailing Netflix suffix in any dash flavour', () => {
      expect(stripNetflixSuffix('Wednesday - Netflix')).toBe('Wednesday');
      expect(stripNetflixSuffix('Wednesday – Netflix')).toBe('Wednesday');
      expect(stripNetflixSuffix('Wednesday | Netflix')).toBe('Wednesday');
    });

    it('recognises the titles that mean "nothing is playing"', () => {
      expect(isGenericTitle('Netflix')).toBe(true);
      expect(isGenericTitle('Home - Netflix')).toBe(true);
      expect(isGenericTitle('')).toBe(true);
      expect(isGenericTitle('Stranger Things')).toBe(false);
    });
  });
});
