/* ============================================================
   个人主页 · 交互脚本
   功能：主题切换 / 移动端菜单 / 锚点平滑滚动 / 表单占位提示
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

  /* ---------- 联系表单：占位演示提示 ---------- */
  var form = document.querySelector(".contact-form");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      alert("这是占位演示表单，尚未接入后端。接入方式见 docs/05-技术方案.md。");
    });
  }

  /* ---------- 我的数字分身：优先接入后端 AI，失败自动回退本地演示 ---------- */
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
    return "这是演示模式的回复。配置好服务端的大模型密钥后，我就能更自然地回答你的问题了。";
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

  // 调用后端 /api/chat；任何失败都会抛错，由调用方回退到 localReply
  function askBackend() {
    return fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

  function sendMessage(text) {
    if (avatarBusy) return;
    var value = (text != null ? text : chatInput.value).trim();
    if (!value) return;

    addChatMessage(value, "user");
    if (chatInput) chatInput.value = "";
    chatHistory.push({ role: "user", content: value });
    setBusy(true);
    var typing = addTypingIndicator();

    askBackend()
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

    // 探测后端是否已启用 AI，用于状态显示
    fetch("/api/health")
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) { if (data) avatarSetStatus(!!data.aiEnabled); })
      .catch(function () { /* 直接打开文件或未启动服务时忽略 */ });
  }
})();
