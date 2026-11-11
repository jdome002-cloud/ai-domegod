/* Minimal, XSS-safe markdown renderer for AI replies. No raw HTML is passed through. */
(function (global) {
  "use strict";

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeUrl(raw) {
    try {
      const url = new URL(raw, "https://invalid.local");
      if (url.protocol === "http:" || url.protocol === "https:") return url.href;
    } catch (_) { /* ignore */ }
    return null;
  }

  function inline(text) {
    let s = escapeHtml(text);

    const codes = [];
    s = s.replace(/`([^`]+)`/g, function (_, code) {
      const i = codes.length;
      codes.push('<code class="inline-code">' + code + "</code>");
      return "%%CODE" + i + "%%";
    });

    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, label, href) {
      const url = safeUrl(href.replace(/&amp;/g, "&"));
      if (!url) return label;
      return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + label + "</a>";
    });

    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^\*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    s = s.replace(/%%CODE(\d+)%%/g, function (_, i) { return codes[Number(i)] || ""; });
    return s;
  }

  function render(src) {
    const raw = String(src || "").replace(/\r\n/g, "\n");
    const fences = [];

    const withFences = raw.replace(/(```|~~~)([^\n]*)\n([\s\S]*?)\1/g, function (_, _t, lang, code) {
      const i = fences.length;
      const language = escapeHtml((lang || "").trim());
      const body = escapeHtml(code.replace(/\n$/, ""));
      fences.push(
        '<div class="code-block">' +
          '<div class="code-head">' +
            (language ? '<span class="code-lang">' + language + "</span>" : "<span></span>") +
            '<button type="button" class="copy-btn">คัดลอก</button>' +
          "</div>" +
          "<pre><code" + (language ? ' class="lang-' + language + '"' : "") + ">" + body + "</code></pre>" +
        "</div>"
      );
      return "\n%%FENCE" + i + "%%\n";
    });

    const lines = withFences.split("\n");
    const out = [];
    let i = 0;

    function flushPara(buf) {
      if (!buf.length) return;
      out.push("<p>" + buf.map(inline).join("<br>") + "</p>");
      buf.length = 0;
    }

    while (i < lines.length) {
      const line = lines[i];
      const fence = line.trim().match(/^%%FENCE(\d+)%%$/);
      if (fence) {
        flushPara(out._para || (out._para = []));
        out.push(fences[Number(fence[1])] || "");
        i += 1;
        continue;
      }

      if (/^\s*$/.test(line)) {
        flushPara(out._para || (out._para = []));
        i += 1;
        continue;
      }

      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        flushPara(out._para || (out._para = []));
        const level = heading[1].length;
        out.push("<h" + level + ">" + inline(heading[2]) + "</h" + level + ">");
        i += 1;
        continue;
      }

      if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
        flushPara(out._para || (out._para = []));
        const ordered = /^\s*\d+\./.test(line);
        const items = [];
        while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
          items.push("<li>" + inline(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "")) + "</li>");
          i += 1;
        }
        out.push((ordered ? "<ol>" : "<ul>") + items.join("") + (ordered ? "</ol>" : "</ul>"));
        continue;
      }

      if (!out._para) out._para = [];
      out._para.push(line);
      i += 1;
    }
    flushPara(out._para || []);
    delete out._para;
    return out.join("");
  }

  global.DomeMarkdown = { render: render, escapeHtml: escapeHtml };
})(window);
