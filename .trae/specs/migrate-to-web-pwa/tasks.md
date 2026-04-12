# Tasks

- [x] Task 1: 抽象跨域请求工具 (CORS Proxy)
  - [x] SubTask 1.1: 在 `src/utils/request.ts` 中封装 `fetchData` 函数。
  - [x] SubTask 1.2: 判断运行环境 (`window.ipcRenderer` 是否存在)，若是 Web 环境则拼接公共的 CORS 代理前缀（如 `https://corsproxy.io/?`）来发起请求。
  - [x] SubTask 1.3: 替换项目中所有的请求调用为新的 `fetchData` 方法。
- [x] Task 2: 移动端响应式 UI 改造
  - [x] SubTask 2.1: 在 `Home.tsx` 中，将侧边栏（Sidebar）在小屏幕设备（`< 768px`）下改为顶部/底部导航或汉堡菜单。
  - [x] SubTask 2.2: 调整影视卡片的 CSS Grid，在移动端单行显示或双列显示 (`grid-cols-2`)。
  - [x] SubTask 2.3: 调整 `Detail.tsx` 和 `Play.tsx` 在手机屏幕下的左右分栏为上下堆叠布局。
- [x] Task 3: 配置 PWA 支持
  - [x] SubTask 3.1: 安装并配置 `vite-plugin-pwa`。
  - [x] SubTask 3.2: 补充 `manifest.json` 所需的图标、主题色等基础配置。

# Task Dependencies
- [Task 1] 无依赖，可立即执行。
- [Task 2] 无依赖，可与 Task 1 并行。
- [Task 3] 依赖 [Task 2] 完成以提供完整的移动端体验。