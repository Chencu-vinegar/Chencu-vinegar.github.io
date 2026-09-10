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

  /* ---------- 我的数字分身：Demo 交互（未接入真实对话） ---------- */
  var chatInput = document.getElementById("avatarChatInput");
  var chatSend = document.getElementById("avatarChatSend");
  var chatLog = document.querySelector(".chat-log");

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

  function avatarReply(text) {
    var reply;
    var t = text.trim();
    if (/技能|擅长|会什么|技术/.test(t)) {
      reply = "我在天津大学香港理工大学深圳未来技术学院修读计算机科学与技术，专注于技术探索与创新实践。";
    } else if (/经历|工作|做过|项目/.test(t)) {
      reply = "我是 2026 级本科生，目前正系统地学习计算机科学与技术，也在尝试把想法付诸实践。";
    } else if (/作品|项目|做了什么/.test(t)) {
      reply = "作品集还在整理中，敬请期待。";
    } else if (/联系|微信|邮箱/.test(t)) {
      reply = "你可以在「联系我」区块找到我的邮箱与微信。";
    } else {
      reply = "这是一个 Demo 演示界面。当前只会按关键词给出示例回复，后续会接入真正的大模型能力。";
    }
    // 模拟真实对话的输入延迟
    setTimeout(function () { addChatMessage(reply, "bot"); }, 500);
  }

  if (chatSend && chatInput && chatLog) {
    var handleSend = function () {
      var value = chatInput.value;
      if (!value.trim()) return;
      addChatMessage(value, "user");
      chatInput.value = "";
      avatarReply(value);
    };
    chatSend.addEventListener("click", handleSend);
    chatInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); handleSend(); }
    });
  }
})();
