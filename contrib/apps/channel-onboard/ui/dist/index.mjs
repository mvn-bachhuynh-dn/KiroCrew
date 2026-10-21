import { jsxs as t, Fragment as j, jsx as e } from "react/jsx-runtime";
import { useAppApi as C } from "@kirocrew/app-sdk";
import { PageHeader as R, Btn as N, Card as _, StatCard as A, CardTitle as M, EmptyState as E, Badge as T, Input as I, Toggle as $ } from "@kirocrew/app-sdk/ui";
import { useState as f, useCallback as F, useEffect as X } from "react";
const x = "/api/apps/channel-onboard", P = ["mention", "always", "observe", "review", "off"];
function q({ value: n, options: i, onChange: u, label: d }) {
  return /* @__PURE__ */ e(
    "select",
    {
      "aria-label": d,
      className: "bg-[var(--bg-input,transparent)] border border-[var(--border)] rounded px-2 py-1 text-sm",
      value: n,
      onChange: (l) => u(l.target.value),
      children: i.map((l) => /* @__PURE__ */ e("option", { value: l, children: l }, l))
    }
  );
}
const B = "__inherit__", L = (n) => n || "kiro";
function K({ row: n, backends: i, hasMaintainers: u, onSaved: d, onError: l }) {
  const r = C(), [o, s] = f(!1), h = n.acp_backend ?? null, m = h === null || i.options.some((c) => c.id === h), y = `Mặc định gateway (${L(i.default)})`, p = async (c) => {
    const g = c === B ? null : c, v = g === null ? y.toLowerCase() : L(g), b = [
      `Chuyển agent ${n.agent} sang backend ${v}?`,
      "Chỉ áp dụng cho thread mới; thread đang chạy giữ backend cũ.",
      "Mọi channel dùng chung agent này đều đổi theo."
    ];
    if (u && g !== null && g !== "claude" && b.push("Channel này có maintainer: rule của maintainer mới được kiểm thử kỹ trên Claude."), !!window.confirm(b.join(`
`))) {
      s(!0);
      try {
        const a = await r.put(`${x}/backend`, { channel_id: n.id, acp_backend: g }), w = a.channels.filter((D) => D !== n.id).length;
        d(`Agent ${a.agent} → ${v}. Áp dụng cho thread mới${w ? `; đổi luôn ${w} channel khác dùng chung agent này` : ""}.`);
      } catch (a) {
        l(String(a));
      } finally {
        s(!1);
      }
    }
  };
  return /* @__PURE__ */ t(
    "select",
    {
      "aria-label": `Backend của agent ${n.agent}`,
      className: "bg-[var(--bg-input,transparent)] border border-[var(--border)] rounded px-2 py-1 text-sm",
      value: h === null ? B : h,
      disabled: o || !n.agent,
      onChange: (c) => {
        p(c.target.value);
      },
      children: [
        /* @__PURE__ */ e("option", { value: B, children: y }),
        i.options.map((c) => /* @__PURE__ */ t("option", { value: c.id, disabled: c.installed === "missing", children: [
          c.label,
          c.installed === "missing" ? " (chưa cài)" : ""
        ] }, c.id || "kiro")),
        !m && h !== null && /* @__PURE__ */ t("option", { value: h, children: [
          L(h),
          " (không dùng được)"
        ] })
      ]
    }
  );
}
function H({ row: n, open: i, backends: u, hasMaintainers: d, onSaved: l, onNotice: r, onError: o }) {
  const s = C(), [h, m] = f(n.workspace_dir || ""), [y, p] = f(n.activation || "mention"), [c, g] = f(n.thread_follow ?? !0), [v, b] = f(!1), a = h !== (n.workspace_dir || "") || y !== n.activation || c !== n.thread_follow, w = async () => {
    b(!0);
    try {
      await s.post(`${x}/reconfigure`, {
        channel_id: n.id,
        workspace_dir: h !== (n.workspace_dir || "") ? h : void 0,
        activation: y !== n.activation ? y : void 0,
        thread_follow: c !== n.thread_follow ? c : void 0
      }), l();
    } catch (k) {
      o(String(k));
    } finally {
      b(!1);
    }
  }, D = async (k) => {
    if (!(k && !window.confirm(`Mở #${n.name || n.id} cho MỌI thành viên của channel (không gồm guest và người ngoài workspace) chat với bot? Họ chỉ đọc được file trong workspace của channel này.`))) {
      b(!0);
      try {
        await s.put(`${x}/open`, { channel_id: n.id, open: k }), l();
      } catch (O) {
        o(String(O));
      } finally {
        b(!1);
      }
    }
  }, G = async () => {
    if (window.confirm(`Gỡ cấu hình của #${n.name || n.id}? Bot đã rời channel này. Agent, workspace và memory được giữ nguyên.`)) {
      b(!0);
      try {
        await s.post(`${x}/unbind`, { channel_id: n.id }), l();
      } catch (k) {
        o(String(k));
      } finally {
        b(!1);
      }
    }
  };
  return /* @__PURE__ */ t("tr", { className: "border-t border-[var(--border)] align-top", "data-testid": `row-${n.id}`, children: [
    /* @__PURE__ */ t("td", { className: "py-2 pr-3", children: [
      /* @__PURE__ */ t("div", { className: "font-medium", children: [
        "#",
        n.name || n.id
      ] }),
      /* @__PURE__ */ e("div", { className: "text-xs text-muted", children: n.id }),
      !n.bot_member && /* @__PURE__ */ t("div", { className: "mt-1 flex items-center gap-2", children: [
        /* @__PURE__ */ e(T, { variant: "warn", children: "bot không còn trong channel" }),
        /* @__PURE__ */ e(N, { danger: !0, disabled: v, onClick: G, children: "Gỡ" })
      ] })
    ] }),
    /* @__PURE__ */ t("td", { className: "py-2 pr-3", children: [
      /* @__PURE__ */ e("div", { className: "font-mono text-sm whitespace-nowrap", children: n.agent || "(default agent)" }),
      /* @__PURE__ */ t("div", { className: "text-xs text-muted", children: [
        "memory: ",
        n.memory_store || "—"
      ] })
    ] }),
    (u == null ? void 0 : u.supported) && /* @__PURE__ */ e("td", { className: "py-2 pr-3", children: /* @__PURE__ */ e(K, { row: n, backends: u, hasMaintainers: d, onSaved: r, onError: o }) }),
    /* @__PURE__ */ e("td", { className: "py-2 pr-3 w-[38%] min-w-[320px]", children: /* @__PURE__ */ e(I, { "aria-label": `Workspace của #${n.name || n.id}`, title: h, className: "w-full font-mono text-xs", value: h, onChange: (k) => m(k.target.value), disabled: !n.agent }) }),
    /* @__PURE__ */ e("td", { className: "py-2 pr-3", children: /* @__PURE__ */ e(q, { label: "Activation", value: y, options: P, onChange: p }) }),
    /* @__PURE__ */ e("td", { className: "py-2 pr-3", children: /* @__PURE__ */ e($, { checked: c, onChange: g, label: "thread_follow" }) }),
    /* @__PURE__ */ e("td", { className: "py-2 pr-3", children: /* @__PURE__ */ e($, { checked: i, onChange: (k) => {
      D(k);
    }, label: `Mở #${n.name || n.id} cho mọi thành viên channel` }) }),
    /* @__PURE__ */ e("td", { className: "py-2 w-[72px]", children: a && /* @__PURE__ */ e(N, { primary: !0, disabled: v, onClick: w, children: v ? "Đang lưu…" : "Lưu" }) })
  ] });
}
function U({ row: n, settings: i, onDone: u, onError: d }) {
  const l = C(), [r, o] = f(!1), s = async () => {
    o(!0);
    try {
      await l.post(`${x}/onboard`, { channel_id: n.id, channel_name: n.name }), u();
    } catch (h) {
      d(String(h));
    } finally {
      o(!1);
    }
  };
  return /* @__PURE__ */ t("tr", { className: "border-t border-[var(--border)]", "data-testid": `pending-${n.id}`, children: [
    /* @__PURE__ */ t("td", { className: "py-2 pr-3", children: [
      /* @__PURE__ */ t("div", { className: "font-medium", children: [
        "#",
        n.name || n.id
      ] }),
      /* @__PURE__ */ e("div", { className: "text-xs text-muted", children: n.id })
    ] }),
    /* @__PURE__ */ t("td", { className: "py-2 pr-3 text-sm text-muted", children: [
      "→ agent ",
      /* @__PURE__ */ e("span", { className: "font-mono", children: n.name || n.id }),
      ", workspace",
      " ",
      /* @__PURE__ */ t("span", { className: "font-mono", children: [
        i.workspace_root,
        "/",
        n.name || n.id
      ] }),
      i.dedicated_memory ? ", memory riêng" : ", memory chung"
    ] }),
    /* @__PURE__ */ e("td", { className: "py-2", children: /* @__PURE__ */ e(N, { primary: !0, disabled: r, onClick: s, children: r ? "Đang tạo…" : "Onboard" }) })
  ] });
}
const S = (n, i) => n && (n.display || n.name) || i;
function W({ people: n, onSaved: i, onError: u }) {
  const d = C(), [l, r] = f(""), [o, s] = f(!1), h = async (p) => {
    s(!0);
    try {
      const c = await d.put(`${x}/members`, { members: p.map(({ slack_id: g, name: v }) => ({ slack_id: g, name: v })) });
      i(c.hot_applied ? "Đã lưu, có hiệu lực ngay." : "Đã lưu. Gateway chưa nhận nóng — cần restart để áp dụng.");
    } catch (c) {
      u(String(c));
    } finally {
      s(!1);
    }
  }, m = async () => {
    const p = l.trim().toUpperCase();
    if (p) {
      s(!0);
      try {
        const c = await d.post(`${x}/resolve-user`, { slack_id: p });
        r(""), await h([...n.members, { slack_id: c.slack_id, name: c.name }]);
      } catch (c) {
        u(String(c)), s(!1);
      }
    }
  }, y = (p) => {
    const c = n.members.find((g) => g.slack_id === p);
    window.confirm(`Gỡ ${S(c, p)} khỏi danh sách member? Người này cũng mất quyền maintainer ở mọi channel.`) && h(n.members.filter((g) => g.slack_id !== p));
  };
  return /* @__PURE__ */ t(_, { children: [
    /* @__PURE__ */ e(M, { children: "Member" }),
    /* @__PURE__ */ t("ul", { className: "text-xs text-muted mb-2 list-disc pl-5 space-y-0.5", children: [
      /* @__PURE__ */ t("li", { children: [
        "Chat được với bot ở mọi channel bot có mặt, nhưng ",
        /* @__PURE__ */ e("b", { children: "chỉ đọc" }),
        ": đọc file trong workspace của channel đó (trừ .env, khoá, .git/…), không sửa file, không chạy lệnh."
      ] }),
      /* @__PURE__ */ e("li", { children: "Không DM, không bấm nút của bot, không spawn/cron/gửi tin." }),
      /* @__PURE__ */ t("li", { children: [
        "Người ngoài danh sách vẫn chat được ở channel bật cột ",
        /* @__PURE__ */ e("b", { children: "Mở" }),
        " bên trên, với cùng quyền chỉ đọc."
      ] })
    ] }),
    /* @__PURE__ */ e("table", { className: "w-full text-left text-sm", children: /* @__PURE__ */ t("tbody", { children: [
      /* @__PURE__ */ t("tr", { className: "border-t border-[var(--border)]", children: [
        /* @__PURE__ */ e("td", { className: "py-2 pr-3", children: n.owner.display || n.owner.slack_id }),
        /* @__PURE__ */ e("td", { className: "py-2 pr-3 font-mono text-xs text-muted", children: n.owner.slack_id }),
        /* @__PURE__ */ e("td", { className: "py-2", children: /* @__PURE__ */ e(T, { variant: "ok", children: "owner · toàn quyền" }) })
      ] }),
      n.members.map((p) => /* @__PURE__ */ t("tr", { className: "border-t border-[var(--border)]", "data-testid": `member-${p.slack_id}`, children: [
        /* @__PURE__ */ e("td", { className: "py-2 pr-3", children: S(p, p.slack_id) }),
        /* @__PURE__ */ e("td", { className: "py-2 pr-3 font-mono text-xs text-muted", children: p.slack_id }),
        /* @__PURE__ */ e("td", { className: "py-2", children: /* @__PURE__ */ e(N, { disabled: o, onClick: () => y(p.slack_id), children: "Gỡ" }) })
      ] }, p.slack_id))
    ] }) }),
    /* @__PURE__ */ t("div", { className: "mt-3 flex gap-2 items-center", children: [
      /* @__PURE__ */ e(I, { "aria-label": "Slack user ID cần thêm", placeholder: "Slack user ID, ví dụ U0XXXXXXXXX", value: l, onChange: (p) => r(p.target.value) }),
      /* @__PURE__ */ e(N, { primary: !!l.trim(), disabled: o || !l.trim(), onClick: m, children: o ? "Đang lưu…" : "Thêm member" })
    ] }),
    /* @__PURE__ */ e("p", { className: "text-xs text-muted mt-2", children: "Lấy ID: mở profile người đó trên Slack → ⋮ → Copy member ID." })
  ] });
}
function z({ ch: n, members: i, catalog: u, onSaved: d, onError: l }) {
  const r = C(), [o, s] = f(!1), [h, m] = f(""), [y, p] = f(!1), c = new Map(i.map((a) => [a.slack_id, a])), g = i.filter((a) => !n.maintainers.includes(a.slack_id)), v = n.commands.length > 0 || n.programs.length > 0, b = async (a) => {
    s(!0);
    try {
      await r.put(`${x}/maintainers`, { channel_id: n.id, maintainers: a }), d("Đã lưu maintainer, có hiệu lực ngay.");
    } catch (w) {
      l(String(w));
    } finally {
      s(!1);
    }
  };
  return /* @__PURE__ */ t("div", { className: "border-t border-[var(--border)] py-2", "data-testid": `maint-${n.id}`, children: [
    /* @__PURE__ */ t("div", { className: "flex flex-wrap items-center gap-x-4 gap-y-2", children: [
      /* @__PURE__ */ t("div", { className: "min-w-[180px]", children: [
        /* @__PURE__ */ t("div", { className: "font-medium", children: [
          "#",
          n.name || n.id
        ] }),
        /* @__PURE__ */ e("div", { className: "text-xs text-muted font-mono truncate max-w-[260px]", title: n.workspace_dir, children: n.workspace_dir || "(chưa có workspace)" })
      ] }),
      /* @__PURE__ */ t("div", { className: "flex flex-wrap gap-1 flex-1 min-w-[160px]", children: [
        n.maintainers.map((a) => /* @__PURE__ */ t("span", { className: "inline-flex items-center gap-1", children: [
          /* @__PURE__ */ e(T, { variant: "aim", children: S(c.get(a), a) }),
          /* @__PURE__ */ e(
            "button",
            {
              type: "button",
              "aria-label": `Gỡ maintainer ${S(c.get(a), a)}`,
              className: "text-xs text-muted hover:text-danger",
              disabled: o,
              onClick: () => b(n.maintainers.filter((w) => w !== a)),
              children: "✕"
            }
          )
        ] }, a)),
        n.maintainers.length === 0 && /* @__PURE__ */ e("span", { className: "text-xs text-muted", children: "Chưa có maintainer" })
      ] }),
      (n.maintainers.length > 0 || v) && /* @__PURE__ */ t(
        "button",
        {
          type: "button",
          className: "text-xs text-accent hover:underline",
          "aria-expanded": y,
          onClick: () => p((a) => !a),
          "data-testid": `maint-toggle-${n.id}`,
          children: [
            n.commands.length,
            " lệnh · ",
            n.programs.length,
            " chương trình ",
            y ? "▴" : "▾"
          ]
        }
      ),
      /* @__PURE__ */ t("div", { className: "flex gap-2 items-center", children: [
        /* @__PURE__ */ t(
          "select",
          {
            "aria-label": `Thêm maintainer cho #${n.name || n.id}`,
            className: "bg-[var(--bg-input,transparent)] border border-[var(--border)] rounded px-2 py-1 text-sm",
            value: h,
            onChange: (a) => m(a.target.value),
            disabled: o || g.length === 0 || !n.workspace_dir,
            children: [
              /* @__PURE__ */ e("option", { value: "", children: g.length ? "Thêm maintainer…" : "Không còn member" }),
              g.map((a) => /* @__PURE__ */ e("option", { value: a.slack_id, children: S(a, a.slack_id) }, a.slack_id))
            ]
          }
        ),
        h && /* @__PURE__ */ e(N, { primary: !0, disabled: o, onClick: () => {
          b([...n.maintainers, h]), m("");
        }, children: "Thêm" })
      ] })
    ] }),
    y && /* @__PURE__ */ e(V, { ch: n, catalog: u, onSaved: d, onError: l })
  ] });
}
function V({ ch: n, catalog: i, onSaved: u, onError: d }) {
  const l = C(), [r, o] = f(n.commands), [s, h] = f(!1), m = r.slice().sort().join(",") !== n.commands.slice().sort().join(","), y = (c, g) => o((v) => g ? [...v.filter((b) => b !== c), c] : v.filter((b) => b !== c)), p = async () => {
    if (!(r.includes("deploy") && !n.commands.includes("deploy") && !window.confirm("Deploy chạy lên PRODUCTION bằng tài khoản Cloudflare của bạn. Cho phép maintainer tự deploy?"))) {
      h(!0);
      try {
        await l.put(`${x}/commands`, { channel_id: n.id, commands: r }), u("Đã lưu lệnh được duyệt, có hiệu lực ngay.");
      } catch (c) {
        d(String(c));
      } finally {
        h(!1);
      }
    }
  };
  return /* @__PURE__ */ t("div", { className: "mt-2 ml-2 pl-3 border-l-2 border-[var(--border)]", "data-testid": `cmds-${n.id}`, children: [
    /* @__PURE__ */ e("div", { className: "text-xs text-muted mb-1", children: "Lệnh được duyệt — maintainer chạy không cần hỏi:" }),
    /* @__PURE__ */ e("div", { className: "flex flex-wrap gap-x-4 gap-y-1", children: i.map((c) => /* @__PURE__ */ t("label", { className: "inline-flex items-center gap-1 text-sm", title: c.example, children: [
      /* @__PURE__ */ e("input", { type: "checkbox", checked: r.includes(c.id), disabled: s, onChange: (g) => y(c.id, g.target.checked) }),
      c.label
    ] }, c.id)) }),
    m && /* @__PURE__ */ e("div", { className: "mt-2", children: /* @__PURE__ */ e(N, { primary: !0, disabled: s, onClick: p, children: s ? "Đang lưu…" : "Lưu lệnh" }) }),
    /* @__PURE__ */ e(J, { ch: n, onSaved: u, onError: d })
  ] });
}
function J({ ch: n, onSaved: i, onError: u }) {
  const d = C(), [l, r] = f(""), [o, s] = f(!1), h = async (m) => {
    s(!0);
    try {
      await d.put(`${x}/programs`, { channel_id: n.id, programs: m }), i("Đã lưu chương trình được duyệt.");
    } catch (y) {
      u(String(y));
    } finally {
      s(!1);
    }
  };
  return /* @__PURE__ */ t("div", { className: "mt-3", children: [
    /* @__PURE__ */ e("div", { className: "text-xs text-muted mb-1", children: "Chương trình được duyệt thêm:" }),
    /* @__PURE__ */ t("div", { className: "flex flex-wrap gap-2 items-center", children: [
      n.programs.map((m) => /* @__PURE__ */ t("span", { className: "inline-flex items-center gap-1", children: [
        /* @__PURE__ */ e(T, { variant: "aim", children: m }),
        /* @__PURE__ */ e(
          "button",
          {
            type: "button",
            "aria-label": `Gỡ chương trình ${m}`,
            className: "text-xs text-muted hover:text-danger",
            disabled: o,
            onClick: () => {
              h(n.programs.filter((y) => y !== m));
            },
            children: "✕"
          }
        )
      ] }, m)),
      /* @__PURE__ */ e(I, { "aria-label": `Thêm chương trình cho #${n.name || n.id}`, placeholder: "vd: sed, jq", className: "max-w-[220px]", value: l, onChange: (m) => r(m.target.value) }),
      l.trim() && /* @__PURE__ */ e(N, { primary: !0, disabled: o, onClick: () => {
        const m = l.trim();
        r(""), h([...n.programs, m]);
      }, children: "Thêm" })
    ] })
  ] });
}
function Q({ people: n, onSaved: i, onError: u }) {
  const d = (r) => r.maintainers.length ? 0 : r.commands.length || r.programs.length ? 1 : 2, l = [...n.channels].sort((r, o) => d(r) - d(o));
  return /* @__PURE__ */ t(_, { children: [
    /* @__PURE__ */ e(M, { children: "Maintainer theo channel" }),
    /* @__PURE__ */ t("ul", { className: "text-xs text-muted mb-2 list-disc pl-5 space-y-0.5", children: [
      /* @__PURE__ */ e("li", { children: "Maintainer sửa được file trong workspace của channel đó (trừ .git/, .kiro/, .env*, khoá, file cấu hình build) và chạy các lệnh đã duyệt. Ở channel khác họ chỉ là member. Phải là member trước." }),
      /* @__PURE__ */ t("li", { children: [
        "Lệnh chưa có quyền: bot hỏi owner trên Slack — ",
        /* @__PURE__ */ e("i", { children: "Cho phép 1 lần" }),
        " / ",
        /* @__PURE__ */ e("i", { children: "Cho phép cả lượt này" }),
        " / ",
        /* @__PURE__ */ e("i", { children: "Luôn cho phép" }),
        " / ",
        /* @__PURE__ */ e("i", { children: "Từ chối" }),
        ". «Luôn cho phép» hiện ở đây."
      ] }),
      /* @__PURE__ */ e("li", { children: "Chương trình duyệt thêm vẫn bị kiểm đường dẫn (trong workspace, không phải file bí mật). Shell, python/node, curl, npm… và npm install, DB remote không bao giờ duyệt được." })
    ] }),
    /* @__PURE__ */ e("div", { className: "text-sm", children: l.map((r) => /* @__PURE__ */ e(
      z,
      {
        ch: r,
        members: n.members,
        catalog: n.command_catalog,
        onSaved: i,
        onError: u
      },
      `${r.id}:${r.maintainers.join(",")}:${r.commands.join(",")}:${r.programs.join(",")}`
    )) }),
    /* @__PURE__ */ e("p", { className: "text-xs text-muted mt-2 font-mono", children: n.roles_path })
  ] });
}
function Y({ settings: n, onSaved: i, onError: u }) {
  const d = C(), [l, r] = f(n);
  X(() => r(n), [n]);
  const o = async () => {
    try {
      await d.put(`${x}/settings`, l), i();
    } catch (s) {
      u(String(s));
    }
  };
  return /* @__PURE__ */ t(_, { children: [
    /* @__PURE__ */ e(M, { children: "Cài đặt tự động" }),
    /* @__PURE__ */ t("div", { className: "grid gap-3 text-sm grid-cols-[180px_1fr] items-center", children: [
      /* @__PURE__ */ e("label", { htmlFor: "co-mode", children: "Chế độ phát hiện" }),
      /* @__PURE__ */ e(q, { label: "Chế độ", value: l.mode, options: ["auto", "notify", "off"], onChange: (s) => r({ ...l, mode: s }) }),
      /* @__PURE__ */ e("label", { htmlFor: "co-root", children: "Thư mục gốc workspace" }),
      /* @__PURE__ */ e(I, { id: "co-root", value: l.workspace_root, onChange: (s) => r({ ...l, workspace_root: s.target.value }) }),
      /* @__PURE__ */ e("span", { children: "Activation mặc định" }),
      /* @__PURE__ */ e(q, { label: "Activation mặc định", value: l.activation, options: P, onChange: (s) => r({ ...l, activation: s }) }),
      /* @__PURE__ */ e("span", { children: "thread_follow mặc định" }),
      /* @__PURE__ */ e($, { checked: l.thread_follow, onChange: (s) => r({ ...l, thread_follow: s }), label: "thread_follow mặc định" }),
      /* @__PURE__ */ e("span", { children: "Chỉ khi owner ở trong channel" }),
      /* @__PURE__ */ e($, { checked: l.require_owner_member, onChange: (s) => r({ ...l, require_owner_member: s }), label: "Chỉ khi owner ở trong channel" }),
      /* @__PURE__ */ e("span", { children: "Memory riêng cho mỗi channel" }),
      /* @__PURE__ */ e($, { checked: l.dedicated_memory, onChange: (s) => r({ ...l, dedicated_memory: s }), label: "Memory riêng" }),
      /* @__PURE__ */ e("label", { htmlFor: "co-poll", children: "Chu kỳ quét (giây, 60–3600)" }),
      /* @__PURE__ */ e(I, { id: "co-poll", type: "number", min: 60, max: 3600, value: l.poll_secs, onChange: (s) => r({ ...l, poll_secs: Number(s.target.value) }) })
    ] }),
    /* @__PURE__ */ e("div", { className: "mt-3", children: /* @__PURE__ */ e(N, { primary: !0, onClick: o, children: "Lưu cài đặt" }) }),
    /* @__PURE__ */ e("p", { className: "text-xs text-muted mt-2", children: "auto: tự tạo agent khi bot được thêm vào channel mới rồi DM cho bạn. notify: chỉ DM báo. off: tắt quét nền." })
  ] });
}
function te() {
  const n = C(), [i, u] = f(null), [d, l] = f(null), [r, o] = f(""), [s, h] = f(""), m = F(() => {
    o(""), n.get(`${x}/channels`).then(u).catch((a) => o(String(a))), n.get(`${x}/people`).then(l).catch((a) => o(String(a)));
  }, []);
  X(() => {
    m();
  }, [m]);
  const y = (a) => {
    h(a), m();
  }, p = (i == null ? void 0 : i.channels.filter((a) => a.configured)) ?? [], c = (i == null ? void 0 : i.channels.filter((a) => !a.configured && a.bot_member && !a.id.startsWith("D"))) ?? [], g = new Set(((d == null ? void 0 : d.channels) ?? []).filter((a) => a.open).map((a) => a.id)), v = new Set(((d == null ? void 0 : d.channels) ?? []).filter((a) => a.maintainers.length > 0).map((a) => a.id)), b = i == null ? void 0 : i.backends;
  return /* @__PURE__ */ t(j, { children: [
    /* @__PURE__ */ e(R, { title: "Channel Onboard", subtitle: "Mỗi Slack channel một agent, workspace và memory riêng", actions: /* @__PURE__ */ e(N, { onClick: m, children: "Làm mới" }) }),
    /* @__PURE__ */ t("div", { className: "px-6 pb-8 overflow-y-auto flex-1 min-h-0 space-y-4", children: [
      r && /* @__PURE__ */ e(_, { children: /* @__PURE__ */ e("div", { role: "alert", className: "text-danger text-sm", children: r }) }),
      s && /* @__PURE__ */ e(_, { children: /* @__PURE__ */ e("div", { role: "status", className: "text-sm", children: s }) }),
      (i == null ? void 0 : i.slack_error) && /* @__PURE__ */ e(_, { children: /* @__PURE__ */ t("div", { role: "alert", className: "text-warn text-sm", children: [
        "Không đọc được danh sách channel từ Slack: ",
        i.slack_error
      ] }) }),
      (d == null ? void 0 : d.roles_error) && /* @__PURE__ */ e(_, { children: /* @__PURE__ */ t("div", { role: "alert", className: "text-danger text-sm", children: [
        "File vai trò lỗi, không ghi đè: ",
        d.roles_error
      ] }) }),
      /* @__PURE__ */ t("div", { className: "grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(150px,1fr))]", children: [
        /* @__PURE__ */ e(A, { label: "Đã cấu hình", value: i ? p.length : null, accent: !0 }),
        /* @__PURE__ */ e(A, { label: "Chờ onboard", value: i ? c.length : null }),
        /* @__PURE__ */ e(A, { label: "Channel mở", value: d ? g.size : null }),
        /* @__PURE__ */ e(A, { label: "Chế độ", value: i ? i.settings.mode : null })
      ] }),
      /* @__PURE__ */ t(_, { children: [
        /* @__PURE__ */ e(M, { children: "Chờ onboard" }),
        i && c.length === 0 ? /* @__PURE__ */ e(E, { icon: "✓", title: "Không có channel nào đang chờ", subtitle: "Thêm bot vào một channel mới để nó xuất hiện ở đây." }) : /* @__PURE__ */ e("table", { className: "w-full text-left", children: /* @__PURE__ */ e("tbody", { children: c.map((a) => i && /* @__PURE__ */ e(U, { row: a, settings: i.settings, onDone: m, onError: o }, a.id)) }) })
      ] }),
      /* @__PURE__ */ t(_, { children: [
        /* @__PURE__ */ e(M, { children: "Channel đã cấu hình" }),
        /* @__PURE__ */ t("p", { className: "text-xs text-muted mb-2", children: [
          /* @__PURE__ */ e("b", { children: "Mở" }),
          ": mọi thành viên của channel (không gồm guest và người ngoài workspace) chat được với bot ở channel đó, quyền chỉ đọc, kể cả khi không có trong danh sách Member.",
          (b == null ? void 0 : b.supported) && /* @__PURE__ */ t(j, { children: [
            " ",
            /* @__PURE__ */ e("b", { children: "Agent backend" }),
            ": harness agent của channel chạy trên, áp dụng cho thread mới. Backend chưa cài hoặc bị chặn thì bot từ chối chạy và báo lý do trong thread, không tự chuyển sang Kiro CLI."
          ] })
        ] }),
        /* @__PURE__ */ t("table", { className: "w-full text-left text-sm", children: [
          /* @__PURE__ */ e("thead", { children: /* @__PURE__ */ t("tr", { className: "text-xs text-muted", children: [
            /* @__PURE__ */ e("th", { className: "pb-2 pr-3", children: "Channel" }),
            /* @__PURE__ */ e("th", { className: "pb-2 pr-3", children: "Agent" }),
            (b == null ? void 0 : b.supported) && /* @__PURE__ */ e("th", { className: "pb-2 pr-3", children: "Agent backend" }),
            /* @__PURE__ */ e("th", { className: "pb-2 pr-3", children: "Workspace" }),
            /* @__PURE__ */ e("th", { className: "pb-2 pr-3", children: "Activation" }),
            /* @__PURE__ */ e("th", { className: "pb-2 pr-3", children: "thread_follow" }),
            /* @__PURE__ */ e("th", { className: "pb-2 pr-3", children: "Mở" }),
            /* @__PURE__ */ e("th", { className: "pb-2" })
          ] }) }),
          /* @__PURE__ */ e("tbody", { children: p.map((a) => /* @__PURE__ */ e(
            H,
            {
              row: a,
              open: g.has(a.id),
              backends: b,
              hasMaintainers: v.has(a.id),
              onSaved: m,
              onNotice: y,
              onError: o
            },
            `${a.id}:${a.workspace_dir}:${a.activation}:${a.thread_follow}:${g.has(a.id)}:${a.acp_backend ?? B}`
          )) })
        ] })
      ] }),
      d && /* @__PURE__ */ e(W, { people: d, onSaved: y, onError: o }),
      d && /* @__PURE__ */ e(Q, { people: d, onSaved: y, onError: o }),
      i && /* @__PURE__ */ e(Y, { settings: i.settings, onSaved: m, onError: o })
    ] })
  ] });
}
export {
  te as default
};
