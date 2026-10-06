import { Injectable, OnDestroy, signal, computed } from '@angular/core';
import {
  AC_ROOMS,
  AMBIENT_TEMP,
  CompatResult,
  INDOOR_UNITS,
  IndoorUnit,
  OUTDOOR_UNITS,
  OutdoorUnit,
  RoomId,
  autoOutdoorUnit,
  evaluateCompatibility,
  getIndoorUnit,
  getOutdoorUnit,
} from './models';

export type Mode = 'cool' | 'heat' | 'fan' | 'dry';
export type FanSpeed = 'auto' | 'low' | 'mid' | 'high';
export type ViewMode = 'top' | 'iso';

export interface RoomState {
  id: RoomId;
  unitId: string; // id de l'unité intérieure
  currentTemp: number; // °C
  targetTemp: number; // consigne °C
  power: boolean;
  mode: Mode;
  fan: FanSpeed;
  swing3d: boolean; // balayage 3D (600/800)
  aqtivIon: boolean; // 800
  sleepSense: boolean; // 800
  unoccupied: boolean; // toggle "pièce inoccupée"
  unoccupiedSince: number | null; // timestamp virtuel (min)
  ecoActive: boolean; // Smart Eco engagé
}

export interface SimState {
  rooms: Record<RoomId, RoomState>;
  outdoorUnitId: string;
  view: ViewMode;
  selectedRoom: RoomId | null;
  virtualMinutes: number; // horloge virtuelle (1 s réelle = 1 min virtuelle)
}

const MODES: Mode[] = ['cool', 'heat', 'fan', 'dry'];

function makeRoom(id: RoomId, unitId: string): RoomState {
  return {
    id,
    unitId,
    currentTemp: AMBIENT_TEMP,
    targetTemp: 22,
    power: false,
    mode: 'cool',
    fan: 'auto',
    swing3d: false,
    aqtivIon: false,
    sleepSense: false,
    unoccupied: false,
    unoccupiedSince: null,
    ecoActive: false,
  };
}

@Injectable({ providedIn: 'root' })
export class ClimateStore implements OnDestroy {
  // Configuration par défaut : 25 + 25 + 35 = 85 (config de l'appartement)
  private readonly state = signal<SimState>({
    rooms: {
      sejour: makeRoom('sejour', 'dj35'),
      ch1: makeRoom('ch1', 'dj25'),
      ch2: makeRoom('ch2', 'vj25'),
      cuisine: makeRoom('cuisine', 'dj25'),
      sdb: makeRoom('sdb', 'dj25'),
      entree: makeRoom('entree', 'dj25'),
      terrasse: makeRoom('terrasse', 'dj25'),
    },
    outdoorUnitId: 'g68',
    view: 'iso',
    selectedRoom: 'sejour',
    virtualMinutes: 0,
  });

  readonly sim = this.state.asReadonly();

  // --- Responsive ----------------------------------------------------------
  /** true si viewport < 768px (smartphone). */
  readonly mobile = signal(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  /** Ouverture du configurateur (panneau coulissant sur mobile). */
  readonly configuratorOpen = signal(false);

  private onResize = () => this.mobile.set(window.innerWidth < 768);

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.onResize);
    }
  }

  toggleConfigurator() {
    this.configuratorOpen.update((o) => !o);
  }

  closeConfigurator() {
    this.configuratorOpen.set(false);
  }

  ngOnDestroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.onResize);
    }
  }

  // --- Sélecteurs ---------------------------------------------------------
  readonly acRooms = AC_ROOMS;
  readonly indoorCatalog = INDOOR_UNITS;
  readonly outdoorCatalog = OUTDOOR_UNITS;

  readonly totalIndex = computed(() =>
    AC_ROOMS.reduce((sum, id) => sum + getIndoorUnit(this.state().rooms[id].unitId).index, 0),
  );

  readonly outdoorUnit = computed(() => getOutdoorUnit(this.state().outdoorUnitId));

  readonly compat = computed<CompatResult>(() =>
    evaluateCompatibility(this.totalIndex(), this.state().outdoorUnitId),
  );

  readonly selectedRoomState = computed(() => {
    const sel = this.state().selectedRoom;
    return sel ? this.state().rooms[sel] : null;
  });

  readonly selectedUnit = computed<IndoorUnit | null>(() => {
    const sel = this.state().selectedRoom;
    return sel ? getIndoorUnit(this.state().rooms[sel].unitId) : null;
  });

  // --- Actions ------------------------------------------------------------
  private patch(fn: (s: SimState) => SimState) {
    this.state.update(fn);
  }

  setUnit(room: RoomId, unitId: string) {
    this.patch((s) => {
      const unit = getIndoorUnit(unitId);
      const rooms = { ...s.rooms, [room]: { ...s.rooms[room], unitId } };
      // Recalcul auto du groupe extérieur si hors plage
      const total = AC_ROOMS.reduce((sum, id) => sum + getIndoorUnit(rooms[id].unitId).index, 0);
      const current = getOutdoorUnit(s.outdoorUnitId);
      const outOfRange = total < current.minIndex || total > current.maxIndex;
      return { ...s, rooms, outdoorUnitId: outOfRange ? autoOutdoorUnit(total).id : s.outdoorUnitId };
    });
  }

  setOutdoorUnit(unitId: string) {
    this.patch((s) => ({ ...s, outdoorUnitId: unitId }));
  }

  setView(view: ViewMode) {
    this.patch((s) => ({ ...s, view }));
  }

  selectRoom(room: RoomId | null) {
    this.patch((s) => ({ ...s, selectedRoom: room }));
  }

  togglePower(room: RoomId) {
    this.patch((s) => ({
      ...s,
      rooms: { ...s.rooms, [room]: { ...s.rooms[room], power: !s.rooms[room].power } },
    }));
  }

  setTargetTemp(room: RoomId, delta: number) {
    this.patch((s) => {
      const r = s.rooms[room];
      const t = Math.min(30, Math.max(16, r.targetTemp + delta));
      return { ...s, rooms: { ...s.rooms, [room]: { ...r, targetTemp: t } } };
    });
  }

  cycleMode(room: RoomId) {
    this.patch((s) => {
      const r = s.rooms[room];
      const next = MODES[(MODES.indexOf(r.mode) + 1) % MODES.length];
      return { ...s, rooms: { ...s.rooms, [room]: { ...r, mode: next } } };
    });
  }

  cycleFan(room: RoomId) {
    const speeds: FanSpeed[] = ['auto', 'low', 'mid', 'high'];
    this.patch((s) => {
      const r = s.rooms[room];
      const next = speeds[(speeds.indexOf(r.fan) + 1) % speeds.length];
      return { ...s, rooms: { ...s.rooms, [room]: { ...r, fan: next } } };
    });
  }

  toggleSwing3d(room: RoomId) {
    this.patch((s) => {
      const r = s.rooms[room];
      return { ...s, rooms: { ...s.rooms, [room]: { ...r, swing3d: !r.swing3d } } };
    });
  }

  toggleAqtivIon(room: RoomId) {
    this.patch((s) => {
      const r = s.rooms[room];
      return { ...s, rooms: { ...s.rooms, [room]: { ...r, aqtivIon: !r.aqtivIon } } };
    });
  }

  toggleSleepSense(room: RoomId) {
    this.patch((s) => {
      const r = s.rooms[room];
      return { ...s, rooms: { ...s.rooms, [room]: { ...r, sleepSense: !r.sleepSense } } };
    });
  }

  toggleUnoccupied(room: RoomId) {
    this.patch((s) => {
      const r = s.rooms[room];
      const unoccupied = !r.unoccupied;
      return {
        ...s,
        rooms: {
          ...s.rooms,
          [room]: {
            ...r,
            unoccupied,
            unoccupiedSince: unoccupied ? s.virtualMinutes : null,
            ecoActive: false,
          },
        },
      };
    });
  }

  /** Avance l'horloge virtuelle et gère le Smart Eco (600/800). */
  tick(dtSeconds: number) {
    this.patch((s) => {
      const minutes = s.virtualMinutes + dtSeconds; // 1 s réelle = 1 min virtuelle
      const rooms = { ...s.rooms };
      for (const id of AC_ROOMS) {
        const r = rooms[id];
        const unit = getIndoorUnit(r.unitId);
        if (r.unoccupied && r.unoccupiedSince !== null && unit.features.presence) {
          const waited = minutes - r.unoccupiedSince;
          if (waited >= 20 && !r.ecoActive) {
            rooms[id] = { ...r, ecoActive: true };
          }
        }
      }
      return { ...s, virtualMinutes: minutes, rooms };
    });
  }

  /** Applique la physique de la simulation (appelé chaque frame). */
  applyThermal(dtSeconds: number) {
    this.patch((s) => {
      const rooms = { ...s.rooms };
      for (const id of AC_ROOMS) {
        const r = rooms[id];
        if (!r.power) {
          // Retour lent vers la température ambiante
          const drift = (AMBIENT_TEMP - r.currentTemp) * 0.002 * dtSeconds;
          rooms[id] = { ...r, currentTemp: r.currentTemp + drift };
          continue;
        }
        const unit = getIndoorUnit(r.unitId);
        let target = r.targetTemp;
        let capacity = 1;
        if (r.ecoActive) {
          target = r.targetTemp + 2; // Smart Eco : consigne +2°C
          capacity = 0.4; // flux réduit
        }
        if (r.sleepSense) capacity *= 0.5;
        if (r.mode === 'fan') capacity *= 0.15; // ventilation sans froid
        const fanFactor = r.fan === 'low' ? 0.5 : r.fan === 'mid' ? 0.8 : r.fan === 'high' ? 1.2 : 1;
        const cooling = (target - r.currentTemp) * 0.01 * capacity * fanFactor * dtSeconds;
        const ambientPull = (AMBIENT_TEMP - r.currentTemp) * 0.001 * dtSeconds;
        rooms[id] = { ...r, currentTemp: r.currentTemp + cooling + ambientPull };
      }
      return { ...s, rooms };
    });
  }
}
