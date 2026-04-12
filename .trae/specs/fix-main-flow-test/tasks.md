# Tasks
- [x] Task 1: 简化应用内的数据源 Mock 逻辑
  - [x] SubTask 1.1: 在 `src/App.tsx` 中，当环境为 `localhost` 时，直接将默认 URL 设置为 `http://mock.api`，并初始化一组最基础的 mock 数据。
  - [x] SubTask 1.2: 移除 `src/utils/request.ts` 中过于复杂的多个跨域代理 fallback 机制，保留最基础的请求逻辑。对于 `http://mock.api` 直接返回静态的 JSON 字符串。
- [x] Task 2: 修复主流程测试脚本
  - [x] SubTask 2.1: 简化 `test_full_flow.py`，不再去尝试配置真实的数据源链接（如饭太硬），直接验证页面能否加载出 Mock 数据。
  - [x] SubTask 2.2: 确保脚本能够按顺序验证：首页列表渲染 -> 点击进入详情页 -> 验证剧集按钮 -> 点击进入播放页 -> 验证播放器渲染。
  - [x] SubTask 2.3: 运行 `python test_full_flow.py` 并确保测试完全通过。

# Task Dependencies
- [Task 2] depends on [Task 1]