# CLAUDE.md

AI 接手本仓库时先阅读 `AGENTS.md`、`docs/PROJECT_CONTEXT.md`、`docs/ARCHITECTURE.md`、`docs/TODO.md`。本文件只保留快速约束。

## 目标

`eco-demo` 是用于沉淀小型链上流程 demo 的 pnpm monorepo。当前包含 EIP-4337 和 EIP-7702 两个 demo，通过根本地壳页统一预览，通过 GitHub Pages 统一发布。

## 必守规则

- 不要直接改生成产物 `dist/`、`apps/*/dist/`、`node_modules/`。
- 生产 Pages 路由只通过 `scripts/build-pages.mjs` 维护。
- 本地统一预览入口只通过 `scripts/dev.mjs`、根 `index.html` 和 `eip-*/index.html` 维护。
- 私钥相关文案必须明确提示“仅测试账户”，不要弱化警示。
- 两个 demo 的用户可见文案默认中文；协议名、RPC 名、方法名可保留英文。
- Demo 间导航必须同时考虑本地壳页和 GitHub Pages 子路径部署，不要默认绝对路径 `/` 一定正确。

## 常用命令

```sh
pnpm install
pnpm dev
pnpm lint
pnpm build
```

`pnpm dev` 会启动：

- `http://127.0.0.1:4173/`
- `http://127.0.0.1:4173/eip-4337/`
- `http://127.0.0.1:4173/eip-7702/`

## 当前状态速记

- 4337 demo：钱包、运行配置、诊断、单笔/批量 UserOperation、批量 UserOps、引导弹窗已完成。
- 7702 demo：网络切换、授权列表、nonce 查询、委托交易发送、结果展示已完成。
- 两个 demo 顶部已加“返回首页”入口，但 Pages 子路径可用性仍需确认。

