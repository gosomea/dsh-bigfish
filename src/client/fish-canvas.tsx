import { petLibrary } from "../pet/library.js";
import { PetCanvas } from "../pet/canvas.js";
import { type IdlePresentation } from "../domain/idle.js";
import { motionReduced } from "../domain/motion-policy.js";
import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { FishRenderer, classicPack } from "./renderer.js";
import { type ScenePack } from "../contract/scenes.js";
import { type Preferences } from "../contract/preferences.js";
import type { Translate } from "./locales.js";
import type { Snapshot } from "../contract/types.js";
import { usePresentation } from "./use-presentation.js";
function LegacyFishCanvas({
  snapshot,
  prefs,
  t,
  pack = classicPack,
  dragging = false,
  previewMotion = "",
  activityMotion = "",
  idle,
}: {
  snapshot: Snapshot;
  prefs: Preferences;
  t: Translate;
  pack?: ScenePack;
  dragging?: boolean;
  previewMotion?: string;
  activityMotion?: string;
  idle?: IdlePresentation;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<FishRenderer>();
  const [error, setError] = useState(false);
  const shown = usePresentation(snapshot, prefs);
  useEffect(() => {
    const element = canvas.current!;
    const r = new FishRenderer(element, shown, prefs, pack, () =>
      setError(element.dataset.error === "atlas"),
    );
    renderer.current = r;
    return () => {
      r.dispose();
      renderer.current = undefined;
    };
  }, [pack]);
  useEffect(() => {
    if (renderer.current) {
      renderer.current.idlePresentation = idle;
      renderer.current.previewMotion = previewMotion;
      renderer.current.activityMotion = activityMotion;
      renderer.current.signText = t("waitSign");
      renderer.current.signAlternatives = [
        t("waitSign"),
        t("signTask"),
        t("signCall"),
        t("signReady"),
      ];
    }
    renderer.current?.update(shown, prefs);
    renderer.current?.setPaused(dragging);
  });
  return (
    <div
      className="bf-stage"
      style={{ opacity: prefs.opacity }}
      onPointerDown={() => renderer.current?.unlockSound()}
    >
      {error ? <p role="alert">{t("atlasError")}</p> : null}
      <canvas
        ref={canvas}
        aria-label={`${t(shown.state)} · ${t("phaseNote")}`}
        role="img"
      />
    </div>
  );
}
export function FishCanvas(
  props: Parameters<typeof LegacyFishCanvas>[0] & {
    activityTag?: string | undefined;
  },
) {
  useSyncExternalStore(petLibrary.subscribe, petLibrary.getSnapshot);
  const shown = usePresentation(props.snapshot, props.prefs),
    pet = petLibrary.active;
  if (!pet) return <LegacyFishCanvas {...props} />;
  const reduced =
    motionReduced(
      props.prefs,
      matchMedia("(prefers-reduced-motion: reduce)").matches,
    ) ||
    (shown.state === "completed" && props.prefs.completionMode !== "celebrate");
  const tag =
    props.activityTag ??
    (
      {
        read: "read",
        type: "writing",
        repair: "command",
        peek: "search",
        shuffle: "parallel",
        stamp: "export",
      } as Record<string, string>
    )[props.previewMotion ?? ""];
  return (
    <PetCanvas
      loaded={pet}
      prefs={props.prefs}
      paused={props.dragging ?? false}
      input={{
        state: shown.state,
        richness: props.prefs.richness,
        reduced,
        idle: props.idle,
        signPreference: props.prefs.idleSignPreference,
        activity: shown.activity,
        pressure: shown.pressure,
        whipHz: shown.whipHz,
        ...(tag ? { tag } : {}),
        ...(props.previewMotion &&
        pet.pet.animations.some((a) => a.id === props.previewMotion)
          ? { preview: props.previewMotion }
          : {}),
      }}
    />
  );
}
