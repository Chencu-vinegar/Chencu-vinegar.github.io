/* ============================================================
   个人主页 · 交互脚本
   功能：主题切换 / 移动端菜单 / 锚点平滑滚动 / 微信点击复制 / 意见反馈提交 / 数字分身对话
   说明：反馈提交有两条路径 —— 静态托管直连 Supabase，本地回退同源 /api/feedback。
   ============================================================ */
(function () {
  "use strict";

  /* ---------- 主题切换（深/浅） ---------- */
  var themeToggle = document.getElementById("themeToggle");
  var root = document.documentElement;

  function applyTheme(theme) {
    if (theme === "dark") {
      root.setAttribute("data-theme", "dark");
    } else {
      root.removeAttribute("data-theme");
    }
    try {
      localStorage.setItem("site-theme", theme);
    } catch (e) { /* 隐私模式下忽略 */ }
  }

  // 读取上次主题，默认浅色
  var savedTheme = null;
  try { savedTheme = localStorage.getItem("site-theme"); } catch (e) {}
  applyTheme(savedTheme === "dark" ? "dark" : "light");

  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var current = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
      applyTheme(current === "dark" ? "light" : "dark");
    });
  }

  /* ---------- 移动端菜单 ---------- */
  var menuToggle = document.getElementById("menuToggle");
  var siteNav = document.getElementById("siteNav");

  function closeMenu() {
    if (siteNav) siteNav.classList.remove("open");
    if (menuToggle) menuToggle.setAttribute("aria-expanded", "false");
  }

  if (menuToggle && siteNav) {
    menuToggle.addEventListener("click", function () {
      var open = siteNav.classList.toggle("open");
      menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    // 点击导航项后收起菜单
    siteNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeMenu);
    });
  }

  /* ---------- 锚点平滑滚动（兼容浏览器） ---------- */
  var navLinks = document.querySelectorAll('a[href^="#"]');
  navLinks.forEach(function (link) {
    link.addEventListener("click", function (e) {
      var targetId = link.getAttribute("href");
      if (!targetId || targetId === "#") return;
      var target = document.querySelector(targetId);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      // 移动端菜单收起
      closeMenu();
    });
  });

  /* ---------- 意见反馈：静态托管直连 Supabase，本地回退同源后端 ---------- */
  var feedbackBusy = false;

  // 公开运行配置（scripts/config.js）。没配置就走同源后端 /api/feedback。
  var SITE_CONFIG = (typeof window !== "undefined" && window.SITE_CONFIG) ? window.SITE_CONFIG : {};
  var SUPABASE_ENDPOINT = (SITE_CONFIG.supabaseUrl && SITE_CONFIG.supabaseKey)
    ? String(SITE_CONFIG.supabaseUrl).replace(/\/+$/, "") + "/rest/v1/" + (SITE_CONFIG.supabaseTable || "feedback")
    : "";

  function setStatus(el, text, kind) {
    if (!el) return;
    el.textContent = text || "";
    el.className = "feedback-status" + (kind ? " is-" + kind : "");
  }

  // 服务端字段长度保护的前端镜像：直连时避免被数据库约束打回
  function trimTo(value, max) {
    var s = (value == null ? "" : String(value)).trim();
    return s ? s.slice(0, max) : null;
  }

  // 模式 A：浏览器直连 Supabase（RLS 只放行匿名 insert，用的是可公开的 publishable key）
  function postDirect(payload) {
    var record = {
      nickname: trimTo(payload.nickname, 50),
      contact: trimTo(payload.contact, 120),
      category: trimTo(payload.category, 20) || "其他",
      message: String(payload.message == null ? "" : payload.message).trim(),
      page_url: trimTo(payload.page_url, 500),
      user_agent: (navigator.userAgent || "").slice(0, 300) || null
    };

    return fetch(SUPABASE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SITE_CONFIG.supabaseKey,
        "Authorization": "Bearer " + SITE_CONFIG.supabaseKey,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(record)
    }).then(function (res) {
      if (res.ok) return true;
      return res.json().catch(function () { return {}; }).then(function (data) {
        throw new Error(data.message || data.hint || ("HTTP " + res.status));
      });
    });
  }

  // 模式 B：同源后端 /api/feedback（本地 py server.py 运行时）
  function postBackend(payload) {
    return fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
        return true;
      });
    });
  }

  // 通用提交：完整反馈表单与原「联系我」留言表单共用
  function submitFeedback(payload, btn, statusEl) {
    if (feedbackBusy) return Promise.resolve(false);

    // 蜜罐命中：机器人会填写隐藏字段，这里假装成功，且一个字节都不发出去
    var honey = (payload && payload.website) ? String(payload.website).trim() : "";
    if (honey) {
      setStatus(statusEl, "提交成功，感谢你的反馈！", "success");
      return Promise.resolve(true);
    }

    feedbackBusy = true;
    if (btn) btn.disabled = true;
    setStatus(statusEl, "正在提交……", "pending");

    return (SUPABASE_ENDPOINT ? postDirect(payload) : postBackend(payload))
      .then(function () {
        setStatus(statusEl, "提交成功，感谢你的反馈！", "success");
        return true;
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : "网络异常";
        setStatus(statusEl, "提交失败：" + msg, "error");
        return false;
      })
      .then(function (ok) {
        feedbackBusy = false;
        if (btn) btn.disabled = false;
        return ok;
      });
  }

  /* ---------- 完整反馈表单 ---------- */
  var feedbackForm = document.getElementById("feedbackForm");
  if (feedbackForm) {
    var fbSubmit = document.getElementById("fbSubmit");
    var fbStatus = document.getElementById("fbStatus");
    var fbMessage = document.getElementById("fbMessage");
    var fbCounter = document.getElementById("fbCounter");

    if (fbMessage && fbCounter) {
      var syncCounter = function () { fbCounter.textContent = String(fbMessage.value.length); };
      fbMessage.addEventListener("input", syncCounter);
      syncCounter();
    }

    feedbackForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var message = fbMessage ? fbMessage.value.trim() : "";
      if (!message) {
        setStatus(fbStatus, "请先填写反馈内容。", "error");
        if (fbMessage) fbMessage.focus();
        return;
      }
      if (message.length > 2000) {
        setStatus(fbStatus, "反馈内容过长，请控制在 2000 字以内。", "error");
        return;
      }

      var val = function (id) {
        var el = document.getElementById(id);
        return el ? el.value.trim() : "";
      };
      var websiteEl = document.getElementById("fbWebsite");

      submitFeedback({
        nickname: val("fbName"),
        contact: val("fbContact"),
        category: val("fbCategory") || "其他",
        message: message,
        website: websiteEl ? websiteEl.value : "",
        page_url: location.href
      }, fbSubmit, fbStatus).then(function (ok) {
        if (ok) {
          feedbackForm.reset();
          if (fbCounter) fbCounter.textContent = "0";
        }
      });
    });
  }

  /* ---------- 原「联系我」留言表单：同样接入反馈接口 ---------- */
  var contactForm = document.querySelector(".contact-form");
  if (contactForm) {
    var contactStatus = document.createElement("p");
    contactStatus.className = "feedback-status";
    contactStatus.setAttribute("role", "status");
    contactStatus.setAttribute("aria-live", "polite");
    contactForm.appendChild(contactStatus);

    contactForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var msgEl = contactForm.querySelector('textarea[name="message"]');
      var nameEl = contactForm.querySelector('input[name="name"]');
      var mailEl = contactForm.querySelector('input[name="email"]');
      var message = msgEl ? msgEl.value.trim() : "";

      if (!message) {
        setStatus(contactStatus, "请先填写留言内容。", "error");
        if (msgEl) msgEl.focus();
        return;
      }

      submitFeedback({
        nickname: nameEl ? nameEl.value.trim() : "",
        contact: mailEl ? mailEl.value.trim() : "",
        category: "留言",
        message: message,
        page_url: location.href
      }, contactForm.querySelector('button[type="submit"]'), contactStatus).then(function (ok) {
        if (ok) contactForm.reset();
      });
    });
  }

  /* ---------- 我的数字分身：线上 Edge Function → 本地后端 → 演示回复 ---------- */
  // 线上（GitHub Pages）调用 Supabase Edge Function：大模型密钥只存在 Supabase Secrets，
  // 浏览器拿不到任何密钥。chatUrl 留空时才回退同源后端 /api/chat（本地开发）。
  var CHAT_ENDPOINT = SITE_CONFIG.chatUrl ? String(SITE_CONFIG.chatUrl).replace(/\/+$/, "") : "";

  // 本地开发（file:// 或 localhost）时优先用自带后端 /api/chat（.env 里的密钥）；
  // 线上（GitHub Pages）优先用 Edge Function。两者取先成功者，都失败再回退演示回复。
  var isLocalHost = false;
  try {
    var hostName = String(location.hostname || "");
    isLocalHost = location.protocol === "file:" ||
      hostName === "localhost" || hostName === "127.0.0.1" || hostName === "[::1]";
  } catch (e) { isLocalHost = false; }

  var BACKEND_TARGET = { url: "/api/chat", headers: { "Content-Type": "application/json" } };

  function chatTargets() {
    var list = [];
    if (isLocalHost) {
      list.push(BACKEND_TARGET);
      if (CHAT_ENDPOINT) list.push({ url: CHAT_ENDPOINT, headers: chatHeaders() });
    } else {
      if (CHAT_ENDPOINT) list.push({ url: CHAT_ENDPOINT, headers: chatHeaders() });
      list.push(BACKEND_TARGET);
    }
    return list;
  }

  var chatInput = document.getElementById("avatarChatInput");
  var chatSend = document.getElementById("avatarChatSend");
  var chatLog = document.querySelector(".chat-log");
  var avatarStatusEl = document.getElementById("avatarStatus");
  var quickBtns = document.querySelectorAll("[data-quick]");

  var chatHistory = [];   // 对话历史 {role, content}，发送给后端
  var avatarBusy = false; // 是否正在等待回复

  // 本地演示回复：未配置密钥或请求失败时使用
  function localReply(text) {
    var t = text.trim();
    if (/笑话|幽默|搞笑|段子/.test(t)) {
      return "演示模式先凑一个：程序员最怕听到什么？——「在我电脑上明明是好的」。接上大模型后我能讲得更长、更有梗。";
    }
    if (/技能|擅长|会什么|技术|学什么|专业/.test(t)) {
      return "我在天津大学香港理工大学深圳未来技术学院修读计算机科学与技术，专注于技术探索与创新实践。";
    }
    if (/经历|工作|做过|项目/.test(t)) {
      return "我是 2026 级本科生，目前正系统地学习计算机科学与技术，也在尝试把想法付诸实践。";
    }
    if (/作品|做了什么/.test(t)) {
      return "作品集还在整理中，敬请期待。";
    }
    if (/联系|微信|邮箱/.test(t)) {
      return "你可以在「联系我」区块找到我的邮箱（chenquliang@tju.edu.cn）和微信。";
    }
    if (/兴趣|爱好|喜欢/.test(t)) {
      return "我关注创新实践、技术探索与人工智能，享受把想法动手实现的过程。";
    }
    return "这是演示模式的回复。配置好服务端的大模型密钥后，我就能更自然地陪你聊天、讲笑话了。";
  }

  function avatarSetStatus(online) {
    if (!avatarStatusEl) return;
    avatarStatusEl.textContent = online ? "● AI 在线" : "● 演示模式";
    avatarStatusEl.classList.toggle("is-online", online);
  }

  function addChatMessage(text, who) {
    var msg = document.createElement("div");
    msg.className = "msg " + (who === "user" ? "msg-user" : "msg-bot");
    var span = document.createElement("span");
    span.textContent = text;
    msg.appendChild(span);
    chatLog.appendChild(msg);
    chatLog.scrollTop = chatLog.scrollHeight;
    return msg;
  }

  function addTypingIndicator() {
    var msg = document.createElement("div");
    msg.className = "msg msg-bot msg-typing";
    var span = document.createElement("span");
    span.className = "typing";
    span.innerHTML = "<i></i><i></i><i></i>";
    msg.appendChild(span);
    chatLog.appendChild(msg);
    chatLog.scrollTop = chatLog.scrollHeight;
    return msg;
  }

  function setBusy(busy) {
    avatarBusy = busy;
    if (chatSend) chatSend.disabled = busy;
    if (chatInput) chatInput.disabled = busy;
  }

  // 调用 Edge Function 时可带上 publishable key：它本身就是公开值，
  // 服务端若开了密钥校验可以据此挡掉裸扫描请求（不带也不会泄露任何机密）。
  function chatHeaders() {
    var headers = { "Content-Type": "application/json" };
    var key = SITE_CONFIG.supabaseKey ? String(SITE_CONFIG.supabaseKey) : "";
    if (key) {
      headers["apikey"] = key;
      headers["Authorization"] = "Bearer " + key;
    }
    return headers;
  }

  // 向对话接口提问；任何失败都会抛错，由调用方回退到 localReply
  function postChat(url, headers) {
    return fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ messages: chatHistory })
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }).then(function (data) {
      if (!data || typeof data.reply !== "string" || !data.reply) {
        throw new Error("响应格式异常");
      }
      return data.reply;
    });
  }

  // 依次尝试各目标，任一成功即返回；全部失败则抛错，由调用方回退 localReply
  function askAvatar() {
    var targets = chatTargets();
    var chain = null;
    for (var i = 0; i < targets.length; i++) {
      chain = (function (target) {
        var attempt = function () { return postChat(target.url, target.headers); };
        return chain ? chain.catch(attempt) : attempt();
      })(targets[i]);
    }
    return chain || Promise.reject(new Error("无可用对话接口"));
  }

  // 本地后端 /api/health：返回 {aiEnabled, model, feedbackEnabled}
  function probeLocalBackend() {
    return fetch("/api/health")
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        avatarSetStatus(!!(data && data.aiEnabled));
        return true;
      });
  }

  // Edge Function 的 GET 探测：返回 {aiEnabled, model}
  function probeEdgeFunction() {
    return fetch(CHAT_ENDPOINT, { method: "GET", headers: chatHeaders() })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        avatarSetStatus(!!(data && data.aiEnabled));
        return true;
      });
  }

  // 刷新「● AI 在线 / ● 演示模式」：按与对话相同的优先级探测，全失败即显示演示模式
  function refreshAvatarStatus() {
    var order = [];
    if (isLocalHost) {
      order.push(probeLocalBackend);
      if (CHAT_ENDPOINT) order.push(probeEdgeFunction);
    } else {
      if (CHAT_ENDPOINT) order.push(probeEdgeFunction);
      order.push(probeLocalBackend);
    }
    var chain = null;
    for (var i = 0; i < order.length; i++) {
      chain = chain ? chain.catch(order[i]) : order[i]();
    }
    return (chain || Promise.reject(new Error("无可用接口"))).catch(function () {
      avatarSetStatus(false);
      return false;
    });
  }

  function sendMessage(text) {
    if (avatarBusy) return;
    var value = (text != null ? text : chatInput.value).trim();
    if (!value) return;

    addChatMessage(value, "user");
    if (chatInput) chatInput.value = "";
    chatHistory.push({ role: "user", content: value });
    setBusy(true);
    var typing = addTypingIndicator();

    askAvatar()
      .then(function (reply) {
        avatarSetStatus(true);
        return reply;
      })
      .catch(function () {
        avatarSetStatus(false);
        return localReply(value);
      })
      .then(function (reply) {
        if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
        addChatMessage(reply, "bot");
        chatHistory.push({ role: "assistant", content: reply });
        setBusy(false);
        if (chatInput) chatInput.focus();
      });
  }

  if (chatSend && chatInput && chatLog) {
    chatSend.addEventListener("click", function () { sendMessage(); });
    chatInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); sendMessage(); }
    });
    quickBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        sendMessage(btn.getAttribute("data-quick") || "");
      });
    });

    // 探测分身是否已接入真实 AI，用于状态显示（「● AI 在线」/「● 演示模式」）
    refreshAvatarStatus();
  }

  // 微信：点击复制（weixin:// 协议浏览器普遍不识别，点了没反应）
  var wechatBtn = document.getElementById("wechatCopy");
  if (wechatBtn) {
    var wechatHint = document.getElementById("wechatHint");
    // 记住初始提示文案（含「非本人手机号」备注），复制后原样恢复
    var wechatDefaultHint = wechatHint ? wechatHint.textContent : "点击复制";
    var wechatTimer = null;

    var copyText = function (text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
      }
      // 回退：http:// 下 clipboard API 不可用
      return new Promise(function (resolve, reject) {
        var tmp = document.createElement("textarea");
        tmp.value = text;
        tmp.setAttribute("readonly", "");
        tmp.style.position = "fixed";
        tmp.style.left = "-9999px";
        document.body.appendChild(tmp);
        tmp.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
        document.body.removeChild(tmp);
        if (ok) { resolve(); } else { reject(new Error("copy failed")); }
      });
    };

    var showWechatHint = function (text, ok) {
      if (wechatHint) wechatHint.textContent = text;
      wechatBtn.classList.toggle("is-copied", !!ok);
      if (wechatTimer) window.clearTimeout(wechatTimer);
      wechatTimer = window.setTimeout(function () {
        if (wechatHint) wechatHint.textContent = wechatDefaultHint;
        wechatBtn.classList.remove("is-copied");
      }, 2000);
    };

    wechatBtn.addEventListener("click", function () {
      var id = wechatBtn.getAttribute("data-wechat") || "";
      if (!id) return;
      copyText(id)
        .then(function () { showWechatHint("已复制", true); })
        .catch(function () { showWechatHint("请手动复制", false); });
    });
  }
})();
