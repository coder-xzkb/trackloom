# 拾曲 Trackloom

在网易云音乐网页整理歌单。支持按歌曲的演唱语种、类别或两者组合分类，确认后可新建歌单，也可去重追加到已有歌单。

## 安装

```bash
npm ci
npm run build
```

打开 Chrome 的 `chrome://extensions/`，启用开发者模式，点击「加载已解压的扩展程序」，选择 `dist/`。登录网易云音乐网页后，点击左下角的蓝色按钮。

## 使用

1. 选来源歌单、分类维度和曲目。
2. 开始分类。插件会识别有明确标签或版本说明的歌曲，其余留在人工确认池。
3. 检查结果，补齐或移出待确认的歌曲，再选目标歌单。

### AI 服务（可选）

在插件首页展开「AI 服务」。默认是 DeepSeek（`deepseek-flash`），也可选 OpenAI 或填写兼容 OpenAI Chat Completions 的地址和模型。填入 API Key，测试后保存。API Key 留空时，仍可用本地规则和人工确认完成整理。

新保存的 API Key 存在当前浏览器。启用 AI 后，待判断歌曲的名称、歌手、专辑等元数据会发给所选服务。更新已安装的旧版时，重新构建原目录并刷新扩展即可继续使用旧设置。

## 测试

- `npm test` 运行自动化测试。
- `npm run test:ui` 打开本地模拟界面（`http://127.0.0.1:4173/tests/ui-preview.html`）。

## 项目来源

基于 [fy-xbot/TuneNest](https://github.com/fy-xbot/tune-nest) 修改，保留原作者署名与提交历史。上游在 [项目介绍页源码](https://github.com/fy-xbot/tune-nest/blob/main/site/index.html) 标注 MIT，见 [许可证](LICENSE)。
