# 神圣座位

一个面向 macOS 的纯本地 CTDP / RSIP 桌面应用。

## 当前功能

- 定义神圣座位、触发动作、对应行为和持续时间。
- 完成专注后累计链长。
- 中止时必须在“链条归零”和“永久允许该行为”之间作出判定。
- 查看永久判例。
- 创建目标位于底部、前置要求位于上方的国策结构。
- 调用本机 Codex，将粗略目标整理成可执行国策，确认后再写入。
- 所有应用数据默认保存在本机 `localStorage`。

## 理论参考

- [`references/知乎原文-如何提高自制力.md`](references/知乎原文-如何提高自制力.md)
- [KenXiao1/momentum](https://github.com/KenXiao1/momentum)：仅用于核对 CTDP/RSIP 的基础字段和判定语义。本项目没有继承其页面和工程结构。

## 本地运行

```bash
npm install
npm run tauri:dev
```

构建 macOS 应用：

```bash
npm run tauri:build
```

Codex 整理功能会寻找 `/opt/homebrew/bin/codex`、`/usr/local/bin/codex` 或当前 `PATH` 中的 `codex`。调用采用只读、临时会话，模型只接收当前目标和国策 JSON，不直接修改应用数据。

## 发布与自动更新

应用通过公开仓库 `HOWILLMAKEIT/sacred-seat` 的 GitHub Releases 分发：

- Release 提供 Apple Silicon 与 Intel Mac 对应的 DMG。
- Tauri Updater 在应用启动后检查 `latest.json`。
- 发现新版本时，应用会显示“更新并重启”提示。
- 更新包使用 Tauri 私钥签名；私钥仅保存在本机和 GitHub Actions Secret 中。

发布新版本时：

1. 同步修改 `src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 和 `package.json` 的版本号。
2. 提交代码并创建同版本标签，例如 `v0.1.2`。
3. 推送标签后，`.github/workflows/release.yml` 自动构建 DMG、更新包、签名和 `latest.json`。

当前使用 ad-hoc 签名，不需要 Apple Developer 账号；首次下载安装时 macOS 仍可能要求用户在“隐私与安全性”中手动确认。
