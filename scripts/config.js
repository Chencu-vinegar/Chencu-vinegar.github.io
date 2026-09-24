/* ============================================================
   个人主页 · 运行配置（公开信息，不含任何敏感密钥）
   ------------------------------------------------------------
   用途：部署到 GitHub Pages 等**纯静态托管**时没有自己的后端，
         两个动态模块都改由「浏览器 → Supabase」直连完成：
           意见反馈 → Supabase REST（数据库）
           数字分身 → Supabase Edge Function（函数，内含大模型密钥）

   ① supabaseUrl / supabaseKey
     - supabaseKey 是 Supabase 的 **publishable / anon 公钥**，本身就设计为
       可放在浏览器里公开使用（和网站前端一起分发是该产品的正常用法）。
     - 数据库已开 RLS，策略只放行匿名 **INSERT**，读不到任何反馈内容。
     - 真正不能公开的是 **service_role 密钥**：本项目从未使用、也绝不会写进前端。

   ② chatUrl（数字分身）
     - 指向 Supabase Edge Function `chat`，大模型（DeepSeek）的 API Key 存在
       Supabase 的 Secrets 里，**只在服务端**，浏览器完全接触不到。
     - 留空 → 回退调用同源后端 `/api/chat`（本地 `py server.py` 模式）；
                两者都不可用时，前端自动回退本地演示回复，页面不会报错。
     - 首次部署函数后若地址有变，只改这一行即可（部署步骤见 docs/05 §4.2）。

   换 Supabase 项目时：改这里的两个值 + 重跑 sql/feedback.sql + 重新部署函数。
   ============================================================ */
window.SITE_CONFIG = {
  // —— Supabase 项目（反馈入库 + 数字分身函数都走它）——
  supabaseUrl: "https://fudznxnxtoiaxcxcvfuq.supabase.co",
  supabaseKey: "sb_publishable_5jEULdDIOcDqR-RusvihUw_9yT5y7w7",
  supabaseTable: "feedback",

  // —— 数字分身：Edge Function 地址（函数名固定为 chat，留空则回退本地后端）——
  chatUrl: "https://fudznxnxtoiaxcxcvfuq.supabase.co/functions/v1/chat"
};
