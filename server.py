#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
个人主页 · 数字分身后端代理（零依赖，Python 3.8+）

功能：
  1. 静态托管本项目（index.html / styles / scripts / assets ...）
  2. POST /api/chat   代理转发到 DeepSeek 大模型，返回数字分身回复
  3. GET  /api/health 返回 AI 是否已启用，供前端显示状态

为什么需要它：
  纯静态页面若直接调用大模型 API，密钥会暴露在浏览器里。
  本代理把密钥保存在服务端（环境变量 / .env），前端只调用同源的 /api/chat。

使用方法：
  1) 复制 .env.example 为 .env，填入 DEEPSEEK_API_KEY
  2) 运行：py server.py
  3) 浏览器打开 http://localhost:8000

未配置密钥时：
  /api/chat 返回 503，前端会自动回退到本地演示回复，页面照常可用。
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
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8000"))

# ============================================================
#  数字分身配置（改这里即可，无需动前端）
# ============================================================
API_BASE = os.environ.get("DEEPSEEK_API_BASE", "https://api.deepseek.com/chat/completions")
MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
MAX_TOKENS = int(os.environ.get("DEEPSEEK_MAX_TOKENS", "800"))
TEMPERATURE = float(os.environ.get("DEEPSEEK_TEMPERATURE", "0.7"))
REQUEST_TIMEOUT = int(os.environ.get("DEEPSEEK_TIMEOUT", "60"))

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

# 最多携带的历史消息条数（避免上下文过长）
MAX_HISTORY = 20
# 单条消息最大字符数（防止超长输入）
MAX_CONTENT_LEN = 4000


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


def get_api_key() -> str:
    return os.environ.get("DEEPSEEK_API_KEY", "").strip()


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
            return self.send_json(200, {"aiEnabled": bool(get_api_key()), "model": MODEL})
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?", 1)[0].rstrip("/")
        if path == "/api/chat":
            return self.handle_chat()
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
    print("  按 Ctrl+C 停止服务")
    print("=" * 56)

    with ThreadingHTTPServer((HOST, PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[server] 已停止")


if __name__ == "__main__":
    main()
