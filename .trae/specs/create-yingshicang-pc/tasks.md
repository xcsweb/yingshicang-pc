# Tasks

- [x] Task 1: 初始化项目
  - [x] SubTask 1.1: 搭建基于 Electron + React (或 Vue) 的桌面应用基础框架。
  - [x] SubTask 1.2: 配置基础的路由和状态管理（Zustand/Redux 等）。
- [x] Task 2: 数据源管理模块开发
  - [x] SubTask 2.1: 开发设置页面，包含数据源输入框和保存按钮。
  - [x] SubTask 2.2: 实现对 TVBox JSON 数据源的请求、解析与本地化持久存储（如 localStorage 或 IndexedDB）。
- [x] Task 3: 首页与分类功能
  - [x] SubTask 3.1: 解析数据源中的站点列表，实现站源切换。
  - [x] SubTask 3.2: 请求并渲染选中站源的分类列表和首页推荐影视数据。
- [x] Task 4: 影视详情与搜索功能
  - [x] SubTask 4.1: 开发搜索页面，支持根据关键字调用接口进行搜索。
  - [x] SubTask 4.2: 开发影视详情页，展示影片信息、播放线路及剧集列表。
- [x] Task 5: 视频播放器集成
  - [x] SubTask 5.1: 集成支持 m3u8 和常见视频格式的 Web 播放器。
  - [x] SubTask 5.2: 实现从剧集列表点击到播放器播放的完整链路，支持选集和切换线路。

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 3]
- [Task 5] depends on [Task 4]
