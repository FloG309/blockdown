// Layout settings popover — manages theme, font size, line height,
// paragraph spacing, content width. Persists to localStorage.

(function () {
  const STORAGE_KEY = 'blockdown-settings';

  const DEFAULTS = {
    theme: 'light',
    fontSize: '16',
    lineHeight: '1.6',
    paragraphSpacing: '1',
    contentWidth: '75',
  };

  const FONT_SIZES = ['14', '16', '18', '20'];

  const THEME_CYCLE = ['light', 'dark'];

  // ── Read / write localStorage ──────────────────────────

  function loadSettings() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = Object.assign({}, DEFAULTS, JSON.parse(stored));
        // Migrate old values
        if (parsed.theme === 'system') parsed.theme = 'light';
        if (String(parsed.paragraphSpacing).includes('rem')) {
          parsed.paragraphSpacing = parseFloat(parsed.paragraphSpacing).toString();
        }
        if (String(parsed.contentWidth).includes('%')) {
          parsed.contentWidth = parseFloat(parsed.contentWidth).toString();
        }
        return parsed;
      }
    } catch (_) { /* ignore */ }
    return Object.assign({}, DEFAULTS);
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (_) { /* ignore */ }
  }

  // ── Apply settings to the page ─────────────────────────

  function applyTheme(theme) {
    const html = document.documentElement;
    html.setAttribute('data-theme', theme);

    // Swap Highlight.js theme
    const isDark = html.getAttribute('data-theme') === 'dark';
    const hljsLink = document.getElementById('hljs-theme');
    if (hljsLink) {
      hljsLink.href = isDark
        ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark-dimmed.min.css'
        : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
    }

    // Re-initialize mermaid with matching theme and re-render diagrams
    if (typeof mermaid !== 'undefined') {
      const mermaidConfig = {
        startOnLoad: false,
        securityLevel: 'loose',
      };
      if (isDark) {
        mermaidConfig.theme = 'base';
        mermaidConfig.themeVariables = {
          background: '#1e1e2e',
          primaryColor: '#313244',
          primaryTextColor: '#cdd6f4',
          primaryBorderColor: '#585b70',
          secondaryColor: '#45475a',
          tertiaryColor: '#3b3d54',
          lineColor: '#a6adc8',
          textColor: '#cdd6f4',
          mainBkg: '#313244',
          nodeBorder: '#585b70',
          clusterBkg: '#2a2a3e',
          edgeLabelBackground: '#313244',
          fontFamily: 'system-ui, sans-serif',
        };
      } else {
        mermaidConfig.theme = 'default';
      }
      mermaid.initialize(mermaidConfig);
      reRenderMermaidBlocks(isDark);
    }
  }

  async function reRenderMermaidBlocks(isDark) {
    const containers = document.querySelectorAll('.mermaid-container');
    if (containers.length === 0) return;

    for (const container of containers) {
      const source = container.getAttribute('data-mermaid-source');
      if (!source) continue;

      try {
        const id = 'mermaid-theme-' + Math.random().toString(36).substr(2, 9);
        const { svg } = await mermaid.render(id, source);

        // Preserve selection state
        const wasSelected = container.classList.contains('selected');

        // Clean up old container's document listeners
        if (container._onMouseMove) document.removeEventListener('mousemove', container._onMouseMove);
        if (container._onMouseUp) document.removeEventListener('mouseup', container._onMouseUp);

        // Replace with new container
        const newContainer = createMermaidContainer(svg, source);
        container.parentNode.replaceChild(newContainer, container);
        if (wasSelected) newContainer.classList.add('selected');
      } catch (err) {
        // Leave as-is on error
      }
    }

    setupSelectionHandlers();
    // Restore selection
    const selected = document.querySelector('#preview .selected');
    if (selected) {
      const idx = parseInt(selected.getAttribute('data-index'));
      if (!isNaN(idx)) currentSelectedIndex = idx;
    }
  }

  function applySetting(key, value) {
    const root = document.documentElement.style;
    switch (key) {
      case 'theme':
        applyTheme(value);
        break;
      case 'fontSize':
        root.setProperty('--font-size', value + 'px');
        break;
      case 'lineHeight':
        root.setProperty('--line-height', value);
        break;
      case 'paragraphSpacing':
        root.setProperty('--paragraph-spacing', value + 'rem');
        break;
      case 'contentWidth':
        root.setProperty('--content-width', value + '%');
        break;
    }
  }

  function applyAllSettings(settings) {
    for (const [key, value] of Object.entries(settings)) {
      applySetting(key, value);
    }
  }

  // ── Popover UI ─────────────────────────────────────────

  function updatePopoverControls(settings) {
    const popover = document.getElementById('settings-popover');
    if (!popover) return;

    // Update segmented buttons (theme, fontSize)
    popover.querySelectorAll('.settings-seg').forEach(seg => {
      const settingKey = seg.getAttribute('data-setting');
      const activeValue = settings[settingKey];
      seg.querySelectorAll('button').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-value') === String(activeValue));
      });
    });

    // Update sliders
    popover.querySelectorAll('input[type="range"]').forEach(slider => {
      const settingKey = slider.getAttribute('data-setting');
      if (settings[settingKey] !== undefined) {
        slider.value = settings[settingKey];
      }
    });

    // Update slider value displays
    updateSliderDisplays(settings);
  }

  function updateSliderDisplays(settings) {
    const popover = document.getElementById('settings-popover');
    if (!popover) return;

    const displays = {
      lineHeight: settings.lineHeight,
      paragraphSpacing: settings.paragraphSpacing + 'rem',
    };

    for (const [key, text] of Object.entries(displays)) {
      const span = popover.querySelector('[data-display="' + key + '"]');
      if (span) span.textContent = text;
    }
  }

  // ── Gear button drag-to-resize content width ────────────

  function initDragResize() {
    const btn = document.getElementById('settings-btn');
    if (!btn) return;

    let isDragging = false;
    let hasMoved = false;
    let startX = 0;
    let guideLeft = null;
    let guideRight = null;

    function createGuides() {
      guideLeft = document.createElement('div');
      guideLeft.className = 'content-width-guide';
      guideRight = document.createElement('div');
      guideRight.className = 'content-width-guide';
      document.body.appendChild(guideLeft);
      document.body.appendChild(guideRight);
    }

    function updateGuides(widthPct) {
      const vw = window.innerWidth;
      const contentPx = vw * widthPct / 100;
      const leftEdge = (vw - contentPx) / 2;
      const rightEdge = (vw + contentPx) / 2;
      if (guideLeft) guideLeft.style.left = leftEdge + 'px';
      if (guideRight) guideRight.style.left = rightEdge + 'px';
    }

    function removeGuides() {
      if (guideLeft) { guideLeft.remove(); guideLeft = null; }
      if (guideRight) { guideRight.remove(); guideRight = null; }
    }

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      if (!hasMoved && Math.abs(e.clientX - startX) > 3) {
        hasMoved = true;
        btn.classList.add('dragging');
        document.body.style.cursor = 'ew-resize';
        createGuides();
      }

      if (!hasMoved) return;

      // The gear sits at the right edge of #preview content.
      // Gear center ≈ right edge of content + 28px (44px offset - 16px half-width).
      // So content right edge ≈ mouseX - 28.
      // Content is centered: width = 2 * (rightEdge - viewportCenter).
      const vw = window.innerWidth;
      const contentRightEdge = e.clientX - 28;
      const contentPx = 2 * (contentRightEdge - vw / 2);
      let widthPct = Math.round(contentPx / vw * 100);
      widthPct = Math.max(30, Math.min(95, widthPct));

      const settings = loadSettings();
      settings.contentWidth = String(widthPct);
      saveSettings(settings);
      applySetting('contentWidth', settings.contentWidth);
      updateGuides(widthPct);
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      btn.classList.remove('dragging');
      document.body.style.cursor = '';
      removeGuides();

      // If no drag happened, treat as click → toggle popover
      if (!hasMoved) {
        const popover = document.getElementById('settings-popover');
        if (popover) popover.classList.toggle('hidden');
      }
    });
  }

  function initPopover() {
    const btn = document.getElementById('settings-btn');
    const popover = document.getElementById('settings-popover');
    if (!btn || !popover) return;

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!popover.contains(e.target) && e.target !== btn) {
        popover.classList.add('hidden');
      }
    });

    // Prevent popover clicks from triggering block selection
    popover.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    popover.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    // Handle segmented button clicks (theme, fontSize)
    popover.querySelectorAll('.settings-seg').forEach(seg => {
      const settingKey = seg.getAttribute('data-setting');

      seg.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const value = btn.getAttribute('data-value');
          const settings = loadSettings();
          settings[settingKey] = value;
          saveSettings(settings);
          applySetting(settingKey, value);
          updatePopoverControls(settings);
        });
      });
    });

    // Handle slider inputs (lineHeight, paragraphSpacing)
    popover.querySelectorAll('input[type="range"]').forEach(slider => {
      const settingKey = slider.getAttribute('data-setting');

      slider.addEventListener('input', () => {
        const value = slider.value;
        const settings = loadSettings();
        settings[settingKey] = value;
        saveSettings(settings);
        applySetting(settingKey, value);
        updateSliderDisplays(settings);
      });
    });

    // Init drag-to-resize on gear button
    initDragResize();
  }

  // ── Keyboard shortcuts ─────────────────────────────────

  function cycleFontSize(direction) {
    const settings = loadSettings();
    const idx = FONT_SIZES.indexOf(String(settings.fontSize));
    const newIdx = Math.max(0, Math.min(FONT_SIZES.length - 1, idx + direction));
    settings.fontSize = FONT_SIZES[newIdx];
    saveSettings(settings);
    applySetting('fontSize', settings.fontSize);
    updatePopoverControls(settings);
  }

  function cycleTheme() {
    const settings = loadSettings();
    const idx = THEME_CYCLE.indexOf(settings.theme);
    settings.theme = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    saveSettings(settings);
    applySetting('theme', settings.theme);
    updatePopoverControls(settings);
  }

  // Expose for base.js keydown handler
  window.LayoutSettings = {
    cycleFontSize,
    cycleTheme,
  };

  // ── Init ───────────────────────────────────────────────

  // Apply settings as early as possible (before DOMContentLoaded) to avoid flash
  const settings = loadSettings();
  applyAllSettings(settings);

  document.addEventListener('DOMContentLoaded', () => {
    initPopover();
    updatePopoverControls(settings);
  });
})();
