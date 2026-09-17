import React, { useState } from "react";
import type { LoadedPet } from "./library.js";
import { PetCanvas } from "./canvas.js";
import { preferenceDefaults } from "../contract/preferences.js";
export function PetPreview({ loaded }: { loaded: LoadedPet }) {
  const [motion, setMotion] = useState("");
  return (
    <div className="bf-pet-preview">
      <label className="bf-field">
        <span>逐个预览动作（共 {loaded.pet.animations.length} 个）</span>
        <select
          aria-label="角色动作预览"
          value={motion}
          onChange={(e) => setMotion(e.target.value)}
        >
          <option value="">安静待机</option>
          {loaded.pet.animations.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label} · {a.id}
            </option>
          ))}
        </select>
      </label>
      <PetCanvas
        loaded={loaded}
        prefs={{ ...preferenceDefaults, sound: false, whipEnabled: false }}
        input={{
          state: "idle",
          richness: 2,
          reduced: false,
          activity: 0.5,
          pressure: 0,
          preview: motion,
        }}
      />
      <p className="bf-help">
        逐个预览展示完整动作；日常显示仍遵守你的动作强度与空闲设置。
      </p>
    </div>
  );
}
