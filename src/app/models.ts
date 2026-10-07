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
// Pièces de l'appartement F704 — géométrie stricte (topology_threejs.md)
// Repère : origine (0,0) en HAUT-GAUCHE du plan. X → droite, Z → profondeur
// (bas du plan), Y = hauteur (plafond 2,5 m). 1 unité Three.js = 1 mètre.
// La cuisine est fusionnée au séjour (espace ouvert, pas de cloison).
// ---------------------------------------------------------------------------

export type RoomId = 'sejour' | 'sdb' | 'ch1' | 'ch2' | 'entree' | 'terrasse';

export interface RoomDef {
  id: RoomId;
  name: string;
  area: number; // m² (surface du polygone)
  hasAc: boolean;
  /** Contour polygonal (m, coordonnées absolues x/z) — sommet par sommet. */
  polygon: { x: number; z: number }[];
}

export const ROOMS: RoomDef[] = [
  // 1. Séjour & Cuisine (espace ouvert)
  {
    id: 'sejour', name: 'Séjour & Cuisine', area: 28.68, hasAc: true,
    polygon: [
      { x: 1.58, z: 0.00 },   // Haut-Gauche (Cuisine)
      { x: 8.30, z: 0.00 },   // Haut-Droite (Séjour)
      { x: 8.55, z: 3.41 },   // Bas-Droite (mur biaisé côté terrasse)
      { x: 5.85, z: 3.41 },   // Angle intérieur avec Chambre 2
      { x: 5.85, z: 4.66 },   // Descente vers couloir
      { x: 1.58, z: 4.66 },   // Retour bas-gauche Cuisine
    ],
  },
  // 2. Chambre 2
  {
    id: 'ch2', name: 'Chambre 2', area: 12.77, hasAc: true,
    polygon: [
      { x: 5.85, z: 3.41 },   // Haut-Gauche
      { x: 8.55, z: 3.41 },   // Haut-Droite
      { x: 8.90, z: 7.85 },   // Bas-Droite (mur biaisé côté terrasse)
      { x: 5.85, z: 7.85 },   // Bas-Gauche
    ],
  },
  // 3. Chambre 1
  {
    id: 'ch1', name: 'Chambre 1', area: 13.96, hasAc: true,
    polygon: [
      { x: 5.85, z: 8.81 },   // Haut-Gauche (après le couloir)
      { x: 8.98, z: 8.81 },   // Haut-Droite
      { x: 9.45, z: 12.96 },  // Bas-Droite (mur biaisé côté terrasse)
      { x: 5.85, z: 12.96 },  // Bas-Gauche
    ],
  },
  // 4. Salle de Bains
  {
    id: 'sdb', name: 'Salle de bains', area: 5.83, hasAc: false,
    polygon: [
      { x: 0.00, z: 4.66 },   // Haut-Gauche
      { x: 2.96, z: 4.66 },   // Haut-Droite
      { x: 2.96, z: 6.63 },   // Bas-Droite
      { x: 0.00, z: 6.63 },   // Bas-Gauche
    ],
  },
  // 5. Entrée & Dégagement (couloir)
  {
    id: 'entree', name: 'Entrée', area: 9.39, hasAc: false,
    polygon: [
      { x: 0.00, z: 6.63 },   // Haut-Gauche
      { x: 5.85, z: 6.63 },   // Haut-Droite (rejoint les chambres)
      { x: 5.85, z: 8.81 },   // Bas-Droite couloir
      { x: 3.62, z: 8.81 },   // Retour angle
      { x: 3.62, z: 7.88 },   // Bas-Droite entrée
      { x: 0.00, z: 7.88 },   // Bas-Gauche entrée
    ],
  },
  // 6. Terrasse (longe toute la façade biaisée)
  {
    id: 'terrasse', name: 'Terrasse', area: 34.10, hasAc: false,
    polygon: [
      { x: 8.30, z: 0.00 },   // Haut-Gauche (touche le séjour)
      { x: 10.87, z: 0.00 },  // Haut-Droite (2,57 m de large)
      { x: 12.03, z: 12.96 }, // Bas-Droite (longe toute la façade)
      { x: 9.45, z: 12.96 },  // Bas-Gauche (touche Chambre 1)
      { x: 8.98, z: 8.81 },   // Point de contact Chambre 1 / Couloir
      { x: 8.90, z: 7.85 },   // Point de contact Chambre 2
      { x: 8.55, z: 3.41 },   // Point de contact Séjour
    ],
  },
];

export const AC_ROOMS: RoomId[] = ['sejour', 'ch1', 'ch2'];

export const WALL_HEIGHT = 2.5;
export const WALL_THICKNESS_EXT = 0.25; // murs extérieurs / porteurs
export const WALL_THICKNESS_INT = 0.10; // cloisons intérieures

/**
 * Murs — segments [startX, startZ, endX, endZ, épaisseur] (topology_threejs.md).
 * glass = façade vitrée (séparation intérieur / terrasse).
 */
export interface WallSeg {
  x1: number; z1: number; x2: number; z2: number;
  thickness: number;
  glass?: boolean;
}

export const WALLS: WallSeg[] = [
  // 1. Mur gauche (Cuisine/SdB/Entrée) — en L
  { x1: 1.58, z1: 0, x2: 1.58, z2: 4.66, thickness: WALL_THICKNESS_EXT },
  { x1: 0, z1: 4.66, x2: 0, z2: 7.88, thickness: WALL_THICKNESS_EXT },
  // 2. Mur haut (Séjour)
  { x1: 1.58, z1: 0, x2: 8.30, z2: 0, thickness: WALL_THICKNESS_EXT },
  // 3. Mur bas (Chambre 1)
  { x1: 5.85, z1: 12.96, x2: 9.45, z2: 12.96, thickness: WALL_THICKNESS_EXT },
  // 4. Façade biaisée (intérieur / terrasse) — vitres
  { x1: 8.30, z1: 0, x2: 8.55, z2: 3.41, thickness: WALL_THICKNESS_EXT, glass: true },
  { x1: 8.55, z1: 3.41, x2: 8.90, z2: 7.85, thickness: WALL_THICKNESS_EXT, glass: true },
  { x1: 8.98, z1: 8.81, x2: 9.45, z2: 12.96, thickness: WALL_THICKNESS_EXT, glass: true },
  // 5. Cloison centrale verticale
  { x1: 5.85, z1: 3.41, x2: 5.85, z2: 12.96, thickness: WALL_THICKNESS_INT },
  // 6. Cloison Ch2 / Séjour
  { x1: 5.85, z1: 3.41, x2: 8.55, z2: 3.41, thickness: WALL_THICKNESS_INT },
  // 7. Cloison Ch1 / Couloir
  { x1: 5.85, z1: 8.81, x2: 8.98, z2: 8.81, thickness: WALL_THICKNESS_INT },
];

/**
 * Unités intérieures — placement strict (topology_threejs.md).
 * facing = rotation Y du groupe : le flux souffle vers la gauche (-X),
 * dans la pièce. (0 = flux +Z, -π/2 = flux -X, +π/2 = flux +X)
 */
export const AC_POSITIONS: Record<string, { x: number; y: number; z: number; facing: number }> = {
  // Split Séjour (AirHome 600 - 3,5 kW)
  sejour: { x: 8.42, y: 2.10, z: 1.70, facing: -Math.PI / 2 },
  // Split Chambre 2 (AirHome 600 - 2,5 kW)
  ch2: { x: 8.72, y: 2.10, z: 5.60, facing: -Math.PI / 2 },
  // Split Chambre 1 (AirHome 600 - 2,5 kW)
  ch1: { x: 9.20, y: 2.10, z: 10.80, facing: -Math.PI / 2 },
};

/**
 * Groupe extérieur (RAM-G68N3HAE - 6,8 kW) sur la terrasse, devant la Ch2.
 * facing = parallèle à la façade biaisée (ventilateur vers la terrasse).
 */
export const OUTDOOR_POSITION = { x: 9.80, y: 0.50, z: 5.60, facing: 0.0787 };

export const AMBIENT_TEMP = 30; // température extérieure par défaut (journée chaude)
export const PRESENCE_DELAY_MIN = 20; // minutes virtuelles avant Smart Eco
