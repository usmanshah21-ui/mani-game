/**
 * VELOCITY RUSH – Input Manager
 * Keyboard, Touch, and Gamepad support.
 */

const InputManager = (() => {
  const keys = {};
  const state = {
    accel: false,
    brake: false,
    left: false,
    right: false,
    nitro: false,
    drift: false,
    pause: false,
  };

  // -- Keyboard --

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    updateState();
    // Pause on Escape
    if (e.code === 'Escape' && window.Game) window.Game.togglePause();
    e.preventDefault && ['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code) && e.preventDefault();
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    updateState();
  });

  function updateState() {
    state.accel  = !!(keys['KeyW'] || keys['ArrowUp']);
    state.brake  = !!(keys['KeyS'] || keys['ArrowDown']);
    state.left   = !!(keys['KeyA'] || keys['ArrowLeft']);
    state.right  = !!(keys['KeyD'] || keys['ArrowRight']);
    state.nitro  = !!(keys['Space']);
    state.drift  = !!(keys['ShiftLeft'] || keys['ShiftRight']);
  }

  // -- Touch / Mobile --

  function mobilePress(action, pressed) {
    state[action] = pressed;
    if (action === 'accel' || action === 'brake') {
      state.accel = pressed && action === 'accel';
      state.brake = pressed && action === 'brake';
    }
  }

  // -- Gamepad --

  let gamepadIndex = null;

  window.addEventListener('gamepadconnected', (e) => {
    gamepadIndex = e.gamepad.index;
    console.log('[Input] Gamepad connected:', e.gamepad.id);
  });
  window.addEventListener('gamepaddisconnected', () => { gamepadIndex = null; });

  function pollGamepad() {
    if (gamepadIndex === null) return;
    const gp = navigator.getGamepads ? navigator.getGamepads()[gamepadIndex] : null;
    if (!gp) return;

    // RT / R2 = accelerate, LT / L2 = brake
    state.accel = gp.buttons[7]?.pressed || gp.axes[1] < -0.3;
    state.brake = gp.buttons[6]?.pressed || gp.axes[1] > 0.3;
    state.left  = gp.axes[0] < -0.25;
    state.right = gp.axes[0] > 0.25;
    state.nitro = gp.buttons[0]?.pressed; // A / Cross
    state.drift = gp.buttons[2]?.pressed; // X / Square

    // D-pad fallback
    if (gp.buttons[12]?.pressed) state.accel = true;
    if (gp.buttons[13]?.pressed) state.brake = true;
    if (gp.buttons[14]?.pressed) state.left = true;
    if (gp.buttons[15]?.pressed) state.right = true;

    // Start = pause
    if (gp.buttons[9]?.pressed && window.Game) window.Game.togglePause();
  }

  // Analog steering value (-1 to 1)
  function getAnalogSteer() {
    if (gamepadIndex !== null) {
      const gp = navigator.getGamepads ? navigator.getGamepads()[gamepadIndex] : null;
      if (gp) {
        const axis = gp.axes[0];
        // Negate gamepad axis: most controllers give +1 for right-push,
        // but we want -1 for right (same convention as keys above).
        if (Math.abs(axis) > 0.15) return -axis;
      }
    }
    // Three.js positive rotation.y = CCW from above = LEFT visual turn.
    // So LEFT key must give +1 (increases heading = turns left).
    // RIGHT key gives -1 (decreases heading = turns right).
    return state.left ? 1 : state.right ? -1 : 0;
  }

  function getThrottle() {
    if (gamepadIndex !== null) {
      const gp = navigator.getGamepads ? navigator.getGamepads()[gamepadIndex] : null;
      if (gp) {
        const rt = gp.buttons[7]?.value || 0;
        const lt = gp.buttons[6]?.value || 0;
        if (rt > 0.05) return rt;
        if (lt > 0.05) return -lt;
      }
    }
    return state.accel ? 1 : state.brake ? -1 : 0;
  }

  function detectMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || window.innerWidth < 768;
  }

  function showMobileControls(show) {
    const el = document.getElementById('mobile-controls');
    if (el) el.classList.toggle('hidden', !show);
  }

  return {
    state,
    mobilePress,
    pollGamepad,
    getAnalogSteer,
    getThrottle,
    detectMobile,
    showMobileControls,
  };
})();
