# CLAUDE.md

AI 接手本仓库时先阅读 `AGENTS.md` 和 `docs/PROJECT_CONTEXT.md`。本文件保留 Claude/Cursor 类工具的快速约束。

## 目标

`eco-demo` 是用于沉淀小型链上流程 demo 的 pnpm monorepo。当前包含 EIP-4337 和 EIP-7702 两个 demo，最终通过 GitHub Pages 统一发布。

## 必守规则

- 不要直接改生成产物 `dist/`、`apps/*/dist/`、`node_modules/`。
- 生产 Pages 路由只通过 `scripts/build-pages.mjs` 维护。
- 本地统一预览入口只通过 `scripts/dev.mjs`、根 `index.html` 和 `eip-*/index.html` 维护。
- 私钥相关文案必须明确提示“仅测试账户”，不要弱化警示。
- 两个 demo 的用户可见文案默认中文；协议名、RPC 名、方法名可保留英文。

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

