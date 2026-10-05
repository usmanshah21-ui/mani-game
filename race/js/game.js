/**
 * VELOCITY RUSH – Race Session Manager
 * Orchestrates: track, cars, AI, physics, camera, HUD, timing, lap logic.
 */

class RaceSession {
  constructor(options = {}) {
    this.options = {
      trackId: options.trackId || 'city',
      totalLaps: options.totalLaps || 3,
      opponentCount: options.opponentCount || 4,
      difficulty: options.difficulty || 'medium',
      weather: options.weather || 'sunny',
      mode: options.mode || 'race',  // race | timetrial | endless
    };

    this.state = 'countdown'; // countdown | racing | paused | finished
    this.raceTime = 0;
    this.currentLap = 1;
    this.totalLaps = this.options.totalLaps;
    this.isFinished = false;
    this.lastUpdateTime = null;

    // Three.js
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.cameraTarget = new THREE.Vector3();
    this.cameraCurrent = new THREE.Vector3();

    // Game objects
    this.track = null;
    this.playerCar = null;
    this.aiCars = [];
    this.aiControllers = [];
    this.particles = null;
    this.weather = null;

    this.animFrameId = null;
  }

  // ── Initialize ─────────────────────────────────────────────────

  init(renderer, canvas) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      CONFIG.render.fov,
      canvas.width / canvas.height,
      CONFIG.render.nearPlane,
      CONFIG.render.farPlane,
    );
    this.camera.position.set(0, 8, -15);

    // Track
    const trackConfig = CONFIG.tracks.find(t => t.id === this.options.trackId) || CONFIG.tracks[0];
    this.track = new Track(this.scene, trackConfig);

    // Weather
    this.weather = new WeatherSystem(this.scene, renderer);
    this.particles = new ParticleSystem(this.scene);
    this.weather.apply(this.options.weather, this.particles);

    // Night mode headlights
    this.nightMode = this.options.weather === 'night';

    // Player car
    const save = SaveSystem.get();
    const carCfg = CONFIG.cars.find(c => c.id === save.selectedCar) || CONFIG.cars[0];
    const customization = SaveSystem.getCustomization(save.selectedCar);
    const carUpgrades = save.upgrades[save.selectedCar] || {};
    const bodyColor = customization.bodyColor || carCfg.color;

    this.playerCar = new Car(this.scene, carCfg, bodyColor, carUpgrades);
    this.playerCar.isPlayer = true;
    this.playerCar.driverName = 'YOU';
    this.playerCar.lapStartTime = 0;
    this.playerCar.lastProgress = 0;
    this.playerCar.lapCount = 0;
    this.playerCar.lapProgress = 0;
    this.playerCar.checkpointsHit = new Set();

    if (this.nightMode) this.playerCar.setHeadlights(true);

    // AI cars
    const aiColors = [0xff4444, 0x44ff44, 0xffff44, 0xff44ff, 0x44ffff, 0xff8844, 0x8844ff];
    const aiNames = CONFIG.aiNames;
    for (let i = 0; i < this.options.opponentCount; i++) {
      const aiCarConfig = CONFIG.cars[Math.floor(Math.random() * Math.min(10, CONFIG.cars.length))];
      const aiCar = new Car(this.scene, aiCarConfig, aiColors[i % aiColors.length]);
      aiCar.driverName = aiNames[i % aiNames.length];
      aiCar.lapCount = 0;
      aiCar.lapProgress = 0;
      aiCar.checkpointsHit = new Set();
      aiCar.lastProgress = 0;
      if (this.nightMode) aiCar.setHeadlights(true);

      const ai = new AIController(aiCar, this.track, this.options.difficulty);
      this.aiCars.push(aiCar);
      this.aiControllers.push(ai);
    }

    // Position cars on start grid
    const allCars = [this.playerCar, ...this.aiCars];
    allCars.forEach((car, i) => {
      const sp = this.track.startPositions[i] || this.track.startPositions[0];
      car.teleportTo(sp.position, sp.rotation);
    });

    // HUD
    HUD.init();
    HUD.show(true);

    // Mobile controls
    if (InputManager.detectMobile()) {
      InputManager.showMobileControls(true);
    }

    // Start countdown
    this._startCountdown();

    return this;
  }

  // ── Countdown ──────────────────────────────────────────────────

  _startCountdown() {
    const overlay = document.getElementById('countdown-overlay');
    const num = document.getElementById('countdown-number');
    overlay.classList.remove('hidden');
    let count = 3;
    num.textContent = count;
    AudioEngine.playCountdownBeep(false);

    const tick = setInterval(() => {
      count--;
      if (count > 0) {
        num.textContent = count;
        // Force animation restart
        num.style.animation = 'none';
        void num.offsetWidth;
        num.style.animation = '';
        AudioEngine.playCountdownBeep(false);
      } else {
        num.textContent = 'GO!';
        num.style.color = '#00e676';
        num.style.animation = 'none';
        void num.offsetWidth;
        num.style.animation = '';
        AudioEngine.playCountdownBeep(true);
        clearInterval(tick);
        setTimeout(() => {
          overlay.classList.add('hidden');
          this.state = 'racing';
          this.lastUpdateTime = performance.now();
          this.playerCar.lapStartTime = performance.now();
          AudioEngine.resume();
          AudioEngine.startEngine();
          AudioEngine.playMusic('race');
        }, 900);
      }
    }, 1000);
  }

  // ── Game Loop ──────────────────────────────────────────────────

  start() {
    this._prevHealth = 1.0;
    this._cameraShake = 0;
    const loop = (now) => {
      this.animFrameId = requestAnimationFrame(loop);

      if (this.state === 'racing') {
        // Normalize dt: 1.0 = 60fps frame. Clamp to avoid spiral-of-death.
        const rawMs = now - (this.lastUpdateTime || now);
        const dt = Math.min(2.5, rawMs / 16.667);
        this.lastUpdateTime = now;
        this._update(dt, now);
      } else if (this.state === 'paused') {
        this.lastUpdateTime = now;
      }

      this._render(now);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  _update(dt, now) {
    // Race time (in ms, normalized)
    this.raceTime += dt * 16.667;

    // Gamepad poll
    InputManager.pollGamepad();

    const gripMul = this.weather.getGripMultiplier();

    // Player update
    this.playerCar.update(InputManager, dt, gripMul, this.particles);
    PhysicsEngine.keepOnGround(this.playerCar);

    // Lap logic for player
    this._updateLapProgress(this.playerCar);

    // AI update
    const allCars = [this.playerCar, ...this.aiCars];
    this.aiControllers.forEach((ai, i) => {
      ai.update(dt, allCars);
      PhysicsEngine.keepOnGround(this.aiCars[i]);
      PhysicsEngine.resolveBarrierCollisions(this.aiCars[i], this.track, null);
      this._updateLapProgress(this.aiCars[i]);
    });

    // Car-car collisions
    PhysicsEngine.resolveCarCollisions(allCars, this.particles);

    // Player barrier collision – run twice per frame for robustness
    PhysicsEngine.resolveBarrierCollisions(this.playerCar, this.track, this.particles);
    PhysicsEngine.resolveBarrierCollisions(this.playerCar, this.track, null);

    // Emergency off-track fallback
    PhysicsEngine.checkOffTrack(this.playerCar, this.track);

    // Coin collection
    this._collectCoins();

    // Powerup collection
    this._collectPowerups();

    // Particles
    this.particles.update(dt, this.playerCar.position);

    // Weather
    this.weather.update(now);

    // Track animation
    this.track.update(now);

    // HUD
    HUD.update({
      playerCar: this.playerCar,
      aiCars: this.aiCars,
      track: this.track,
      raceTime: this.raceTime,
      currentLap: this.playerCar.lapCount + 1,
      totalLaps: this.totalLaps,
    });

    // ── Visual Effects ───────────────────────────────────────────
    const speedPct = Math.abs(this.playerCar.speed) / this.playerCar.maxSpeed;
    const vignette = document.getElementById('speed-vignette');
    if (vignette) {
      if (this.playerCar.nitroActive) {
        vignette.className = 'nitro';
      } else if (speedPct > 0.7) {
        vignette.className = 'active';
        vignette.style.opacity = (speedPct - 0.7) * 2.5;
      } else {
        vignette.className = '';
        vignette.style.opacity = 0;
      }
    }

    // Damage flash on health drop
    const curHealth = this.playerCar.health;
    if (curHealth < (this._prevHealth || 1) - 0.02) {
      const dmgFlash = document.getElementById('damage-flash');
      if (dmgFlash) {
        dmgFlash.classList.remove('show');
        void dmgFlash.offsetWidth; // reflow
        dmgFlash.classList.add('show');
        this._cameraShake = 0.8;
      }
    }
    this._prevHealth = curHealth;

    // Camera shake decay
    if (this._cameraShake > 0) this._cameraShake *= 0.85;

    // Nitro HUD bars
    const nitroFill = document.getElementById('hud-nitro-fill');
    if (nitroFill) nitroFill.classList.toggle('active', this.playerCar.nitroActive);

    // Health bar critical state
    const healthFill = document.getElementById('hud-health-fill');
    if (healthFill) healthFill.classList.toggle('critical', this.playerCar.health < 0.25);

    // Nitro flash on activation start
    if (this.playerCar.nitroActive && !this._nitroFlash) {
      this._nitroFlash = true;
      const flash = document.createElement('div');
      flash.className = 'nitro-flash';
      document.body.appendChild(flash);
      setTimeout(() => { flash.remove(); this._nitroFlash = false; }, 500);
    }
    if (!this.playerCar.nitroActive) this._nitroFlash = false;

    // Check if player finished
    if (!this.isFinished && this.playerCar.lapCount >= this.totalLaps) {
      this._onRaceFinish();
    }
  }

  _updateLapProgress(car) {
    const t = this.track.getProgress(car.position);

    // Detect lap completion (crossing t=0 boundary going forward)
    const prev = car.lastProgress || 0;
    if (prev > 0.85 && t < 0.1) {
      // Possible lap completion – check all checkpoints were hit
      if (car.checkpointsHit.size >= Math.floor(this.track.checkpoints.length * 0.7)) {
        car.lapCount++;
        car.checkpointsHit.clear();

        if (car.isPlayer) {
          const lapTime = performance.now() - car.lapStartTime;
          car.lapTimes = car.lapTimes || [];
          car.lapTimes.push(lapTime);
          car.lapStartTime = performance.now();
          AudioEngine.playLapComplete();

          // Save best lap
          const isNew = SaveSystem.updateBestLap(this.options.trackId, lapTime);
          if (isNew) {
            // Brief visual notification could be added here
          }
        }
      }
    }

    // Check checkpoints
    this.track.checkpoints.forEach((cp, i) => {
      if (car.checkpointsHit.has(i)) return;
      const dx = car.position.x - cp.position.x;
      const dz = car.position.z - cp.position.z;
      if (Math.sqrt(dx * dx + dz * dz) < this.track.trackWidth) {
        car.checkpointsHit.add(i);
      }
    });

    car.lastProgress = t;
    car.progress = t;
    car.lapProgress = car.lapCount + t; // total progress for ranking
  }

  _collectCoins() {
    const car = this.playerCar;
    const magnetActive = car.activePowerup === 'coin_magnet';
    const magnetRadius = magnetActive ? 20 : CONFIG.gameplay.coinPickupRadius;

    this.track.coins.forEach(coin => {
      if (coin.collected) return;
      const dx = car.position.x - coin.position.x;
      const dz = car.position.z - coin.position.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < magnetRadius) {
        if (magnetActive && d > 3) {
          // Attract coin to car
          const speed = 0.2;
          coin.mesh.position.x += (car.position.x - coin.mesh.position.x) * speed;
          coin.mesh.position.z += (car.position.z - coin.mesh.position.z) * speed;
        }
        if (d < 3) {
          coin.collected = true;
          this.scene.remove(coin.mesh);
          const multiplier = car.activePowerup === 'double_coins' ? 2 : 1;
          const earned = CONFIG.gameplay.coinValue * multiplier;
          car.coinsCollected += earned;
          AudioEngine.playCoinPickup();
        }
      }
    });
  }

  _collectPowerups() {
    const car = this.playerCar;
    this.track.powerups.forEach(pu => {
      if (pu.collected) return;
      const dx = car.position.x - pu.position.x;
      const dz = car.position.z - pu.position.z;
      if (Math.sqrt(dx * dx + dz * dz) < CONFIG.gameplay.powerupPickupRadius) {
        pu.collected = true;
        this.scene.remove(pu.mesh);
        car.activatePowerup(pu.type);
      }
    });
  }

  _onRaceFinish() {
    this.isFinished = true;
    this.state = 'finished';

    // Calculate final position
    const allCars = [this.playerCar, ...this.aiCars];
    const sorted = [...allCars].sort((a, b) => b.lapProgress - a.lapProgress);
    const pos = sorted.indexOf(this.playerCar) + 1;
    this.playerCar.racePosition = pos;

    // Save stats
    const coinsEarned = this.playerCar.coinsCollected;
    const xpEarned = (CONFIG.gameplay.positionXP[pos - 1] || 10) + CONFIG.gameplay.lapXP * this.totalLaps;
    SaveSystem.addCoins(coinsEarned);
    const leveledUp = SaveSystem.addXP(xpEarned);
    SaveSystem.updateStats('racesPlayed', 1);
    if (pos === 1) SaveSystem.updateStats('racesWon', 1);
    SaveSystem.updateStats('bestSpeed', this.playerCar.maxSpeed * 60);

    // Add to leaderboard
    const bestLap = this.playerCar.lapTimes?.length
      ? Math.min(...this.playerCar.lapTimes)
      : this.raceTime;
    SaveSystem.addLeaderboardEntry({
      name: 'Player',
      trackId: this.options.trackId,
      position: pos,
      time: this.raceTime,
      bestLap,
      date: new Date().toISOString(),
    });

    AudioEngine.stopMusic();
    if (pos === 1) AudioEngine.playVictory();

    setTimeout(() => this._showResultScreen(pos, xpEarned, coinsEarned, bestLap), 2000);
  }

  _showResultScreen(pos, xp, coins, bestLap) {
    AudioEngine.stopEngine();

    const posEmoji = ['🏆','🥈','🥉','😐','😐','😐','😐','😐'][pos - 1] || '😐';
    const posLabel = ['1st Place!','2nd Place','3rd Place','4th Place','5th Place',
                      '6th Place','7th Place','8th Place'][pos - 1] || `${pos}th Place`;

    document.getElementById('result-title').textContent = 'RACE COMPLETE';
    document.getElementById('result-position').textContent = posEmoji + ' ' + posLabel;

    const t = this.raceTime / 1000;
    const lapBest = bestLap / 1000;
    document.getElementById('result-stats').innerHTML = `
      <div class="result-stat"><div class="result-stat-label">RACE TIME</div>
        <div class="result-stat-val">${Math.floor(t/60).toString().padStart(2,'0')}:${(t%60).toFixed(3).padStart(6,'0')}</div></div>
      <div class="result-stat"><div class="result-stat-label">BEST LAP</div>
        <div class="result-stat-val">${Math.floor(lapBest/60).toString().padStart(2,'0')}:${(lapBest%60).toFixed(3).padStart(6,'0')}</div></div>
      <div class="result-stat"><div class="result-stat-label">TOP SPEED</div>
        <div class="result-stat-val">${Math.round(this.playerCar.maxSpeed * 60)} km/h</div></div>
      <div class="result-stat"><div class="result-stat-label">POSITION</div>
        <div class="result-stat-val">${posLabel}</div></div>
    `;

    document.getElementById('result-rewards').innerHTML = `
      <div class="reward-item"><div class="reward-val">🪙 +${coins}</div><div>Coins</div></div>
      <div class="reward-item"><div class="reward-val">⭐ +${xp}</div><div>XP</div></div>
    `;

    document.getElementById('race-result').classList.remove('hidden');
  }

  // ── Camera ─────────────────────────────────────────────────────

  _updateCamera(dt) {
    if (!this.playerCar) return;
    const car = this.playerCar;
    const heading = car.heading;
    const speed = Math.abs(car.speed);
    const speedPct = speed / car.maxSpeed;

    // Dynamic chase camera: pull back at speed, raise on drift
    const camDist   = 11 + speedPct * 4 + (car.isDrifting ? 2 : 0);
    const camHeight = 3.5 + speedPct * 1.5;

    const targetX = car.group.position.x - Math.sin(heading) * camDist;
    const targetY = car.group.position.y + camHeight;
    const targetZ = car.group.position.z - Math.cos(heading) * camDist;

    // Camera shake on collision/damage
    const shakeAmt = (this._cameraShake || 0);
    const shakeX = (Math.random() - 0.5) * shakeAmt * 0.6;
    const shakeY = (Math.random() - 0.5) * shakeAmt * 0.3;

    // Smooth chase lerp (faster at high speed for tighter feel)
    const lerpSpeed = 0.08 + speedPct * 0.04;
    this.camera.position.x += (targetX - this.camera.position.x) * lerpSpeed + shakeX;
    this.camera.position.y += (targetY - this.camera.position.y) * lerpSpeed + shakeY;
    this.camera.position.z += (targetZ - this.camera.position.z) * lerpSpeed;

    // Look slightly ahead of car
    const lookAheadDist = 3 + speedPct * 4;
    this.cameraTarget.set(
      car.group.position.x + Math.sin(heading) * lookAheadDist,
      car.group.position.y + 0.8,
      car.group.position.z + Math.cos(heading) * lookAheadDist,
    );
    this.camera.lookAt(this.cameraTarget);

    // FOV zoom: wider at high speed / on nitro
    const targetFOV = CONFIG.render.fov + speedPct * 12 + (car.nitroActive ? 8 : 0);
    this.camera.fov += (targetFOV - this.camera.fov) * 0.05;
    this.camera.updateProjectionMatrix();
  }

  _render(now) {
    if (!this.renderer) return;
    this._updateCamera();
    this.renderer.render(this.scene, this.camera);
  }

  // ── Pause ──────────────────────────────────────────────────────

  togglePause() {
    if (this.state === 'racing') {
      this.state = 'paused';
      document.getElementById('pause-menu').classList.remove('hidden');
      AudioEngine.stopEngine();
    } else if (this.state === 'paused') {
      this.state = 'racing';
      this.lastUpdateTime = performance.now();
      document.getElementById('pause-menu').classList.add('hidden');
      AudioEngine.startEngine();
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────

  dispose() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    AudioEngine.stopEngine();
    AudioEngine.stopMusic();
    HUD.show(false);
    InputManager.showMobileControls(false);

    document.getElementById('countdown-overlay').classList.add('hidden');
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('race-result').classList.add('hidden');

    if (this.track) this.track.dispose();
    if (this.playerCar) this.playerCar.dispose();
    this.aiCars.forEach(c => c.dispose());
    if (this.particles) this.particles.dispose();
    if (this.weather) this.weather.dispose();

    this.track = this.playerCar = null;
    this.aiCars = [];
    this.aiControllers = [];
  }
}
