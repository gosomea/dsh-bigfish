---
name: dsh-bigfish-pet-maker
description: Create, extend, validate and package replaceable DSH web pets from descriptions, character references or existing pet packs. Supports arbitrary extra animations, role dialogue, props, Codex pet import and conditional Codex v2 export.
metadata:
  version: "1.1.0"
---

# DSH Bigfish Pet Maker

Produce an importable `.dshpet` with real assets and a working preview. Use this skill when the user wants a DSH character, replaces an existing pet, or adds animations. Do not confuse this with installing a new dsh plugin or modifying the agent's behavior.

Read [pack-spec.md](references/pack-spec.md) before constructing metadata. `scripts/pet-core.mjs` is the bundled authoritative runtime validator, not a file to edit. It is built from the plugin contract; new packs cannot invent unsupported renderer capabilities. Animation IDs and semantic tags ARE extensible and are not limited to Bigfish's built-in motion catalog.

1. Infer identity, style and personality from user text/references. Ask only about consequential missing choices. Use one canonical character reference for every generated action. Keep user input images unchanged.
2. Build the five required role mappings (idle, working, attention, success, error), then the user-requested extras. Read [animation-guide.md](references/animation-guide.md) for visual constraints and stop conditions. Record a concise action checklist and finish each group before expanding it. Preserve completed source material so extensions can resume.
3. If new raster art is needed, use the host's available image-generation skill/tool and follow its instructions. Normal prompt-based pets should use generated art. Simple geometric/vector characters may use original deterministic drawings. Do not assume a particular image provider or silently use paid fallback APIs. Without image-generation capability, existing-art processing can proceed; report a missing generator if new art is required rather than delivering placeholders.
4. Assemble grounded frames into aligned transparent cells. Use `scripts/build_atlas.py` for already-created art; never use transforms of one pose as a substitute for requested distinct actions. Write manifest, animations and optional dialogue following the spec. Every required role has an intensity-0 fallback and a meaningful first frame.
5. Validate using `node scripts/pet-tool.mjs validate <folder-or-archive>`. Build with `node scripts/pet-tool.mjs build <folder> <output.dshpet>`. Generate an offline preview using `node scripts/pet-tool.mjs preview <folder-or-archive> <preview.html>`. Open it in the available browser and inspect normal-size loops, first/last continuity, transparency, props, idle behavior and all five roles. JSON validation alone does not establish visual quality. Do not claim visual inspection without actually viewing the result.
6. Deliver the .dshpet, preview, validation output and optional source folder. If the user asks to install, use the plugin's 角色库 → 导入角色包 → 安装并使用. A remote Host uses browser upload, not paths on the Agent's own filesystem. Keep existing behavior settings and custom dialogue. Creating a pack by itself does not imply changing the user's active pet.

For existing Codex pet import or dual-target export, read [codex-compat.md](references/codex-compat.md) only when needed. Import preserves source image bytes. Full Codex v2 export requires all mapped rows and 16 look directions; do not fill missing rows with unrelated copies.

For extensions, retain role ID, increase `version`, append independent animation IDs and reuse approved assets where appropriate. Packs may contain more actions than the built-in character. Resource caps in the spec remain enforced. Return the actual action/frame counts; distinguish distinct art sequences from aliases and shared fallback mappings.

A successful result can be installed without editing the plugin, has no missing resources, keeps quiet idle quiet, has usable fallbacks for new tools, and visibly preserves character identity. Stop after two failed repair attempts on the same visual defect and report the specific unresolved artifact; do not loop generation indefinitely.

## Intelligent companion development branch

The 0.7 development runtime adds optional body bounds, foot anchors, movement and touch mappings; consult `references/pack-spec.md`. Only declare capabilities supported by the target runtime. Do not label a stationary translated image as walking. Keep generated drafts separate from accepted animations, and do not count mirrored directions as separately drawn clips. The development runtime accepts optional `life`, `home`, `voice-display` and `paired` capabilities, body/per-frame accessory anchors, and `unlockAt` growth gates. Each required capability needs actual packaged artwork and validated references. Use the updated protocol and bundled validator; an old npm 0.6 runtime cannot load these new required capabilities. Voice declarations are visual poses, never recording consent or credentials. Paired pets share one local chain, Host and budget; test both actors and the prop exchange in the plugin, not just the per-animation preview. Set `body.bounds` to the visible union of all poses, including extended tails and carried props. The offline preview plays individual source sequences and can show bounds/foot guides; it does not reproduce stage clipping, movement, worn accessories or complete home/paired chains. Check those in the plugin or desktop stage, especially extreme poses and transitions.
