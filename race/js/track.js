/**
 * VELOCITY RUSH – Track Generator
 * Builds procedural Catmull-Rom spline race tracks with barriers, decorations,
 * coins, power-ups, and environment-specific scenery.
 */

class Track {
  constructor(scene, trackConfig) {
    this.scene = scene;
    this.config = trackConfig;
    this.splinePoints = [];
    this.curve = null;
    this.trackMesh = null;
    this.barrierMeshes = [];
    this.coins = [];
    this.powerups = [];
    this.decorations = [];
    this.startPositions = [];
    this.trackWidth = 14;
    this.checkpoints = [];
    this.totalLength = 0;

    this._generate();
  }

  // ── Spline Generation ────────────────────────────────────────────

  _generate() {
    this._buildSpline();
    this._buildRoadMesh();
    this._buildBarriers();
    this._buildStartLine();
    this._buildCheckpoints();
    this._spawnCoins();
    this._spawnPowerups();
    this._buildEnvironment();
    this._buildStartPositions();
  }

  _buildSpline() {
    const env = this.config.env;
    const pts = this._getTrackLayout(env);
    this.splinePoints = pts.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    this.curve = new THREE.CatmullRomCurve3(this.splinePoints, true);
    this.totalLength = this.curve.getLength();
  }

  _getTrackLayout(env) {
    // Each env gets a unique hand-crafted control point layout
    const layouts = {
      city: [
        [0,0,0],[40,0,-10],[80,0,-5],[100,0,20],[90,0,60],
        [60,0,90],[30,0,100],[0,0,80],[-20,0,50],[-10,0,20],
      ],
      desert: [
        [0,0,0],[60,0,-30],[120,0,-20],[160,0,10],[170,0,60],
        [140,0,110],[100,0,130],[50,0,120],[10,0,100],[-10,0,60],
      ],
      forest: [
        [0,0,0],[30,0,-20],[55,0,-40],[75,0,-20],[80,0,10],
        [65,0,40],[45,0,55],[20,0,50],[0,0,35],[-15,0,15],
      ],
      snow: [
        [0,0,0],[50,2,-20],[100,4,-10],[130,5,20],[125,3,70],
        [100,2,100],[60,1,110],[20,0,95],[-10,0,60],[0,0,25],
      ],
      coastal: [
        [0,0,0],[70,0,-40],[140,0,-30],[180,0,10],[185,0,60],
        [165,0,110],[120,0,140],[60,0,145],[10,0,120],[-20,0,70],
      ],
      night: [
        [0,0,0],[45,0,-15],[85,0,-5],[105,0,25],[95,0,65],
        [65,0,90],[35,0,95],[10,0,80],[-15,0,50],[0,0,20],
      ],
      volcano: [
        [0,0,0],[35,2,-18],[65,4,-15],[82,5,8],[78,3,42],
        [58,2,62],[35,1,68],[12,0,55],[-8,0,30],[0,0,12],
      ],
      industrial: [
        [0,0,0],[55,0,-25],[110,0,-15],[145,0,15],[148,0,60],
        [130,0,100],[90,0,120],[45,0,120],[5,0,105],[-15,0,65],
      ],
      countryside: [
        [0,0,0],[80,0,-50],[165,0,-35],[210,0,15],[215,0,75],
        [185,0,130],[130,0,155],[65,0,158],[10,0,138],[-25,0,90],
      ],
    };
    return layouts[env] || layouts.city;
  }

  // ── Road Mesh ────────────────────────────────────────────────────

  _buildRoadMesh() {
    const segments = 240;
    const pts = this.curve.getSpacedPoints(segments);

    // Build road geometry as a ribbon along the spline
    const vertices = [];
    const indices = [];
    const uvs = [];
    const normals = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const pt = this.curve.getPoint(t);
      const tangent = this.curve.getTangent(t).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      const left  = pt.clone().addScaledVector(normal, -this.trackWidth / 2);
      const right = pt.clone().addScaledVector(normal,  this.trackWidth / 2);

      vertices.push(left.x,  left.y + 0.01, left.z);
      vertices.push(right.x, right.y + 0.01, right.z);
      uvs.push(0, t * 30, 1, t * 30);
      normals.push(0, 1, 0, 0, 1, 0);

      if (i < segments) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    // Road surface color with Phong for wet/reflective sheen
    const envColors = {
      city: 0x282828, desert: 0x7a6540, forest: 0x303030,
      snow: 0x99aabb, coastal: 0x282828, night: 0x141414,
      volcano: 0x302010, industrial: 0x252530, countryside: 0x4a4a38,
    };
    const roadColor = envColors[this.config.env] || 0x2a2a2a;

    const mat = new THREE.MeshPhongMaterial({
      color: roadColor,
      shininess: 40,
      specular: 0x333333,
      side: THREE.DoubleSide,
    });

    this.trackMesh = new THREE.Mesh(geo, mat);
    this.trackMesh.receiveShadow = true;
    this.scene.add(this.trackMesh);

    // ── Lane markings ─────────────────────────────────────────────
    this._buildLaneMarkings(segments);

    // ── Curb / edge strips ────────────────────────────────────────
    this._buildCurbStrips(segments);

    // Ground plane (large colored backdrop)
    const groundGeo = new THREE.PlaneGeometry(800, 800);
    const envGrounds = {
      city: 0x1a2530, desert: 0xb8996a, forest: 0x2a5022,
      snow: 0xcce8ff, coastal: 0x3a7a2a, night: 0x070712,
      volcano: 0x3a1a08, industrial: 0x1e1e28, countryside: 0x3e6e22,
    };
    const groundMat = new THREE.MeshLambertMaterial({ color: envGrounds[this.config.env] || 0x2d5a27 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.06;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.decorations.push(ground);

    this._segments = pts;
  }

  _buildLaneMarkings(segments) {
    const dashLen = 4.0;
    const gapLen  = 6.0;
    const totalPeriod = dashLen + gapLen;
    let accumulated = 0;
    let inDash = true;

    const centerVerts = [];
    const centerIdx   = [];
    const centerUVs   = [];
    let vi = 0;

    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const pt0 = this.curve.getPoint(t0);
      const pt1 = this.curve.getPoint(t1);
      const seg = pt1.clone().sub(pt0);
      const segLen = seg.length();
      const tang = seg.clone().normalize();
      const norm = new THREE.Vector3(-tang.z, 0, tang.x);

      const posInPeriod = accumulated % totalPeriod;
      inDash = posInPeriod < dashLen;
      accumulated += segLen;

      if (!inDash) continue;

      // Center dash strip (width 0.25m)
      const hw = 0.125;
      const y = 0.03;
      const l0 = pt0.clone().addScaledVector(norm, -hw);
      const r0 = pt0.clone().addScaledVector(norm,  hw);
      const l1 = pt1.clone().addScaledVector(norm, -hw);
      const r1 = pt1.clone().addScaledVector(norm,  hw);

      centerVerts.push(l0.x, l0.y + y, l0.z,  r0.x, r0.y + y, r0.z,
                       l1.x, l1.y + y, l1.z,  r1.x, r1.y + y, r1.z);
      centerUVs.push(0,0, 1,0, 0,1, 1,1);
      centerIdx.push(vi, vi+1, vi+2, vi+1, vi+3, vi+2);
      vi += 4;
    }

    if (centerVerts.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(centerVerts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(centerUVs, 2));
      geo.setIndex(centerIdx);
      geo.computeVertexNormals();
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const mesh = new THREE.Mesh(geo, mat);
      this.scene.add(mesh);
      this.decorations.push(mesh);
    }
  }

  _buildCurbStrips(segments) {
    const curbW = 0.5;
    const y = 0.02;
    const envCurbColor = {
      city: [0xff2200, 0xffffff], desert: [0xffaa00, 0xffffff],
      forest: [0x00aa44, 0xffffff], snow:   [0x4499ff, 0xffffff],
      coastal:[0xff8800, 0xffffff], night:  [0xff2277, 0x00ddff],
      volcano:[0xff4400, 0xffaa00], industrial:[0xffcc00, 0x333355],
      countryside:[0xcc4400, 0xddcc88],
    };
    const [c1, c2] = envCurbColor[this.config.env] || [0xff2200, 0xffffff];

    const makeStrip = (side, colorHex) => {
      const verts = [], idxs = [], uvs = [];
      const offset = (this.trackWidth / 2) * side;
      let vi = 0;
      for (let i = 0; i < segments; i++) {
        const t0 = i / segments;
        const t1 = (i + 1) / segments;
        const pt0 = this.curve.getPoint(t0);
        const pt1 = this.curve.getPoint(t1);
        const tang = pt1.clone().sub(pt0).normalize();
        const norm = new THREE.Vector3(-tang.z, 0, tang.x);
        const inner = offset - side * curbW;

        const l0 = pt0.clone().addScaledVector(norm, inner);
        const r0 = pt0.clone().addScaledVector(norm, offset);
        const l1 = pt1.clone().addScaledVector(norm, inner);
        const r1 = pt1.clone().addScaledVector(norm, offset);
        verts.push(l0.x, l0.y + y, l0.z,  r0.x, r0.y + y, r0.z,
                   l1.x, l1.y + y, l1.z,  r1.x, r1.y + y, r1.z);
        uvs.push(0,0, 1,0, 0,1, 1,1);
        // Alternating color every 2 segments for chequered curb feel
        idxs.push(vi, vi+1, vi+2, vi+1, vi+3, vi+2);
        vi += 4;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idxs);
      geo.computeVertexNormals();
      const mat = new THREE.MeshBasicMaterial({ color: colorHex });
      const mesh = new THREE.Mesh(geo, mat);
      this.scene.add(mesh);
      this.decorations.push(mesh);
    };

    makeStrip(-1, c1);
    makeStrip( 1, c2);
  }


  // ── Barriers ─────────────────────────────────────────────────────

  _buildBarriers() {
    const segments = 180;   // more segments = smoother barrier walls
    const barrierH = 1.2;   // taller for better visibility
    const barrierW = 0.45;
    const offset = this.trackWidth / 2 + 0.25;
    const envBarrierColor = {
      city:        [0xe8e8e8, 0x333333], // alternating concrete
      desert:      [0xff8800, 0xffffff],
      forest:      [0x4a7a2a, 0x88aa44],
      snow:        [0x99bbdd, 0xffffff],
      coastal:     [0xffffff, 0x2266aa],
      night:       [0xff0066, 0x00e5ff],
      volcano:     [0xff4400, 0x440000],
      industrial:  [0xffcc00, 0x334455],
      countryside: [0xcc8833, 0xffffff],
    };
    const [colorA, colorB] = envBarrierColor[this.config.env] || [0xcccccc, 0x333333];

    this._barrierData = []; // kept for compatibility, but physics.js uses spline-based check

    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < segments; i++) {
        const t = i / segments;
        const pt = this.curve.getPoint(t);
        const tangent = this.curve.getTangent(t).normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        const pos = pt.clone().addScaledVector(normal, side * offset);
        pos.y += barrierH / 2;

        // Alternating colored barriers
        const color = Math.floor(i / 2) % 2 === 0 ? colorA : colorB;
        const geo = new THREE.BoxGeometry(1.3, barrierH, barrierW);
        const mat = new THREE.MeshPhongMaterial({ color, shininess: 50 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        const angle = Math.atan2(-tangent.z, tangent.x);
        mesh.rotation.y = -angle;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.barrierMeshes.push(mesh);
        this._barrierData.push({
          pos: pos.clone(), normal: normal.clone().multiplyScalar(side), t,
        });
      }
    }
  }

  _buildStartLine() {
    const pt = this.curve.getPoint(0);
    const tangent = this.curve.getTangent(0).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);

    // Start/finish banner
    const poleGeo = new THREE.CylinderGeometry(0.15, 0.15, 8, 8);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x888888 });

    [-1, 1].forEach(s => {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.copy(pt).addScaledVector(normal, s * (this.trackWidth / 2 + 0.5));
      pole.position.y += 4;
      this.scene.add(pole);
      this.decorations.push(pole);
    });

    // Checkered line
    const lineGeo = new THREE.PlaneGeometry(this.trackWidth, 1.5);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.copy(pt);
    line.position.y = 0.02;
    line.rotation.y = Math.atan2(tangent.x, tangent.z);
    this.scene.add(line);
    this.decorations.push(line);
  }

  _buildCheckpoints() {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count; // Midpoints, not at 0
      const pt = this.curve.getPoint(t);
      const tangent = this.curve.getTangent(t).normalize();
      this.checkpoints.push({ t, position: pt, tangent, triggered: false });
    }
  }

  // ── Coins & Powerups ─────────────────────────────────────────────

  _spawnCoins() {
    const count = 40;
    const coinGeo = new THREE.TorusGeometry(0.4, 0.12, 8, 16);
    const coinMat = new THREE.MeshLambertMaterial({ color: 0xFFD600, emissive: 0x886600, emissiveIntensity: 0.3 });

    for (let i = 0; i < count; i++) {
      const t = i / count;
      const pt = this.curve.getPoint(t);
      const tangent = this.curve.getTangent(t).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);

      // Place coins in a small arc across the track
      const offset = (Math.random() - 0.5) * (this.trackWidth - 3);
      const pos = pt.clone().addScaledVector(normal, offset);
      pos.y = 0.8;

      const coin = new THREE.Mesh(coinGeo, coinMat.clone());
      coin.position.copy(pos);
      coin.rotation.x = Math.PI / 2;
      this.scene.add(coin);
      this.coins.push({ mesh: coin, position: pos.clone(), collected: false });
    }
  }

  _spawnPowerups() {
    const count = 8;
    const powerupList = CONFIG.powerups;

    for (let i = 0; i < count; i++) {
      const t = (i + 0.3) / count;
      const pt = this.curve.getPoint(t);
      const tangent = this.curve.getTangent(t).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
      const offset = (Math.random() - 0.5) * (this.trackWidth * 0.5);
      const pos = pt.clone().addScaledVector(normal, offset);
      pos.y = 0.8;

      const pDef = powerupList[i % powerupList.length];
      const geo = new THREE.OctahedronGeometry(0.6, 0);
      const mat = new THREE.MeshLambertMaterial({
        color: pDef.color, emissive: pDef.color, emissiveIntensity: 0.5,
        transparent: true, opacity: 0.9,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.powerups.push({ mesh, position: pos.clone(), type: pDef.id, collected: false });
    }
  }

  _buildEnvironment() {
    const env = this.config.env;
    const builders = {
      city:        () => this._buildCityEnv(),
      desert:      () => this._buildDesertEnv(),
      forest:      () => this._buildForestEnv(),
      snow:        () => this._buildSnowEnv(),
      night:       () => this._buildNightEnv(),
      volcano:     () => this._buildVolcanoEnv(),
      coastal:     () => this._buildCoastalEnv(),
      industrial:  () => this._buildIndustrialEnv(),
      countryside: () => this._buildCountrysideEnv(),
    };
    if (builders[env]) builders[env]();
  }

  _addBuilding(x, y, z, w, h, d, color) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.decorations.push(mesh);
  }

  _addTree(x, z, color = 0x2d6a4f, height = 4) {
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, height * 0.4, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, height * 0.2, z);
    this.scene.add(trunk);

    const topGeo = new THREE.ConeGeometry(1.5, height * 0.8, 7);
    const topMat = new THREE.MeshLambertMaterial({ color });
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.set(x, height * 0.6 + height * 0.2, z);
    this.scene.add(top);
    trunk.castShadow = top.castShadow = true;
    this.decorations.push(trunk, top);
  }

  _buildCityEnv() {
    const colors = [0x334455, 0x445566, 0x223344, 0x556677, 0x3d5a80];
    const splinePts = this.curve.getSpacedPoints(30);
    splinePts.forEach((pt, i) => {
      if (i % 3 === 0) return;
      const n = new THREE.Vector3();
      const t = this.curve.getTangent(i / 30);
      n.set(-t.z, 0, t.x);
      [-1, 1].forEach(s => {
        const bx = pt.x + n.x * s * (this.trackWidth / 2 + 5 + Math.random() * 8);
        const bz = pt.z + n.z * s * (this.trackWidth / 2 + 5 + Math.random() * 8);
        const h = 6 + Math.random() * 25;
        this._addBuilding(bx, 0, bz, 4 + Math.random() * 6, h, 4 + Math.random() * 6, colors[i % colors.length]);
      });
    });
  }

  _buildForestEnv() {
    const greenVariants = [0x2d6a4f, 0x40916c, 0x1b4332, 0x52b788, 0x081c15];
    const splinePts = this.curve.getSpacedPoints(60);
    splinePts.forEach((pt, i) => {
      const t = this.curve.getTangent(i / 60);
      const n = new THREE.Vector3(-t.z, 0, t.x);
      [-1, 1].forEach(s => {
        const dist = this.trackWidth / 2 + 2 + Math.random() * 15;
        const tx = pt.x + n.x * s * dist;
        const tz = pt.z + n.z * s * dist;
        const color = greenVariants[Math.floor(Math.random() * greenVariants.length)];
        this._addTree(tx, tz, color, 4 + Math.random() * 8);
      });
    });
  }

  _buildDesertEnv() {
    const splinePts = this.curve.getSpacedPoints(40);
    splinePts.forEach((pt, i) => {
      if (i % 5 !== 0) return;
      const t = this.curve.getTangent(i / 40);
      const n = new THREE.Vector3(-t.z, 0, t.x);
      [-1, 1].forEach(s => {
        const dx = pt.x + n.x * s * (this.trackWidth / 2 + 8 + Math.random() * 20);
        const dz = pt.z + n.z * s * (this.trackWidth / 2 + 8 + Math.random() * 20);
        // Cactus (simple cylinder + sphere)
        const bodyGeo = new THREE.CylinderGeometry(0.3, 0.35, 3 + Math.random() * 3, 8);
        const mat = new THREE.MeshLambertMaterial({ color: 0x4a7c59 });
        const body = new THREE.Mesh(bodyGeo, mat);
        body.position.set(dx, 1.5, dz);
        body.castShadow = true;
        this.scene.add(body);
        this.decorations.push(body);
      });
    });
    // Sand dunes
    for (let i = 0; i < 15; i++) {
      const geo = new THREE.SphereGeometry(5 + Math.random() * 8, 8, 6);
      const mat = new THREE.MeshLambertMaterial({ color: 0xc4a87a });
      const dune = new THREE.Mesh(geo, mat);
      dune.scale.y = 0.3;
      dune.position.set(
        (Math.random() - 0.5) * 200,
        0,
        (Math.random() - 0.5) * 200,
      );
      this.scene.add(dune);
      this.decorations.push(dune);
    }
  }

  _buildSnowEnv() {
    // Snow-capped mountains in background
    for (let i = 0; i < 8; i++) {
      const geo = new THREE.ConeGeometry(15 + Math.random() * 20, 30 + Math.random() * 40, 7);
      const mat = new THREE.MeshLambertMaterial({ color: 0x9ab8d0 });
      const mtn = new THREE.Mesh(geo, mat);
      mtn.position.set(
        (Math.random() - 0.5) * 300,
        0,
        (Math.random() - 0.5) * 300,
      );
      this.scene.add(mtn);
      this.decorations.push(mtn);
    }
    // Pine trees with snow
    const splinePts = this.curve.getSpacedPoints(60);
    splinePts.forEach((pt, i) => {
      const t = this.curve.getTangent(i / 60);
      const n = new THREE.Vector3(-t.z, 0, t.x);
      [-1, 1].forEach(s => {
        const dist = this.trackWidth / 2 + 3 + Math.random() * 12;
        const tx = pt.x + n.x * s * dist;
        const tz = pt.z + n.z * s * dist;
        this._addTree(tx, tz, 0xffffff, 5 + Math.random() * 5); // snow-white trees
      });
    });
  }

  _buildNightEnv() {
    // Neon street lights
    const splinePts = this.curve.getSpacedPoints(40);
    splinePts.forEach((pt, i) => {
      if (i % 3 !== 0) return;
      const t = this.curve.getTangent(i / 40);
      const n = new THREE.Vector3(-t.z, 0, t.x);
      const neonColors = [0x00e5ff, 0xff1744, 0x7c4dff, 0xffd600, 0x00e676];
      [-1, 1].forEach(s => {
        const lx = pt.x + n.x * s * (this.trackWidth / 2 + 1.5);
        const lz = pt.z + n.z * s * (this.trackWidth / 2 + 1.5);

        // Pole
        const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 6, 4);
        const poleMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(lx, 3, lz);
        this.scene.add(pole);

        // Light
        const neonColor = neonColors[Math.floor(Math.random() * neonColors.length)];
        const ptLight = new THREE.PointLight(neonColor, 1.5, 25);
        ptLight.position.set(lx, 6, lz);
        this.scene.add(ptLight);
        this.decorations.push(pole);
      });
    });

    // Background buildings with lights
    const splinePts2 = this.curve.getSpacedPoints(20);
    splinePts2.forEach((pt, i) => {
      if (i % 2 === 0) return;
      const t = this.curve.getTangent(i / 20);
      const n = new THREE.Vector3(-t.z, 0, t.x);
      [-1, 1].forEach(s => {
        const bx = pt.x + n.x * s * (this.trackWidth / 2 + 8 + Math.random() * 12);
        const bz = pt.z + n.z * s * (this.trackWidth / 2 + 8 + Math.random() * 12);
        const h = 10 + Math.random() * 30;
        this._addBuilding(bx, 0, bz, 6 + Math.random() * 8, h, 6 + Math.random() * 8, 0x1a1a2e);
        // Window glow
        const windowLight = new THREE.PointLight(0xffd080, 0.3, 15);
        windowLight.position.set(bx, h * 0.7, bz);
        this.scene.add(windowLight);
      });
    });
  }

  _buildVolcanoEnv() {
    // Lava glow
    const lavaLight = new THREE.PointLight(0xff4400, 3, 200);
    lavaLight.position.set(0, 5, 0);
    this.scene.add(lavaLight);

    // Volcano cone
    const volcGeo = new THREE.ConeGeometry(40, 60, 12);
    const volcMat = new THREE.MeshLambertMaterial({ color: 0x3d1010 });
    const volc = new THREE.Mesh(volcGeo, volcMat);
    volc.position.set(-50, 0, -50);
    this.scene.add(volc);
    this.decorations.push(volc);

    // Lava rocks
    for (let i = 0; i < 20; i++) {
      const rockGeo = new THREE.DodecahedronGeometry(1 + Math.random() * 3, 0);
      const rockMat = new THREE.MeshLambertMaterial({ color: 0x2d1010 });
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(
        (Math.random() - 0.5) * 200,
        0,
        (Math.random() - 0.5) * 200,
      );
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      this.scene.add(rock);
      this.decorations.push(rock);
    }
  }

  _buildCoastalEnv() {
    // Ocean water plane
    const waterGeo = new THREE.PlaneGeometry(500, 300);
    const waterMat = new THREE.MeshLambertMaterial({ color: 0x006994, transparent: true, opacity: 0.85 });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.5, 150);
    this.scene.add(water);
    this.decorations.push(water);

    // Palm trees
    const splinePts = this.curve.getSpacedPoints(30);
    splinePts.forEach((pt, i) => {
      if (i % 4 !== 0) return;
      const t = this.curve.getTangent(i / 30);
      const n = new THREE.Vector3(-t.z, 0, t.x);
      const dist = this.trackWidth / 2 + 4 + Math.random() * 10;
      const tx = pt.x + n.x * dist;
      const tz = pt.z + n.z * dist;
      this._addTree(tx, tz, 0x4caf50, 7 + Math.random() * 5);
    });
  }

  _buildIndustrialEnv() {
    const splinePts = this.curve.getSpacedPoints(25);
    splinePts.forEach((pt, i) => {
      if (i % 3 !== 0) return;
      const t = this.curve.getTangent(i / 25);
      const n = new THREE.Vector3(-t.z, 0, t.x);
      [-1, 1].forEach(s => {
        const bx = pt.x + n.x * s * (this.trackWidth / 2 + 5 + Math.random() * 8);
        const bz = pt.z + n.z * s * (this.trackWidth / 2 + 5 + Math.random() * 8);
        const h = 8 + Math.random() * 20;
        this._addBuilding(bx, 0, bz, 8 + Math.random() * 10, h, 8 + Math.random() * 10, 0x37474f);
      });
    });
    // Smokestacks
    for (let i = 0; i < 5; i++) {
      const geo = new THREE.CylinderGeometry(0.8, 1.2, 20 + Math.random() * 15, 8);
      const mat = new THREE.MeshLambertMaterial({ color: 0x424242 });
      const stack = new THREE.Mesh(geo, mat);
      stack.position.set(
        (Math.random() - 0.5) * 200,
        10,
        (Math.random() - 0.5) * 200,
      );
      this.scene.add(stack);
      this.decorations.push(stack);
    }
  }

  _buildCountrysideEnv() {
    // Rolling hills and farmland
    const splinePts = this.curve.getSpacedPoints(50);
    splinePts.forEach((pt, i) => {
      if (i % 6 !== 0) return;
      const t = this.curve.getTangent(i / 50);
      const n = new THREE.Vector3(-t.z, 0, t.x);
      [-1, 1].forEach(s => {
        const dist = this.trackWidth / 2 + 5 + Math.random() * 20;
        const tx = pt.x + n.x * s * dist;
        const tz = pt.z + n.z * s * dist;
        this._addTree(tx, tz, 0x4a9e4a, 5 + Math.random() * 7);
      });
    });
    // Fence posts
    const splinePts2 = this.curve.getSpacedPoints(80);
    splinePts2.forEach((pt, i) => {
      if (i % 4 !== 0) return;
      const t = this.curve.getTangent(i / 80);
      const n = new THREE.Vector3(-t.z, 0, t.x);
      [-1, 1].forEach(s => {
        const fx = pt.x + n.x * s * (this.trackWidth / 2 + 1);
        const fz = pt.z + n.z * s * (this.trackWidth / 2 + 1);
        const pGeo = new THREE.BoxGeometry(0.15, 1.2, 0.15);
        const pMat = new THREE.MeshLambertMaterial({ color: 0x8d6e63 });
        const post = new THREE.Mesh(pGeo, pMat);
        post.position.set(fx, 0.6, fz);
        this.scene.add(post);
        this.decorations.push(post);
      });
    });
  }

  _buildStartPositions() {
    const count = 9; // max opponents + player
    for (let i = 0; i < count; i++) {
      const t = -i * 0.012; // behind start line
      const pt = this.curve.getPoint((t + 1) % 1);
      const tangent = this.curve.getTangent((t + 1) % 1).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);

      // Grid pattern: alternating left/right
      const row = Math.floor(i / 2);
      const side = i % 2 === 0 ? -1 : 1;
      const pos = pt.clone().addScaledVector(tangent, -row * 5).addScaledVector(normal, side * 3);
      pos.y = 0;

      const angle = Math.atan2(tangent.x, tangent.z);
      this.startPositions.push({ position: pos, rotation: angle });
    }
  }

  // ── Queries ──────────────────────────────────────────────────────

  /** Returns the track parameter t [0,1] closest to a world position */
  getProgress(worldPos) {
    let minDist = Infinity;
    let bestT = 0;
    const steps = 200;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const pt = this.curve.getPoint(t);
      const dx = pt.x - worldPos.x;
      const dz = pt.z - worldPos.z;
      const d = dx * dx + dz * dz;
      if (d < minDist) { minDist = d; bestT = t; }
    }
    return bestT;
  }

  getPositionAt(t) {
    return this.curve.getPoint(t % 1);
  }

  getTangentAt(t) {
    return this.curve.getTangent(t % 1);
  }

  /** Check barrier collision – returns push-back vector or null */
  checkBarrierCollision(carPos, radius = 2.5) {
    for (const b of this._barrierData) {
      const dx = carPos.x - b.pos.x;
      const dz = carPos.z - b.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < radius + 1.5) {
        return b.normal.clone().multiplyScalar(0.5);
      }
    }
    return null;
  }

  /** Animate coins & powerups */
  update(time) {
    // Spin coins
    this.coins.forEach(c => {
      if (!c.collected) {
        c.mesh.rotation.y += 0.04;
        c.mesh.position.y = 0.8 + Math.sin(time * 0.003 + c.position.x) * 0.2;
      }
    });
    // Rotate powerups
    this.powerups.forEach(p => {
      if (!p.collected) {
        p.mesh.rotation.y += 0.03;
        p.mesh.rotation.x += 0.01;
        p.mesh.position.y = 0.8 + Math.cos(time * 0.004 + p.position.z) * 0.25;
      }
    });
  }

  dispose() {
    // Remove all scene objects
    const toRemove = [
      this.trackMesh,
      ...this.barrierMeshes,
      ...this.decorations,
      ...this.coins.map(c => c.mesh),
      ...this.powerups.map(p => p.mesh),
    ].filter(Boolean);

    toRemove.forEach(m => {
      this.scene.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        if (Array.isArray(m.material)) m.material.forEach(mat => mat.dispose());
        else m.material.dispose();
      }
    });
  }
}
