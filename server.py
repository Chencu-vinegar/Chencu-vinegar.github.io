#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
个人主页 · 数字分身后端代理（零依赖，Python 3.8+）

功能：
  1. 静态托管本项目（index.html / styles / scripts / assets ...）
  2. POST /api/chat     代理转发到 DeepSeek 大模型，返回数字分身回复
  3. POST /api/feedback 接收意见反馈并写入 Supabase 数据库
  4. GET  /api/health   返回 AI / 反馈功能是否已启用，供前端显示状态

为什么需要它：
  纯静态页面若直接调用外部服务，密钥会暴露在浏览器里。
  本代理把密钥保存在服务端（环境变量 / .env），前端只调用同源的 /api/*。

使用方法：
  1) 复制 .env.example 为 .env，按需填入
       DEEPSEEK_API_KEY                    （数字分身）
       SUPABASE_URL / SUPABASE_KEY         （意见反馈，建表 SQL 见 sql/feedback.sql）
  2) 运行：py server.py
  3) 浏览器打开 http://localhost:8000

未配置时：
  /api/chat     返回 503，前端自动回退到本地演示回复；
  /api/feedback 返回 503，前端提示反馈功能尚未接通。
  两者都不影响页面其余部分正常浏览。
"""

import http.server
import json
import os
import pathlib
import socketserver
import sys
import urllib.error
import urllib.request

# ============================================================
#  基础配置
# ============================================================
BASE_DIR = pathlib.Path(__file__).resolve().parent


def load_dotenv(path: pathlib.Path) -> None:
    """极简 .env 解析：KEY=VALUE，每行一条，支持 # 注释。已存在的环境变量不覆盖。"""
    if not path.exists():
        return
    try:
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
    except OSError as exc:
        print(f"[warn] 读取 .env 失败：{exc}", file=sys.stderr)


# 必须在下面的配置常量之前加载，否则 os.environ.get 读不到 .env 里的值
load_dotenv(BASE_DIR / ".env")

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8000"))

# ============================================================
#  数字分身配置（改这里即可，无需动前端）
# ============================================================
API_BASE = os.environ.get("DEEPSEEK_API_BASE", "https://api.deepseek.com/chat/completions")
# 模型名以 DeepSeek 官方文档为准（当前只有 deepseek-flash / deepseek-v4-pro）；
# 旧的 deepseek-chat 已不在文档列表中，用错名字会直接 502。
MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-flash")
MAX_TOKENS = int(os.environ.get("DEEPSEEK_MAX_TOKENS", "800"))
TEMPERATURE = float(os.environ.get("DEEPSEEK_TEMPERATURE", "0.7"))
REQUEST_TIMEOUT = int(os.environ.get("DEEPSEEK_TIMEOUT", "60"))

# DeepSeek 默认开启「思考模式」：正式回答前先输出一大段思维链，又慢又按输出 token 计费。
# 数字分身只要 2-4 句简短回答，因此默认关闭；想打开设 DEEPSEEK_THINKING=enabled，
# 换成别的 OpenAI 兼容服务（不认识该参数）时设 DEEPSEEK_THINKING=omit 直接不发送。
_THINKING_ENV = os.environ.get("DEEPSEEK_THINKING", "disabled").strip().lower()
THINKING = _THINKING_ENV if _THINKING_ENV in ("enabled", "disabled") else ""

# 分身人格设定：只依据陈渠梁的公开信息回答，不编造。
SYSTEM_PROMPT = """你是「陈渠梁的数字分身」，一个友好、真诚的 AI 助手，代表陈渠梁与访客交流。

【关于陈渠梁的公开信息（你只能依据这些回答问题）】
- 姓名：陈渠梁
- 身份：天津大学香港理工大学深圳未来技术学院 2026 级学生
- 专业：计算机科学与技术
- 兴趣方向：创新实践、技术探索、人工智能
- 特点：相信「代码能改变世界」，把创新当作一种习惯，喜欢把想法动手实现并不断优化
- 邮箱：chenquliang@tju.edu.cn
- 微信：18603179528

【回答要求】
1. 用中文回答，语气友好、简洁、口语化，避免空话套话。
2. 只使用上面列出的信息作答。遇到不清楚或未提供的信息（如具体成绩、家庭、私人经历等），
   要坦诚说明「这部分我暂时不了解」，并建议对方通过邮箱或微信联系本人，绝不要编造。
3. 你就是陈渠梁的数字分身，以「我」的口吻介绍陈渠梁时，说明自己是他的分身，不要冒充本人做出承诺。
4. 若访客问与陈渠梁无关的问题，礼貌地把话题引导回「关于陈渠梁」的范围内。
5. 回答控制在 2-4 句话以内。"""

# ============================================================
#  意见反馈配置（Supabase）
# ============================================================
# 在 .env 中填入 SUPABASE_URL 与 SUPABASE_KEY 后，反馈功能自动启用。
# 密钥用 anon / publishable key 即可：数据库侧只放行了「匿名插入」，
# 即使密钥泄露，他人也无法读取你收到的反馈内容。
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "").strip()
_table_raw = os.environ.get("SUPABASE_TABLE", "feedback").strip()
# 表名只允许字母、数字、下划线，避免拼出异常请求路径
SUPABASE_TABLE = _table_raw if _table_raw.replace("_", "").isalnum() else "feedback"
SUPABASE_TIMEOUT = int(os.environ.get("SUPABASE_TIMEOUT", "20"))

# 反馈内容长度上限（与建表约束保持一致）
FEEDBACK_MAX_LEN = 2000

# 最多携带的历史消息条数（避免上下文过长）
MAX_HISTORY = 20
# 单条消息最大字符数（防止超长输入）
MAX_CONTENT_LEN = 4000


def get_api_key() -> str:
    return os.environ.get("DEEPSEEK_API_KEY", "").strip()


def feedback_enabled() -> bool:
    """反馈功能是否已接通（Supabase 配置齐全）。"""
    return bool(SUPABASE_URL and SUPABASE_KEY)


class Handler(http.server.SimpleHTTPRequestHandler):
    """静态托管 + /api/* 接口。"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    # ---------- 工具方法 ----------
    def send_json(self, status: int, obj: dict) -> None:
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            return json.loads(raw.decode("utf-8") or "{}")
        except (ValueError, UnicodeDecodeError):
            return None

    # ---------- 路由 ----------
    def do_GET(self):
        path = self.path.split("?", 1)[0].rstrip("/")
        if path == "/api/health":
            return self.send_json(200, {
                "aiEnabled": bool(get_api_key()),
                "model": MODEL,
                "feedbackEnabled": feedback_enabled(),
            })
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?", 1)[0].rstrip("/")
        if path == "/api/chat":
            return self.handle_chat()
        if path == "/api/feedback":
            return self.handle_feedback()
        return self.send_json(404, {"error": "接口不存在"})

    # ---------- /api/chat ----------
    def handle_chat(self):
        api_key = get_api_key()
        if not api_key:
            return self.send_json(503, {
                "error": "服务端未配置 DEEPSEEK_API_KEY，已回退到本地演示回复。",
                "fallback": True,
            })

        data = self.read_json_body()
        if data is None:
            return self.send_json(400, {"error": "请求体不是合法 JSON"})

        messages = data.get("messages")
        if not isinstance(messages, list) or not messages:
            single = data.get("message")
            messages = [{"role": "user", "content": str(single)}] if single else []

        clean = []
        for item in messages[-MAX_HISTORY:]:
            if not isinstance(item, dict):
                continue
            role = item.get("role")
            content = item.get("content")
            if role in ("user", "assistant") and isinstance(content, str) and content.strip():
                clean.append({"role": role, "content": content[:MAX_CONTENT_LEN]})
        if not clean:
            return self.send_json(400, {"error": "messages 为空或格式不正确"})

        payload = {
            "model": MODEL,
            "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + clean,
            "temperature": TEMPERATURE,
            "max_tokens": MAX_TOKENS,
            "stream": False,
        }
        # temperature 只在非思考模式生效（思考模式下会被忽略）
        if THINKING:
            payload["thinking"] = {"type": THINKING}
        request = urllib.request.Request(
            API_BASE,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            reply = result["choices"][0]["message"]["content"].strip()
            return self.send_json(200, {"reply": reply})
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "ignore")[:500]
            print(f"[error] 上游 {exc.code}: {detail}", file=sys.stderr)
            return self.send_json(502, {"error": f"大模型返回错误 {exc.code}", "detail": detail})
        except urllib.error.URLError as exc:
            print(f"[error] 网络错误：{exc.reason}", file=sys.stderr)
            return self.send_json(502, {"error": f"无法连接大模型：{exc.reason}"})
        except (KeyError, IndexError, ValueError) as exc:
            print(f"[error] 解析响应失败：{exc}", file=sys.stderr)
            return self.send_json(502, {"error": "大模型响应格式异常"})
        except OSError as exc:
            print(f"[error] 请求失败：{exc}", file=sys.stderr)
            return self.send_json(502, {"error": f"请求大模型失败：{exc}"})

    # ---------- /api/feedback ----------
    def handle_feedback(self):
        if not feedback_enabled():
            return self.send_json(503, {
                "error": "反馈功能尚未接通：服务端未配置 SUPABASE_URL / SUPABASE_KEY。",
                "fallback": True,
            })

        data = self.read_json_body()
        if data is None:
            return self.send_json(400, {"error": "请求体不是合法 JSON"})

        # 蜜罐命中：机器人会填写隐藏字段，这里假装成功但直接丢弃
        if str(data.get("website") or "").strip():
            print("[info] 反馈蜜罐命中，已丢弃", file=sys.stderr)
            return self.send_json(201, {"ok": True})

        message = str(data.get("message") or "").strip()
        if not message:
            return self.send_json(400, {"error": "反馈内容不能为空"})
        if len(message) > FEEDBACK_MAX_LEN:
            return self.send_json(400, {"error": f"反馈内容过长（最多 {FEEDBACK_MAX_LEN} 字）"})

        record = {
            "nickname": str(data.get("nickname") or "").strip()[:50] or None,
            "contact": str(data.get("contact") or "").strip()[:120] or None,
            "category": str(data.get("category") or "其他").strip()[:20] or "其他",
            "message": message,
            "page_url": str(data.get("page_url") or "").strip()[:500] or None,
            "user_agent": (self.headers.get("User-Agent") or "")[:300] or None,
        }

        request = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/{SUPABASE_TABLE}",
            data=json.dumps(record, ensure_ascii=False).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Prefer": "return=minimal",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=SUPABASE_TIMEOUT) as resp:
                code = resp.getcode()
                if code not in (200, 201, 204):
                    return self.send_json(502, {"error": f"反馈写入失败（HTTP {code}）"})
            return self.send_json(201, {"ok": True})
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "ignore")[:400]
            print(f"[error] Supabase {exc.code}: {detail}", file=sys.stderr)
            return self.send_json(502, {
                "error": f"反馈写入失败（HTTP {exc.code}）",
                "detail": detail,
            })
        except urllib.error.URLError as exc:
            print(f"[error] Supabase 网络错误：{exc.reason}", file=sys.stderr)
            return self.send_json(502, {"error": f"无法连接反馈服务：{exc.reason}"})
        except OSError as exc:
            print(f"[error] 反馈请求失败：{exc}", file=sys.stderr)
            return self.send_json(502, {"error": f"反馈请求失败：{exc}"})

    # 简化日志
    def log_message(self, fmt, *args):
        sys.stderr.write("[server] " + (fmt % args) + "\n")


class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


def main():
    load_dotenv(BASE_DIR / ".env")

    url = f"http://{HOST}:{PORT}"
    print("=" * 56)
    print("  个人主页 · 本地服务已启动")
    print(f"  访问地址：{url}")
    if get_api_key():
        print(f"  数字分身：已启用 DeepSeek（{MODEL}）")
    else:
        print("  数字分身：未检测到 DEEPSEEK_API_KEY")
        print("            → 当前为演示模式（本地关键词回复）")
        print("            → 启用方法：复制 .env.example 为 .env 并填入密钥")
    if feedback_enabled():
        print(f"  意见反馈：已接通 Supabase（表 {SUPABASE_TABLE}）")
    else:
        print("  意见反馈：未配置 SUPABASE_URL / SUPABASE_KEY")
        print("            → 启用方法：见 .env.example 第二节，建表 SQL 见 sql/feedback.sql")
    print("  按 Ctrl+C 停止服务")
    print("=" * 56)

    with ThreadingHTTPServer((HOST, PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[server] 已停止")


if __name__ == "__main__":
    main()
