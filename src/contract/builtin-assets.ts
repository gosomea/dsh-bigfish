export const builtinAssets = ["bigfish-atlas.png", "bigfish-motions.png", "bigfish-signs.png", "bigfish-work.png", "bigfish-quiet.png", "bigfish-daily.png"] as const;
export const isBuiltinAsset=(path:string)=>builtinAssets.some(asset=>asset===path);
