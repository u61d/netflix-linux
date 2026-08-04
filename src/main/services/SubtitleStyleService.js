const { SUBTITLE_SELECTORS } = require('../../config/selectors');

const FONT_SIZE_PX = {
  small: 20,
  medium: 28,
  large: 36,
  xlarge: 46,
};

const FONT_FAMILY_STACKS = {
  default: null, // leave Netflix's own font alone
  sans: '"Helvetica Neue", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  monospace: '"Courier New", Consolas, monospace',
};

function hexToRgb(hex, fallback = { r: 0, g: 0, b: 0 }) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!match) return fallback;
  const int = parseInt(match[1], 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function edgeStyleCss(style, color) {
  // contrast against light or dark subtitle text
  const shadow = color === '#000000' ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.9)';

  switch (style) {
    case 'outline':
      return `
        text-shadow:
          -1px -1px 0 ${shadow},
          1px -1px 0 ${shadow},
          -1px 1px 0 ${shadow},
          1px 1px 0 ${shadow} !important;
      `;
    case 'raised':
      return `text-shadow: 1px 1px 2px ${shadow}, 2px 2px 4px ${shadow} !important;`;
    case 'none':
      return 'text-shadow: none !important;';
    case 'dropshadow':
    default:
      return `text-shadow: 1px 1px 3px ${shadow} !important;`;
  }
}

// netflix sets font-size/color/background inline per cue, so overrides need
// !important or they get clobbered. Position is nudged with translateY
// instead of touching netflix's own bottom/positioning math.
class SubtitleStyleService {
  constructor(ctx) {
    this.ctx = ctx;
    this.insertedKey = null;
  }

  buildCss(settings) {
    const containerSel = SUBTITLE_SELECTORS.container;
    const textSel = SUBTITLE_SELECTORS.textContainer;

    const fontSizePx = FONT_SIZE_PX[settings.subtitleFontSize] || FONT_SIZE_PX.medium;
    const fontFamily = FONT_FAMILY_STACKS[settings.subtitleFontFamily];
    const { r, g, b } = hexToRgb(settings.subtitleBackgroundColor);
    const alpha =
      Math.max(0, Math.min(100, Number(settings.subtitleBackgroundOpacity) ?? 75)) / 100;
    const offset = Number(settings.subtitleVerticalOffset) || 0;

    return `
      ${textSel} {
        transform: translateY(${offset}px) !important;
      }

      ${textSel} span {
        font-size: ${fontSizePx}px !important;
        color: ${settings.subtitleTextColor} !important;
        ${fontFamily ? `font-family: ${fontFamily} !important;` : ''}
        ${edgeStyleCss(settings.subtitleEdgeStyle, settings.subtitleTextColor)}
      }

      /* background on the inner span so it hugs the text, not the full cue line */
      ${textSel} span span {
        background-color: rgba(${r}, ${g}, ${b}, ${alpha}) !important;
        padding: 0.05em 0.3em !important;
        border-radius: 3px !important;
      }

      ${containerSel} {
        pointer-events: none !important;
      }
    `;
  }

  async apply() {
    const win = this.ctx.getMainWindow();
    if (!win || win.isDestroyed()) return false;

    try {
      if (this.insertedKey) {
        await win.webContents.removeInsertedCSS(this.insertedKey).catch(() => {});
        this.insertedKey = null;
      }

      const enabled = this.ctx.store.get('subtitleCustomizationEnabled', false);
      if (!enabled) return true;

      const settings = {
        subtitleFontSize: this.ctx.store.get('subtitleFontSize', 'medium'),
        subtitleFontFamily: this.ctx.store.get('subtitleFontFamily', 'default'),
        subtitleTextColor: this.ctx.store.get('subtitleTextColor', '#ffffff'),
        subtitleBackgroundColor: this.ctx.store.get('subtitleBackgroundColor', '#000000'),
        subtitleBackgroundOpacity: this.ctx.store.get('subtitleBackgroundOpacity', 75),
        subtitleEdgeStyle: this.ctx.store.get('subtitleEdgeStyle', 'dropshadow'),
        subtitleVerticalOffset: this.ctx.store.get('subtitleVerticalOffset', 0),
      };

      const css = this.buildCss(settings);
      this.insertedKey = await win.webContents.insertCSS(css);
      this.ctx.logger.debug('Subtitle style CSS applied');
      return true;
    } catch (error) {
      this.ctx.logger.error('Failed to apply subtitle style:', error);
      return false;
    }
  }

  // same idea as AutoSkippers selector health check
  async checkSelectorHealth() {
    const win = this.ctx.getMainWindow();
    if (!win || win.isDestroyed()) return null;

    const script = `
      (function() {
        const containerSel = ${JSON.stringify(SUBTITLE_SELECTORS.container)};
        const textSel = ${JSON.stringify(SUBTITLE_SELECTORS.textContainer)};
        return {
          containerFound: document.querySelectorAll(containerSel).length,
          textContainerFound: document.querySelectorAll(textSel).length,
        };
      })();
    `;

    try {
      const result = await win.webContents.executeJavaScript(script, true);
      return {
        checkedAt: new Date().toISOString(),
        ...result,
        note:
          result.textContainerFound === 0
            ? 'No subtitle text found. Make sure a title is playing with subtitles/CC turned on, then check again.'
            : 'Selectors found subtitle elements.',
      };
    } catch (error) {
      return { checkedAt: new Date().toISOString(), error: error.message };
    }
  }

  cleanup() {
    this.insertedKey = null;
  }
}

module.exports = SubtitleStyleService;
