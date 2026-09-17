/* ============================================================
   个人主页 · 运行配置（公开信息，不含任何敏感密钥）
   ------------------------------------------------------------
   用途：部署到 GitHub Pages 等**纯静态托管**时，没有后端可代理，
        意见反馈表单由浏览器直连 Supabase REST 接口。

   关于这里的 supabaseKey：
     - 它是 Supabase 的 **publishable / anon 公钥**，本身就设计为可放在
       浏览器里公开使用（跟网站前端打包在一起是这个产品的正常用法）。
     - 数据库已开启 RLS，策略只放行匿名 **INSERT**，不放行读取/修改/删除。
       因此即使有人拿到这个公钥，也只能往表里写，读不到任何反馈内容。
     - 真正不能公开的是 **service_role 密钥**，本项目从未使用、也不会写进前端。

   留空行为：
     supabaseUrl 或 supabaseKey 为空字符串时，前端自动回退为调用同源后端
     `/api/feedback`（即本地 `py server.py` 模式）。两种模式共用同一套表单 UI。

   换 Supabase 项目时：改这里的两个值 + 重跑 sql/feedback.sql 即可。
   ============================================================ */
window.SITE_CONFIG = {
  supabaseUrl: "https://fudznxnxtoiaxcxcvfuq.supabase.co",
  supabaseKey: "sb_publishable_5jEULdDIOcDqR-RusvihUw_9yT5y7w7",
  supabaseTable: "feedback"
};
