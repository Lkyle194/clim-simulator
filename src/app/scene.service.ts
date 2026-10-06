import { Injectable, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  AC_POSITIONS,
  AMBIENT_TEMP,
  OUTDOOR_POSITION,
  ROOMS,
  RoomId,
  WALL_HEIGHT,
  WALL_THICKNESS,
  getIndoorUnit,
} from './models';
import { ClimateStore, RoomState } from './store';

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

  private acVisuals = new Map<RoomId, AcVisual>();
  private roomFloors = new Map<RoomId, RoomFloor>();
  private outdoorMesh: THREE.Group | null = null;
  private labelSprites = new Map<string, THREE.Sprite>();

  // Dimensions totales du plan (m)
  private readonly planW = 6.7;
  private readonly planD = 12.4;

  attach(container: HTMLElement) {
    this.container = container;
    this.build();
    this.running = true;
    this.animate();
  }

  detach() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    if (this.renderer && this.container) {
      this.renderer.domElement.remove();
      this.renderer.dispose();
    }
    this.renderer = null;
    this.container = null;
  }

  private build() {
    const c = this.container!;
    const w = c.clientWidth || 800;
    const h = c.clientHeight || 600;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    c.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1020);
    this.scene.fog = new THREE.Fog(0x0b1020, 20, 60);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 200);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2.05;

    // Lumières
    const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x1a2033, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d6, 1.1);
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
    this.buildAcUnits();
    this.buildOutdoor();
    this.buildLabels();

    this.applyView();
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
  }

  private onResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // --- Sol + heatmap ------------------------------------------------------
  private buildFloor() {
    const s = this.scene!;
    // Sol global
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(this.planW + 4, this.planD + 4),
      new THREE.MeshStandardMaterial({ color: 0x141b2e, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(this.planW / 2, -0.02, this.planD / 2);
    ground.receiveShadow = true;
    s.add(ground);

    // Heatmap par pièce (shader)
    for (const room of ROOMS) {
      const { x, y, w, d } = room.rect;
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTemp: { value: AMBIENT_TEMP },
          uTarget: { value: 22 },
          uActive: { value: 0 },
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
          uniform float uActive;
          uniform float uTime;
          void main() {
            // delta entre température actuelle et consigne
            float delta = clamp((uTemp - uTarget) / 12.0, -1.0, 1.0);
            // bleu (froid) <-> rouge (chaud)
            vec3 cold = vec3(0.15, 0.45, 0.95);
            vec3 hot  = vec3(0.95, 0.30, 0.15);
            vec3 neutral = vec3(0.20, 0.24, 0.34);
            vec3 col = mix(neutral, mix(cold, hot, delta * 0.5 + 0.5), uActive);
            // léger scintillement quand actif
            float shimmer = sin(vUv.x * 40.0 + uTime * 2.0) * sin(vUv.y * 40.0 - uTime * 2.0);
            col += shimmer * 0.03 * uActive;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x + w / 2, 0.01, y + d / 2);
      s.add(mesh);
      this.roomFloors.set(room.id, { mesh, mat, room: room.id });
    }
  }

  // --- Murs ---------------------------------------------------------------
  private buildWalls() {
    const s = this.scene!;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a3350, roughness: 0.8, transparent: true, opacity: 0.55 });
    const t = WALL_THICKNESS;
    const H = WALL_HEIGHT;

    const addWall = (cx: number, cz: number, len: number, rotY: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, H, t), wallMat);
      m.position.set(cx, H / 2, cz);
      m.rotation.y = rotY;
      m.castShadow = true;
      m.receiveShadow = true;
      s.add(m);
    };

    // Contour extérieur
    addWall(this.planW / 2, 0, this.planW, 0); // nord
    addWall(this.planW / 2, this.planD, this.planW, 0); // sud
    addWall(0, this.planD / 2, this.planD, Math.PI / 2); // ouest
    addWall(this.planW, this.planD / 2, this.planD, Math.PI / 2); // est

    // Murs intérieurs (simplifiés selon plan)
    // Séparation séjour / cuisine (y=3.9)
    addWall(2.05, 3.9, 4.1, 0);
    // Cuisine / SDB (y=7.5)
    addWall(1.0, 7.5, 2.0, 0);
    // Cuisine / Entrée (x=2.0)
    addWall(2.0, 4.8, 1.8, Math.PI / 2);
    // Entrée / Ch2 (x=2.0, y 5.7-9.5)
    addWall(2.0, 7.6, 3.8, Math.PI / 2);
    // SDB / Ch1 (y=9.5)
    addWall(2.05, 9.5, 4.1, 0);
    // Séparation séjour / terrasse (x=4.1)
    addWall(4.1, 6.2, 12.4, Math.PI / 2);
  }

  // --- Unités intérieures -------------------------------------------------
  private buildAcUnits() {
    const s = this.scene!;
    for (const [roomId, pos] of Object.entries(AC_POSITIONS)) {
      const room = roomId as RoomId;
      const group = new THREE.Group();
      group.position.set(pos.x, 2.0, pos.y);
      group.rotation.y = pos.facing;

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

      // Particules
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

  // --- Unité extérieure ---------------------------------------------------
  private buildOutdoor() {
    const s = this.scene!;
    const g = new THREE.Group();
    g.position.set(OUTDOOR_POSITION.x, 0.5, OUTDOOR_POSITION.y);
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

  // --- Étiquettes ---------------------------------------------------------
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
      const { x, y, w, d } = room.rect;
      const label = this.makeLabel(room.name, 0xcfe0ff);
      label.position.set(x + w / 2, 0.15, y + d / 2);
      s.add(label);
      this.labelSprites.set(room.id, label);
    }
  }

  // --- Caméra -------------------------------------------------------------
  private applyView() {
    if (!this.camera || !this.controls) return;
    const view = this.store.sim().view;
    const cx = this.planW / 2;
    const cz = this.planD / 2;
    if (view === 'top') {
      this.camera.position.set(cx, 22, cz + 0.01);
      this.controls.target.set(cx, 0, cz);
      this.controls.minPolarAngle = 0;
      this.controls.maxPolarAngle = 0.02;
    } else {
      this.camera.position.set(cx + 9, 9, cz + 11);
      this.controls.target.set(cx, 1, cz);
      this.controls.minPolarAngle = 0;
      this.controls.maxPolarAngle = Math.PI / 2.05;
    }
    this.controls.update();
  }

  // --- Boucle d'animation -------------------------------------------------
  private animate = () => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;

    // Tick virtuel + thermique (hors zone pour ne pas re-render Angular à 60fps)
    this.zone.runOutsideAngular(() => {
      this.store.tick(dt);
      this.store.applyThermal(dt);
    });

    const sim = this.store.sim();

    // Heatmap
    for (const [roomId, floor] of this.roomFloors) {
      const r = sim.rooms[roomId];
      const unit = getIndoorUnit(r.unitId);
      const active = r.power && unit.features.presence !== undefined ? (r.power ? 1 : 0) : 0;
      floor.mat.uniforms['uTemp'].value = r.currentTemp;
      floor.mat.uniforms['uTarget'].value = r.targetTemp;
      floor.mat.uniforms['uActive'].value = active;
      floor.mat.uniforms['uTime'].value = t;
    }

    // Unités intérieures + particules
    for (const [roomId, v] of this.acVisuals) {
      const r = sim.rooms[roomId];
      const unit = getIndoorUnit(r.unitId);
      const on = r.power;
      let flow = on ? 1 : 0;
      if (r.ecoActive) flow *= 0.35;
      if (r.sleepSense) flow *= 0.5;
      if (r.mode === 'fan') flow *= 0.3;
      const fanFactor = r.fan === 'low' ? 0.5 : r.fan === 'mid' ? 0.8 : r.fan === 'high' ? 1.3 : 1;
      flow *= fanFactor;

      v.glow.intensity = on ? 1.5 * flow : 0;
      v.particleMat.opacity = on ? 0.85 * Math.min(flow, 1) : 0;

      // Couleur selon mode
      let color = 0x7dd3fc; // cool
      if (r.mode === 'heat') color = 0xff8a5c;
      else if (r.mode === 'fan') color = 0xd1d5db;
      else if (r.mode === 'dry') color = 0x67e8f9;
      if (r.aqtivIon) color = 0x60a5fa; // ionisé bleuté
      if (r.sleepSense) color = 0x3b4a6b; // nuit assombri
      v.particleMat.color.setHex(color);
      v.louver.material.emissive.setHex(on ? 0x0a3a5a : 0x000000);

      // Mise à jour des particules
      const pos = v.positions;
      const vel = v.velocities;
      const n = pos.length / 3;
      const spread = unit.features.swing3d ? 1.0 : 0.35; // cône large vs simple
      for (let i = 0; i < n; i++) {
        if (on) {
          pos[i * 3] += vel[i * 3] * dt * flow;
          pos[i * 3 + 1] += vel[i * 3 + 1] * dt * flow;
          pos[i * 3 + 2] += vel[i * 3 + 2] * dt * flow;
          // balayage 3D : dispersion horizontale
          if (unit.features.swing3d) {
            pos[i * 3] += Math.sin(t * 1.5 + v.phase + i) * 0.004 * spread;
          }
          // reset si hors volume
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

    this.controls?.update();
    this.renderer?.render(this.scene!, this.camera!);
  };

  ngOnInit() {}
  ngOnDestroy() {
    this.detach();
    window.removeEventListener('resize', this.onResize);
  }
}
