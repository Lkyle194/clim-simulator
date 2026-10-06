import { Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ClimateStore, Mode, FanSpeed } from './store';
import { RoomId, getIndoorUnit } from './models';

const MODE_LABEL: Record<Mode, string> = {
  cool: '❄️ Refroidir',
  heat: '🔥 Chauffer',
  fan: '🌀 Ventiler',
  dry: '💧 Déshumidifier',
};

const FAN_LABEL: Record<FanSpeed, string> = {
  auto: 'Auto',
  low: 'Bas',
  mid: 'Moyen',
  high: 'Haut',
};

@Component({
  selector: 'app-remote',
  imports: [DecimalPipe],
  template: `
    @if (room(); as r) {
      <div
        class="absolute bottom-3 left-3 right-3 md:left-auto md:right-6 md:bottom-6 md:w-72 rounded-2xl border border-slate-600/60 bg-slate-900/90 backdrop-blur-md shadow-2xl p-3 md:p-4 space-y-3 text-sm"
      >
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-bold text-sky-300">{{ roomName(r.id) }}</h3>
            <p class="text-[11px] text-slate-400">{{ unit().seriesName }} · {{ unit().ref }}</p>
          </div>
          <button
            class="text-xs text-slate-400 hover:text-white"
            (click)="store.selectRoom(null)"
          >
            ✕
          </button>
        </div>

        <!-- Température -->
        <div class="flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2">
          <button
            class="w-10 h-10 md:w-9 md:h-9 rounded-full bg-slate-700 hover:bg-slate-600 text-xl"
            (click)="store.setTargetTemp(r.id, -1)"
          >
            −
          </button>
          <div class="text-center">
            <div class="text-2xl md:text-3xl font-bold tabular-nums" [class.text-sky-300]="r.power" [class.text-slate-500]="!r.power">
              {{ r.targetTemp | number:'1.0-0' }}°C
            </div>
            <div class="text-[11px] text-slate-400">
              Actuelle : {{ r.currentTemp | number:'1.1-1' }}°C
            </div>
          </div>
          <button
            class="w-10 h-10 md:w-9 md:h-9 rounded-full bg-slate-700 hover:bg-slate-600 text-xl"
            (click)="store.setTargetTemp(r.id, 1)"
          >
            +
          </button>
        </div>

        <!-- Power + Mode + Vitesse -->
        <div class="grid grid-cols-2 gap-2">
          <button
            class="rounded-lg py-2 font-semibold transition-colors"
            [class.bg-green-500]="r.power"
            [class.bg-slate-700]="!r.power"
            (click)="store.togglePower(r.id)"
          >
            {{ r.power ? '● Marche' : '○ Arrêt' }}
          </button>
          <button
            class="rounded-lg py-2 bg-slate-700 hover:bg-slate-600"
            (click)="store.cycleMode(r.id)"
          >
            {{ modeLabel(r.mode) }}
          </button>
          <button
            class="rounded-lg py-2 bg-slate-700 hover:bg-slate-600"
            (click)="store.cycleFan(r.id)"
          >
            Ventilo : {{ fanLabel(r.fan) }}
          </button>
          <!-- Balayage 3D : 600/800 uniquement -->
          @if (unit().features.swing3d) {
            <button
              class="rounded-lg py-2 transition-colors"
              [class.bg-sky-500]="r.swing3d"
              [class.bg-slate-700]="!r.swing3d"
              (click)="store.toggleSwing3d(r.id)"
            >
              Balayage 3D
            </button>
          } @else {
            <div class="rounded-lg py-2 bg-slate-800/40 text-slate-500 text-xs flex items-center justify-center">
              Balayage 3D indispo (400)
            </div>
          }
        </div>

        <!-- Fonctions 800 -->
        @if (unit().series === '800') {
          <div class="grid grid-cols-2 gap-2">
            <button
              class="rounded-lg py-2 text-xs transition-colors"
              [class.bg-indigo-500]="r.aqtivIon"
              [class.bg-slate-700]="!r.aqtivIon"
              (click)="store.toggleAqtivIon(r.id)"
            >
              AQtiv-Ion
            </button>
            <button
              class="rounded-lg py-2 text-xs transition-colors"
              [class.bg-indigo-500]="r.sleepSense"
              [class.bg-slate-700]="!r.sleepSense"
              (click)="store.toggleSleepSense(r.id)"
            >
              Sleep Sense
            </button>
          </div>
        }

        <!-- Présence / Smart Eco (600/800) -->
        @if (unit().features.presence) {
          <button
            class="w-full rounded-lg py-2 text-xs transition-colors"
            [class.bg-amber-500]="r.unoccupied"
            [class.bg-slate-700]="!r.unoccupied"
            (click)="store.toggleUnoccupied(r.id)"
          >
            {{ r.unoccupied ? '👻 Pièce inoccupée' : '👤 Pièce occupée' }}
          </button>
          @if (r.ecoActive) {
            <div class="text-xs text-amber-300 text-center">
              🌿 Smart Eco actif — consigne +2°C, flux réduit
            </div>
          }
        }
      </div>
    }
  `,
})
export class RemoteComponent {
  store = inject(ClimateStore);

  room() {
    return this.store.selectedRoomState();
  }

  unit() {
    return this.store.selectedUnit()!;
  }

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

  modeLabel(m: Mode) {
    return MODE_LABEL[m];
  }

  fanLabel(f: FanSpeed) {
    return FAN_LABEL[f];
  }
}
