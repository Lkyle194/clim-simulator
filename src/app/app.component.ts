import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { ConfiguratorComponent } from './configurator.component';
import { RemoteComponent } from './remote.component';
import { SceneService } from './scene.service';
import { ClimateStore } from './store';

@Component({
  selector: 'app-root',
  imports: [ConfiguratorComponent, RemoteComponent],
  template: `
    <div class="flex h-dvh w-screen overflow-hidden bg-slate-950">
      <!-- Configurateur : sidebar fixe (desktop) / panneau coulissant (mobile) -->
      <app-configurator></app-configurator>

      <main class="relative flex-1 h-full min-w-0">
        <div #scene class="absolute inset-0"></div>

        <!-- En-tête -->
        <div class="absolute top-3 left-3 pointer-events-none">
          <h1 class="text-lg sm:text-xl font-bold text-white drop-shadow">Clim Simulator</h1>
          <p class="text-[11px] sm:text-xs text-slate-300">Hitachi AirHome · Tri-split · Appart F704 · v1.2</p>
        </div>

        <!-- Légende température -->
        <div class="absolute top-3 right-3 rounded-lg bg-slate-900/70 backdrop-blur px-3 py-2 text-xs pointer-events-none">
          <div class="flex items-center gap-2">
            <span class="text-slate-300">Température</span>
            <span class="w-20 sm:w-24 h-2 rounded-full" style="background: linear-gradient(90deg, #2673f2, #333d57, #f24d26)"></span>
          </div>
          <div class="flex justify-between w-20 sm:w-24 mt-1 text-[10px] text-slate-400">
            <span>Froid</span><span>Chaud</span>
          </div>
        </div>

        <!-- Bouton configurateur (mobile uniquement) -->
        <button
          class="md:hidden absolute top-16 left-3 w-11 h-11 rounded-full bg-sky-500/90 backdrop-blur text-white text-lg shadow-xl active:scale-95 transition-transform"
          (click)="store.toggleConfigurator()"
          aria-label="Ouvrir le configurateur"
        >
          ⚙️
        </button>

        <app-remote></app-remote>
      </main>
    </div>
  `,
})
export class AppComponent implements OnInit, OnDestroy {
  @ViewChild('scene') sceneRef!: ElementRef<HTMLDivElement>;
  private scene = inject(SceneService);
  store = inject(ClimateStore);

  ngOnInit() {
    this.scene.attach(this.sceneRef.nativeElement);
  }

  ngOnDestroy() {
    this.scene.detach();
  }
}
