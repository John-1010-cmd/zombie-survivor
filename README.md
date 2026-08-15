# Zombie Survivor
2D 无尽僵尸射击（吸血鬼幸存者类）。设计文档见 `docs/superpowers/specs/`。

## 在线试玩（GitHub Pages）
👉 https://john-1010-cmd.github.io/zombie-survivor/

操作：WASD/方向键移动 · 1–5 数字键使用道具（医疗包/磁铁/炸弹/固定火炮/围墙）· `` ` `` 开发者菜单 · Esc 暂停。
游戏内走近棕色「店」建筑自动打开商店：银币购买武器强化/换枪/辅助/道具，可提前召唤下一难度档换取奖励银币。

## 运行
需要任意静态服务器（ES Modules 限制，不能直接双击 html）：
    npx serve .
然后浏览器打开提示的地址（默认 http://localhost:3000）。

## 测试
    npm test
