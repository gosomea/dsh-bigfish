# Animation production

Start with five base roles. Additional variants should serve recognizable purposes: greeting, reading, searching, editing, testing, exporting, celebrating, observing, and character-specific gestures. No fixed action count is required. Record which animations reuse art so counts are honest.

Use a consistent whole-body reference, palette, proportions, clothing and props. Generate action strips with preparation, main gesture and recovery. Do not ask a generator to invent an entire large atlas at once. Keep idle as breathing/blinking; never bake attention-grabbing waving into the default idle loop. Separate “no work” from “waiting for approval”.

First align transparent source cells to the same canvas and baseline. Inspect large arms/tails/props at extrema, not only neutral. The runtime fits the entire cell, so excessive padding makes a character tiny. Keep room for legitimate motion without clipping. Do not draw message bubbles into art. Empty signs can use frame.sign; inspect all sign frames, including raise/lower poses.

`build_atlas.py` accepts an ordered JSON list of existing image paths, cell size and output. It centers each source at the bottom of the cell without upscaling and generates rects; inspect registration and use already-aligned frames if auto-centering loses intentional movement. It never manufactures poses or removes backgrounds. Python with Pillow is required; prefer the host's bundled runtime when available.

Review at normal pet size on light AND dark backgrounds. Look for stuck or backwards loops, jumping scale, identity drift, opaque background squares, cropped limbs, and changing prop handedness. Take a contact sheet and inspect representative actual moving loops. Validate reduced-motion first frames for each role. Source/metadata checks and visual QA are separate.

A finite frame sequence is a real animation only when its poses vary in ways appropriate to the action. A slow blink can be subtle; claiming 36 new motions from the same shifted still is not acceptable.


## Playback in Bigfish 0.4

Keep feet and subject scale aligned across every frame. Playback integrates speed changes instead of multiplying total elapsed time. Ordinary motions change on cycle boundaries; one-shots hold their final frame and are not periodically restarted. For a new tool semantic, the player waits at most 1.2 seconds for a loop or 6 seconds for a one-shot; confirmation, failure, completion and cancellation take priority immediately. Limit meaningful entry/operation/recovery gestures to this response budget.

Make `attention` distinct from quiet idle. Its final frame should communicate waiting without repetitive beckoning. For `near-miss`, use a preparation pose first, anticipation around 26–36% of the clip, the main dodge around 46–72%, and recovery to work by the final frame. Keep the entire silhouette inside the declared canvas; the shared rope is clipped outside the character compartment. Preview quiet rest as well as active work.

Keep `near-miss` exclusive to optional air-swing reactions, not normal work or required role fallbacks. Provide independent normal work frames so users can disable encouragement without losing work animation. Verify the pet with “启用鞭策动作” both off and on; asset preview may explicitly inspect a reaction while daily encouragement stays off.
