import { Component, inject } from '@angular/core';
import { ClimateStore } from './store';
import {
  AC_ROOMS,
  INDOOR_UNITS,
  OUTDOOR_UNITS,
  RoomId,
  getIndoorUnit,
} from './models';

@Component({
  selector: 'app-configurator',
  imports: [],
  template: `
    <aside class="w-80 shrink-0 h-full overflow-y-auto bg-slate-900/80 backdrop-blur border-r border-slate-700/50 p-4 space-y-4 text-sm">
      <div>
        <h2 class="text-lg font-bold text-sky-300">Hitachi AirHome</h2>
        <p class="text-slate-400 text-xs">Simulateur tri-split — Appart F704</p>
      </div>

      <!-- Sélecteur de modèle par pièce -->
      <div class="space-y-3">
        <h3 class="font-semibold text-slate-200 uppercase text-xs tracking-wider">Unités intérieures</h3>
        @for (room of store.acRooms; track room) {
          <div
            class="rounded-lg border p-3 cursor-pointer transition-colors"
            [class.border-sky-400]="store.sim().selectedRoom === room"
            [class.border-slate-700]="store.sim().selectedRoom !== room"
            [class.bg-slate-800/60]="store.sim().selectedRoom === room"
            (click)="store.selectRoom(room)"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="font-medium">{{ roomName(room) }}</span>
              <span class="text-xs text-slate-400">{{ getUnit(room).seriesName }}</span>
            </div>
            <div class="grid grid-cols-3 gap-1">
              @for (u of store.indoorCatalog; track u.id) {
                <button
                  class="text-xs rounded px-2 py-1.5 transition-colors"
                  [class.bg-sky-500]="store.sim().rooms[room].unitId === u.id"
                  [class.text-white]="store.sim().rooms[room].unitId === u.id"
                  [class.bg-slate-700/60]="store.sim().rooms[room].unitId !== u.id"
                  [class.text-slate-300]="store.sim().rooms[room].unitId !== u.id"
                  (click)="$event.stopPropagation(); store.setUnit(room, u.id)"
                >
                  {{ u.series }} · {{ u.powerKw }}kW
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
            class="w-3 h-3 rounded-full inline-block"
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
      </div>

      <p class="text-[11px] text-slate-500 leading-relaxed">
        Glissez la souris pour orbiter · molette pour zoomer · clic droit pour déplacer.
        Cliquez sur une pièce pour ouvrir sa télécommande.
      </p>
    </aside>
  `,
})
export class ConfiguratorComponent {
  store = inject(ClimateStore);

  roomName(id: RoomId): string {
    const names: Record<string, string> = {
      sejour: 'Séjour',
      ch1: 'Chambre 1',
      ch2: 'Chambre 2',
      cuisine: 'Cuisine',
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
