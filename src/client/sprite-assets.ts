import { isBuiltinAsset } from "../contract/builtin-assets.js";
import { parsePack } from "../contract/scenes.js";
import manifest from "../../packs/classic/manifest.json" with { type: "json" };
import classicUrl from "../../assets/sprites/bigfish-atlas.png";
import motionsUrl from "../../assets/sprites/bigfish-motions.png";
import signsUrl from "../../assets/sprites/bigfish-signs.png";
import workUrl from "../../assets/sprites/bigfish-work.png";
import quietUrl from "../../assets/sprites/bigfish-quiet.png";
import dailyUrl from "../../assets/sprites/bigfish-daily.png";
export const spriteUrls = {
  classic: classicUrl,
  motions: motionsUrl,
  signs: signsUrl,
  work: workUrl,
  quiet: quietUrl,
  daily: dailyUrl,
};
export { default as layouts } from "../../assets/sprites/atlas-layout.json" with { type: "json" };
export const classicPack = parsePack(manifest, isBuiltinAsset);
