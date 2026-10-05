/**
 * VELOCITY RUSH – Menu System
 * Manages all screens, animated background, and race mode selection.
 */

const MenuSystem = (() => {
  let menuRenderer = null;
  let menuScene = null;
  let menuCamera = null;
  let menuCars = [];
  let menuAnimId = null;
  let currentMode = 'race';
  let selectedTrack = CONFIG.tracks[0];
  let raceOptions = { laps: 3, opponents: 4, difficulty: 'medium', weather: 'sunny' };

  // ── Animated Background ──────────────────────────────────────────

  function initMenuBackground() {
    const canvas = document.getElementById('menu-bg-canvas');
    if (!canvas) return;

    menuRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    menuRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    menuRenderer.setSize(window.innerWidth, window.innerHeight);
    menuRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    menuRenderer.toneMappingExposure = 1.0;

    menuScene = new THREE.Scene();
    menuScene.background = new THREE.Color(0x050a12);
    menuScene.fog = new THREE.FogExp2(0x050a12, 0.005);

    menuCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
    menuCamera.position.set(0, 8, 30);
    menuCamera.lookAt(0, 2, 0);

    // Lighting
    const ambient = new THREE.AmbientLight(0x223344, 0.8);
    menuScene.add(ambient);
    const directional = new THREE.DirectionalLight(0x00e5ff, 0.8);
    directional.position.set(10, 20, 10);
    menuScene.add(directional);
    const accent = new THREE.DirectionalLight(0xff3d00, 0.5);
    accent.position.set(-10, 10, 5);
    menuScene.add(accent);

    // Ground
    const gndGeo = new THREE.PlaneGeometry(200, 200, 20, 20);
    const gndMat = new THREE.MeshLambertMaterial({ color: 0x0a1020 });
    const gnd = new THREE.Mesh(gndGeo, gndMat);
    gnd.rotation.x = -Math.PI / 2;
    menuScene.add(gnd);

    // Grid lines on ground
    const gridHelper = new THREE.GridHelper(200, 40, 0x001133, 0x001133);
    menuScene.add(gridHelper);

    // Road stripes
    const stripeGeo = new THREE.PlaneGeometry(60, 3);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0x1a2a3a });
    const road = new THREE.Mesh(stripeGeo, stripeMat);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.01;
    menuScene.add(road);

    // Animated background cars
    const carColors = [0xff3d00, 0x00e5ff, 0xffd600, 0x7c4dff, 0x00e676];
    const carConfigs = [CONFIG.cars[4], CONFIG.cars[8], CONFIG.cars[11], CONFIG.cars[2]];

    carConfigs.forEach((cfg, i) => {
      const carGroup = new THREE.Group();
      const color = carColors[i % carColors.length];

      // Simple car shape
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(cfg.bodyW || 1.8, cfg.bodyH || 0.5, cfg.bodyL || 4),
        new THREE.MeshLambertMaterial({ color }),
      );
      body.position.y = 0.4;
      carGroup.add(body);

      const roof = new THREE.Mesh(
        new THREE.BoxGeometry((cfg.bodyW || 1.8) * 0.6, (cfg.bodyH || 0.5) * 0.85, (cfg.bodyL || 4) * 0.45),
        new THREE.MeshLambertMaterial({ color }),
      );
      roof.position.y = 0.4 + (cfg.bodyH || 0.5) / 2 + (cfg.bodyH || 0.5) * 0.85 / 2;
      carGroup.add(roof);

      // Headlights glow
      const hlGeo = new THREE.SphereGeometry(0.2, 6, 6);
      const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      [-0.5, 0.5].forEach(s => {
        const hl = new THREE.Mesh(hlGeo, hlMat);
        hl.position.set(s * ((cfg.bodyW || 1.8) * 0.45), 0.4, (cfg.bodyL || 4) / 2);
        carGroup.add(hl);
      });

      const lane = (i % 2 === 0 ? -1 : 1) * (4 + Math.random() * 6);
      carGroup.position.set(lane, 0, -30 - i * 20);
      carGroup.rotation.y = Math.PI;
      menuScene.add(carGroup);
      menuCars.push({ group: carGroup, speed: 0.3 + Math.random() * 0.3, lane });
    });

    // Neon city buildings
    const buildColors = [0x0a0a2a, 0x0a1a2a, 0x1a0a2a];
    for (let i = 0; i < 20; i++) {
      const h = 15 + Math.random() * 50;
      const geo = new THREE.BoxGeometry(5 + Math.random() * 8, h, 5 + Math.random() * 8);
      const mat = new THREE.MeshLambertMaterial({ color: buildColors[i % 3] });
      const building = new THREE.Mesh(geo, mat);
      const side = i % 2 === 0 ? 1 : -1;
      building.position.set(
        side * (50 + Math.random() * 60),
        h / 2,
        (Math.random() - 0.5) * 200,
      );
      menuScene.add(building);

      // Window glow
      const glowColors = [0x00e5ff, 0xff9800, 0x7c4dff, 0xffd600];
      const ptLight = new THREE.PointLight(glowColors[i % 4], 0.4, 30);
      ptLight.position.copy(building.position);
      ptLight.position.y = h * 0.7;
      menuScene.add(ptLight);
    }

    // Particle field (stars/city lights)
    const starCount = 1000;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3]     = (Math.random() - 0.5) * 400;
      starPositions[i * 3 + 1] = Math.random() * 100 + 10;
      starPositions[i * 3 + 2] = (Math.random() - 0.5) * 400;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, opacity: 0.6 });
    menuScene.add(new THREE.Points(starGeo, starMat));

    window.addEventListener('resize', () => {
      if (!menuRenderer) return;
      menuCamera.aspect = window.innerWidth / window.innerHeight;
      menuCamera.updateProjectionMatrix();
      menuRenderer.setSize(window.innerWidth, window.innerHeight);
    });

    _animateMenu();
  }

  function _animateMenu() {
    menuAnimId = requestAnimationFrame(_animateMenu);
    const time = performance.now() * 0.001;

    // Move cars
    menuCars.forEach(mc => {
      mc.group.position.z += mc.speed;
      if (mc.group.position.z > 50) mc.group.position.z = -80;
    });

    // Slow camera drift
    menuCamera.position.x = Math.sin(time * 0.1) * 5;
    menuCamera.position.y = 8 + Math.sin(time * 0.08) * 1;
    menuCamera.lookAt(Math.sin(time * 0.05) * 3, 2, 0);

    menuRenderer.render(menuScene, menuCamera);
  }

  function destroyMenuBackground() {
    if (menuAnimId) { cancelAnimationFrame(menuAnimId); menuAnimId = null; }
    menuCars = [];
    if (menuScene) {
      menuScene.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
    }
    if (menuRenderer) { menuRenderer.dispose(); menuRenderer = null; }
  }

  // ── Screen Management ────────────────────────────────────────────

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    if (id) document.getElementById(id)?.classList.remove('hidden');
  }

  // ── Main Menu ────────────────────────────────────────────────────

  function showMainMenu() {
    showScreen('main-menu');
    updateMenuStats();
    AudioEngine.resume();
    AudioEngine.playMusic('menu');
    if (!menuRenderer) initMenuBackground();
  }

  function updateMenuStats() {
    const save = SaveSystem.get();
    document.getElementById('menu-coins').textContent = save.coins.toLocaleString();
    document.getElementById('menu-level').textContent = save.level;
    const bestLap = save.bestLaps[selectedTrack?.id];
    document.getElementById('menu-best').textContent = bestLap
      ? formatTime(bestLap)
      : '--:--.---';
  }

  function formatTime(ms) {
    const t = ms / 1000;
    const min = Math.floor(t / 60).toString().padStart(2, '0');
    const sec = (t % 60).toFixed(3).padStart(6, '0');
    return `${min}:${sec}`;
  }

  // ── Race Select ──────────────────────────────────────────────────

  function showRaceSelect(mode = 'race') {
    currentMode = mode;
    showScreen('race-select-screen');

    const titles = {
      race: 'QUICK RACE',
      career: 'CAREER MODE',
      timetrial: 'TIME TRIAL',
      endless: 'ENDLESS HIGHWAY',
    };
    document.getElementById('race-select-title').textContent = titles[mode] || 'SELECT RACE';

    buildTrackGrid();
    initOptionButtons();
  }

  function buildTrackGrid() {
    const save = SaveSystem.get();
    const grid = document.getElementById('track-grid');
    if (!grid) return;
    grid.innerHTML = '';

    CONFIG.tracks.forEach(track => {
      const unlocked = save.level >= track.unlockLevel;
      const bestLap = save.bestLaps[track.id];
      const card = document.createElement('div');
      card.className = `track-card${selectedTrack?.id === track.id ? ' selected' : ''}${!unlocked ? ' locked' : ''}`;

      card.innerHTML = `
        <div class="track-card-img" style="background:linear-gradient(135deg, ${track.gradient?.[0] || '#1a2a3a'}, ${track.gradient?.[1] || '#2a3a4a'})">
          <span style="font-size:3.5rem;">${track.emoji}</span>
          ${!unlocked ? '<div class="track-lock-badge">🔒</div>' : ''}
        </div>
        <div class="track-card-name">${track.name}</div>
        <div class="track-card-info">
          ${track.length} · ${unlocked ? (bestLap ? '⏱ ' + formatTime(bestLap) : 'No record') : 'Unlock Lv.' + track.unlockLevel}
        </div>
      `;

      if (unlocked) {
        card.addEventListener('click', () => {
          selectedTrack = track;
          document.querySelectorAll('.track-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          AudioEngine.playMenuClick();
        });
      }

      grid.appendChild(card);
    });

    // Auto-select first track
    if (!selectedTrack || !save.level >= selectedTrack.unlockLevel) {
      selectedTrack = CONFIG.tracks.find(t => save.level >= t.unlockLevel) || CONFIG.tracks[0];
    }
  }

  function initOptionButtons() {
    document.querySelectorAll('.option-btns').forEach(group => {
      const btns = group.querySelectorAll('.opt-btn');
      btns.forEach(btn => {
        btn.addEventListener('click', () => {
          btns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          AudioEngine.playMenuClick();

          const groupId = group.id;
          const val = btn.dataset.value;
          if (groupId === 'lap-select') raceOptions.laps = parseInt(val);
          else if (groupId === 'opp-select') raceOptions.opponents = parseInt(val);
          else if (groupId === 'diff-select') raceOptions.difficulty = val;
          else if (groupId === 'weather-select') raceOptions.weather = val;
        });
      });
    });
  }

  // ── Leaderboard ──────────────────────────────────────────────────

  function showLeaderboard() {
    showScreen('leaderboard-screen');
    const save = SaveSystem.get();
    const content = document.getElementById('leaderboard-content');
    content.innerHTML = '';

    if (!save.leaderboard.length) {
      content.innerHTML = '<div style="padding:2rem;color:rgba(255,255,255,0.3);text-align:center;">No races yet. Get out there! 🏎</div>';
      return;
    }

    save.leaderboard.forEach((entry, i) => {
      const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      const trackCfg = CONFIG.tracks.find(t => t.id === entry.trackId);
      const row = document.createElement('div');
      row.className = 'lb-entry';
      row.innerHTML = `
        <div class="lb-rank ${rankClass}">${i + 1}</div>
        <div style="flex:0 0 auto; font-size:1.5rem;">${trackCfg?.emoji || '🏁'}</div>
        <div class="lb-name">${entry.name}<div class="lb-track">${trackCfg?.name || 'Unknown Track'} · Pos: ${entry.position}</div></div>
        <div class="lb-time">${formatTime(entry.bestLap || entry.time)}</div>
      `;
      content.appendChild(row);
    });
  }

  // ── Settings ─────────────────────────────────────────────────────

  function showSettings() {
    showScreen('settings-screen');
    const save = SaveSystem.get();
    const settings = save.settings;
    const content = document.getElementById('settings-content');
    content.innerHTML = '';

    const settingsDefs = [
      { label: 'Master Volume', key: 'masterVolume', type: 'range', min: 0, max: 1, step: 0.1 },
      { label: 'Music Volume', key: 'musicVolume', type: 'range', min: 0, max: 1, step: 0.1 },
      { label: 'SFX Volume', key: 'sfxVolume', type: 'range', min: 0, max: 1, step: 0.1 },
      { label: 'Shadows', sub: 'Better quality, lower performance', key: 'shadows', type: 'toggle' },
      { label: 'Bloom Effects', sub: 'Glow on lights and nitro', key: 'bloom', type: 'toggle' },
      { label: 'Camera Shake', sub: 'Shakes on collision and nitro', key: 'cameraShake', type: 'toggle' },
      { label: 'Show FPS Counter', key: 'showFPS', type: 'toggle' },
    ];

    settingsDefs.forEach(def => {
      const row = document.createElement('div');
      row.className = 'settings-row';

      const labelDiv = document.createElement('div');
      labelDiv.innerHTML = `<label>${def.label}</label>${def.sub ? `<small>${def.sub}</small>` : ''}`;

      let control;
      if (def.type === 'toggle') {
        control = document.createElement('div');
        control.className = 'toggle-wrap';
        const toggle = document.createElement('div');
        toggle.className = `toggle${settings[def.key] ? ' on' : ''}`;
        toggle.addEventListener('click', () => {
          const newVal = !SaveSystem.get().settings[def.key];
          SaveSystem.updateSetting(def.key, newVal);
          toggle.classList.toggle('on', newVal);
          AudioEngine.playMenuClick();
        });
        control.appendChild(toggle);
      } else if (def.type === 'range') {
        control = document.createElement('div');
        control.className = 'range-wrap';
        const input = document.createElement('input');
        input.type = 'range';
        input.min = def.min; input.max = def.max; input.step = def.step;
        input.value = settings[def.key];
        const val = document.createElement('div');
        val.className = 'range-val';
        val.textContent = Math.round(settings[def.key] * 100);
        input.addEventListener('input', () => {
          const v = parseFloat(input.value);
          val.textContent = Math.round(v * 100);
          SaveSystem.updateSetting(def.key, v);
          if (def.key === 'masterVolume') AudioEngine.setMasterVolume(v);
          else if (def.key === 'musicVolume') AudioEngine.setMusicVolume(v);
          else if (def.key === 'sfxVolume') AudioEngine.setSFXVolume(v);
        });
        control.appendChild(input);
        control.appendChild(val);
      }

      row.appendChild(labelDiv);
      if (control) row.appendChild(control);
      content.appendChild(row);
    });

    // Reset save
    const resetRow = document.createElement('div');
    resetRow.className = 'settings-row';
    resetRow.innerHTML = `<div><label style="color:var(--red)">Reset All Progress</label><small>⚠ This cannot be undone!</small></div>`;
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'RESET';
    resetBtn.style.cssText = 'background:var(--red);border:none;color:#fff;padding:0.5rem 1rem;border-radius:4px;font-family:var(--font-race);cursor:pointer;';
    resetBtn.addEventListener('click', () => {
      if (confirm('Reset ALL progress? This cannot be undone!')) {
        SaveSystem.reset();
        showMainMenu();
      }
    });
    resetRow.appendChild(resetBtn);
    content.appendChild(resetRow);
  }

  // ── Bind Events ──────────────────────────────────────────────────

  function bindEvents() {
    // Main menu buttons
    const btnMap = {
      'btn-quick-race':  () => showRaceSelect('race'),
      'btn-career':      () => showRaceSelect('career'),
      'btn-time-trial':  () => showRaceSelect('timetrial'),
      'btn-endless':     () => showRaceSelect('endless'),
      'btn-garage':      () => { GarageUI.show(); showScreen('garage-screen'); },
      'btn-leaderboard': () => showLeaderboard(),
      'btn-settings':    () => showSettings(),
    };

    Object.entries(btnMap).forEach(([id, fn]) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => { AudioEngine.resume(); AudioEngine.playMenuClick(); fn(); });
    });

    // Back buttons
    const backMap = {
      'race-select-back': () => showMainMenu(),
      'garage-back':      () => { GarageUI.hide(); showMainMenu(); },
      'leaderboard-back': () => showMainMenu(),
      'settings-back':    () => showMainMenu(),
    };
    Object.entries(backMap).forEach(([id, fn]) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => { AudioEngine.playMenuClick(); fn(); });
    });

    // Start Race
    document.getElementById('start-race-btn')?.addEventListener('click', () => {
      if (!selectedTrack) { alert('Please select a track!'); return; }
      AudioEngine.playMenuClick();
      startRace();
    });

    // Garage back
    document.getElementById('garage-back')?.addEventListener('click', () => {
      GarageUI.hide();
      showMainMenu();
    });

    // HUD Menu Button
    document.getElementById('hud-menu-btn')?.addEventListener('click', () => {
      AudioEngine.playMenuClick();
      if (window.Game) window.Game.togglePause();
    });

    // Pause menu
    document.getElementById('pause-resume')?.addEventListener('click', () => {
      if (window.Game) window.Game.togglePause();
    });
    document.getElementById('pause-restart')?.addEventListener('click', () => {
      if (window.Game) {
        window.Game.dispose();
        window.Game = null;
        startRace();
      }
    });
    document.getElementById('pause-quit')?.addEventListener('click', () => {
      if (window.Game) { window.Game.dispose(); window.Game = null; }
      document.getElementById('game-canvas').classList.add('hidden');
      showMainMenu();
    });

    // Race result
    document.getElementById('result-restart')?.addEventListener('click', () => {
      if (window.Game) { window.Game.dispose(); window.Game = null; }
      startRace();
    });
    document.getElementById('result-menu')?.addEventListener('click', () => {
      if (window.Game) { window.Game.dispose(); window.Game = null; }
      document.getElementById('game-canvas').classList.add('hidden');
      showMainMenu();
    });
  }

  // ── Start Race ───────────────────────────────────────────────────

  function startRace() {
    AudioEngine.stopMusic();
    destroyMenuBackground();

    // Hide all screens
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));

    // Show game canvas
    const canvas = document.getElementById('game-canvas');
    canvas.classList.remove('hidden');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: window.devicePixelRatio < 2,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = SaveSystem.get().settings.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;

    // Window resize
    window.addEventListener('resize', () => {
      if (!renderer) return;
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Create game session
    const session = new RaceSession({
      trackId: selectedTrack?.id || 'city',
      totalLaps: raceOptions.laps,
      opponentCount: raceOptions.opponents,
      difficulty: raceOptions.difficulty,
      weather: raceOptions.weather,
      mode: currentMode,
    });

    session.init(renderer, canvas);
    session.start();
    window.Game = session;
  }

  return {
    init: () => {
      GarageUI.init();
      bindEvents();
    },
    showMainMenu,
    showRaceSelect,
    showLeaderboard,
    showSettings,
  };
})();
