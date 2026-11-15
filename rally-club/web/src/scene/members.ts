// "Meet the Members" — Rally Club's original playable roster.
import type { PalLook } from './pal.ts';

export interface Member {
  id: string;
  name: string;
  tagline: string;
  look: PalLook;
}

export const MEMBERS: Member[] = [
  {
    id: 'theo',
    name: 'Theo',
    tagline: 'Never misses a dink',
    look: { skin: 0xe3b48f, hair: 0x4a3122, hairStyle: 'quiff', headwear: 'visor', headwearColor: 0xfbf8f2, top: 'polo', shirt: 0x8fab83, trim: 0xf6efe0, shorts: 0xf1e6d2, bottom: 'shorts', shoes: 0xfbf8f2, paddle: 0x6f8a63, eye: 0x4a3426 },
  },
  {
    id: 'lila',
    name: 'Lila',
    tagline: 'All power, all smiles',
    look: { skin: 0xf2c9a8, hair: 0x9a4f2e, hairStyle: 'ponytail', hairAccent: 0xc8b8e3, top: 'tank', shirt: 0xc4b2e2, trim: 0xfbf8f2, shorts: 0xc4b2e2, bottom: 'skirt', shoes: 0xfbf8f2, paddle: 0xb7a3d9, eye: 0x5b4030, freckles: true, lashes: true, wristband: 0xfbf8f2 },
  },
  {
    id: 'jasper',
    name: 'Jasper',
    tagline: 'Cardigan on, game on',
    look: { skin: 0xf0c7a2, hair: 0xe0b86a, hairStyle: 'wavy', top: 'cardigan', shirt: 0x8ea5cf, shirtInner: 0xfbf8f2, trim: 0xfbf8f2, shorts: 0xf2dc8e, bottom: 'shorts', shoes: 0xfbf8f2, paddle: 0x4d5f8f, eye: 0x4a6a8a },
  },
  {
    id: 'marcus',
    name: 'Marcus',
    tagline: 'Calm, cool, unbreakable',
    look: { skin: 0x7a4a30, hair: 0x1d1612, hairStyle: 'afro', top: 'polo', shirt: 0xc46e55, trim: 0xf6efe0, shorts: 0xece0c8, trousers: 0xece0c8, bottom: 'trousers', shoes: 0xfbf8f2, paddle: 0xc46e55, eye: 0x2b1d14, beard: true, build: 0.7 },
  },
  {
    id: 'mei',
    name: 'Mei',
    tagline: 'Third-shot drop queen',
    look: { skin: 0xf1d0b0, hair: 0x1b1716, hairStyle: 'bun', top: 'crop', shirt: 0xf3ead8, trim: 0x8fab83, shorts: 0x9db592, bottom: 'skirt', shoes: 0xfbf8f2, paddle: 0x8fab83, eye: 0x2b1d14, lashes: true },
  },
  {
    id: 'zara',
    name: 'Zara',
    tagline: 'Lives for the long rally',
    look: { skin: 0xa86e4a, hair: 0x2a1a12, hairStyle: 'curly', headwear: 'cap', headwearColor: 0xd8cdee, top: 'polo', shirt: 0xf3df8e, trim: 0xfbf8f2, shorts: 0xc4b2e2, bottom: 'shorts', shoes: 0xfbf8f2, paddle: 0xb7a3d9, eye: 0x3a2618, lashes: true },
  },
];

export const memberById = (id: string): Member => MEMBERS.find((m) => m.id === id) ?? MEMBERS[0];
