import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { ConfiguratorComponent } from './configurator.component';
import { RemoteComponent } from './remote.component';
import { SceneService } from './scene.service';
import { ClimateStore } from './store';

@Component({
  selector: 'app-root',
  imports: [ConfiguratorComponent, RemoteComponent],
  template: `
    <div class="flex h-screen w-screen overflow-hidden">
      <app-configurator></app-configurator>

      <main class="relative flex-1 h-full">
        <div #scene class="absolute inset-0"></div>

        <!-- En-tête -->
        <div class="absolute top-4 left-4 pointer-events-none">
          <h1 class="text-xl font-bold text-white drop-shadow">Clim Simulator</h1>
          <p class="text-xs text-slate-300">Hitachi AirHome · Tri-split · Appart F704 · v1.1</p>
        </div>

        <!-- Légende température -->
        <div class="absolute top-4 right-4 rounded-lg bg-slate-900/70 backdrop-blur px-3 py-2 text-xs pointer-events-none">
          <div class="flex items-center gap-2">
            <span class="text-slate-300">Température</span>
            <span class="w-24 h-2 rounded-full" style="background: linear-gradient(90deg, #2673f2, #333d57, #f24d26)"></span>
          </div>
          <div class="flex justify-between w-24 mt-1 text-[10px] text-slate-400">
            <span>Froid</span><span>Chaud</span>
          </div>
        </div>

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
