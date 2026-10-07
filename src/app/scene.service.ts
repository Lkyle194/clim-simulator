import { Injectable, NgZone, OnDestroy, OnInit, inject, signal } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  AC_POSITIONS,
  AC_ROOMS,
  AMBIENT_TEMP,
  OUTDOOR_POSITION,
  ROOMS,
  RoomId,
  WALLS,
  WALL_HEIGHT,
  getIndoorUnit,
  getOutdoorUnit,
} from './models';
import { ClimateStore, DayNight, RoomState, ViewMode } from './store';

interface AcVisual {
  group: THREE.Group;
  body: THREE.Mesh;
  louver: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  glow: THREE.PointLight;
  particles: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  particleMat: THREE.PointsMaterial;
  positions: Float32Array;
  velocities: Float32Array;
  room: RoomId;
  phase: number;
}

interface RoomFloor {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  room: RoomId;
}

interface WallHighlight {
  mesh: THREE.Line;
  room: RoomId;
}

@Injectable({ providedIn: 'root' })
export class SceneService implements OnInit, OnDestroy {
  private zone = inject(NgZone);
  private store = inject(ClimateStore);

  private container: HTMLElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private controls: OrbitControls | null = null;
  private clock = new THREE.Clock();
  private rafId = 0;
  private running = false;
  private resizeObserver: ResizeObserver | null = null;
  readonly webglFailed = signal(false);

  private acVisuals = new Map<RoomId, AcVisual>();
  private roomFloors = new Map<RoomId, RoomFloor>();
  private wallHighlights = new Map<RoomId, WallHighlight>();
  private outdoorMesh: THREE.Group | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private hemiLight: THREE.HemisphereLight | null = null;
  private sunMesh: THREE.Mesh | null = null;
  private exhaust: {
    points: THREE.Points;
    mat: THREE.PointsMaterial;
    positions: Float32Array;
    velocities: Float32Array;
    label: THREE.Sprite;
    labelCanvas: HTMLCanvasElement;
    labelCtx: CanvasRenderingContext2D;
    ox: number;
    oz: number;
  } | null = null;
  private labelSprites = new Map<string, THREE.Sprite>();
  private lastView: ViewMode | null = null;
  private lastDayNight: DayNight | null = null;
  private raycaster = new THREE.Raycaster();
  private clickMouse = new THREE.Vector2();
  private clickStart = { x: 0, y: 0 };

  // Boîte englobante du plan (repère cartésien, origine = haut-gauche).
  // x ∈ [0, 12.03], z ∈ [0, 12.96] (pièces + terrasse).
  private readonly planW = 12.03;   // étendue X
  private readonly planD = 12.96;   // étendue Z
  private readonly planCX = 6.015;  // centre X
  private readonly planCZ = 6.48;   // centre Z

  attach(container: HTMLElement) {
    this.container = container;
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      this.build();
    } else if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        if (this.container && this.container.clientWidth > 0 && this.container.clientHeight > 0) {
          ro.disconnect();
          this.build();
        }
      });
      ro.observe(container);
    } else {
      this.build();
    }
    this.running = true;
    this.animate();
  }

  detach() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.renderer && this.container) {
      this.renderer.domElement.remove();
      this.renderer.dispose();
    }
    this.renderer = null;
    this.container = null;
  }

  private build() {
    const c = this.container!;
    if (this.renderer) return;
    const w = c.clientWidth || 800;
    const h = c.clientHeight || 600;

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (err) {
      console.error('WebGL indisponible :', err);
      this.webglFailed.set(true);
      return;
    }
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.webglFailed.set(true);
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    c.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1020);
    this.scene.fog = new THREE.Fog(0x0b1020, 20, 60);

    this.camera = new THREE.PerspectiveCamera(w / h < 1 ? 62 : 50, w / h, 0.1, 200);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2.05;

    // Clic → sélection pièce (distingue clic de drag)
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      this.clickStart = { x: e.clientX, y: e.clientY };
    });
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      const dx = e.clientX - this.clickStart.x;
      const dy = e.clientY - this.clickStart.y;
      if (dx * dx + dy * dy < 25) {
        this.onClick(e);
      }
    });

    // Lumières
    const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x1a2033, 0.9);
    this.hemiLight = hemi;
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d6, 1.1);
    this.sunLight = sun;
    sun.position.set(8, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    this.scene.add(sun);

    this.buildFloor();
    this.buildWalls();
    this.buildTerraceWall();
    this.buildBuildingBackground();
    this.buildAcUnits();
    this.buildOutdoor();
    this.buildExhaust();
    this.buildLabels();
    this.buildHighlights();

    this.applyView();
    this.applyDayNight();
    window.addEventListener('resize', this.onResize);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(c);
    }
  }

  private onResize = () => {
    if (!this.container || !this.renderer || !this.camera) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 62 : 50;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private onClick(e: PointerEvent) {
    if (!this.renderer || !this.camera || !this.scene) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.clickMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.clickMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.clickMouse, this.camera);

    const floors = [...this.roomFloors.values()].map((f) => f.mesh);
    const hits = this.raycaster.intersectObjects(floors);
    if (hits.length > 0) {
      const roomId = (hits[0].object.userData as { room: RoomId }).room;
      const def = ROOMS.find((rm) => rm.id === roomId);
      // Seules les pièces dotées d'une unité intérieure de clim sont sélectionnables.
      if (def && def.hasAc) {
        this.zone.run(() => {
          this.store.toggleRoomSelection(roomId);
        });
      }
    }
  }

  // --- Sol + heatmap (toujours coloré) ------------------------------------
  private buildFloor() {
    const s = this.scene!;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(this.planW + 4, this.planD + 4),
      new THREE.MeshStandardMaterial({ color: 0x141b2e, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(this.planCX, -0.02, this.planCZ);
    ground.receiveShadow = true;
    s.add(ground);

    for (const room of ROOMS) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTemp: { value: AMBIENT_TEMP },
          uTarget: { value: 22 },
          uTime: { value: 0 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision highp float;
          varying vec2 vUv;
          uniform float uTemp;
          uniform float uTarget;
          uniform float uTime;
          void main() {
            // Couleur = température ACTUELLE de la pièce (16 °C → bleu, 30 °C → rouge)
            float t = clamp((uTemp - 16.0) / 14.0, 0.0, 1.0);
            vec3 cold = vec3(0.15, 0.45, 0.95);
            vec3 mid  = vec3(0.30, 0.75, 0.45);
            vec3 hot  = vec3(0.95, 0.30, 0.15);
            vec3 col = t < 0.5 ? mix(cold, mid, t * 2.0) : mix(mid, hot, (t - 0.5) * 2.0);
            float shimmer = sin(vUv.x * 40.0 + uTime * 2.0) * sin(vUv.y * 40.0 - uTime * 2.0);
            col += shimmer * 0.02;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      });

      // Toutes les pièces sont des polygones (topology_threejs.md).
      // ShapeGeometry est dans le plan XY ; la rotation -π/2 autour de X
      // envoie l'axe local Y vers -Z, d'où le signe négatif sur (z - cz).
      const pts = room.polygon;
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
      const shape = new THREE.Shape();
      shape.moveTo(pts[0].x - cx, -(pts[0].z - cz));
      for (let i = 1; i < pts.length; i++) {
        shape.lineTo(pts[i].x - cx, -(pts[i].z - cz));
      }
      shape.closePath();
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(cx, 0.01, cz);
      mesh.userData = { room: room.id };
      s.add(mesh);
      this.roomFloors.set(room.id, { mesh, mat, room: room.id });
    }
  }

  // --- Murs ----------------------------------------------------------------
  // 10 segments (topology_threejs.md) : 0,25 m extérieurs / 0,10 m cloisons.
  // La façade biaisée (séjour/ch2/ch1 ↔ terrasse) = baies vitrées.
  private buildWalls() {
    const s = this.scene!;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a3350, roughness: 0.8, transparent: true, opacity: 0.55 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
    const H = WALL_HEIGHT;

    // Chaque segment est défini par ses deux extrémités (x1,z1)→(x2,z2).
    // BoxGeometry : longueur sur l'axe local X. Pour aligner ce local X sur la
    // direction du segment (dx,dz), la rotation Y est -atan2(dz, dx) (fix murs).
    for (const w of WALLS) {
      const dx = w.x2 - w.x1;
      const dz = w.z2 - w.z1;
      const len = Math.hypot(dx, dz);
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, H, w.thickness), w.glass ? glassMat : wallMat);
      m.position.set((w.x1 + w.x2) / 2, H / 2, (w.z1 + w.z2) / 2);
      m.rotation.y = -Math.atan2(dz, dx);
      m.castShadow = !w.glass;
      m.receiveShadow = true;
      s.add(m);
    }
  }

  // --- Unités intérieures (parallèles au mur) ------------------------------
  /**
   * Murs vitrés côté terrasse : gérés directement dans buildWalls (baies vitrées
   * sur les murs nord/sud du séjour et est de la ch2). Méthode conservée comme
   * point d'extension pour un cadre de baie éventuel.
   */
  private buildTerraceWall() {
    // Les baies vitrées sont intégrées au contour (buildWalls, glass=true).
  }

  /**
   * Background : le bâtiment vu depuis le 7e et dernier étage (fix 4) —
   * toits de la ville, skyline lointaine, et disque solaire.
   */
  private buildBuildingBackground() {
    if (!this.scene) return;
    // Toit du propre bâtiment (on est au dernier étage)
    const ownRoof = new THREE.Mesh(
      new THREE.BoxGeometry(this.planW + 1.2, 0.25, this.planD + 1.2),
      new THREE.MeshStandardMaterial({ color: 0x39415c, roughness: 0.9 }),
    );
    ownRoof.position.set(this.planCX, -0.13, this.planCZ);
    this.scene.add(ownRoof);

    // Toits de la ville (cubes gris variés, hors de l'appartement)
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a5470, roughness: 1 });
    const roofMat2 = new THREE.MeshStandardMaterial({ color: 0x3d4660, roughness: 1 });
    const roofs: Array<[number, number, number, number, number]> = [
      // x, z, largeur, profondeur, hauteur
      [-14, -10, 8, 8, 6], [-16, 4, 10, 7, 9], [-8, -16, 9, 9, 5],
      [14, -12, 8, 10, 7], [16, 6, 9, 8, 10], [8, 18, 10, 8, 6],
      [-18, 16, 8, 8, 8], [20, -4, 7, 9, 12], [-6, 20, 9, 7, 5],
    ];
    for (const [x, z, w, d, h] of roofs) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), Math.random() > 0.5 ? roofMat : roofMat2);
      m.position.set(x, h / 2 - 0.25, z);
      this.scene.add(m);
    }

    // Skyline lointaine (anneau de tours plus hautes)
    const farMat = new THREE.MeshStandardMaterial({ color: 0x2c3450, roughness: 1 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = 34 + Math.random() * 10;
      const h = 14 + Math.random() * 18;
      const w = 4 + Math.random() * 5;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), farMat);
      m.position.set(Math.cos(a) * r, h / 2 - 0.25, Math.sin(a) * r);
      this.scene.add(m);
    }

    // Disque solaire (visible dans le ciel)
    const sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe08a }),
    );
    sunDisc.position.set(26, 22, -18);
    this.sunMesh = sunDisc;
    this.scene.add(sunDisc);
  }

  /** Particules d'air chaud rejeté par l'unité extérieure (fix 8). */
  private buildExhaust() {
    if (!this.scene) return;
    const count = 120;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    // Repère de l'unité extérieure (position + orientation du groupe)
    const ox = OUTDOOR_POSITION.x;
    const oz = OUTDOOR_POSITION.z;
    const fx = Math.sin(OUTDOOR_POSITION.facing); // axe du flux (avant du ventilateur)
    const fz = Math.cos(OUTDOOR_POSITION.facing);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = ox + fx * 0.3 + (Math.random() - 0.5) * 0.3;
      positions[i * 3 + 1] = 1.0 + Math.random() * 0.8;
      positions[i * 3 + 2] = oz + fz * 0.3 + (Math.random() - 0.5) * 0.3;
      velocities[i * 3] = fx * 0.8 + (Math.random() - 0.5) * 0.3;
      velocities[i * 3 + 1] = 0.5 + Math.random() * 0.7;
      velocities[i * 3 + 2] = fz * 0.8 + (Math.random() - 0.5) * 0.3;
    }
    const mat = new THREE.PointsMaterial({
      color: 0xff9a5c,
      size: 0.14,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);

    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256;
    labelCanvas.height = 64;
    const labelCtx = labelCanvas.getContext('2d')!;
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(labelCanvas), depthTest: false }),
    );
    label.scale.set(2.4, 0.6, 1);
    label.position.set(ox, 2.6, oz);
    this.scene.add(label);

    this.exhaust = { points, mat, positions, velocities, label, labelCanvas, labelCtx, ox, oz };
  }

  private buildAcUnits() {
    const s = this.scene!;
    for (const [roomId, pos] of Object.entries(AC_POSITIONS)) {
      const room = roomId as RoomId;
      const group = new THREE.Group();
      group.position.set(pos.x, pos.y, pos.z);
      group.rotation.y = pos.facing; // -π/2 : long du mur, flux vers l'ouest

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.28, 0.32),
        new THREE.MeshStandardMaterial({ color: 0xf5f7fa, roughness: 0.4, metalness: 0.1 }),
      );
      body.castShadow = true;
      group.add(body);

      const louver = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.05, 0.28),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0a2a3a }),
      );
      louver.position.set(0, -0.14, 0.1);
      group.add(louver);

      const glow = new THREE.PointLight(0x38bdf8, 0, 2.5);
      glow.position.set(0, -0.2, 0.3);
      group.add(glow);

      const COUNT = 220;
      const positions = new Float32Array(COUNT * 3);
      const velocities = new Float32Array(COUNT * 3);
      for (let i = 0; i < COUNT; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 0.6;
        positions[i * 3 + 1] = -0.15;
        positions[i * 3 + 2] = Math.random() * 0.2;
        velocities[i * 3] = (Math.random() - 0.5) * 0.2;
        velocities[i * 3 + 1] = -0.3 - Math.random() * 0.3;
        velocities[i * 3 + 2] = 0.4 + Math.random() * 0.4;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const particleMat = new THREE.PointsMaterial({
        color: 0x7dd3fc,
        size: 0.05,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const particles = new THREE.Points(geo, particleMat);
      group.add(particles);

      s.add(group);
      this.acVisuals.set(room, { group, body, louver, glow, particles, particleMat, positions, velocities, room, phase: Math.random() * 10 });
    }
  }

  // --- Unité extérieure (parallèle au mur, ventilateur vers la terrasse) ---
  private buildOutdoor() {
    const s = this.scene!;
    const g = new THREE.Group();
    g.position.set(OUTDOOR_POSITION.x, 0.5, OUTDOOR_POSITION.z);
    g.rotation.y = OUTDOOR_POSITION.facing; // +π/2 : long du mur, flux vers l'est
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 1.0, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x9aa4b2, roughness: 0.6, metalness: 0.3 }),
    );
    body.position.y = 0.5;
    body.castShadow = true;
    g.add(body);
    const fan = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.05, 24),
      new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5 }),
    );
    fan.rotation.z = Math.PI / 2;
    fan.position.set(0.2, 0.5, 0.21);
    g.add(fan);
    s.add(g);
    this.outdoorMesh = g;
  }

  // --- Étiquettes ----------------------------------------------------------
  private makeLabel(text: string, color = 0xffffff): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'bold 30px sans-serif';
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.6, 0.4, 1);
    return sprite;
  }

  private buildLabels() {
    const s = this.scene!;
    for (const room of ROOMS) {
      const lx = room.polygon.reduce((s, p) => s + p.x, 0) / room.polygon.length;
      const lz = room.polygon.reduce((s, p) => s + p.z, 0) / room.polygon.length;
      const label = this.makeLabel(room.name, 0xcfe0ff);
      label.position.set(lx, 0.15, lz);
      s.add(label);
      this.labelSprites.set(room.id, label);
    }
  }

  // --- Surbrillance des pièces sélectionnées -------------------------------
  private buildHighlights() {
    const s = this.scene!;
    for (const room of ROOMS) {
      const pts = room.polygon.map((p) => new THREE.Vector3(p.x, 0.02, p.z));
      pts.push(pts[0].clone());
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0 });
      const line = new THREE.Line(geo, mat);
      s.add(line);
      this.wallHighlights.set(room.id, { mesh: line, room: room.id });
    }
  }

  // --- Caméra --------------------------------------------------------------
  private applyView() {
    if (!this.camera || !this.controls) return;
    const view = this.store.sim().view;
    const cx = this.planCX;
    const cz = this.planCZ;
    if (view === 'top') {
      this.camera.position.set(cx, 22, cz + 0.01);
      this.controls.target.set(cx, 0, cz);
      this.controls.minPolarAngle = 0;
      this.controls.maxPolarAngle = 0.02;
    } else {
      const narrow = this.camera.aspect < 1;
      const dist = narrow ? 1.55 : 1;
      this.camera.position.set(cx + 9 * dist, 9 * dist, cz + 11 * dist);
      this.controls.target.set(cx, 1, cz);
      this.controls.minPolarAngle = 0;
      this.controls.maxPolarAngle = Math.PI / 2.05;
    }
    this.controls.update();
  }

  /** Mode jour / nuit : soleil, ciel, éclairage (fix 5). */
  private applyDayNight() {
    if (!this.scene) return;
    const dn = this.store.sim().dayNight;
    if (dn === 'day') {
      if (this.sunLight) {
        this.sunLight.intensity = 2.2;
        this.sunLight.color.set(0xfff2d8);
      }
      if (this.hemiLight) {
        this.hemiLight.intensity = 0.9;
        this.hemiLight.color.set(0xbfd8ff);
        this.hemiLight.groundColor.set(0x3a3f55);
      }
      this.scene.background = new THREE.Color(0x8ec8f0);
      this.scene.fog = new THREE.Fog(0x8ec8f0, 40, 90);
      if (this.sunMesh) {
        this.sunMesh.visible = true;
        (this.sunMesh.material as THREE.MeshBasicMaterial).color.set(0xffe08a);
      }
    } else {
      if (this.sunLight) {
        this.sunLight.intensity = 0.25;
        this.sunLight.color.set(0x8fa8ff); // lune
      }
      if (this.hemiLight) {
        this.hemiLight.intensity = 0.35;
        this.hemiLight.color.set(0x2a3560);
        this.hemiLight.groundColor.set(0x141828);
      }
      this.scene.background = new THREE.Color(0x0b1026);
      this.scene.fog = new THREE.Fog(0x0b1026, 30, 70);
      if (this.sunMesh) {
        this.sunMesh.visible = true;
        (this.sunMesh.material as THREE.MeshBasicMaterial).color.set(0xdfe8ff); // lune
      }
    }
  }

  // --- Boucle d'animation ---------------------------------------------------
  private animate = () => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;

    this.zone.runOutsideAngular(() => {
      this.store.tick(dt);
      this.store.applyThermal(dt);
    });

    const sim = this.store.sim();

    // Heatmap — toujours coloré
    for (const [roomId, floor] of this.roomFloors) {
      const r = sim.rooms[roomId];
      floor.mat.uniforms['uTemp'].value = r.currentTemp;
      floor.mat.uniforms['uTarget'].value = r.targetTemp;
      floor.mat.uniforms['uTime'].value = t;
    }

    // Surbrillance sélection
    const selected = new Set(sim.selectedRooms);
    for (const [roomId, hl] of this.wallHighlights) {
      const mat = hl.mesh.material as THREE.LineBasicMaterial;
      mat.opacity = selected.has(roomId) ? 0.8 : 0;
    }

    // Unités intérieures + particules
    for (const [roomId, v] of this.acVisuals) {
      const r = sim.rooms[roomId];
      const unit = getIndoorUnit(r.unitId);
      const on = r.power;
      // Puissance effective du clim : fonction de l'écart température actuelle / consigne.
      const delta = Math.abs(r.currentTemp - r.targetTemp);
      const effort = Math.min(1, delta / 5); // 0 à la consigne → 1 si écart ≥ 5 °C
      let flow = on ? (0.15 + 0.85 * effort) : 0;
      if (r.ecoActive) flow *= 0.35;
      if (r.sleepSense) flow *= 0.5;
      if (r.mode === 'fan') flow *= 0.3;
      const fanFactor = r.fan === 'low' ? 0.5 : r.fan === 'mid' ? 0.8 : r.fan === 'high' ? 1.3 : 1;
      flow *= fanFactor;

      v.glow.intensity = on ? 1.5 * flow : 0;
      v.particleMat.opacity = on ? 0.85 * Math.min(flow, 1) : 0;

      let color = 0x7dd3fc;
      if (r.mode === 'heat') color = 0xff8a5c;
      else if (r.mode === 'fan') color = 0xd1d5db;
      else if (r.mode === 'dry') color = 0x67e8f9;
      if (r.aqtivIon) color = 0x60a5fa;
      if (r.sleepSense) color = 0x3b4a6b;
      v.particleMat.color.setHex(color);
      v.louver.material.emissive.setHex(on ? 0x0a3a5a : 0x000000);

      const pos = v.positions;
      const vel = v.velocities;
      const n = pos.length / 3;
      const spread = unit.features.swing3d ? 1.0 : 0.35;
      for (let i = 0; i < n; i++) {
        if (on) {
          const speed = dt * flow * sim.timeScale;
          pos[i * 3] += vel[i * 3] * speed;
          pos[i * 3 + 1] += vel[i * 3 + 1] * speed;
          pos[i * 3 + 2] += vel[i * 3 + 2] * speed;
          if (unit.features.swing3d) {
            pos[i * 3] += Math.sin(t * 1.5 + v.phase + i) * 0.004 * spread;
          }
          if (pos[i * 3 + 1] < -2.2 || Math.abs(pos[i * 3]) > 2.5 || pos[i * 3 + 2] > 3) {
            pos[i * 3] = (Math.random() - 0.5) * 0.6;
            pos[i * 3 + 1] = -0.15;
            pos[i * 3 + 2] = Math.random() * 0.2;
            vel[i * 3] = (Math.random() - 0.5) * 0.2 * spread;
            vel[i * 3 + 1] = -0.3 - Math.random() * 0.3;
            vel[i * 3 + 2] = 0.4 + Math.random() * 0.4;
          }
        }
      }
      v.particles.geometry.attributes['position'].needsUpdate = true;
    }

    // Ventilo extérieur
    if (this.outdoorMesh) {
      const anyOn = Object.values(sim.rooms).some((r) => r.power);
      this.outdoorMesh.children[1].rotation.x += dt * (anyOn ? 8 : 0.5);
    }

    // Changement de vue 2D/3D ou jour/nuit → application immédiate (fix 2, 5)
    if (sim.view !== this.lastView) {
      this.lastView = sim.view;
      this.applyView();
    }
    if (sim.dayNight !== this.lastDayNight) {
      this.lastDayNight = sim.dayNight;
      this.applyDayNight();
    }

    // Air rejeté par l'unité extérieure (fix 8)
    if (this.exhaust) {
      const ex = this.exhaust;
      let load = 0;
      for (const id of AC_ROOMS) {
        const r = sim.rooms[id];
        if (r.power) {
          const delta = Math.abs(r.currentTemp - r.targetTemp);
          load += Math.min(1, delta / 5);
        }
      }
      load = Math.min(1, load / 2); // normalisation (2 pièces à pleine charge ≈ max)
      ex.mat.opacity = load * 0.7;
      const pos = ex.positions;
      const vel = ex.velocities;
      const n = pos.length / 3;
      for (let i = 0; i < n; i++) {
        if (load > 0.02) {
          const speed = dt * (0.5 + load) * sim.timeScale;
          pos[i * 3] += vel[i * 3] * speed;
          pos[i * 3 + 1] += vel[i * 3 + 1] * speed;
          pos[i * 3 + 2] += vel[i * 3 + 2] * speed;
          if (pos[i * 3 + 1] > 3.5) {
            pos[i * 3] = ex.ox + (Math.random() - 0.5) * 0.4;
            pos[i * 3 + 1] = 1.0 + Math.random() * 0.8;
            pos[i * 3 + 2] = ex.oz + (Math.random() - 0.5) * 0.4;
          }
        }
      }
      ex.points.geometry.attributes['position'].needsUpdate = true;
      // Étiquette dB (valeur max constructeur, proportionnelle à la charge)
      const unit = getOutdoorUnit(sim.outdoorUnitId);
      const db = Math.round(30 + (unit.dbMax - 30) * Math.max(load, 0.15));
      const ctx = ex.labelCtx;
      ctx.clearRect(0, 0, ex.labelCanvas.width, ex.labelCanvas.height);
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = load > 0.02 ? '#ffb26b' : '#8b93a8';
      ctx.fillText(`${unit.ref} — ${db} dB`, 128, 38);
      (ex.label.material as THREE.SpriteMaterial).map!.needsUpdate = true;
    }

    this.controls?.update();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  };

  reframe() {
    this.applyView();
  }

  ngOnInit() {}
  ngOnDestroy() {
    this.detach();
    window.removeEventListener('resize', this.onResize);
  }
}
