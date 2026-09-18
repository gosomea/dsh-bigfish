import {useRef} from 'react';
import type {Snapshot} from '../contract/types.js';
import type {Preferences} from '../contract/preferences.js';
import {Presentation} from '../domain/presentation.js';
export function usePresentation(snapshot:Snapshot,prefs:Preferences):Snapshot {
  const director=useRef(new Presentation());
  return director.current.show(snapshot,prefs,Date.now());
}
