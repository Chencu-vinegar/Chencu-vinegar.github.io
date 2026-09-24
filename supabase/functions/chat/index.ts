/* ============================================================
   个人主页 · 数字分身 Edge Function（Supabase / Deno）

   作用：把 DeepSeek 等大模型的调用放到服务端，前端只请求本函数。
        这样 **API Key 只存在 Supabase 的 Secrets 里**，永远不会
         出现在 GitHub Pages 的静态文件里（浏览器看不到任何密钥）。

   调用方式（前端 scripts/main.js 已实现）：
     POST https://<项目ref>.supabase.co/functions/v1/chat
     body: { "messages": [{ "role": "user", "content": "你好" }] }
     返回: { "reply": "……" }

   健康探测（前端用来显示「AI 在线 / 演示模式」）：
     GET  同上地址  →  { "aiEnabled": true, "model": "deepseek-flash" }

   需要的 Secrets（在 Supabase Dashboard → Project Settings → Edge Functions
   → Secrets 添加，或用 `supabase secrets set`）：
     DEEPSEEK_API_KEY      必填。大模型密钥，仅存在服务端。
     SITE_ANON_KEY         可选。填了它，函数会校验请求头 apikey/Authorization
                           必须与之相同，挡掉不带密钥的裸扫描请求。
     DEEPSEEK_API_BASE / DEEPSEEK_MODEL / DEEPSEEK_MAX_TOKENS /
     DEEPSEEK_TEMPERATURE / DEEPSEEK_TIMEOUT / DEEPSEEK_THINKING  可选，按需覆盖默认值。
     （模型名以 https://api-docs.deepseek.com 为准，但改模型名**不用改代码**：设 DEEPSEEK_MODEL 即可。）
     ALLOWED_ORIGIN        可选。默认 "*"，可改成 https://你的站点 收紧跨域。

   注意：SYSTEM_PROMPT（分身人格）需与 server.py 中的同名常量保持一致，
        改动时两处同步（见 docs/05-技术方案.md §1.1 与 docs/00 §5）。
   ============================================================ */

// ---------- 上游大模型配置（都可由 Secrets 覆盖，改配置不用改代码） ----------
const API_BASE = Deno.env.get("DEEPSEEK_API_BASE") ?? "https://api.deepseek.com/chat/completions";
// 模型名以 DeepSeek 官方文档为准（当前只有 deepseek-flash / deepseek-v4-pro）；
// 旧的 deepseek-chat 已不在文档列表中，用错名字会直接 502。
const MODEL = Deno.env.get("DEEPSEEK_MODEL") ?? "deepseek-flash";
const MAX_TOKENS = Number(Deno.env.get("DEEPSEEK_MAX_TOKENS") ?? "800");
const TEMPERATURE = Number(Deno.env.get("DEEPSEEK_TEMPERATURE") ?? "0.7");
const REQUEST_TIMEOUT_MS = Number(Deno.env.get("DEEPSEEK_TIMEOUT") ?? "60") * 1000;

// DeepSeek 默认开启「思考模式」：正式回答前先输出一大段思维链，又慢又按输出 token 计费。
// 数字分身只要 2-4 句简短回答，因此默认关闭；想打开设 DEEPSEEK_THINKING=enabled，
// 换成别的 OpenAI 兼容服务（不认识该参数）时设 DEEPSEEK_THINKING=omit 直接不发送。
const THINKING_ENV = (Deno.env.get("DEEPSEEK_THINKING") ?? "disabled").trim().toLowerCase();
const THINKING = THINKING_ENV === "enabled" || THINKING_ENV === "disabled" ? THINKING_ENV : "";

// ---------- 入参限制（与 server.py 一致，防止超长输入刷额度） ----------
const MAX_HISTORY = 20;
const MAX_CONTENT_LEN = 4000;

// ---------- 分身人格设定（与 server.py 的 SYSTEM_PROMPT 必须逐字一致） ----------
// 可陪聊、讲笑话（幽默），但介绍陈渠梁时只依据公开信息、不编造。
// 校验：py .deepworks/tmp/compare_prompts.py
const SYSTEM_PROMPT = `你是「陈渠梁的数字分身」——陈渠梁用 AI 做出来的分身，替他陪访客聊天。你友好、真诚、有幽默感，
既能陪人闲聊，也能把陈渠梁介绍清楚。

【关于陈渠梁的公开信息（你只能依据这些回答问题）】
- 姓名：陈渠梁
- 身份：天津大学香港理工大学深圳未来技术学院 2026 级学生
- 专业：计算机科学与技术
- 兴趣方向：创新实践、技术探索、人工智能
- 特点：相信「代码能改变世界」，把创新当作一种习惯，喜欢把想法动手实现并不断优化
- 邮箱：chenquliang@tju.edu.cn
- 微信：18603179528

【你的两种聊法】
1. 陪聊（默认）：访客想闲聊就自然聊下去——技术、学习、日常、吐槽、脑洞都可以。可以讲笑话、玩梗、适度自嘲。
2. 介绍：访客问起陈渠梁的学习、兴趣、经历、联系方式时，按上面的信息如实回答。

【幽默怎么用】
- 说人话，像朋友聊天，别像客服话术或产品说明书；允许口语、短句、小玩笑。
- 对方要正经答案时，先给正经答案，再顺手俏皮一句；不要每句话都抖机灵，也不要连着反问、过度热情。
- 让你讲笑话就认真讲：可以原创，也可以讲经典段子，要有铺垫也有笑点，别讲到一半就收。
- 讲笑话是讲笑话，别把编的段子说成陈渠梁的真实经历。
- 玩笑不拿别人的外貌、成绩、地域、性别、职业、家庭开涮，也不要给陈渠梁编造糗事。

【不能越过的底线】
1. 介绍陈渠梁只能使用上面列出的信息。不清楚的（具体成绩、家庭、私人经历、没答应过的事等）就坦白说
   「这部分我暂时不了解」，并建议对方用邮箱或微信联系本人，绝不编造。
2. 你是他的数字分身，不是他本人：可以用「我」的口吻介绍他，但不要冒充他做承诺、表态、答应事情。
3. 遇到违法、成人、挑衅攻击、政治敏感的内容，礼貌拒绝，然后把话题自然地带回轻松的范围。

【说话方式】
- 中文、口语化、简洁。
- 介绍陈渠梁：2-4 句；闲聊：1-3 句；讲笑话可以更长一些，但要讲完。
- 表情符号偶尔用一两个就好，不要堆砌。`;

// ---------- 跨域（GitHub Pages 与本地 localhost 都要能调） ----------
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/** 可选的密钥校验：只有配置了 SITE_ANON_KEY 才生效（密钥是公开 key，作用是挡裸扫描）。 */
function keyAllowed(req: Request): boolean {
  const expected = (Deno.env.get("SITE_ANON_KEY") ?? "").trim();
  if (!expected) return true;
  const apikey = (req.headers.get("apikey") ?? "").trim();
  const auth = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  return apikey === expected || auth === expected;
}

/** 从请求体里挑出合法的对话历史，超长与非法项直接丢弃。 */
function cleanMessages(input: unknown): Array<{ role: string; content: string }> {
  if (!Array.isArray(input)) return [];
  const clean: Array<{ role: string; content: string }> = [];
  const recent = input.slice(-MAX_HISTORY);
  for (const item of recent) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || !content.trim()) continue;
    clean.push({ role, content: content.slice(0, MAX_CONTENT_LEN) });
  }
  return clean;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // 浏览器跨域预检
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  if (!keyAllowed(req)) {
    return json(401, { error: "请求未携带有效密钥" });
  }

  const apiKey = (Deno.env.get("DEEPSEEK_API_KEY") ?? "").trim();

  // 健康探测：前端据此显示「● AI 在线」或「● 演示模式」
  if (req.method === "GET") {
    return json(200, {
      aiEnabled: Boolean(apiKey),
      model: MODEL,
      source: "supabase-edge-function",
    });
  }

  if (req.method !== "POST") {
    return json(405, { error: "只支持 GET / POST" });
  }

  if (!apiKey) {
    // 没配密钥时明确告知，前端会自动回退到本地演示回复，页面不会报错
    return json(503, {
      error: "服务端未配置 DEEPSEEK_API_KEY，已回退到本地演示回复。",
      fallback: true,
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "请求体不是合法 JSON" });
  }

  const payloadObj = (body ?? {}) as { messages?: unknown; message?: unknown };
  let messages = cleanMessages(payloadObj.messages);
  if (!messages.length && typeof payloadObj.message === "string" && payloadObj.message.trim()) {
    messages = [{ role: "user", content: payloadObj.message.slice(0, MAX_CONTENT_LEN) }];
  }
  if (!messages.length) {
    return json(400, { error: "messages 为空或格式不正确" });
  }

  const upstreamBody: Record<string, unknown> = {
    model: MODEL,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    temperature: TEMPERATURE,
    max_tokens: MAX_TOKENS,
    stream: false,
  };
  // temperature 只在非思考模式生效（思考模式下会被忽略）
  if (THINKING) upstreamBody.thinking = { type: THINKING };

  try {
    const upstream = await fetch(API_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!upstream.ok) {
      const detail = (await upstream.text().catch(() => "")).slice(0, 500);
      console.error(`[chat] 上游 ${upstream.status}: ${detail}`);
      return json(502, { error: `大模型返回错误 ${upstream.status}`, detail });
    }

    const result = await upstream.json();
    const reply = result?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      return json(502, { error: "大模型响应格式异常" });
    }
    return json(200, { reply: reply.trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[chat] 调用失败: ${message}`);
    return json(502, { error: `请求大模型失败：${message}` });
  }
});
