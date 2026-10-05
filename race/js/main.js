/**
 * VELOCITY RUSH – Bootstrap & Application Entry
 * Initializes everything, runs the loading sequence.
 */

(function init() {
  'use strict';

  // ── Loading Sequence ───────────────────────────────────────────

  const loadingBar   = document.getElementById('loading-bar');
  const loadingText  = document.getElementById('loading-text');
  const loadingSteps = [
    { msg: 'Loading Engine...',        pct: 10 },
    { msg: 'Building World...',        pct: 25 },
    { msg: 'Spawning Cars...',         pct: 40 },
    { msg: 'Tuning Physics...',        pct: 55 },
    { msg: 'Wiring Electronics...',    pct: 70 },
    { msg: 'Painting Tracks...',       pct: 85 },
    { msg: 'Fueling Up...',            pct: 95 },
    { msg: 'Ready to Race!',           pct: 100 },
  ];

  let stepIndex = 0;

  function nextStep() {
    if (stepIndex >= loadingSteps.length) {
      // All done – show menu
      setTimeout(finishLoading, 300);
      return;
    }
    const step = loadingSteps[stepIndex++];
    loadingBar.style.width = step.pct + '%';
    loadingText.textContent = step.msg;
    setTimeout(nextStep, 180 + Math.random() * 120);
  }

  function finishLoading() {
    // Init save system
    SaveSystem.load();

    // Apply saved audio settings
    const settings = SaveSystem.get().settings;
    AudioEngine.setMasterVolume(settings.masterVolume);
    AudioEngine.setMusicVolume(settings.musicVolume);
    AudioEngine.setSFXVolume(settings.sfxVolume);

    // Init menu
    MenuSystem.init();

    // Fade out loading screen
    const loadScreen = document.getElementById('loading-screen');
    loadScreen.style.transition = 'opacity 0.6s ease';
    loadScreen.style.opacity = '0';
    setTimeout(() => {
      loadScreen.classList.add('hidden');
      MenuSystem.showMainMenu();
    }, 600);
  }

  // Start loading
  nextStep();

  // ── Window Resize ──────────────────────────────────────────────

  window.addEventListener('resize', () => {
    // Game canvas resize is handled inside the session
    const canvas = document.getElementById('game-canvas');
    if (canvas && !canvas.classList.contains('hidden')) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
  });

  // ── Prevent context menu on right-click ───────────────────────

  document.addEventListener('contextmenu', e => e.preventDefault());

  // ── Keyboard shortcut: F to toggle fullscreen ─────────────────

  document.addEventListener('keydown', e => {
    if (e.key === 'f' || e.key === 'F') {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    }
  });

  // ── Touch: prevent scroll bounce ─────────────────────────────

  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

  // ── Global Game reference (used by HTML button handlers) ──────
  window.Game = null;

})();
