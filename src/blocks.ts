// Block registry. IDs are stored in Uint8Array chunk data.

export const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  SANDSTONE: 6,
  MARBLE: 7,
  PLASTER: 8,
  BLUE: 9,
  OCHRE: 10,
  TERRACOTTA: 11,
  PLANKS: 12,
  LOG: 13,
  LEAVES: 14,
  LATTICE: 15,
  GOLD: 16,
  LAMP: 17,
  COBBLE: 18,
  INLAY: 19,
  BEDROCK: 20,
} as const;

/** Atlas tile indices (8 columns x 4 rows of 16px tiles). */
export const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5, SANDSTONE_SIDE: 6, SANDSTONE_TOP: 7,
  MARBLE: 8, PLASTER: 9, BLUE: 10, OCHRE: 11, TERRACOTTA: 12, PLANKS: 13, LOG_SIDE: 14, LOG_TOP: 15,
  LEAVES: 16, LATTICE: 17, GOLD: 18, LAMP: 19, COBBLE: 20, INLAY: 21, BEDROCK: 22, LAMP_TOP: 23,
} as const;

export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 4;

export const Kind = { Air: 0, Opaque: 1, Cutout: 2, Water: 3, Emissive: 4 } as const;

export interface BlockDef {
  name: string;
  hindi?: string;
  kind: number;
  solid: boolean;
  top: number; side: number; bottom: number;
}

const D: BlockDef[] = [];
function def(id: number, name: string, kind: number, top: number, side = top, bottom = top, solid = true, hindi?: string) {
  D[id] = { name, kind, top, side, bottom, solid, hindi };
}

def(B.AIR, 'Air', Kind.Air, 0, 0, 0, false);
def(B.GRASS, 'Grass', Kind.Opaque, T.GRASS_TOP, T.GRASS_SIDE, T.DIRT);
def(B.DIRT, 'Dirt', Kind.Opaque, T.DIRT);
def(B.STONE, 'Aravalli Stone', Kind.Opaque, T.STONE);
def(B.SAND, 'Sand', Kind.Opaque, T.SAND);
def(B.WATER, 'Water', Kind.Water, T.WATER, T.WATER, T.WATER, false);
def(B.SANDSTONE, 'Sandstone', Kind.Opaque, T.SANDSTONE_TOP, T.SANDSTONE_SIDE, T.SANDSTONE_TOP, true, 'बलुआ पत्थर');
def(B.MARBLE, 'White Marble', Kind.Opaque, T.MARBLE, T.MARBLE, T.MARBLE, true, 'संगमरमर');
def(B.PLASTER, 'Lime Plaster', Kind.Opaque, T.PLASTER, T.PLASTER, T.PLASTER, true, 'चूना');
def(B.BLUE, 'Rajasthani Blue', Kind.Opaque, T.BLUE, T.BLUE, T.BLUE, true, 'नीला');
def(B.OCHRE, 'Haveli Ochre', Kind.Opaque, T.OCHRE, T.OCHRE, T.OCHRE, true, 'गेरुआ');
def(B.TERRACOTTA, 'Terracotta', Kind.Opaque, T.TERRACOTTA, T.TERRACOTTA, T.TERRACOTTA, true, 'टेराकोटा');
def(B.PLANKS, 'Sheesham Wood', Kind.Opaque, T.PLANKS);
def(B.LOG, 'Neem Log', Kind.Opaque, T.LOG_TOP, T.LOG_SIDE, T.LOG_TOP);
def(B.LEAVES, 'Neem Leaves', Kind.Cutout, T.LEAVES);
def(B.LATTICE, 'Jharokha Jaali', Kind.Cutout, T.LATTICE, T.LATTICE, T.LATTICE, true, 'जाली');
def(B.GOLD, 'Brass Dome', Kind.Opaque, T.GOLD, T.GOLD, T.GOLD, true, 'पीतल');
def(B.LAMP, 'Diya Lantern', Kind.Emissive, T.LAMP_TOP, T.LAMP, T.LAMP_TOP, true, 'दीया');
def(B.COBBLE, 'Old City Paving', Kind.Opaque, T.COBBLE);
def(B.INLAY, 'Pietra Dura Inlay', Kind.Opaque, T.INLAY, T.INLAY, T.INLAY, true, 'पच्चीकारी');
def(B.BEDROCK, 'Bedrock', Kind.Opaque, T.BEDROCK);

export const BLOCKS = D;

// Fast lookup tables
export const KIND = new Uint8Array(256);
export const SOLID = new Uint8Array(256);
export const OCCLUDES_AO = new Uint8Array(256);
for (let i = 0; i < D.length; i++) {
  const d = D[i];
  if (!d) continue;
  KIND[i] = d.kind;
  SOLID[i] = d.solid ? 1 : 0;
  OCCLUDES_AO[i] = d.kind === Kind.Opaque || d.kind === Kind.Emissive || i === B.LEAVES ? 1 : 0;
}

export const HOTBAR: number[] = [
  B.MARBLE, B.PLASTER, B.BLUE, B.OCHRE, B.TERRACOTTA, B.SANDSTONE, B.LATTICE, B.GOLD, B.LAMP,
];
