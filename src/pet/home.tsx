import React from 'react';
import type {LoadedPet} from './library.js';
import {sceneContext,type ScenePresentation} from '../client/scene-state.js';
/** Role-authored local home artwork, admitted and decoded with the rest of its role pack. */
export function PetHomeLayer({loaded,enabled,...presentation}:{loaded:LoadedPet;enabled:boolean}&ScenePresentation){
 const home=loaded.pet.manifest.home;
 if(!enabled||!home||!loaded.pet.manifest.capabilities.includes('home'))return null;
 const image=loaded.images[home.background];if(!image)return null;
 return <img data-context={sceneContext(presentation)} data-ambient="static-pack-art" src={image.src} alt={`${loaded.pet.manifest.name}的角色包小窝`} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain',pointerEvents:'none'}}/>;
}
