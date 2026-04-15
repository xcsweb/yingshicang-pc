# 修复网页更新路由与推荐源加载失败 (Fix Web Routing, Updates, and Sources) Spec

## Why
1. 当前应用使用了 PWA 的 `useRegisterSW` 更新机制，但对于普通的 GitHub Pages 静态网页来说，直接清理浏览器缓存和强制刷新往往更简单有效。
2. 点击“清除所有缓存”时，由于代码中硬编码了跳转到 `/`，导致在 GitHub Pages 环境下丢失了正确的路由基路径（`/yingshicang-pc/`）。
3. 推荐的 TVBox JSON 源（如 `cdn.jsdelivr.net`）在国内网络环境下经常遭遇 DNS 污染或阻断，导致出现 "Failed to fetch" 错误。
4. 项目需要引入规范的单元测试和端到端测试（E2E）来保证代码修改后的稳定性和核心链路可用性。

## What Changes
- 移除 `Settings.tsx` 中的 `vite-plugin-pwa` 更新逻辑，替换为标准的注销 Service Worker 并强制刷新页面的常规网页更新逻辑。
- 修复 `Settings.tsx` 中的“清除所有缓存”逻辑，使用 `import.meta.env.BASE_URL` 进行正确的页面重定向。
- 修改预设的 JSON 源地址，采用社区验证更稳定的 CDN 镜像（如 `fastly.jsdelivr.net`, `raw.kkgithub.com` 等）替代 `cdn.jsdelivr.net` 或 `github.io`。
- 在 `request.ts` 中增强针对配置文件拉取的自动降级（Fallback）机制，如果首选 CDN 失败，自动尝试备用镜像。
- 安装并配置 `vitest` 编写单元测试（针对 `request.ts`, `tvbox.ts` 等核心工具函数）。
- 安装并配置 `@playwright/test` 编写 E2E 测试，覆盖从设置页加载配置到首页展示、再到详情页的基本链路。

## Impact
- 受影响的代码：`src/pages/Settings.tsx`, `src/utils/request.ts`
- 新增目录：`tests/unit/`, `tests/e2e/`

## ADDED Requirements
### Requirement: 自动化测试 (Automated Testing)
系统应配置 Vitest 进行单元测试，配置 Playwright 进行 E2E 端到端测试。测试用例需要能在本地和 CI 中稳定运行。

## MODIFIED Requirements
### Requirement: 网页缓存清理与更新 (Cache Clearing and Updates)
当用户点击“清除所有缓存”时，系统应清空 `localStorage`、`sessionStorage`，注销所有 Service Worker，并跳转至 `import.meta.env.BASE_URL`（而不是写死的 `/`）。
点击“检查更新”时，执行硬重载（Hard Reload）。

### Requirement: 预设推荐源高可用 (Preset Sources High Availability)
系统应使用国内访问更稳定的镜像 CDN 地址作为预设源，且底层请求函数 `fetchData` 需要具备自动重试其他镜像地址的容灾能力，避免一直报 "Failed to fetch"。