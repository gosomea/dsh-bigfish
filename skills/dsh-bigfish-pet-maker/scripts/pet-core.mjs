// src/pet/archive.ts
var MAX_ARCHIVE = 32 * 1024 * 1024;
var MAX_EXPANDED = 64 * 1024 * 1024;
function safePath(path) {
  return typeof path === "string" && /^[a-zA-Z0-9_./-]+$/.test(path) && !path.startsWith("/") && path.split("/").every((p) => p !== "." && p !== ".." && p !== "");
}
function crc32(bytes) {
  let crc = 4294967295;
  for (const b of bytes) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc >>> 1 ^ (crc & 1 ? 3988292384 : 0);
  }
  return (crc ^ 4294967295) >>> 0;
}
async function readZip(bytes, limits = { archive: MAX_ARCHIVE, expanded: MAX_EXPANDED }) {
  if (bytes.length > limits.archive || bytes.length < 22) throw Error(limits.archive === MAX_ARCHIVE ? "\u89D2\u8272\u5305\u5927\u5C0F\u65E0\u6548\uFF08\u6700\u5927 32 MB\uFF09" : `\u5907\u4EFD\u5927\u5C0F\u65E0\u6548\uFF08\u6700\u5927 ${limits.archive / 1024 / 1024} MB\uFF09`);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), files = /* @__PURE__ */ Object.create(null);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (v.getUint32(i, true) === 101010256 && i + 22 + v.getUint16(i + 20, true) === bytes.length) {
    end = i;
    break;
  }
  if (end < 0 || v.getUint16(end + 4, true) || v.getUint16(end + 6, true)) throw Error("\u4E0D\u652F\u6301\u7684 ZIP \u683C\u5F0F");
  const count = v.getUint16(end + 10, true), centralSize = v.getUint32(end + 12, true);
  let at = v.getUint32(end + 16, true), expanded = 0;
  if (count > 256 || count !== v.getUint16(end + 8, true) || at + centralSize !== end) throw Error("ZIP \u76EE\u5F55\u65E0\u6548\u6216\u6587\u4EF6\u8FC7\u591A");
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || v.getUint32(at, true) !== 33639248) throw Error("ZIP \u76EE\u5F55\u635F\u574F");
    const flags = v.getUint16(at + 8, true), method = v.getUint16(at + 10, true), crc = v.getUint32(at + 16, true), packed = v.getUint32(at + 20, true), size = v.getUint32(at + 24, true), n = v.getUint16(at + 28, true), extra = v.getUint16(at + 30, true), comment = v.getUint16(at + 32, true), offset = v.getUint32(at + 42, true);
    if (at + 46 + n + extra + comment > end) throw Error("ZIP \u76EE\u5F55\u8D8A\u754C");
    const path = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(at + 46, at + 46 + n));
    at += 46 + n + extra + comment;
    if (path.endsWith("/") && size === 0 && safePath(path.slice(0, -1))) continue;
    expanded += size;
    if (!safePath(path) || Object.hasOwn(files, path) || flags & 1 || ![0, 8].includes(method) || expanded > limits.expanded || (v.getUint32(at - 46 - n - extra - comment + 38, true) >>> 16 & 61440) === 40960) throw Error("ZIP \u8DEF\u5F84\u3001\u538B\u7F29\u65B9\u5F0F\u6216\u5C55\u5F00\u5927\u5C0F\u65E0\u6548");
    if (offset + 30 > bytes.length || v.getUint32(offset, true) !== 67324752) throw Error("ZIP \u6587\u4EF6\u5934\u65E0\u6548");
    const start = offset + 30 + v.getUint16(offset + 26, true) + v.getUint16(offset + 28, true);
    if (start + packed > v.getUint32(end + 16, true)) throw Error("ZIP \u6587\u4EF6\u8D8A\u754C");
    const compressed = bytes.slice(start, start + packed);
    let out;
    if (method === 0) out = compressed;
    else {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      const reader = stream.getReader(), chunks = [];
      let total = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          total += chunk.value.length;
          if (total > size || total > limits.expanded) throw Error("ZIP \u5B9E\u9645\u5C55\u5F00\u5927\u5C0F\u8D85\u9650");
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel();
      }
      out = new Uint8Array(total);
      let pos = 0;
      for (const c of chunks) {
        out.set(c, pos);
        pos += c.length;
      }
    }
    if (out.length !== size || crc32(out) !== crc) throw Error("ZIP \u6587\u4EF6\u6821\u9A8C\u5931\u8D25");
    files[path] = out;
  }
  if (at !== end) throw Error("ZIP \u76EE\u5F55\u957F\u5EA6\u4E0D\u4E00\u81F4");
  return files;
}
function writeZip(files) {
  const chunks = [], directories = [];
  let offset = 0;
  for (const [path, data] of Object.entries(files)) {
    if (!safePath(path)) throw Error("Invalid path");
    const name = new TextEncoder().encode(path), crc = crc32(data);
    const local = new Uint8Array(30 + name.length), v = new DataView(local.buffer);
    v.setUint32(0, 67324752, true);
    v.setUint16(4, 20, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, name.length, true);
    local.set(name, 30);
    const dir = new Uint8Array(46 + name.length), d = new DataView(dir.buffer);
    d.setUint32(0, 33639248, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, data.length, true);
    d.setUint32(24, data.length, true);
    d.setUint16(28, name.length, true);
    d.setUint32(42, offset, true);
    dir.set(name, 46);
    chunks.push(local, data);
    directories.push(dir);
    offset += local.length + data.length;
  }
  const central = directories.reduce((n, d) => n + d.length, 0), end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 101010256, true);
  e.setUint16(8, directories.length, true);
  e.setUint16(10, directories.length, true);
  e.setUint32(12, central, true);
  e.setUint32(16, offset, true);
  const result = new Uint8Array(offset + central + 22);
  let at = 0;
  for (const c of [...chunks, ...directories, end]) {
    result.set(c, at);
    at += c.length;
  }
  return result;
}

// src/pet/contract.ts
var PET_FORMAT_VERSION = 1;
var requiredRoles = ["idle", "working", "attention", "success", "error"];
function object(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("\u5E94\u4E3A\u5BF9\u8C61");
  return v;
}
function str(v, max = 160) {
  if (typeof v !== "string" || !v.trim() || v.length > max) throw Error("\u6587\u5B57\u5B57\u6BB5\u65E0\u6548");
  return v;
}
function number(v, min, max) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw Error("\u6570\u503C\u8D85\u51FA\u8303\u56F4");
  return v;
}
function id(v) {
  const s = str(v, 100);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(s)) throw Error("ID \u65E0\u6548");
  return s;
}
function json(files, path) {
  if (!safePath(path) || !Object.hasOwn(files, path)) throw Error(`\u7F3A\u5C11\u6587\u4EF6\uFF1A${path}`);
  const b = files[path];
  if (b.length > 4 * 1024 * 1024) throw Error("JSON \u6587\u4EF6\u8D85\u8FC7 4 MB");
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(b));
}
function imageSize(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length >= 24 && v.getUint32(0) === 2303741511 && v.getUint32(4) === 218765834) return { width: v.getUint32(16), height: v.getUint32(20) };
  if (b.length >= 30 && new TextDecoder().decode(b.subarray(0, 4)) === "RIFF" && new TextDecoder().decode(b.subarray(8, 12)) === "WEBP") {
    const kind = new TextDecoder().decode(b.subarray(12, 16));
    if (kind === "VP8X") return { width: 1 + b[24] + (b[25] << 8) + (b[26] << 16), height: 1 + b[27] + (b[28] << 8) + (b[29] << 16) };
    if (kind === "VP8 ") return { width: v.getUint16(26, true) & 16383, height: v.getUint16(28, true) & 16383 };
    if (kind === "VP8L" && b[20] === 47) {
      const bits = v.getUint32(21, true);
      return { width: (bits & 16383) + 1, height: (bits >>> 14 & 16383) + 1 };
    }
  }
  throw Error("\u53EA\u652F\u6301 PNG / WebP \u56FE\u7247");
}
function parsePet(files) {
  const p = object(json(files, "pet.json")), warnings = [];
  if (p.format !== "dsh-pet" || p.formatVersion !== 1) throw Error("\u4E0D\u652F\u6301\u7684\u89D2\u8272\u5305\u534F\u8BAE\u7248\u672C");
  id(p.id);
  if (p.id === "bigfish-classic") throw Error("\u6B64 ID \u4E3A\u5185\u7F6E\u89D2\u8272\u4FDD\u7559");
  str(p.name, 60);
  str(p.author ?? "", 100);
  str(p.description ?? "", 500);
  if (!/^\d+\.\d+\.\d+$/.test(p.version)) throw Error("\u7248\u672C\u683C\u5F0F\u5E94\u4E3A x.y.z");
  object(p.canvas);
  number(p.canvas.width, 32, 2048);
  number(p.canvas.height, 32, 2048);
  const assets = object(p.assets);
  let pixels = 0;
  if (!Object.keys(assets).length || Object.keys(assets).length > 64) throw Error("\u9700\u8981 1\u201364 \u5F20\u56FE\u96C6");
  for (const [key, a] of Object.entries(assets)) {
    id(key);
    object(a);
    if (!safePath(a.path) || !files[a.path] || !/\.(png|webp)$/i.test(a.path)) throw Error("\u56FE\u7247\u8D44\u6E90\u8DEF\u5F84\u65E0\u6548");
    const size = imageSize(files[a.path]);
    number(a.width, 1, 8192);
    number(a.height, 1, 8192);
    if (size.width !== a.width || size.height !== a.height) throw Error(`\u56FE\u7247\u5C3A\u5BF8\u4E0D\u7B26\uFF1A${a.path}`);
    pixels += a.width * a.height;
  }
  if (pixels > 32 * 1024 * 1024) throw Error("\u603B\u89E3\u7801\u50CF\u7D20\u8D85\u8FC7 32 M");
  if (!files[p.thumbnail] || !safePath(p.thumbnail)) throw Error("\u7F3A\u5C11\u7F29\u7565\u56FE");
  const thumb = imageSize(files[p.thumbnail]);
  if (thumb.width * thumb.height > 32 * 1024 * 1024) throw Error("\u7F29\u7565\u56FE\u5C3A\u5BF8\u8D85\u9650");
  if (!Array.isArray(p.capabilities) || p.capabilities.some((c) => !["sign", "air-swing", "scenes", "look"].includes(c))) throw Error("\u4E0D\u652F\u6301\u7684\u5FC5\u8981\u80FD\u529B");
  const raw = json(files, str(p.animations)), animations = [], ids = /* @__PURE__ */ new Set();
  let frames = 0;
  if (!Array.isArray(raw) || !raw.length || raw.length > 2048) throw Error("\u52A8\u753B\u6570\u91CF\u5E94\u4E3A 1\u20132048");
  for (const value of raw) {
    const a = object(value);
    id(a.id);
    if (ids.has(a.id)) throw Error("\u52A8\u4F5C ID \u91CD\u590D");
    ids.add(a.id);
    str(a.label, 80);
    if (!Array.isArray(a.tags) || !a.tags.length || a.tags.length > 32) throw Error("\u7F3A\u5C11\u52A8\u4F5C\u7528\u9014\u6807\u7B7E");
    a.tags.forEach(id);
    number(a.intensity, 0, 2);
    if (!Number.isInteger(a.intensity) || typeof a.loop !== "boolean") throw Error("\u52A8\u4F5C\u5F3A\u5EA6\u6216\u5FAA\u73AF\u65B9\u5F0F\u65E0\u6548");
    number(a.weight, 0.01, 100);
    number(a.cooldownMs, 0, 36e5);
    if (!Array.isArray(a.frames) || !a.frames.length || a.frames.length > 512 || (frames += a.frames.length) > 32768) throw Error("\u52A8\u753B\u5E27\u6570\u91CF\u8D85\u9650");
    for (const f of a.frames) {
      object(f);
      const asset = assets[f.asset];
      if (!Object.hasOwn(assets, f.asset) || !asset || !Array.isArray(f.rect) || f.rect.length !== 4) throw Error("\u5E27\u8D44\u6E90\u6216\u77E9\u5F62\u65E0\u6548");
      const [x, y, w, h] = f.rect;
      number(x, 0, asset.width);
      number(y, 0, asset.height);
      number(w, 1, asset.width);
      number(h, 1, asset.height);
      if (x + w > asset.width || y + h > asset.height) throw Error("\u5E27\u8D85\u51FA\u56FE\u96C6");
      if (w !== p.canvas.width || h !== p.canvas.height) throw Error("\u6BCF\u5E27\u5C3A\u5BF8\u5FC5\u987B\u7B49\u4E8E\u89D2\u8272\u903B\u8F91\u753B\u5E03\uFF08\u5236\u4F5C\u65F6\u5148\u5BF9\u9F50\uFF09");
      number(f.durationMs, 16, 1e4);
      if (f.sign) {
        const s = object(f.sign);
        number(s.x, 0, w);
        number(s.y, 0, h);
        number(s.width, 1, w);
        number(s.height, 1, h);
        number(s.angle, -45, 45);
        if (s.x + s.width > w || s.y + s.height > h) throw Error("\u724C\u9762\u8D85\u51FA\u753B\u5E03");
      }
    }
    if (!a.speed) a.speed = [1, 1];
    if (!Array.isArray(a.speed) || a.speed.length !== 2) throw Error("\u901F\u5EA6\u8303\u56F4\u65E0\u6548");
    number(a.speed[0], 0.5, 2);
    number(a.speed[1], a.speed[0], 2);
    if (a.scene && (!p.scenes || !Object.hasOwn(p.scenes, a.scene))) throw Error("\u52A8\u4F5C\u5F15\u7528\u7684\u573A\u666F\u4E0D\u5B58\u5728");
    animations.push(a);
  }
  object(p.fallbacks);
  for (const role of requiredRoles) {
    const a = animations.find((a2) => a2.id === p.fallbacks[role]);
    if (!a || !a.tags.includes(role)) throw Error(`\u7F3A\u5C11 ${role} \u57FA\u7840\u52A8\u4F5C\u6620\u5C04`);
    if (a.intensity !== 0) throw Error(`\u57FA\u7840\u52A8\u4F5C ${role} \u5FC5\u987B\u652F\u6301\u8F7B\u67D4\u6A21\u5F0F`);
  }
  if (p.scenes) for (const [key, s] of Object.entries(object(p.scenes))) {
    id(key);
    if (!Object.hasOwn(assets, object(s).asset)) throw Error("\u573A\u666F\u8D44\u6E90\u4E0D\u5B58\u5728");
  }
  const dialogue = p.dialogue ? object(json(files, str(p.dialogue))) : {};
  for (const [key, lines] of Object.entries(dialogue)) {
    id(key);
    if (!Array.isArray(lines) || lines.length > 30 || lines.some((s) => typeof s !== "string" || !s.trim() || s.length > 160 || /\{(?!tool\}|file\}|elapsed\}|activeCount\}|completedCount\})[^}]*\}/.test(s))) throw Error("\u89D2\u8272\u53F0\u8BCD\u683C\u5F0F\u65E0\u6548");
  }
  if (p.capabilities.includes("air-swing") && !animations.some((a) => a.tags.includes("near-miss"))) throw Error("\u7A7A\u6325\u4E92\u52A8\u9700\u8981 near-miss \u53CD\u5E94\u52A8\u753B");
  if (p.capabilities.includes("sign") && !animations.some((a) => a.frames.some((f) => f.sign))) throw Error("\u4E3E\u724C\u80FD\u529B\u9700\u8981\u724C\u9762\u951A\u70B9");
  const optional = ["read", "search", "edit", "test", "greeting"];
  for (const tag of optional) if (!animations.some((a) => a.tags.includes(tag))) warnings.push(`${tag} \u4F7F\u7528\u57FA\u7840\u52A8\u4F5C\u56DE\u9000`);
  return { manifest: p, animations, dialogue, files, warnings };
}
function convertCodex(files) {
  const p = object(json(files, "pet.json"));
  if (p.format === "dsh-pet") return files;
  const version = p.spriteVersionNumber ?? 1;
  if (![1, 2].includes(version)) throw Error("\u672A\u77E5 Codex \u5BA0\u7269\u7248\u672C");
  const path = str(p.spritesheetPath);
  if (!safePath(path) || !files[path]) throw Error("\u7F3A\u5C11 Codex \u56FE\u96C6");
  const size = imageSize(files[path]);
  if (size.width !== 1536 || size.height !== (version === 2 ? 2288 : 1872)) throw Error("Codex \u56FE\u96C6\u5C3A\u5BF8\u4E0D\u5339\u914D");
  const rows = [["idle", 6, "idle"], ["drag-right", 8, "drag-right"], ["drag-left", 8, "drag-left"], ["wave", 4, "greeting"], ["jump", 5, "success"], ["failed", 8, "error"], ["waiting", 6, "attention"], ["work", 6, "working"], ["review", 6, "thinking"]];
  const animations = rows.map(([name, count, tag], row) => ({ id: name, label: name, tags: [tag], intensity: ["idle", "jump", "failed", "waiting", "work"].includes(name) ? 0 : 1, loop: ["idle", "work", "review"].includes(name), weight: 1, cooldownMs: 0, speed: [1, 1], frames: Array.from({ length: count }, (_, col) => ({ asset: "main", rect: [col * 192, row * 208, 192, 208], durationMs: col === count - 1 ? 280 : 140 })) }));
  if (version === 2) for (let i = 0; i < 16; i++) animations.push({ id: `look-${i}`, label: `\u89C6\u7EBF ${i * 22.5}\xB0`, tags: [`look-${i}`], intensity: 0, loop: true, weight: 1, cooldownMs: 0, speed: [1, 1], frames: [{ asset: "main", rect: [i % 8 * 192, (9 + Math.floor(i / 8)) * 208, 192, 208], durationMs: 1e3 }] });
  const pet = { format: "dsh-pet", formatVersion: 1, id: "codex-" + String(p.id ?? "imported").replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 70), name: p.displayName ?? "Codex \u5BA0\u7269", version: "1.0.0", author: "Imported", description: p.description || "\u4ECE Codex \u56FE\u96C6\u5BFC\u5165", canvas: { width: 192, height: 208 }, assets: { main: { path, width: size.width, height: size.height } }, thumbnail: path, animations: "animations.json", fallbacks: { idle: "idle", working: "work", attention: "waiting", success: "jump", error: "failed" }, capabilities: version === 2 ? ["look"] : [] };
  const encode = (v) => new TextEncoder().encode(JSON.stringify(v));
  return { ...files, "pet.json": encode(pet), "animations.json": encode(animations) };
}
async function decodePet(bytes) {
  return parsePet(convertCodex(await readZip(bytes)));
}
var encodePet = (pet) => {
  const bytes = writeZip(pet.files);
  if (bytes.length > MAX_ARCHIVE) throw Error("\u6807\u51C6\u5316\u540E\u7684\u89D2\u8272\u5305\u8D85\u8FC7 32 MB\uFF0C\u8BF7\u51CF\u5C0F\u7D20\u6750");
  return bytes;
};
export {
  PET_FORMAT_VERSION,
  convertCodex,
  decodePet,
  encodePet,
  imageSize,
  parsePet,
  requiredRoles
};
