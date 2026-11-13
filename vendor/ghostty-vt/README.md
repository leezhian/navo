# libghostty-vt 构建说明

本目录记录应用内 `libghostty-vt` WASM 的来源与复现方式。正常安装依赖和打包应用直接使用已提交的 WASM，不需要安装 Zig。

## 固定版本

- 上游仓库：<https://github.com/ghostty-org/ghostty>
- Ghostty commit：`26df373ec83fb1cebb4fee0a8394144ae984a9b8`
- Zig：`0.16.0`
- 许可证：MIT，见同目录 `LICENSE`
- 应用内产物：`src/assets/terminal/ghostty-vt.wasm`
- SHA-256：`2f3e3d05dd4162e132e29dbb36d005a41699f93fa856f84ca0204a3104142841`

## 复现构建

在固定 commit 的 Ghostty 仓库根目录执行：

```bash
zig build -Demit-lib-vt -Dtarget=wasm32-freestanding -Doptimize=ReleaseFast
```

构建结果位于：

```text
zig-out/bin/ghostty-vt.wasm
```

将产物更新到 `src/assets/terminal/ghostty-vt.wasm` 后，需要同步更新本文件中的 commit、Zig 版本和 SHA-256，并重新验证 renderer 生产构建可以产出 Worker 与 WASM 资源。
