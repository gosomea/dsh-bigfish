# 场景生成记录

2026-10-29，使用内置 `image_gen.imagegen`，透明背景模式。所有 PNG 为工具原图，未重绘或抠图；WebP 仅格式编码，逐字节核对 alpha 通道。运行时按记录的矩形裁切道具，不修改原图。

## 共用制作规范

Use case: illustration-story / stylized-concept. Transparent production desktop-pet diorama. Polished hand-painted anime storybook linework, navy/ivory/brass shells and delicate materials matching the blue whale maid mascot. No characters, animals, text or watermark. Wide 3:2 composition. Scenery concentrated in left 45% and bottom22%; upper-right clear for character face/tail, standing point x70% y85%. Genuine alpha, no opaque rectangular backdrop. Desk, bed and lamp are separate configurable assets.

## sea.png

A miniature ocean reading cove: curved whitewashed window arch showing turquoise sea, rope accents, hanging starfish, shelves with blue books and seashells, delicate wood grain and ceramic tile, oval blue-white woven rug and complete diorama ground. No large furniture or character.

## night.png

Uses sea.png as style/layout reference. A moonlit reading cove: indigo starry sea, silver stars, violet drapes, midnight-blue wood, small books, shells, moon ornaments and blue flowers. Navy/silver oval rug and ivory stone floor. Same transparent character compartment and foot position.

## garden.png

Uses sea.png as style/layout reference. A sunlit garden reading cove: ivory/sage pergola, blue hydrangea, ferns, porcelain teacups, books and shell ornaments, lily garden beyond window, woven pale-sage rug and complete stone patio. Same transparent character compartment.

## props.png

Uses sea.png for material/style reference. One eight-object sprite atlas; row-major: whale pet bed with shell pillow; whitewood desk with blue books and pen; brass moon-glass lamp; open whale-sticker cardboard box; paper sailboat; oval lily pond with pebbles; fishing rod with line/float/holder; ivory display shelf with three blank postcards. No characters/text/grid. Final edit preserves designs and separates each object with transparent margins. Actual unequal margins are recorded in `src/client/scene-art.tsx`; explicit clipping prevents adjacent objects leaking through letterboxed viewports.

原图与编码哈希见 [production.json](production.json)。最终合成检查记录与截图位于项目本地 `artifacts/companion/scene-art-contact.png`，包含三主题明暗六种背景与三种小剧场。不把新场景道具计为新角色动作。
