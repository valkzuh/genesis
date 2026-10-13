import type { GodTool } from '../store/gameStore';

export interface GodToolInfo {
  id: GodTool;
  label: string;
  verb: string;
  description: string;
  color: number;
  css: string;
}

/** Map-targeted divine powers. Radii come from the simulation's COMMAND_RADIUS. */
export const GOD_TOOLS: Record<GodTool, GodToolInfo> = {
  spawn_civ: {
    id: 'spawn_civ',
    label: 'Raise a Nation',
    verb: 'raise a new civilization',
    description: 'Creates a new people on empty land, or a rebel nation carved from an existing one.',
    color: 0xf0d78c,
    css: '#f0d78c',
  },
  famine: {
    id: 'famine',
    label: 'Famine',
    verb: 'bring blight and famine',
    description: 'Withers harvests in a wide area and empties granaries.',
    color: 0xd9b25a,
    css: '#d9b25a',
  },
  plague: {
    id: 'plague',
    label: 'Plague',
    verb: 'unleash a plague',
    description: 'A deadly epidemic that kills over several years and spreads along trade routes.',
    color: 0x9fd16a,
    css: '#9fd16a',
  },
  earthquake: {
    id: 'earthquake',
    label: 'Earthquake',
    verb: 'shake the earth',
    description: 'Kills people, ruins cities and devastates the land around the epicentre.',
    color: 0xb88ae0,
    css: '#b88ae0',
  },
  flood: {
    id: 'flood',
    label: 'Great Flood',
    verb: 'flood the lowlands',
    description: 'Drowns river valleys and coasts, destroying crops and settlements.',
    color: 0x5fb3d6,
    css: '#5fb3d6',
  },
};
