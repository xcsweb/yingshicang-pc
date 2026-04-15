# Tasks

- [x] Task 1: 修复路由丢失和网页常规更新逻辑
  - [x] SubTask 1.1: 在 `Settings.tsx` 中移除 `useRegisterSW` 及相关的 PWA 自动更新逻辑。
  - [x] SubTask 1.2: 重写 `handleClearCache`，在清除 `localStorage` 和 `sessionStorage` 后，注销所有 Service Worker，并通过 `window.location.href = import.meta.env.BASE_URL` 重定向回正确的 GitHub Pages 基路径。
  - [x] SubTask 1.3: 重写 `handleUpdate`，实现一个简单直接的 `window.location.reload(true)` 强制刷新更新。

- [x] Task 2: 优化预设源并增强网络请求容灾
  - [x] SubTask 2.1: 在 `Settings.tsx` 的 `PRESET_URLS` 中，将不稳定的 `dxawi.github.io` 和 `cdn.jsdelivr.net` 替换为社区常用的稳定镜像（如 `fastly.jsdelivr.net` 或 `raw.kkgithub.com` 等）。
  - [x] SubTask 2.2: 在 `request.ts` 中增强针对 `.json` 和 `.txt` 配置文件的 Fetch 逻辑，如果首选链接 `Failed to fetch`，自动替换域名尝试备用 CDN 镜像。

- [x] Task 3: 编写单元测试 (Unit Tests)
  - [x] SubTask 3.1: 安装 `vitest` 及相关测试依赖。
  - [x] SubTask 3.2: 编写 `tests/unit/request.test.ts` 测试增强后的请求逻辑和 URL 处理函数。
  - [x] SubTask 3.3: 编写 `tests/unit/tvbox.test.ts` 测试解析配置文件的核心函数。

- [x] Task 4: 编写端到端测试 (E2E Tests)
  - [x] SubTask 4.1: 安装并初始化 `@playwright/test`。
  - [x] SubTask 4.2: 编写 `tests/e2e/main-flow.spec.ts`，模拟用户在 Settings 页面填入/点击预设源，验证 Home 页面正确渲染视频列表，以及点击进入 Detail 页面。

# Task Dependencies
- Task 3 和 Task 4 可以与 Task 1、Task 2 并行执行。