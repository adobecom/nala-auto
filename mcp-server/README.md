# nala-diff-judge-mcp

一个 MCP（Model Context Protocol）server，让任何支持 MCP 且带视觉能力的 AI
客户端（GitHub Copilot CLI、Claude Desktop、Cursor 等）都能直接**看图判断**
nala-auto 截图对比（screenshot-diff）结果是不是真的视觉回归。

## 为什么需要它

nala-auto 网站本身不能直接调用 AI 做判断。这个 MCP server 不跑任何模型——
它只是把某个 dataset/页面的 baseline、new、diff 三张截图从 S3 抓下来，作为
图片内容返回给调用它的 AI 客户端。**判断这一步，由你自己的 AI 客户端（已经
具备视觉能力）来做**，不需要额外的 API key，也没有把 Copilot/其他模型接到
第三方代理的合规风险。

## 安装（同事怎么装）

需要 Node.js ≥ 18，并且能访问 Adobe 内网/VPN（S3 域名 `s3-sj3.corp.adobe.com`
是内网地址，跟直接打开 nala-auto 网站需要的网络条件一样）。

```bash
git clone https://github.com/adobecom/nala-auto.git
cd nala-auto/mcp-server
npm install
```

然后在你的 MCP 客户端配置里加上这个 server。例如 **GitHub Copilot CLI**
（`~/.copilot/mcp-config.json` 或对应配置文件）：

```json
{
  "mcpServers": {
    "nala-diff-judge": {
      "command": "node",
      "args": ["/绝对路径/nala-auto/mcp-server/index.js"]
    }
  }
}
```

**Claude Desktop**（`claude_desktop_config.json`）同理：

```json
{
  "mcpServers": {
    "nala-diff-judge": {
      "command": "node",
      "args": ["/绝对路径/nala-auto/mcp-server/index.js"]
    }
  }
}
```

重启客户端后就会出现三个工具。

## 提供的工具

- **`list_known_datasets`** — 列出常见内置 dataset 名（如 `bacom`、
  `dc`），仅作提示；自定义 dataset（如 `bacom-live-qa`）不在这个列表里，
  但只要你知道名字（就是 nala-auto 网址 `/imagediff/{dataset}` 里的那部分）
  照样能用。
- **`list_snapshots(dataset)`** — 拉取该 dataset 的 `results.json`，列出
  所有页面 key、对比的 URL。
- **`get_diff_images(dataset, key, order?)`** — 抓取该页面的 baseline、
  new、diff 三张截图，作为图片返回。**这一步之后就交给 AI 客户端自己看图
  判断**：是真的内容/布局回归，还是视频帧、时间戳、广告位这类噪音。

## 典型对话示例

> 帮我判断一下 bacom-live-qa 里 "It Starts with Adobe-chrome" 这个 diff
> 是不是真的问题

AI 会自动调用 `get_diff_images`，看图后直接给出结论和理由。

## 数据来源

跟 nala-auto 网页用的是同一个 S3 桶（`https://s3-sj3.corp.adobe.com/milo/
screenshots/{dataset}/results.json`），也就是 Vite 开发代理里 `/api/milo`
指向的地址，参见仓库根目录 `vite.config.js`。
