# 指挥湖

[GitHub Pages 在线版](https://youlinh.github.io/command-lake/)提供湖区生存和 AI 闯关。真人对决和邀请房间使用下方的本地服务。

在 Windows 安装 Node.js 24 后，双击 `start.cmd`，房主可继续在浏览器里打开 [本机游戏](http://127.0.0.1:5173/)。启动窗口还会显示 `LAN invite address`，这是同一局域网内其他设备可使用的地址。Three.js、游戏素材和联机服务都随项目提供，启动和游玩无需访问外网。

## 局域网联机

1. 房主保持游戏服务运行，在大厅选择「真人对决」，选择队伍人数并创建房间。选「单人」时为 1 对 1。
2. 复制房间里显示的邀请链接，发给同一 Wi‑Fi 或同一局域网内的玩家。即使房主使用 `127.0.0.1` 玩，房间显示的邀请链接也会使用房主电脑的局域网 IP。
3. 对方在浏览器中打开邀请链接。房间满员后自动开赛。团体模式在双方都有人时，房主也可提前开赛。

启动时如提示检测到多个局域网地址，可用 `start.cmd --lan-ip <电脑在该局域网的IPv4地址>` 指定一个地址。使用 `start.cmd --port 5174` 更换端口时，邀请链接将使用新端口。若更换 Wi‑Fi 导致地址变化，重启服务后重新创建房间并复制新链接。

房间保存在内存 SQLite 中，关闭服务后需要重新创建。金币和关卡进度按浏览器及访问地址保存，房主继续用原本的 `127.0.0.1` 地址可以沿用原有本地进度。

## 开发和验证

在 `game` 目录运行 `npm test` 可验证构建产物、进度解锁和联机房间逻辑。`npm run dev` 默认只监听本机。也可用 `npm run dev -- --lan` 启用局域网监听。

运行 `npm run build:pages` 生成 `game/dist/pages/` 静态站点。GitHub Pages 从 `gh-pages` 分支的根目录发布该产物。

默认动物外观使用 Blender 生成的 `game/web/assets/animals.glb`。Three.js 根据实际移动距离和地面高度驱动骨骼。机甲与特殊皮肤使用原有模型。

在项目根目录重新生成模型，再用 `gltfpack` 压缩发布资产。模型生成已用 Blender 4.0.2 验证，第一条命令附加 `--blend animals.blend` 可同时保存可编辑工程。

```sh
blender --background --factory-startup --python-exit-code 1 --python game/scripts/export-animals.py -- --output animals-raw.glb
npx --yes gltfpack@1.3.0 -i animals-raw.glb -o game/web/assets/animals.glb -cc -noq -kn -km -ke
```

在支持 WebGL 2 的浏览器里会进入 Three.js 场景。浏览器无法创建 WebGL 上下文时，游戏使用 Canvas 2D，场景顶部会显示「兼容画面」。
