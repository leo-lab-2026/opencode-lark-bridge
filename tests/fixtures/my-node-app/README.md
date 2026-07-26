# my-node-app 部署文档

## 概述

本文档描述 `my-node-app` 项目的标准部署流程，用于测试 OpenCode Lark Bridge 的端到端事件触发。

## 前置条件

- Node.js >= 18.0.0
- npm >= 9.0.0
- nginx（反向代理）

## 构建步骤

```bash
npm ci
npm run build
```

## 环境变量

复制 `.env.production` 并填写真实值：

```bash
cp .env.production .env
```

关键变量：
- `DB_HOST` — 数据库主机
- `API_KEY` — 外部服务密钥

## 部署检查清单

- [ ] 确认测试环境通过
- [ ] 确认预发环境通过
- [ ] 确认生产环境通过

## 参考链接

- 项目主页：https://github.com/example/my-node-app
- 监控面板：https://grafana.example.com/d/my-node-app
