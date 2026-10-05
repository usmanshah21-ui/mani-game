/**
 * VELOCITY RUSH – Weather System
 * Controls environment: sky color, fog, lighting mood, physics grip modifiers.
 */

class WeatherSystem {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.current = 'sunny';
    this.transition = 0;

    // Ambient light
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(this.ambientLight);

    // Directional (sun)
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sunLight.position.set(50, 100, 50);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = CONFIG.render.shadowMapSize;
    this.sunLight.shadow.mapSize.height = CONFIG.render.shadowMapSize;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 300;
    this.sunLight.shadow.camera.left = -100;
    this.sunLight.shadow.camera.right = 100;
    this.sunLight.shadow.camera.top = 100;
    this.sunLight.shadow.camera.bottom = -100;
    scene.add(this.sunLight);

    // Hemisphere light
    this.hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x334411, 0.4);
    scene.add(this.hemiLight);

    // Stars (for night)
    this.stars = null;

    this.apply('sunny');
  }

  apply(weatherId, particles = null) {
    this.current = weatherId;
    const w = CONFIG.weather[weatherId] || CONFIG.weather.sunny;

    // Sky / background
    this.scene.background = new THREE.Color(w.skyColor);

    // Fog
    if (w.fog) {
      this.scene.fog = new THREE.FogExp2(w.skyColor, w.fogDensity);
    } else {
      this.scene.fog = null;
    }

    // Lighting
    switch (weatherId) {
      case 'sunny':
        this.ambientLight.color.set(0xfff8f0);
        this.ambientLight.intensity = 0.6;
        this.sunLight.color.set(0xfff5e0);
        this.sunLight.intensity = 1.4;
        this.sunLight.position.set(80, 120, 80);
        this.hemiLight.color.set(0x87CEEB);
        this.hemiLight.groundColor.set(0x556B2F);
        this.hemiLight.intensity = 0.5;
        this.removeStars();
        break;

      case 'rain':
        this.ambientLight.color.set(0x8090a0);
        this.ambientLight.intensity = 0.4;
        this.sunLight.color.set(0x6080a0);
        this.sunLight.intensity = 0.5;
        this.sunLight.position.set(50, 100, 50);
        this.hemiLight.color.set(0x607D8B);
        this.hemiLight.groundColor.set(0x333333);
        this.hemiLight.intensity = 0.3;
        this.removeStars();
        if (particles) particles.createRain(2000);
        break;

      case 'fog':
        this.ambientLight.color.set(0xb0c0d0);
        this.ambientLight.intensity = 0.7;
        this.sunLight.color.set(0xc0d0e0);
        this.sunLight.intensity = 0.4;
        this.hemiLight.intensity = 0.3;
        this.removeStars();
        break;

      case 'night':
        this.ambientLight.color.set(0x101030);
        this.ambientLight.intensity = 0.15;
        this.sunLight.color.set(0x203060);
        this.sunLight.intensity = 0.1;
        this.hemiLight.color.set(0x000814);
        this.hemiLight.groundColor.set(0x111122);
        this.hemiLight.intensity = 0.1;
        this.createStars();
        break;

      case 'snow':
        this.ambientLight.color.set(0xd0e8f8);
        this.ambientLight.intensity = 0.8;
        this.sunLight.color.set(0xe8f4ff);
        this.sunLight.intensity = 0.9;
        this.sunLight.position.set(40, 80, 60);
        this.hemiLight.color.set(0xcfe8ff);
        this.hemiLight.groundColor.set(0xddeeff);
        this.hemiLight.intensity = 0.6;
        this.removeStars();
        if (particles) particles.createSnow(1000);
        break;

      default:
        break;
    }

    // Tone mapping
    if (weatherId === 'night') {
      this.renderer.toneMappingExposure = 0.6;
    } else if (weatherId === 'sunny') {
      this.renderer.toneMappingExposure = 1.2;
    } else {
      this.renderer.toneMappingExposure = 0.9;
    }
  }

  createStars() {
    if (this.stars) return;
    const count = 2000;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 400;
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.abs(Math.sin(phi));
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, transparent: true, opacity: 0.8 });
    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  removeStars() {
    if (this.stars) {
      this.scene.remove(this.stars);
      this.stars.geometry.dispose();
      this.stars.material.dispose();
      this.stars = null;
    }
  }

  getGripMultiplier() {
    const w = CONFIG.weather[this.current];
    return w ? w.grip : 1.0;
  }

  update(time) {
    // Slowly animate sun position
    if (this.current !== 'night') {
      this.sunLight.position.x = Math.sin(time * 0.0001) * 100;
    }
    // Twinkle stars
    if (this.stars) {
      this.stars.material.opacity = 0.7 + Math.sin(time * 0.003) * 0.15;
    }
  }

  dispose() {
    this.removeStars();
  }
}
