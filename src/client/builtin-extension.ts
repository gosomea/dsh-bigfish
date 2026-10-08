import bytes from '../../packs/playful/bundle.dshpet';
import metadata from '../../examples/bigfish-playful/animations.json' with { type: 'json' };
import { decodePet, type PetBundle } from '../pet/contract.js';
import { loadImages, type LoadedPet } from '../pet/library.js';

export const newBuiltinMotions = metadata.filter(a => Boolean(a.family));
let data: PetBundle | undefined;
let pending: Promise<PetBundle> | undefined;
let images: Promise<LoadedPet> | undefined;
let owners = 0;
export const builtinExtensionData = () => data;

/** All visible built-in canvases share decoded sheets; each releases only its own lease. */
export async function loadBuiltinExtension(): Promise<LoadedPet> {
  pending ??= decodePet(bytes).then(pet => (data = pet));
  const loading = images ??= pending.then(pet => loadImages('bigfish-builtin-extension', pet));
  owners++;
  try {
    const loaded = await loading;
    let released = false;
    return { ...loaded, release() {
      if (released) return;
      released = true;
      if (--owners === 0) { loaded.release(); if (images === loading) images = undefined; }
    } };
  } catch (error) {
    if (--owners === 0 && images === loading) images = undefined;
    throw error;
  }
}
