(function () {
  "use strict";

  var STORAGE_KEY = "ai-domegod-thread-v1";
  var HINT_KEY = "ai-domegod-install-hint-v1";
  var threadEl = document.getElementById("thread");
  var emptyEl = document.getElementById("empty");
  var inputEl = document.getElementById("input");
  var sendEl = document.getElementById("send");
  var formEl = document.getElementById("composer");
  var newChatEl = document.getElementById("new-chat");
  var hintEl = document.getElementById("install-hint");
  var dismissEl = document.getElementById("dismiss-hint");

  var messages = [];
  var busy = false;
  var typingEl = null;

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (m) {
        return m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string";
      });
    } catch (_) {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch (_) { /* quota / private mode */ }
  }

  function scrollToEnd() {
    threadEl.scrollTop = threadEl.scrollHeight;
  }

  function autoSize() {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + "px";
  }

  function setSendState() {
    sendEl.disabled = busy || !inputEl.value.trim();
  }

  function appendMessage(role, content, opts) {
    opts = opts || {};
    emptyEl.hidden = true;
    var row = document.createElement("div");
    row.className = "msg " + (role === "user" ? "user" : "ai");
    var bubble = document.createElement("div");
    bubble.className = "bubble";
    if (role === "assistant" && !opts.plain && window.DomeMarkdown) {
      bubble.innerHTML = window.DomeMarkdown.render(content);
    } else {
      bubble.textContent = content;
    }
    row.appendChild(bubble);
    threadEl.appendChild(row);
    return row;
  }

  function showTyping(on) {
    if (on) {
      if (typingEl) return;
      emptyEl.hidden = true;
      typingEl = document.createElement("div");
      typingEl.className = "msg ai typing";
      typingEl.innerHTML = '<div class="bubble"><span class="dots" aria-label="กำลังพิมพ์"><i></i><i></i><i></i></span></div>';
      threadEl.appendChild(typingEl);
    } else if (typingEl) {
      typingEl.remove();
      typingEl = null;
    }
  }

  function renderAll() {
    threadEl.querySelectorAll(".msg").forEach(function (n) { n.remove(); });
    showTyping(false);
    if (!messages.length) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    messages.forEach(function (m) { appendMessage(m.role, m.content); });
    scrollToEnd();
  }

  async function send() {
    var text = inputEl.value.trim();
    if (!text || busy) return;
    busy = true;
    setSendState();
    inputEl.value = "";
    autoSize();

    messages.push({ role: "user", content: text });
    save();
    appendMessage("user", text);
    showTyping(true);
    scrollToEnd();

    try {
      var res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ messages: messages })
      });
      var data = null;
      try { data = await res.json(); } catch (_) { data = null; }
      var content = data && typeof data.content === "string" && data.content
        ? data.content
        : "ขออภัย ตอบไม่สำเร็จ กรุณาลองใหม่ครับ";
      messages.push({ role: "assistant", content: content });
      save();
      showTyping(false);
      appendMessage("assistant", content);
      scrollToEnd();
    } catch (_) {
      var fail = "เชื่อมต่อไม่สำเร็จครับ ตรวจเน็ตแล้วลองใหม่ได้เลย";
      messages.push({ role: "assistant", content: fail });
      save();
      showTyping(false);
      appendMessage("assistant", fail);
      scrollToEnd();
    } finally {
      busy = false;
      setSendState();
      inputEl.focus();
    }
  }

  formEl.addEventListener("submit", function (e) {
    e.preventDefault();
    send();
  });

  inputEl.addEventListener("input", function () {
    autoSize();
    setSendState();
  });

  inputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });

  newChatEl.addEventListener("click", function () {
    if (messages.length && !window.confirm("เริ่มแชทใหม่ และล้างประวัติในเครื่องนี้?")) return;
    messages = [];
    save();
    renderAll();
    inputEl.focus();
  });

  threadEl.addEventListener("click", function (e) {
    var btn = e.target.closest(".copy-btn");
    if (!btn) return;
    var block = btn.closest(".code-block");
    var code = block && block.querySelector("code");
    if (!code) return;
    var text = code.textContent || "";
    function done() {
      btn.textContent = "คัดลอกแล้ว";
      btn.classList.add("copied");
      setTimeout(function () {
        btn.textContent = "คัดลอก";
        btn.classList.remove("copied");
      }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  });

  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch (_) {}
    ta.remove();
  }

  function maybeHint() {
    try {
      if (localStorage.getItem(HINT_KEY)) return;
    } catch (_) { return; }
    var standalone = window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
    if (standalone) return;
    hintEl.hidden = false;
  }

  dismissEl.addEventListener("click", function () {
    hintEl.hidden = true;
    try { localStorage.setItem(HINT_KEY, "1"); } catch (_) {}
  });

  messages = load();
  renderAll();
  maybeHint();
  setSendState();
  autoSize();
})();
