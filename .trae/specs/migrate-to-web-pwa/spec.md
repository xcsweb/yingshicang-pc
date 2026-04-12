# 影视仓 Web版与移动端适配 Spec

## Why
完全可以做成网页版！目前的项目基于 React + Vite，本身就是 Web 技术栈，天然支持编译为纯网页应用。将其改造为 Web 版并适配移动端（支持 PWA），能够让用户直接在手机、平板或任意浏览器的设备上访问和观看，无需安装额外的客户端软件。

唯一的技术瓶颈在于**跨域限制 (CORS)**：由于纯网页无法像 Electron 主进程那样直接请求第三方站点的 API（会被浏览器安全策略拦截），因此在纯 Web 环境下必须引入代理服务。

## What Changes
- 改造网络请求层：抽离统一的 `fetchData` 工具。检测当前环境，如果是在 Electron 中运行则继续使用 `ipcRenderer`；如果是在纯 Web 环境中运行，则使用代理（如 `corsproxy.io` 或自定义代理）来绕过跨域限制。
- 移动端 UI 响应式适配：修改侧边栏布局，在小屏幕设备上改为底部导航栏或抽屉菜单（Drawer）；调整首页影视卡片网格和视频播放器的响应式比例。
- 引入 PWA 支持：配置 `vite-plugin-pwa`，使得网页版能够像原生 App 一样“添加至主屏幕”，并拥有独立的应用图标和启动页。

## Impact
- Affected specs: 网络请求工具模块、全局 UI 布局组件、Vite 配置文件。
- Affected code: 
  - `src/utils/request.ts` (新建)
  - `src/pages/Home.tsx`, `src/pages/Settings.tsx`, `src/pages/Detail.tsx`, `src/pages/Play.tsx`
  - `vite.config.ts`

## ADDED Requirements
### Requirement: 多环境兼容的网络请求
系统应自动检测运行环境，确保无论是桌面端（Electron）还是移动端（Web）都能成功拉取数据。
#### Scenario: 纯网页端获取数据
- **WHEN** 用户在手机浏览器中访问应用并配置数据源
- **THEN** 系统自动使用配置的 CORS 代理服务器发起 `fetch` 请求，成功获取第三方影视数据而不触发跨域拦截。

### Requirement: PWA 移动端沉浸式体验
系统支持作为 PWA 独立安装在移动设备上。
#### Scenario: 手机端安装应用
- **WHEN** 用户在手机浏览器中打开网页，并点击“添加至主屏幕”
- **THEN** 生成独立的桌面图标，点击后以全屏无浏览器地址栏的沉浸模式启动。
