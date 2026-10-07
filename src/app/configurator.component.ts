import { Component, inject } from '@angular/core';
import { ClimateStore } from './store';
import {
  AC_ROOMS,
  OUTDOOR_UNITS,
  RoomId,
  SeriesId,
  getIndoorUnit,
} from './models';

const SERIES: SeriesId[] = ['400', '600', '800'];
const POWERS = [2.5, 3.5];

@Component({
  selector: 'app-configurator',
  imports: [],
  template: `
    <!-- Overlay mobile (masqué sur desktop) -->
    @if (store.mobile()) {
      <div
        class="md:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm transition-opacity"
        [class.opacity-0]="!store.configuratorOpen()"
        [class.pointer-events-none]="!store.configuratorOpen()"
        (click)="store.closeConfigurator()"
      ></div>
    }

    <aside
      class="fixed md:static z-40 inset-y-0 left-0 w-[85vw] max-w-[320px] md:w-80 md:max-w-none shrink-0 h-full overflow-y-auto bg-slate-900/95 md:bg-slate-900/80 backdrop-blur border-r border-slate-700/50 p-4 space-y-4 text-sm transition-transform duration-200"
      [class.-translate-x-full]="store.mobile() && !store.configuratorOpen()"
      [class.translate-x-0]="!store.mobile() || store.configuratorOpen()"
    >
      <!-- Titre + fermeture (mobile) -->
      <div class="flex items-start justify-between">
        <div>
          <h2 class="text-lg font-bold text-sky-300">Hitachi AirHome</h2>
          <p class="text-slate-400 text-xs">Simulateur tri-split — Appart F704</p>
        </div>
        <button
          class="md:hidden text-slate-400 hover:text-white text-lg p-1"
          (click)="store.closeConfigurator()"
          aria-label="Fermer le configurateur"
        >
          ✕
        </button>
      </div>

      <!-- Sélecteur de modèle par pièce (série + puissance indépendantes) -->
      <div class="space-y-3">
        <h3 class="font-semibold text-slate-200 uppercase text-xs tracking-wider">Unités intérieures</h3>
        @for (room of store.acRooms; track room) {
          <div
            class="rounded-lg border p-3 cursor-pointer transition-colors"
            [class.border-sky-400]="store.sim().selectedRooms.includes(room)"
            [class.border-slate-700]="!store.sim().selectedRooms.includes(room)"
            [class.bg-slate-800/60]="store.sim().selectedRooms.includes(room)"
            (click)="store.selectRoom(room)"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="font-medium">{{ roomName(room) }}</span>
              <span class="text-xs text-slate-400">{{ getUnit(room).seriesName }}</span>
            </div>
            <!-- Série (400 / 600 / 800) -->
            <div class="grid grid-cols-3 gap-1 mb-1">
              @for (s of series; track s) {
                <button
                  class="text-xs rounded px-2 py-1.5 transition-colors"
                  [class.bg-sky-500]="getUnit(room).series === s"
                  [class.text-white]="getUnit(room).series === s"
                  [class.bg-slate-700/60]="getUnit(room).series !== s"
                  [class.text-slate-300]="getUnit(room).series !== s"
                  (click)="$event.stopPropagation(); store.setSeries(room, s)"
                >
                  {{ s }}
                </button>
              }
            </div>
            <!-- Puissance (2.5 / 3.5 kW) -->
            <div class="grid grid-cols-2 gap-1">
              @for (p of powers; track p) {
                <button
                  class="text-xs rounded px-2 py-1.5 transition-colors"
                  [class.bg-sky-500]="getUnit(room).powerKw === p"
                  [class.text-white]="getUnit(room).powerKw === p"
                  [class.bg-slate-700/60]="getUnit(room).powerKw !== p"
                  [class.text-slate-300]="getUnit(room).powerKw !== p"
                  (click)="$event.stopPropagation(); store.setPower(room, p)"
                >
                  {{ p }} kW
                </button>
              }
            </div>
            <div class="mt-2 text-xs text-slate-400">
              Indice : <span class="text-slate-200 font-mono">{{ getUnit(room).index }}</span>
              <span class="mx-1">·</span>
              {{ getUnit(room).ref }}
            </div>
          </div>
        }
      </div>

      <!-- Groupe extérieur -->
      <div class="space-y-2">
        <h3 class="font-semibold text-slate-200 uppercase text-xs tracking-wider">Groupe extérieur</h3>
        <div class="grid grid-cols-3 gap-1">
          @for (u of store.outdoorCatalog; track u.id) {
            <button
              class="text-xs rounded px-2 py-1.5 transition-colors"
              [class.bg-sky-500]="store.sim().outdoorUnitId === u.id"
              [class.text-white]="store.sim().outdoorUnitId === u.id"
              [class.bg-slate-700/60]="store.sim().outdoorUnitId !== u.id"
              [class.text-slate-300]="store.sim().outdoorUnitId !== u.id"
              (click)="store.setOutdoorUnit(u.id)"
            >
              {{ u.nominalKw }} kW
            </button>
          }
        </div>
        <div class="text-xs text-slate-400">
          {{ store.outdoorUnit().ref }}
          <span class="text-amber-300/90">· {{ store.outdoorUnit().dbMax }} dB(A) max</span>
        </div>
      </div>

      <!-- Indicateur de compatibilité -->
      <div
        class="rounded-lg border p-3"
        [class.border-green-500]="store.compat().status === 'green'"
        [class.bg-green-500/10]="store.compat().status === 'green'"
        [class.border-orange-400]="store.compat().status === 'orange'"
        [class.bg-orange-500/10]="store.compat().status === 'orange'"
        [class.border-red-500]="store.compat().status === 'red'"
        [class.bg-red-500/10]="store.compat().status === 'red'"
        [class.border-sky-400]="store.compat().status === 'info'"
        [class.bg-sky-500/10]="store.compat().status === 'info'"
      >
        <div class="flex items-center gap-2 mb-1">
          <span
            class="w-3 h-3 rounded-full inline-block shrink-0"
            [class.bg-green-400]="store.compat().status === 'green'"
            [class.bg-orange-400]="store.compat().status === 'orange'"
            [class.bg-red-500]="store.compat().status === 'red'"
            [class.bg-sky-400]="store.compat().status === 'info'"
          ></span>
          <span class="font-semibold">
            Indice total : {{ store.totalIndex() }}
            <span class="text-slate-400 font-normal">
              (plage {{ store.outdoorUnit().minIndex }}–{{ store.outdoorUnit().maxIndex }})
            </span>
          </span>
        </div>
        <p class="text-xs leading-relaxed">{{ store.compat().message }}</p>
      </div>

      <!-- Vue -->
      <div class="space-y-2">
        <h3 class="font-semibold text-slate-200 uppercase text-xs tracking-wider">Caméra</h3>
        <div class="grid grid-cols-2 gap-1">
          <button
            class="text-xs rounded px-2 py-1.5"
            [class.bg-sky-500]="store.sim().view === 'top'"
            [class.text-white]="store.sim().view === 'top'"
            [class.bg-slate-700/60]="store.sim().view !== 'top'"
            [class.text-slate-300]="store.sim().view !== 'top'"
            (click)="store.setView('top')"
          >
            Vue 2D (dessus)
          </button>
          <button
            class="text-xs rounded px-2 py-1.5"
            [class.bg-sky-500]="store.sim().view === 'iso'"
            [class.text-white]="store.sim().view === 'iso'"
            [class.bg-slate-700/60]="store.sim().view !== 'iso'"
            [class.text-slate-300]="store.sim().view !== 'iso'"
            (click)="store.setView('iso')"
          >
            Vue 3D (iso)
          </button>
        </div>
        <div class="grid grid-cols-2 gap-1">
          <button
            class="text-xs rounded px-2 py-1.5"
            [class.bg-amber-400]="store.sim().dayNight === 'day'"
            [class.text-slate-900]="store.sim().dayNight === 'day'"
            [class.bg-slate-700/60]="store.sim().dayNight !== 'day'"
            [class.text-slate-300]="store.sim().dayNight !== 'day'"
            (click)="store.setDayNight('day')"
          >
            ☀️ Jour
          </button>
          <button
            class="text-xs rounded px-2 py-1.5"
            [class.bg-indigo-500]="store.sim().dayNight === 'night'"
            [class.text-white]="store.sim().dayNight === 'night'"
            [class.bg-slate-700/60]="store.sim().dayNight !== 'night'"
            [class.text-slate-300]="store.sim().dayNight !== 'night'"
            (click)="store.setDayNight('night')"
          >
            🌙 Nuit
          </button>
        </div>
      </div>

      <p class="text-[11px] text-slate-500 leading-relaxed">
        @if (store.mobile()) {
          Glissez pour orbiter · pincez pour zoomer.
          Cliquez sur une pièce pour la sélectionner (multi-sélection possible).
        } @else {
          Glissez la souris pour orbiter · molette pour zoomer · clic droit pour déplacer.
          Cliquez sur une pièce pour la sélectionner (multi-sélection possible).
        }
      </p>
    </aside>
  `,
})
export class ConfiguratorComponent {
  store = inject(ClimateStore);
  series: SeriesId[] = SERIES;
  powers = POWERS;

  roomName(id: RoomId): string {
    const names: Record<string, string> = {
      sejour: 'Séjour & Cuisine',
      ch1: 'Chambre 1',
      ch2: 'Chambre 2',
      sdb: 'Salle de bains',
      entree: 'Entrée',
      terrasse: 'Terrasse',
    };
    return names[id] ?? id;
  }

  getUnit(room: RoomId) {
    return getIndoorUnit(this.store.sim().rooms[room].unitId);
  }
}
