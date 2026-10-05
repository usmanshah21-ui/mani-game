/**
 * VELOCITY RUSH – Car Model & Physics
 * Builds a stylized 3D car from Three.js geometry groups.
 * Handles acceleration, braking, steering, drifting, nitro.
 */

class Car {
  constructor(scene, carConfig, color, upgrades = {}) {
    this.scene = scene;
    this.config = carConfig;
    this.upgrades = upgrades;
    this.group = new THREE.Group();

    // Physics state
    this.speed = 0;           // current speed (m/s)
    this.maxSpeed = this._stat('topSpeed') * 0.4;  // scaled to world units
    this.acceleration = this._stat('acceleration') * 0.002;
    this.handling = this._stat('handling') * 0.0004;
    this.grip = this._stat('grip') / 100;
    this.heading = 0;         // radians
    this.steerAngle = 0;
    this.velocity = new THREE.Vector3();
    this.position = new THREE.Vector3();

    // Drift
    this.isDrifting = false;
    this.driftAngle = 0;      // lateral slip angle

    // Nitro
    this.nitro = 1.0;
    this.nitroActive = false;
    this.nitroCapacity = this._stat('nitro') / 100;

    // Health
    this.health = 1.0;

    // Gear system
    this.gear = 1;
    this.gears = 6;
    this.rpm = 0;

    // Lap tracking
    this.lap = 0;
    this.progress = 0;       // track t [0,1]
    this.lapProgress = 0;    // total laps + fraction
    this.lastCheckpointT = 0;
    this.checkpointsHit = new Set();
    this.lapTimes = [];
    this.lapStartTime = 0;
    this.racePosition = 1;

    // Coins picked up
    this.coinsCollected = 0;

    // Active powerup
    this.activePowerup = null;
    this.powerupTimer = 0;

    // Whether engine is player or AI
    this.isPlayer = false;

    // Visual
    this.bodyColor = color || carConfig.color;
    this._buildModel();
    scene.add(this.group);
  }

  _stat(key) {
    const base = this.config.stats[key];
    const upgDef = CONFIG.upgrades.find(u => u.effect === key);
    if (upgDef && this.upgrades[upgDef.id]) {
      return base + upgDef.perLevel * this.upgrades[upgDef.id];
    }
    return base;
  }

  // ── 3D Model ────────────────────────────────────────────────────

  _buildModel() {
    const cfg = this.config;
    const color = this.bodyColor;
    const w = cfg.bodyW || 1.8;
    const h = cfg.bodyH || 0.5;
    const l = cfg.bodyL || 4.0;

    // Body – slightly rounded feel via layered boxes
    const bodyGeo = new THREE.BoxGeometry(w, h, l);
    const bodyMat = new THREE.MeshPhongMaterial({ color, shininess: 80, specular: 0x443322 });
    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.bodyMesh.position.y = 0.4;
    this.bodyMesh.castShadow = true;
    this.group.add(this.bodyMesh);

    // Side skirts
    const skirtGeo = new THREE.BoxGeometry(w + 0.15, h * 0.3, l * 0.75);
    const skirtMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 40 });
    const skirt = new THREE.Mesh(skirtGeo, skirtMat);
    skirt.position.y = 0.4 - h * 0.35;
    this.group.add(skirt);

    // Front bumper
    const fbGeo = new THREE.BoxGeometry(w * 0.95, h * 0.4, 0.25);
    const fbMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 60 });
    const fbump = new THREE.Mesh(fbGeo, fbMat);
    fbump.position.set(0, 0.22, l / 2 + 0.12);
    this.group.add(fbump);

    // Rear bumper
    const rbump = new THREE.Mesh(fbGeo.clone(), fbMat.clone());
    rbump.position.set(0, 0.22, -l / 2 - 0.12);
    this.group.add(rbump);

    // Grille (front)
    const grGeo = new THREE.BoxGeometry(w * 0.55, h * 0.28, 0.08);
    const grMat = new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 100, specular: 0x888888 });
    const grille = new THREE.Mesh(grGeo, grMat);
    grille.position.set(0, 0.28, l / 2 + 0.28);
    this.group.add(grille);

    // Hood scoop (sports/super/hyper/muscle only)
    if (['Sports','Supercar','Hypercar','Muscle Car'].includes(cfg.class)) {
      const scoopGeo = new THREE.BoxGeometry(w * 0.3, h * 0.15, l * 0.25);
      const scoopMat = new THREE.MeshPhongMaterial({ color: 0x0a0a0a, shininess: 80 });
      const scoop = new THREE.Mesh(scoopGeo, scoopMat);
      scoop.position.set(0, 0.4 + h / 2 + h * 0.08, l * 0.15);
      this.group.add(scoop);
    }

    // Roof / cabin
    const roofW = w * 0.65;
    const roofH = h * 0.9;
    const roofL = l * 0.5;
    const roofGeo = new THREE.BoxGeometry(roofW, roofH, roofL);
    const roofMat = new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0x443322 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    const roofY = 0.4 + h / 2 + roofH / 2;
    roof.position.y = roofY;
    roof.position.z = -l * 0.05;
    roof.castShadow = true;
    this.group.add(roof);

    // Windshield (front glass – angled)
    const windGeo = new THREE.BoxGeometry(roofW * 0.92, roofH * 0.88, 0.07);
    const windMat = new THREE.MeshPhongMaterial({
      color: 0x88bbdd, transparent: true, opacity: 0.45,
      shininess: 200, specular: 0xffffff,
    });
    const windshield = new THREE.Mesh(windGeo, windMat);
    windshield.position.set(0, roofY, roofL / 2 + 0.04);
    windshield.rotation.x = Math.PI * 0.18;
    this.group.add(windshield);

    // Rear window
    const rwindshield = new THREE.Mesh(windGeo.clone(), windMat.clone());
    rwindshield.position.set(0, roofY, -roofL / 2 - 0.04);
    rwindshield.rotation.x = -Math.PI * 0.14;
    this.group.add(rwindshield);

    // Door pillars (A-pillar)
    const pillarGeo = new THREE.BoxGeometry(0.07, roofH, 0.07);
    const pillarMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
    [-roofW / 2 + 0.05, roofW / 2 - 0.05].forEach(px => {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(px, roofY, roofL / 2 + 0.02);
      this.group.add(pillar);
    });

    // Spoiler with wing supports
    if (['Sports','Supercar','Hypercar','Electric'].includes(cfg.class)) {
      const spoilerGeo = new THREE.BoxGeometry(w * 0.88, 0.06, 0.5);
      const spoilerMat = new THREE.MeshPhongMaterial({ color: 0x0d0d0d, shininess: 120 });
      const spoilerY = 0.4 + h + 0.25;
      const spoiler = new THREE.Mesh(spoilerGeo, spoilerMat);
      spoiler.position.set(0, spoilerY, -l / 2 + 0.15);
      this.group.add(spoiler);
      // Wing end plates
      const epGeo = new THREE.BoxGeometry(0.06, 0.2, 0.5);
      [-w * 0.44, w * 0.44].forEach(ex => {
        const ep = new THREE.Mesh(epGeo, spoilerMat.clone());
        ep.position.set(ex, spoilerY, -l / 2 + 0.15);
        this.group.add(ep);
      });
    }

    // Wheels (4)
    const wheelPositions = [
      [-w / 2 - 0.12,  0, l / 2 - 0.8],
      [ w / 2 + 0.12,  0, l / 2 - 0.8],
      [-w / 2 - 0.12,  0, -l / 2 + 0.8],
      [ w / 2 + 0.12,  0, -l / 2 + 0.8],
    ];
    this.wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.30, 14);
    const wheelMat = new THREE.MeshPhongMaterial({ color: 0x181818, shininess: 20 });
    // Rim with spokes look
    const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.32, 8);
    const rimMat = new THREE.MeshPhongMaterial({ color: 0xbbbbbb, shininess: 200, specular: 0xffffff });
    const hubGeo = new THREE.CylinderGeometry(0.10, 0.10, 0.34, 6);
    const hubMat = new THREE.MeshPhongMaterial({ color: 0xdddddd, shininess: 200 });

    wheelPositions.forEach(pos => {
      const wheelGroup = new THREE.Group();
      const wheel = new THREE.Mesh(wheelGeo, wheelMat.clone());
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = true;
      const rim = new THREE.Mesh(rimGeo, rimMat.clone());
      rim.rotation.z = Math.PI / 2;
      const hub = new THREE.Mesh(hubGeo, hubMat.clone());
      hub.rotation.z = Math.PI / 2;
      wheelGroup.add(wheel);
      wheelGroup.add(rim);
      wheelGroup.add(hub);
      wheelGroup.position.set(...pos);
      this.group.add(wheelGroup);
      this.wheels.push(wheelGroup);
    });

    // Headlights (layered: housing + lens glow)
    const hlHousingMat = new THREE.MeshPhongMaterial({ color: 0x333333, shininess: 60 });
    const hlLensMat = new THREE.MeshPhongMaterial({ color: 0xffffee, emissive: 0xffffcc, emissiveIntensity: 0.6, shininess: 200, specular: 0xffffff });
    const hlGeo = new THREE.BoxGeometry(0.45, 0.22, 0.12);
    const hlLensGeo = new THREE.BoxGeometry(0.38, 0.16, 0.08);
    this.headlightLenses = [];
    [-1, 1].forEach(s => {
      const housing = new THREE.Mesh(hlGeo, hlHousingMat.clone());
      housing.position.set(s * (w / 2 - 0.28), 0.38, l / 2 + 0.01);
      this.group.add(housing);
      const lens = new THREE.Mesh(hlLensGeo, hlLensMat.clone());
      lens.position.set(s * (w / 2 - 0.28), 0.38, l / 2 + 0.06);
      this.group.add(lens);
      this.headlightLenses.push(lens);
    });
    this.headlightOn = false;

    // Headlight spotlights
    this.headlights = [-1, 1].map(s => {
      const light = new THREE.SpotLight(0xfff8e0, 0, 80, Math.PI * 0.18, 0.4);
      light.position.set(s * (w / 2 - 0.28), 0.5, l / 2 + 0.5);
      light.target.position.set(s * 4, -1, 40);
      light.castShadow = false; // perf
      this.group.add(light);
      this.group.add(light.target);
      return light;
    });

    // Tail lights (red housing + bright lens)
    const tlHousingMat = new THREE.MeshPhongMaterial({ color: 0x330000, shininess: 60 });
    const tlGeo = new THREE.BoxGeometry(0.55, 0.20, 0.10);
    const tlLensGeo = new THREE.BoxGeometry(0.45, 0.14, 0.07);
    this.tailLightLenses = [];
    [-1, 1].forEach(s => {
      const thousing = new THREE.Mesh(tlGeo, tlHousingMat.clone());
      thousing.position.set(s * (w / 2 - 0.32), 0.40, -l / 2 - 0.01);
      this.group.add(thousing);
    });

    // Brake light lenses
    const blLensMat = new THREE.MeshPhongMaterial({
      color: 0xff1100, emissive: 0xcc0000, emissiveIntensity: 0.2,
      transparent: true, opacity: 0.85, shininess: 150,
    });
    this.brakeLights = [];
    [-1, 1].forEach(s => {
      const bl = new THREE.Mesh(tlLensGeo, blLensMat.clone());
      bl.position.set(s * (w / 2 - 0.32), 0.40, -l / 2 - 0.05);
      this.group.add(bl);
      this.brakeLights.push(bl);
    });

    // Neon underglow (based on saved customization)
    const neonColor = this.neonColor || 0x00e5ff;
    const neonGeo = new THREE.BoxGeometry(w * 0.9, 0.04, l * 0.85);
    const neonMat = new THREE.MeshBasicMaterial({
      color: neonColor, transparent: true, opacity: 0.7,
    });
    this.neonMesh = new THREE.Mesh(neonGeo, neonMat);
    this.neonMesh.position.y = 0.05;
    this.group.add(this.neonMesh);
    // Point light for underglow
    this.neonLight = new THREE.PointLight(neonColor, 0, 5);
    this.neonLight.position.y = 0.1;
    this.group.add(this.neonLight);

    // Exhaust tips
    const exGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.3, 8);
    const exMat = new THREE.MeshPhongMaterial({ color: 0x888888, shininess: 200, specular: 0xffffff });
    this.exhaustPoints = [-1, 1].map(s => {
      const ex = new THREE.Mesh(exGeo, exMat.clone());
      ex.rotation.x = Math.PI / 2;
      ex.position.set(s * 0.45, 0.18, -l / 2 - 0.15);
      this.group.add(ex);
      const pt = new THREE.Object3D();
      pt.position.set(s * 0.45, 0.18, -l / 2 - 0.25);
      this.group.add(pt);
      return pt;
    });
  }

  // ── Setters for customization ────────────────────────────────────

  setBodyColor(hex) {
    this.bodyColor = hex;
    if (this.bodyMesh) {
      this.bodyMesh.material.color.set(hex);
      // Also update roof
      const roof = this.group.children.find(c => c !== this.bodyMesh && c.geometry?.type === 'BoxGeometry');
      if (roof && roof.material) roof.material.color.set(hex);
    }
  }

  setHeadlights(on) {
    this.headlightOn = on;
    this.headlights.forEach(l => { l.intensity = on ? 3 : 0; });
  }

  // ── Physics Update ───────────────────────────────────────────────

  update(input, dt, weatherGrip = 1.0, particles = null) {
    const phys = CONFIG.physics;
    const maxSp = this.maxSpeed * (this.nitroActive ? CONFIG.physics.nitroMultiplier : 1.0);
    const weatherMultiplier = weatherGrip;

    // Steering
    const steerInput = input ? (input.getAnalogSteer ? input.getAnalogSteer() : (inputState.left ? 1 : inputState.right ? -1 : 0)) : 0;
    const targetSteer = steerInput * CONFIG.physics.maxSteerAngle * (1 - this.speed / maxSp * 0.4);
    this.steerAngle += (targetSteer - this.steerAngle) * CONFIG.physics.steerReturnSpeed;

    // Drift
    // ⚠ Must read from input.state (InputManager.state), not directly from InputManager
    const inputState = input?.state || input || {};
    const driftInput = inputState.drift || false;
    if (driftInput && Math.abs(steerInput) > 0.3 && this.speed > this.maxSpeed * 0.3) {
      this.isDrifting = true;
      this.driftAngle += steerInput * 0.04;
      this.driftAngle *= 0.95;
    } else {
      this.isDrifting = false;
      this.driftAngle *= 0.85;
    }

    // Throttle / Brake
    const throttle = input?.getThrottle ? input.getThrottle() : (input?.accel ? 1 : input?.brake ? -0.5 : 0);

    // Nitro
    if (inputState.nitro && this.nitro > 0) {
      this.nitroActive = true;
      this.nitro = Math.max(0, this.nitro - CONFIG.physics.nitroDrainRate * dt);
      if (particles) {
        const exhaustWorld = new THREE.Vector3();
        this.exhaustPoints[0].getWorldPosition(exhaustWorld);
        const dir = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
        particles.createNitroFire(exhaustWorld, dir);
      }
    } else {
      this.nitroActive = false;
      this.nitro = Math.min(this.nitroCapacity, this.nitro + CONFIG.physics.nitroRechargeRate * dt);
    }

    // Speed
    if (throttle > 0) {
      this.speed += this.acceleration * throttle * dt * weatherMultiplier;
    } else if (throttle < 0) {
      this.speed += this.acceleration * throttle * 2 * dt; // braking is faster
    } else {
      // Coast
      this.speed *= 1 - CONFIG.physics.groundFriction * dt;
    }

    // Air drag
    this.speed -= this.speed * this.speed * CONFIG.physics.airDrag * dt;

    // Clamp speed
    this.speed = Math.max(-maxSp * 0.3, Math.min(maxSp, this.speed));

    // Heading update
    if (Math.abs(this.speed) > 0.01) {
      const turnRate = (this.steerAngle + this.driftAngle) * Math.sign(this.speed) * (this.speed / maxSp);
      this.heading += turnRate * dt * (1 - phys.groundFriction);
    }

    // Position update
    this.velocity.set(
      Math.sin(this.heading) * this.speed,
      0,
      Math.cos(this.heading) * this.speed,
    );
    this.group.position.x += this.velocity.x * dt * 0.016;
    this.group.position.z += this.velocity.z * dt * 0.016;
    this.group.rotation.y = this.heading;

    // Suspension roll effect
    const roll = this.steerAngle * this.speed * 0.015;
    this.group.rotation.z = -roll;
    const pitch = -this.speed * 0.005 * Math.sign(throttle);
    this.group.rotation.x = pitch;

    // Wheel spin (normalized by 60fps target)
    const spinRate = this.speed * 0.05;
    this.wheels.forEach((w, i) => {
      w.rotation.x += spinRate;
      // Front wheels steer
      if (i < 2) w.rotation.y = this.steerAngle * 8;
    });

    // Gear calculation
    const speedPct = Math.abs(this.speed) / maxSp;
    this.gear = Math.max(1, Math.min(this.gears, Math.ceil(speedPct * this.gears)));
    this.rpm = ((speedPct * this.gears - (this.gear - 1)) / 1.0) * 100;

    // Brake lights glow
    const braking = throttle < 0 || (this.speed > 0.5 && throttle === 0 && this.speed > this.maxSpeed * 0.3);
    this.brakeLights.forEach(bl => {
      bl.material.emissiveIntensity = braking ? 1.0 : 0.15;
      bl.material.opacity = braking ? 1.0 : 0.7;
    });

    // Neon underglow – pulse on nitro
    if (this.neonLight) {
      this.neonLight.intensity = this.nitroActive ? 2.5 : 0.5;
      this.neonMesh.material.opacity = this.nitroActive ? 1.0 : 0.5;
    }

    // Tire smoke when drifting
    if (this.isDrifting && Math.abs(this.speed) > 0.5 && particles) {
      this.wheels.forEach((w, i) => {
        const wPos = new THREE.Vector3();
        w.getWorldPosition(wPos);
        if (i >= 2) {
          particles.createSmoke(wPos, 0xbbbbbb, 1);
          particles.addSkidmark(wPos);
        }
      });
      AudioEngine.playTireScreech();
    }

    // Speed-dependent smoke puff from exhaust
    if (Math.abs(this.speed) > this.maxSpeed * 0.8 && particles && Math.random() < 0.1) {
      const exhaustW = new THREE.Vector3();
      this.exhaustPoints[0].getWorldPosition(exhaustW);
      particles.createSmoke(exhaustW, 0x888888, 1);
    }

    // Update audio engine
    AudioEngine.updateEngine(this.rpm, Math.abs(this.speed));

    // Powerup timer
    if (this.activePowerup) {
      this.powerupTimer -= dt * 16;
      if (this.powerupTimer <= 0) this.clearPowerup();
    }

    this.position.copy(this.group.position);
  }

  activatePowerup(type) {
    const def = CONFIG.powerups.find(p => p.id === type);
    if (!def) return;
    AudioEngine.playPowerupPickup();

    switch (type) {
      case 'nitro_boost':
        this.nitro = 1.0;
        this.activePowerup = type;
        this.powerupTimer = def.duration;
        break;
      case 'repair':
      case 'instant_fix':
        this.health = Math.min(1.0, this.health + 0.5);
        break;
      case 'shield':
        this.activePowerup = type;
        this.powerupTimer = def.duration;
        break;
      case 'double_coins':
        this.activePowerup = type;
        this.powerupTimer = def.duration;
        break;
      case 'slow_mo':
        this.activePowerup = type;
        this.powerupTimer = def.duration;
        break;
      case 'turbo':
        this.activePowerup = type;
        this.powerupTimer = def.duration;
        this.maxSpeed *= 1.3;
        break;
      case 'coin_magnet':
        this.activePowerup = type;
        this.powerupTimer = def.duration;
        break;
      default:
        break;
    }
  }

  clearPowerup() {
    if (this.activePowerup === 'turbo') {
      this.maxSpeed = this._stat('topSpeed') * 0.4;
    }
    this.activePowerup = null;
    this.powerupTimer = 0;
  }

  takeDamage(amount) {
    if (this.activePowerup === 'shield') return;
    this.health = Math.max(0, this.health - amount);
  }

  teleportTo(pos, angle) {
    this.group.position.copy(pos);
    this.group.position.y = 0;
    this.heading = angle;
    this.group.rotation.y = angle;
    this.speed = 0;
    this.velocity.set(0, 0, 0);
    this.steerAngle = 0;
    this.driftAngle = 0;
    this.position.copy(this.group.position);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
  }

  // Convenience getters
  get speedKmh() { return Math.abs(this.speed) * 60; }
  get worldPosition() { return this.group.position; }
}
