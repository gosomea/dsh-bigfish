# Codex compatibility

Input: ZIP containing pet.json and its relative spritesheetPath. Recognized dimensions: v1 1536×1872, v2 1536×2288; cells 192×208. `pet-tool.mjs build` accepts Codex directories and emits converted DSH packages. Inspect the converted loops; imported speed/semantics use the known row contract, not arbitrary row guessing.

Codex v2 output is optional and requires a map JSON of all 9 standard rows plus 16 directions. Run:

`python scripts/export_codex.py <dsh-source-folder> <mapping.json> <output-folder>`

Mapping keys: idle, running-right, running-left, waving, jumping, failed, waiting, running, review, look-0 … look-15. Values are DSH animation IDs. All frames must be 192×208. Standard used-frame counts are 6,8,8,4,5,8,6,6,6. Look actions need a meaningful directional first frame; directions run clockwise from UP in 22.5° steps. Missing actions/frames reject export. Do not assert directional semantics from file names: inspect directions visually, especially four cardinals. Use a dedicated Codex pet skill such as hatch-pet when available for full direction-generation QA.

DSH extra scenes, dialogue, signs and near-miss effects do not transfer to Codex. Export is an additional artifact, not a replacement for the richer DSH package. No automatic installation into Codex is implied.
