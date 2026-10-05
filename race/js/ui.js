/**
 * VELOCITY RUSH – HUD & UI Rendering
 * Speedometer (canvas arc), RPM meter, mini-map, race positions.
 */

const HUD = (() => {
  let speedoCtx, rpmCtx, minimapCtx;
  let initialized = false;
  let fpsBuffer = [];
  let lastFpsTime = performance.now();

  function init() {
    speedoCtx  = document.getElementById('speedo-canvas')?.getContext('2d');
    rpmCtx     = document.getElementById('rpm-canvas')?.getContext('2d');
    minimapCtx = document.getElementById('minimap-canvas')?.getContext('2d');
    initialized = true;
  }

  // ── Speedometer ────────────────────────────────────────────────

  function drawSpeedometer(speedKmh, maxKmh) {
    if (!speedoCtx) return;
    const ctx = speedoCtx;
    const w = 200, h = 110;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2, cy = h - 15;
    const r = h - 20;
    const startA = Math.PI;
    const endA = 0;
    const pct = Math.min(1, speedKmh / maxKmh);
    const angle = startA + pct * Math.PI;

    // Background arc
    ctx.beginPath();
    ctx.arc(cx, cy, r, startA, endA, false);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 8;
    ctx.stroke();

    // Speed arc
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, '#00e5ff');
    gradient.addColorStop(0.7, '#7c4dff');
    gradient.addColorStop(1, '#ff3d00');
    ctx.beginPath();
    ctx.arc(cx, cy, r, startA, angle, false);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Tick marks
    for (let i = 0; i <= 10; i++) {
      const a = startA + (i / 10) * Math.PI;
      const x1 = cx + Math.cos(a) * (r - 10);
      const y1 = cy + Math.sin(a) * (r - 10);
      const x2 = cx + Math.cos(a) * r;
      const y2 = cy + Math.sin(a) * r;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = i === 0 || i === 10 ? '#ff3d00' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = i % 5 === 0 ? 2 : 1;
      ctx.stroke();
    }
  }

  // ── RPM Meter ──────────────────────────────────────────────────

  function drawRPM(rpm) {
    if (!rpmCtx) return;
    const ctx = rpmCtx;
    const w = 100, h = 100;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, r = 38;

    // Background circle
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 6;
    ctx.stroke();

    // RPM arc
    const pct = Math.min(1, rpm / 100);
    const startA = -Math.PI / 2;
    const endA = startA + pct * Math.PI * 2;
    const rpmColor = rpm > 80 ? '#ff3d00' : rpm > 60 ? '#ffaa00' : '#00e5ff';
    ctx.beginPath();
    ctx.arc(cx, cy, r, startA, endA);
    ctx.strokeStyle = rpmColor;
    ctx.lineWidth = 6;
    ctx.shadowColor = rpmColor;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // RPM label
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '9px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('RPM', cx, cy + 3);
  }

  // ── Minimap ────────────────────────────────────────────────────

  function drawMinimap(track, playerCar, aiCars) {
    if (!minimapCtx || !track) return;
    const ctx = minimapCtx;
    const w = 180, h = 180;
    ctx.clearRect(0, 0, w, h);

    // Circular clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, w, h);

    // Compute track bounds
    const pts = track.curve.getSpacedPoints(80);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    pts.forEach(p => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    });
    const rangeX = maxX - minX + 20;
    const rangeZ = maxZ - minZ + 20;
    const scale = Math.min((w - 20) / rangeX, (h - 20) / rangeZ);
    const offX = (w - rangeX * scale) / 2 - minX * scale;
    const offZ = (h - rangeZ * scale) / 2 - minZ * scale;

    const toMap = (x, z) => ({ x: x * scale + offX, y: z * scale + offZ });

    // Draw track line
    ctx.beginPath();
    pts.forEach((p, i) => {
      const m = toMap(p.x, p.z);
      if (i === 0) ctx.moveTo(m.x, m.y);
      else ctx.lineTo(m.x, m.y);
    });
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw AI cars
    aiCars.forEach(car => {
      const m = toMap(car.position.x, car.position.z);
      ctx.beginPath();
      ctx.arc(m.x, m.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ff5555';
      ctx.fill();
    });

    // Draw player
    if (playerCar) {
      const m = toMap(playerCar.position.x, playerCar.position.z);
      ctx.beginPath();
      ctx.arc(m.x, m.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#00e5ff';
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Direction arrow
      const hdx = Math.sin(playerCar.heading) * 8;
      const hdz = Math.cos(playerCar.heading) * 8;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x + hdx, m.y + hdz);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();

    // Border glow
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,229,255,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ── Race Positions Sidebar ──────────────────────────────────────

  function updatePositions(cars, playerCar) {
    const el = document.getElementById('hud-race-positions');
    if (!el) return;

    // Sort by total race progress (lap + progress)
    const sorted = [...cars].sort((a, b) => b.lapProgress - a.lapProgress);
    sorted.forEach((car, i) => car.racePosition = i + 1);

    el.innerHTML = '';
    sorted.slice(0, 8).forEach((car, i) => {
      const div = document.createElement('div');
      div.className = 'race-pos-item' + (car === playerCar ? ' player-row' : '');
      const posStr = ['1st','2nd','3rd','4th','5th','6th','7th','8th'][i];
      const name = car.driverName || (car.isPlayer ? 'YOU' : 'AI');
      div.innerHTML = `<span class="pos-num">${posStr}</span><span class="pos-name">${name}</span>`;
      el.appendChild(div);
    });
  }

  // ── FPS ──────────────────────────────────────────────────────────

  function updateFPS() {
    const now = performance.now();
    fpsBuffer.push(now);
    while (fpsBuffer[0] < now - 1000) fpsBuffer.shift();
    const fps = fpsBuffer.length;
    const el = document.getElementById('hud-fps');
    if (el) el.textContent = fps + ' FPS';
    return fps;
  }

  // ── Main Update ───────────────────────────────────────────────────

  function update(state) {
    if (!initialized) return;
    const { playerCar, aiCars, track, raceTime, currentLap, totalLaps } = state;
    if (!playerCar) return;

    // Speed display
    const kmh = Math.round(playerCar.speedKmh);
    document.getElementById('hud-speed-val').textContent = kmh;
    drawSpeedometer(kmh, playerCar.maxSpeed * 60);

    // RPM
    drawRPM(playerCar.rpm);

    // Gear
    document.getElementById('hud-gear').textContent = playerCar.gear;

    // Nitro bar
    document.getElementById('hud-nitro-fill').style.width = (playerCar.nitro * 100) + '%';

    // Health bar
    const healthFill = document.getElementById('hud-health-fill');
    const hp = playerCar.health * 100;
    healthFill.style.width = hp + '%';
    healthFill.style.background = hp > 60 ? '' : hp > 30 ? 'linear-gradient(90deg,#ff9800,#ffb74d)' : 'linear-gradient(90deg,#ff1744,#ff6659)';

    // Position
    const posEl = document.getElementById('hud-position');
    const posStr = ['1st','2nd','3rd','4th','5th','6th','7th','8th','9th'];
    const pos = posStr[playerCar.racePosition - 1] || (playerCar.racePosition + 'th');
    posEl.innerHTML = pos.slice(0,-2) + '<sup>' + pos.slice(-2) + '</sup>';

    // Lap info
    document.getElementById('hud-lap').textContent = `LAP ${Math.min(currentLap, totalLaps)}/${totalLaps}`;
    const t = raceTime / 1000;
    const min = Math.floor(t / 60).toString().padStart(2,'0');
    const sec = Math.floor(t % 60).toString().padStart(2,'0');
    const ms  = Math.floor((t % 1) * 1000).toString().padStart(3,'0');
    document.getElementById('hud-time').textContent = `${min}:${sec}.${ms}`;

    // Coins
    document.getElementById('hud-coins').textContent = '🪙 ' + playerCar.coinsCollected;

    // Powerup
    if (playerCar.activePowerup) {
      const pDef = CONFIG.powerups.find(p => p.id === playerCar.activePowerup);
      const def = CONFIG.powerups.find(p => p.id === playerCar.activePowerup);
      document.getElementById('hud-powerup').style.display = 'flex';
      document.getElementById('powerup-icon').textContent = pDef?.emoji || '⚡';
      const pct = (playerCar.powerupTimer / (def?.duration || 5000)) * 100;
      document.getElementById('powerup-bar').style.width = Math.max(0, pct) + '%';
    } else {
      document.getElementById('hud-powerup').style.display = 'none';
    }

    // Minimap
    drawMinimap(track, playerCar, aiCars);

    // Race positions
    updatePositions([playerCar, ...aiCars], playerCar);

    // FPS
    updateFPS();
  }

  function show(visible) {
    document.getElementById('hud').classList.toggle('hidden', !visible);
  }

  return { init, update, show, drawSpeedometer, drawRPM, drawMinimap };
})();
