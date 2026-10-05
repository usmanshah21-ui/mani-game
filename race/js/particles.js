/**
 * VELOCITY RUSH – Particle System
 * Smoke, tire marks, sparks, rain, snow, dust, nitro exhaust.
 */

class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.weatherParticles = null;
    this.skidmarks = [];
    this.maxSkidmarks = 200;
  }

  // ── Smoke / Tire Particles ──────────────────────────────────────
  createSmoke(position, color = 0xcccccc, count = 3, velocity = null) {
    const geo = new THREE.SphereGeometry(0.2, 4, 4);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      mesh.position.x += (Math.random() - 0.5) * 0.5;
      mesh.position.z += (Math.random() - 0.5) * 0.5;
      this.scene.add(mesh);

      const vx = velocity ? velocity.x * 0.2 : (Math.random() - 0.5) * 0.05;
      const vy = 0.04 + Math.random() * 0.04;
      const vz = velocity ? velocity.z * 0.2 : (Math.random() - 0.5) * 0.05;
      const scale = 0.3 + Math.random() * 0.4;
      mesh.scale.setScalar(scale);

      this.particles.push({
        mesh, vx, vy, vz, life: 1.0, decay: 0.025 + Math.random() * 0.02,
        scaleRate: 0.015 + Math.random() * 0.01, type: 'smoke',
      });
    }
  }

  // Nitro fire particles
  createNitroFire(position, direction) {
    const colors = [0xff3d00, 0xff6d00, 0x7c4dff, 0xb388ff];
    for (let i = 0; i < 4; i++) {
      const geo = new THREE.SphereGeometry(0.15, 3, 3);
      const mat = new THREE.MeshBasicMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        transparent: true, opacity: 0.8, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      this.scene.add(mesh);

      const speed = 0.3 + Math.random() * 0.2;
      this.particles.push({
        mesh,
        vx: -direction.x * speed + (Math.random() - 0.5) * 0.1,
        vy: (Math.random() - 0.3) * 0.08,
        vz: -direction.z * speed + (Math.random() - 0.5) * 0.1,
        life: 1.0, decay: 0.08,
        scaleRate: 0.01, type: 'nitro',
      });
    }
  }

  // Spark particles (collision)
  createSparks(position, count = 8) {
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.06, 3, 3);
      const mat = new THREE.MeshBasicMaterial({ color: 0xFFD600, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      this.scene.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const speed = 0.1 + Math.random() * 0.3;
      this.particles.push({
        mesh,
        vx: Math.cos(angle) * speed,
        vy: 0.1 + Math.random() * 0.2,
        vz: Math.sin(angle) * speed,
        life: 1.0, decay: 0.07, gravity: true,
        scaleRate: 0, type: 'spark',
      });
    }
  }

  // Skid mark on ground
  addSkidmark(position, width = 0.3) {
    const geo = new THREE.PlaneGeometry(width, 0.4);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x111111, transparent: true, opacity: 0.7,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(position);
    mesh.position.y = 0.01;
    this.scene.add(mesh);

    this.skidmarks.push({ mesh, life: 1.0, decay: 0.0005 });
    if (this.skidmarks.length > this.maxSkidmarks) {
      const old = this.skidmarks.shift();
      this.scene.remove(old.mesh);
      old.mesh.geometry.dispose();
      old.mesh.material.dispose();
    }
  }

  // ── Weather ──────────────────────────────────────────────────────

  createRain(count = 1500) {
    this.removeWeather();
    const positions = new Float32Array(count * 3);
    const spread = 150;
    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = Math.random() * 60;
      positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xaabbcc, size: 0.12, transparent: true, opacity: 0.6 });
    this.weatherParticles = new THREE.Points(geo, mat);
    this.weatherParticles.userData.type = 'rain';
    this.weatherParticles.userData.count = count;
    this.scene.add(this.weatherParticles);
  }

  createSnow(count = 800) {
    this.removeWeather();
    const positions = new Float32Array(count * 3);
    const spread = 120;
    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = Math.random() * 40;
      positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.3, transparent: true, opacity: 0.8 });
    this.weatherParticles = new THREE.Points(geo, mat);
    this.weatherParticles.userData.type = 'snow';
    this.weatherParticles.userData.count = count;
    this.scene.add(this.weatherParticles);
  }

  removeWeather() {
    if (this.weatherParticles) {
      this.scene.remove(this.weatherParticles);
      this.weatherParticles.geometry.dispose();
      this.weatherParticles.material.dispose();
      this.weatherParticles = null;
    }
  }

  // ── Update ──────────────────────────────────────────────────────

  update(dt, carPosition) {
    // Update smoke/spark particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= p.decay;
      p.mesh.position.x += p.vx;
      p.mesh.position.y += p.vy;
      p.mesh.position.z += p.vz;

      if (p.gravity) p.vy -= 0.015;
      if (p.type === 'smoke') {
        p.mesh.scale.addScalar(p.scaleRate);
        p.mesh.material.opacity = p.life * 0.5;
      } else if (p.type === 'nitro') {
        p.mesh.scale.addScalar(p.scaleRate);
        p.mesh.material.opacity = p.life;
      } else {
        p.mesh.material.opacity = p.life;
      }

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
      }
    }

    // Update skidmarks (fade slowly)
    for (let i = this.skidmarks.length - 1; i >= 0; i--) {
      const s = this.skidmarks[i];
      s.life -= s.decay;
      s.mesh.material.opacity = s.life * 0.7;
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        this.skidmarks.splice(i, 1);
      }
    }

    // Update weather particles to follow car
    if (this.weatherParticles && carPosition) {
      const pos = this.weatherParticles.geometry.attributes.position;
      const count = this.weatherParticles.userData.count;
      const type = this.weatherParticles.userData.type;
      const spreadH = 100;
      const fallSpeed = type === 'rain' ? 0.8 : 0.15;

      for (let i = 0; i < count; i++) {
        pos.array[i * 3 + 1] -= fallSpeed;
        if (pos.array[i * 3 + 1] < 0) {
          pos.array[i * 3]     = carPosition.x + (Math.random() - 0.5) * spreadH;
          pos.array[i * 3 + 1] = carPosition.y + 40 + Math.random() * 20;
          pos.array[i * 3 + 2] = carPosition.z + (Math.random() - 0.5) * spreadH;
        } else {
          // Drift with car
          pos.array[i * 3]     = pos.array[i * 3]     * 0.99 + (carPosition.x + (Math.random() - 0.5) * 5) * 0.01;
          pos.array[i * 3 + 2] = pos.array[i * 3 + 2] * 0.99 + (carPosition.z + (Math.random() - 0.5) * 5) * 0.01;
        }
      }
      pos.needsUpdate = true;
    }
  }

  dispose() {
    this.particles.forEach(p => {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    });
    this.particles = [];
    this.skidmarks.forEach(s => {
      this.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.mesh.material.dispose();
    });
    this.skidmarks = [];
    this.removeWeather();
  }
}
