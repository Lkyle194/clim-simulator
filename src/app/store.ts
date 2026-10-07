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
  SeriesId,
  autoOutdoorUnit,
  evaluateCompatibility,
  getIndoorUnit,
  getOutdoorUnit,
} from './models';

export type Mode = 'cool' | 'heat' | 'fan' | 'dry';
export type FanSpeed = 'auto' | 'low' | 'mid' | 'high';
export type ViewMode = 'top' | 'iso';
export type DayNight = 'day' | 'night';

export interface RoomState {
  id: RoomId;
  unitId: string;
  currentTemp: number;
  targetTemp: number;
  power: boolean;
  mode: Mode;
  fan: FanSpeed;
  swing3d: boolean;
  aqtivIon: boolean;
  sleepSense: boolean;
  unoccupied: boolean;
  unoccupiedSince: number | null;
  ecoActive: boolean;
}

export interface SimState {
  rooms: Record<RoomId, RoomState>;
  outdoorUnitId: string;
  view: ViewMode;
  dayNight: DayNight;
  selectedRooms: RoomId[];
  timeScale: number;
  ambientTemp: number;
  virtualMinutes: number;
}

const MODES: Mode[] = ['cool', 'heat', 'fan', 'dry'];
const ALL_IDS: RoomId[] = ['sejour', 'cuisine', 'sdb', 'ch1', 'ch2', 'entree', 'terrasse'];

function makeRoom(id: RoomId, unitId: string): RoomState {
  return {
    id,
    unitId,
    currentTemp: AMBIENT_TEMP,
    targetTemp: 22,
    power: id === 'sejour' || id === 'ch1' || id === 'ch2',
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

function initialRooms(): Record<RoomId, RoomState> {
  const rooms = {} as Record<RoomId, RoomState>;
  for (const id of ALL_IDS) {
    // Défauts : AirHome 600 (vj35 séjour, vj25 chambres)
    const unitId =
      id === 'sejour' ? 'vj35' :
      id === 'ch1' || id === 'ch2' ? 'vj25' :
      'dj25';
    rooms[id] = makeRoom(id, unitId);
  }
  return rooms;
}

@Injectable({ providedIn: 'root' })
export class ClimateStore implements OnDestroy {
  private readonly state = signal<SimState>({
    rooms: initialRooms(),
    outdoorUnitId: 'g68',
    view: 'iso',
    dayNight: 'day',
    selectedRooms: ['sejour'],
    timeScale: 1,
    ambientTemp: AMBIENT_TEMP,
    virtualMinutes: 0,
  });

  readonly sim = this.state.asReadonly();

  // --- Responsive ---
  readonly mobile = signal(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
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

  // --- Sélecteurs ---
  readonly acRooms = AC_ROOMS;
  readonly indoorCatalog = INDOOR_UNITS;
  readonly outdoorCatalog = OUTDOOR_UNITS;

  readonly selectedRooms = computed(() => this.state().selectedRooms);
  readonly selectedRoom = computed(() => this.state().selectedRooms[0] ?? null);

  readonly totalIndex = computed(() =>
    AC_ROOMS.reduce((sum, id) => sum + getIndoorUnit(this.state().rooms[id].unitId).index, 0),
  );

  readonly outdoorUnit = computed(() => getOutdoorUnit(this.state().outdoorUnitId));

  readonly compat = computed<CompatResult>(() =>
    evaluateCompatibility(this.totalIndex(), this.state().outdoorUnitId),
  );

  readonly selectedRoomState = computed(() => {
    const sel = this.selectedRoom();
    return sel ? this.state().rooms[sel] : null;
  });

  readonly selectedUnit = computed<IndoorUnit | null>(() => {
    const sel = this.selectedRoom();
    return sel ? getIndoorUnit(this.state().rooms[sel].unitId) : null;
  });

  // --- Actions ---
  private patch(fn: (s: SimState) => SimState) {
    this.state.update(fn);
  }

  // --- Sélection multi ---
  toggleRoomSelection(id: RoomId) {
    this.patch((s) => {
      const has = s.selectedRooms.includes(id);
      return {
        ...s,
        selectedRooms: has ? s.selectedRooms.filter((r) => r !== id) : [...s.selectedRooms, id],
      };
    });
  }

  selectRoom(id: RoomId | null) {
    this.patch((s) => ({ ...s, selectedRooms: id === null ? [] : [id] }));
  }

  clearSelection() {
    this.patch((s) => ({ ...s, selectedRooms: [] }));
  }

  // --- Config unités ---
  setUnit(room: RoomId, unitId: string) {
    this.patch((s) => {
      const rooms = { ...s.rooms, [room]: { ...s.rooms[room], unitId } };
      const total = AC_ROOMS.reduce((sum, id) => sum + getIndoorUnit(rooms[id].unitId).index, 0);
      const current = getOutdoorUnit(s.outdoorUnitId);
      const outOfRange = total < current.minIndex || total > current.maxIndex;
      return { ...s, rooms, outdoorUnitId: outOfRange ? autoOutdoorUnit(total).id : s.outdoorUnitId };
    });
  }

  setSeries(room: RoomId, series: SeriesId) {
    const current = getIndoorUnit(this.state().rooms[room].unitId);
    const match = INDOOR_UNITS.find((u) => u.series === series && u.powerKw === current.powerKw);
    if (match) this.setUnit(room, match.id);
  }

  setPower(room: RoomId, powerKw: number) {
    const current = getIndoorUnit(this.state().rooms[room].unitId);
    const match = INDOOR_UNITS.find((u) => u.series === current.series && u.powerKw === powerKw);
    if (match) this.setUnit(room, match.id);
  }

  setOutdoorUnit(unitId: string) {
    this.patch((s) => ({ ...s, outdoorUnitId: unitId }));
  }

  setView(view: ViewMode) {
    this.patch((s) => ({ ...s, view }));
  }

  setDayNight(dn: DayNight) {
    this.patch((s) => ({ ...s, dayNight: dn }));
  }

  setTimeScale(v: number) {
    this.patch((s) => ({ ...s, timeScale: v }));
  }

  setAmbientTemp(v: number) {
    this.patch((s) => ({ ...s, ambientTemp: v }));
  }

  // --- Télécommande (agit sur TOUTES les pièces sélectionnées) ---
  private applyToSelected(fn: (r: RoomState) => RoomState) {
    this.patch((s) => {
      const rooms = { ...s.rooms };
      for (const id of s.selectedRooms) {
        rooms[id] = fn(rooms[id]);
      }
      return { ...s, rooms };
    });
  }

  setTargetTemp(delta: number) {
    this.applyToSelected((r) => ({
      ...r,
      targetTemp: Math.min(30, Math.max(16, r.targetTemp + delta)),
    }));
  }

  togglePower() {
    this.applyToSelected((r) => ({ ...r, power: !r.power }));
  }

  cycleMode() {
    this.applyToSelected((r) => {
      const next = MODES[(MODES.indexOf(r.mode) + 1) % MODES.length];
      return { ...r, mode: next };
    });
  }

  cycleFan() {
    const speeds: FanSpeed[] = ['auto', 'low', 'mid', 'high'];
    this.applyToSelected((r) => {
      const next = speeds[(speeds.indexOf(r.fan) + 1) % speeds.length];
      return { ...r, fan: next };
    });
  }

  toggleSwing3d() {
    this.applyToSelected((r) => ({ ...r, swing3d: !r.swing3d }));
  }

  toggleAqtivIon() {
    this.applyToSelected((r) => ({ ...r, aqtivIon: !r.aqtivIon }));
  }

  toggleSleepSense() {
    this.applyToSelected((r) => ({ ...r, sleepSense: !r.sleepSense }));
  }

  toggleUnoccupied() {
    this.applyToSelected((r) => {
      const unoccupied = !r.unoccupied;
      return {
        ...r,
        unoccupied,
        unoccupiedSince: unoccupied ? this.state().virtualMinutes : null,
        ecoActive: false,
      };
    });
  }

  // --- Simulation ---
  tick(dtSeconds: number) {
    this.patch((s) => {
      const minutes = s.virtualMinutes + dtSeconds * s.timeScale;
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

  applyThermal(dtSeconds: number) {
    this.patch((s) => {
      const vdt = dtSeconds * s.timeScale;
      const ambient = s.ambientTemp;
      const rooms = { ...s.rooms };
      for (const id of AC_ROOMS) {
        const r = rooms[id];
        if (!r.power) {
          const drift = (ambient - r.currentTemp) * 0.002 * vdt;
          rooms[id] = { ...r, currentTemp: r.currentTemp + drift };
          continue;
        }
        const unit = getIndoorUnit(r.unitId);
        let target = r.targetTemp;
        let capacity = 1;
        if (r.ecoActive) {
          target = r.targetTemp + 2;
          capacity = 0.4;
        }
        if (r.sleepSense) capacity *= 0.5;
        if (r.mode === 'fan') capacity *= 0.15;
        const fanFactor = r.fan === 'low' ? 0.5 : r.fan === 'mid' ? 0.8 : r.fan === 'high' ? 1.2 : 1;
        const cooling = (target - r.currentTemp) * 0.01 * capacity * fanFactor * vdt;
        const ambientPull = (ambient - r.currentTemp) * 0.001 * vdt;
        rooms[id] = { ...r, currentTemp: r.currentTemp + cooling + ambientPull };
      }
      return { ...s, rooms };
    });
  }
}
