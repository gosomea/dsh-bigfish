#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
version=${1:-24}
case "$version" in 24|22.19.0) ;; *) echo 'Use Node 24 or 22.19.0' >&2; exit 2;; esac
mkdir -p "$root/artifacts"
docker run --rm --init -e BIGFISH_NODE="$version" -e BIGFISH_LINUX_BROWSER="${BIGFISH_LINUX_BROWSER:-0}" -v "$root:/source:ro" -v "$root/artifacts:/reports" "node:$version-bookworm-slim" bash -euo pipefail -c '
 mkdir /work; cd /work
 cp /source/package.json /source/pnpm-lock.yaml /source/tsconfig.json /source/tsconfig.build.json /source/pnpm-workspace.yaml /source/playwright.config.ts .
 cp -R /source/src /source/tests /source/scripts /source/packs /source/assets /source/examples /source/skills /source/docs /source/browser-tests .
 npm install --global pnpm@11.7.0 --registry=https://registry.npmjs.org
 pnpm install --frozen-lockfile
 pnpm check
 pnpm build
 node --import tsx --test --test-reporter=tap tests/*.test.ts | tee /work/tests.log
 if [ "$BIGFISH_LINUX_BROWSER" = 1 ]; then
  pnpm exec playwright install --with-deps chromium
  BIGFISH_PREVIEW_PORT=4182 pnpm test:browser | tee /reports/linux-browser.log
 fi
 node --input-type=module -e '\''await import("./lib/index.js");const fs=await import("node:fs/promises");await fs.writeFile("/reports/linux-node"+process.env.BIGFISH_NODE+".json",JSON.stringify({ok:true,date:new Date().toISOString(),platform:process.platform,arch:process.arch,node:process.version,unitTests:Number((await fs.readFile("/work/tests.log","utf8")).match(/# tests ([0-9]+)/)[1]),browserRegression:process.env.BIGFISH_LINUX_BROWSER==="1",checks:["frozen-lockfile install","typecheck","build","unit suite including cross-process and crash recovery","bundled Host module import"]},null,2));'\''
' 2>&1 | tee "$root/artifacts/linux-node$version.log"
