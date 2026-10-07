// Base de données métier — Gamme Hitachi AirHome & compatibilité multisplit
// Source : hitachi_specs.md

export type SeriesId = '400' | '600' | '800';

export interface UnitFeatures {
  swing3d: boolean; // balayage 3D motorisé
  presence: boolean; // détection de présence / Smart Eco
  aqtivIon: boolean; // particules ionisées
  sleepSense: boolean; // mode nuit
  frostWash: boolean; // dégivrage
}

export interface IndoorUnit {
  id: string;
  series: SeriesId;
  seriesName: string;
  ref: string;
  powerKw: number;
  index: number; // indice de puissance (25 / 35)
  seer: number;
  scop: number;
  db: number; // niveau sonore
  features: UnitFeatures;
}

export const INDOOR_UNITS: IndoorUnit[] = [
  {
    id: 'dj25', series: '400', seriesName: 'AirHome 400', ref: 'RAK-DJ25RHAE',
    powerKw: 2.5, index: 25, seer: 7.5, scop: 4.6, db: 24,
    features: { swing3d: false, presence: false, aqtivIon: false, sleepSense: false, frostWash: true },
  },
  {
    id: 'dj35', series: '400', seriesName: 'AirHome 400', ref: 'RAK-DJ35RHAE',
    powerKw: 3.5, index: 35, seer: 7.5, scop: 4.6, db: 26,
    features: { swing3d: false, presence: false, aqtivIon: false, sleepSense: false, frostWash: true },
  },
  {
    id: 'vj25', series: '600', seriesName: 'AirHome 600', ref: 'RAK-VJ25RHAE',
    powerKw: 2.5, index: 25, seer: 8.5, scop: 4.9, db: 19,
    features: { swing3d: true, presence: true, aqtivIon: false, sleepSense: false, frostWash: true },
  },
  {
    id: 'vj35', series: '600', seriesName: 'AirHome 600', ref: 'RAK-VJ35RHAE',
    powerKw: 3.5, index: 35, seer: 8.5, scop: 4.9, db: 21,
    features: { swing3d: true, presence: true, aqtivIon: false, sleepSense: false, frostWash: true },
  },
  {
    id: 'xj25', series: '800', seriesName: 'AirHome 800', ref: 'RAK-XJ25RHAE',
    powerKw: 2.5, index: 25, seer: 9.5, scop: 5.2, db: 20,
    features: { swing3d: true, presence: true, aqtivIon: true, sleepSense: true, frostWash: true },
  },
  {
    id: 'xj35', series: '800', seriesName: 'AirHome 800', ref: 'RAK-XJ35RHAE',
    powerKw: 3.5, index: 35, seer: 9.5, scop: 5.2, db: 22,
    features: { swing3d: true, presence: true, aqtivIon: true, sleepSense: true, frostWash: true },
  },
];

export function getIndoorUnit(id: string): IndoorUnit {
  return INDOOR_UNITS.find((u) => u.id === id) ?? INDOOR_UNITS[0];
}

// ---------------------------------------------------------------------------
// Unités extérieures multisplits (série RAM-G)
// ---------------------------------------------------------------------------

export interface OutdoorUnit {
  id: string;
  ref: string;
  nominalKw: number;
  minIndex: number;
  maxIndex: number;
  dbMax: number; // niveau sonore max (dB(A)) — fiche technique constructeur
}

export const OUTDOOR_UNITS: OutdoorUnit[] = [
  { id: 'g55', ref: 'RAM-G55N3HAE', nominalKw: 5.5, minIndex: 50, maxIndex: 75, dbMax: 61 },
  { id: 'g68', ref: 'RAM-G68N3HAE', nominalKw: 6.8, minIndex: 75, maxIndex: 95, dbMax: 63 },
  { id: 'g75', ref: 'RAM-G75N3HAE', nominalKw: 7.5, minIndex: 90, maxIndex: 110, dbMax: 66 },
];

export function getOutdoorUnit(id: string): OutdoorUnit {
  return OUTDOOR_UNITS.find((u) => u.id === id) ?? OUTDOOR_UNITS[1];
}

export type CompatStatus = 'green' | 'orange' | 'red' | 'info';

export interface CompatResult {
  unit: OutdoorUnit;
  status: CompatStatus;
  message: string;
}

/**
 * Évalue la combinaison des indices intérieurs vs la capacité du groupe.
 * - Dans la plage  → vert (100% d'efficacité)
 * - Au-dessus      → orange (foisonnement) / rouge (sous-puissance)
 * - En dessous     → info (surdimensionné)
 */
export function evaluateCompatibility(totalIndex: number, unitId: string): CompatResult {
  const unit = getOutdoorUnit(unitId);
  if (totalIndex >= unit.minIndex && totalIndex <= unit.maxIndex) {
    return {
      unit,
      status: 'green',
      message: 'Configuration optimale — les simulations tournent à 100% d’efficacité.',
    };
  }
  if (totalIndex > unit.maxIndex) {
    const over = totalIndex - unit.maxIndex;
    if (over <= 15) {
      return {
        unit,
        status: 'orange',
        message:
          'Attention, coefficient de foisonnement élevé. Si les 3 pièces fonctionnent à 100% en même temps, la puissance restituée baissera.',
      };
    }
    return {
      unit,
      status: 'red',
      message: 'Risque de sous-puissance en simultané : la somme des indices dépasse trop la capacité du groupe.',
    };
  }
  return {
    unit,
    status: 'info',
    message: 'Groupe surdimensionné, coût initial plus élevé sans bénéfice thermique majeur.',
  };
}

/** Choisit automatiquement le groupe dont la plage contient l'indice total. */
export function autoOutdoorUnit(totalIndex: number): OutdoorUnit {
  const inRange = OUTDOOR_UNITS.find((u) => totalIndex >= u.minIndex && totalIndex <= u.maxIndex);
  if (inRange) return inRange;
  return OUTDOOR_UNITS.reduce((best, u) => {
    const d = totalIndex < u.minIndex ? u.minIndex - totalIndex : totalIndex - u.maxIndex;
    const db = best ? (totalIndex < best.minIndex ? best.minIndex - totalIndex : totalIndex - best.maxIndex) : Infinity;
    return d < db ? u : best;
  }, null as OutdoorUnit | null) ?? OUTDOOR_UNITS[1];
}

// ---------------------------------------------------------------------------
// Pièces de l'appartement (géométrie du plan.png, en mètres)
// Origine en haut à gauche du plan, x → droite, y → bas.
// Le contour global n'est PAS un rectangle : escalier à gauche (sdb décalée),
// salle de bains en L (renfoncement), côté droit oblique (terrasse).
// ---------------------------------------------------------------------------

export type RoomId = 'sejour' | 'cuisine' | 'sdb' | 'ch1' | 'ch2' | 'entree' | 'terrasse';

export interface RoomDef {
  id: RoomId;
  name: string;
  area: number; // m² (valeurs officielles du plan)
  /** Centre de la pièce (m) — repère cartésien strict, origine = centre de l'Entrée. */
  rect: { x: number; z: number; w: number; d: number };
  hasAc: boolean;
  /** Contour polygonal (m, coordonnées absolues x/z) pour les pièces non rectangulaires. */
  polygon?: { x: number; z: number }[];
}

// ---------------------------------------------------------------------------
// Repère cartésien strict (X, Z) — topology_threejs.md
// Origine (0, 0) = centre de l'Entrée. X → droite, Z → profondeur (bas du
// plan), Y = hauteur des murs. 1 unité Three.js = 1 mètre.
// Les positions ci-dessous sont les CENTRES des pièces.
// ---------------------------------------------------------------------------
export const ROOMS: RoomDef[] = [
  // Entrée : origine du repère
  { id: 'entree', name: 'Entrée', area: 3.9, rect: { x: 0, z: 0, w: 2.1, d: 1.8 }, hasAc: false },
  // Séjour : pièce principale, à gauche (forme le « L » global)
  { id: 'sejour', name: 'Séjour', area: 16.02, rect: { x: -3.5, z: -2, w: 4.5, d: 6 }, hasAc: true },
  // Cuisine : encastrée dans le séjour (espace ouvert, pas de mur séparateur)
  { id: 'cuisine', name: 'Cuisine', area: 7.33, rect: { x: -3.5, z: 2, w: 2.0, d: 3.6 }, hasAc: false },
  // Salle de bains
  { id: 'sdb', name: 'Salle de bains', area: 5.56, rect: { x: -1, z: 3, w: 1.5, d: 2.0 }, hasAc: false },
  // Chambres empilées à droite
  { id: 'ch2', name: 'Chambre 2', area: 11.05, rect: { x: 2.5, z: -1.5, w: 2.7, d: 4.4 }, hasAc: true },
  { id: 'ch1', name: 'Chambre 1', area: 12.43, rect: { x: 2.5, z: 4, w: 2.9, d: 4.1 }, hasAc: true },
  // Terrasse : enveloppe la façade (haut + droite), bord extérieur en biais.
  // Contour : bord intérieur suit l'appartement, bord extérieur décalé + coupé à 45°.
  {
    id: 'terrasse', name: 'Terrasse', area: 31.91, rect: { x: 0, z: 0, w: 0, d: 0 }, hasAc: false,
    polygon: [
      { x: -5.75, z: -5 },    // intérieur haut-gauche (séjour)
      { x: -1.25, z: -5 },    // intérieur haut, fin séjour
      { x: -1.25, z: -3.7 },  // marche vers ch2
      { x: 3.85, z: -3.7 },   // intérieur haut-droite (ch2)
      { x: 3.95, z: 0.7 },    // marche vers ch1
      { x: 3.95, z: 6.05 },   // intérieur bas-droite (ch1)
      { x: 6.45, z: 6.05 },   // extérieur bas-droite
      { x: 6.45, z: -1.0 },   // extérieur droite
      { x: 3.0, z: -4.5 },    // coin extérieur en biais (45°)
      { x: -5.75, z: -7.5 },  // extérieur haut (en biais)
    ],
  },
];

export const AC_ROOMS: RoomId[] = ['sejour', 'ch1', 'ch2'];

export const WALL_HEIGHT = 2.6;
export const WALL_THICKNESS = 0.15;

/**
 * Unités intérieures — placement strict (topology_threejs.md).
 * facing = rotation Y du groupe : le long du split suit le mur, le flux souffle
 * dans la pièce. (0 = flux +Z, -π/2 = flux -X, +π/2 = flux +X)
 */
export const AC_POSITIONS: Record<string, { x: number; z: number; facing: number }> = {
  // Séjour : mur adjacent à la terrasse (axe Z-), flux vers le séjour (+Z)
  sejour: { x: -3.5, z: -4.8, facing: 0 },
  // Chambre 1 : mur extérieur droit (axe X+), flux vers la chambre (-X)
  ch1: { x: 3.75, z: 4, facing: -Math.PI / 2 },
  // Chambre 2 : mur séparant la chambre de la terrasse (axe X+), flux -X
  ch2: { x: 3.65, z: -1.5, facing: -Math.PI / 2 },
};

/**
 * Groupe extérieur sur la terrasse, juste devant la Chambre 2.
 * facing = +π/2 : le long du split suit le mur, ventilateur vers la terrasse.
 */
export const OUTDOOR_POSITION = { x: 4.6, z: -1.5, facing: Math.PI / 2 };

export const AMBIENT_TEMP = 30; // température extérieure par défaut (journée chaude)
export const PRESENCE_DELAY_MIN = 20; // minutes virtuelles avant Smart Eco
