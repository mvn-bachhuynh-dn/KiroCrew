/**
 * Channel Onboard — one row per Slack channel the bot is in (or has a binding for).
 *
 * Configured rows: edit workspace directory, activation, thread_follow, and the
 * agent's backend (shown only when the gateway reads agents.<name>.acp_backend).
 * Unconfigured rows: one-click Onboard (workspace + agent + private memory + binding).
 * Settings: the background detector mode and defaults for new channels.
 *
 * Everything goes through this app's owner-only routes under
 * /api/apps/channel-onboard, which reuse the gateway's own config writer.
 */
import { useAppApi } from '@kirocrew/app-sdk'
import { Badge, Btn, Card, CardTitle, EmptyState, Input, PageHeader, StatCard, Toggle } from '@kirocrew/app-sdk/ui'
import { useCallback, useEffect, useState } from 'react'

const BASE = '/api/apps/channel-onboard'
const ACTIVATIONS = ['mention', 'always', 'observe', 'review', 'off'] as const

interface Row {
  id: string
  name: string
  bot_member: boolean
  configured: boolean
  agent?: string
  activation?: string
  thread_follow?: boolean
  workspace?: string
  workspace_dir?: string
  memory_store?: string
  acp_backend?: string | null
}

interface Settings {
  mode: 'auto' | 'notify' | 'off'
  workspace_root: string
  activation: string
  thread_follow: boolean
  require_owner_member: boolean
  dedicated_memory: boolean
  poll_secs: number
}

interface BackendOption { id: string; label: string; installed: string }
interface Backends { supported: boolean; options: BackendOption[]; default: string }

interface ListResponse {
  channels: Row[]
  backends?: Backends
  settings: Settings
  slack_error: string
}

function Select({ value, options, onChange, label }: { value: string; options: readonly string[]; onChange: (v: string) => void; label: string }) {
  return (
    <select
      aria-label={label}
      className="bg-[var(--bg-input,transparent)] border border-[var(--border)] rounded px-2 py-1 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  )
}

const INHERIT = '__inherit__'
const backendName = (id: string) => id || 'kiro'

function BackendSelect({ row, backends, hasMaintainers, onSaved, onError }: { row: Row; backends: Backends; hasMaintainers: boolean; onSaved: (msg: string) => void; onError: (m: string) => void }) {
  const api = useAppApi()
  const [busy, setBusy] = useState(false)
  const current = row.acp_backend ?? null
  const known = current === null || backends.options.some((o) => o.id === current)
  const inheritLabel = `Mặc định gateway (${backendName(backends.default)})`

  const change = async (v: string) => {
    const next = v === INHERIT ? null : v
    const name = next === null ? inheritLabel.toLowerCase() : backendName(next)
    const lines = [
      `Chuyển agent ${row.agent} sang backend ${name}?`,
      'Chỉ áp dụng cho thread mới; thread đang chạy giữ backend cũ.',
      'Mọi channel dùng chung agent này đều đổi theo.',
    ]
    if (hasMaintainers && next !== null && next !== 'claude') {
      lines.push('Channel này có maintainer: rule của maintainer mới được kiểm thử kỹ trên Claude.')
    }
    if (!window.confirm(lines.join('\n'))) return
    setBusy(true)
    try {
      const r = await api.put<{ agent: string; channels: string[] }>(`${BASE}/backend`, { channel_id: row.id, acp_backend: next })
      const others = r.channels.filter((c) => c !== row.id).length
      onSaved(`Agent ${r.agent} → ${name}. Áp dụng cho thread mới${others ? `; đổi luôn ${others} channel khác dùng chung agent này` : ''}.`)
    } catch (e) {
      onError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <select
      aria-label={`Backend của agent ${row.agent}`}
      className="bg-[var(--bg-input,transparent)] border border-[var(--border)] rounded px-2 py-1 text-sm"
      value={current === null ? INHERIT : current}
      disabled={busy || !row.agent}
      onChange={(e) => { void change(e.target.value) }}
    >
      <option value={INHERIT}>{inheritLabel}</option>
      {backends.options.map((o) => (
        <option key={o.id || 'kiro'} value={o.id} disabled={o.installed === 'missing'}>
          {o.label}{o.installed === 'missing' ? ' (chưa cài)' : ''}
        </option>
      ))}
      {!known && current !== null && <option value={current}>{backendName(current)} (không dùng được)</option>}
    </select>
  )
}

function ConfiguredRow({ row, open, backends, hasMaintainers, onSaved, onNotice, onError }: { row: Row; open: boolean; backends?: Backends; hasMaintainers: boolean; onSaved: () => void; onNotice: (msg: string) => void; onError: (m: string) => void }) {
  const api = useAppApi()
  const [dir, setDir] = useState(row.workspace_dir || '')
  const [activation, setActivation] = useState(row.activation || 'mention')
  const [follow, setFollow] = useState(row.thread_follow ?? true)
  const [busy, setBusy] = useState(false)
  const dirty = dir !== (row.workspace_dir || '') || activation !== row.activation || follow !== row.thread_follow

  const save = async () => {
    setBusy(true)
    try {
      await api.post(`${BASE}/reconfigure`, {
        channel_id: row.id,
        workspace_dir: dir !== (row.workspace_dir || '') ? dir : undefined,
        activation: activation !== row.activation ? activation : undefined,
        thread_follow: follow !== row.thread_follow ? follow : undefined,
      })
      onSaved()
    } catch (e) {
      onError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const setOpen = async (v: boolean) => {
    if (v && !window.confirm(`Mở #${row.name || row.id} cho MỌI thành viên của channel (không gồm guest và người ngoài workspace) chat với bot? Họ chỉ đọc được file trong workspace của channel này.`)) return
    setBusy(true)
    try {
      await api.put(`${BASE}/open`, { channel_id: row.id, open: v })
      onSaved()
    } catch (e) {
      onError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const unbind = async () => {
    if (!window.confirm(`Gỡ cấu hình của #${row.name || row.id}? Bot đã rời channel này. Agent, workspace và memory được giữ nguyên.`)) return
    setBusy(true)
    try {
      await api.post(`${BASE}/unbind`, { channel_id: row.id })
      onSaved()
    } catch (e) {
      onError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr className="border-t border-[var(--border)] align-top" data-testid={`row-${row.id}`}>
      <td className="py-2 pr-3">
        <div className="font-medium">#{row.name || row.id}</div>
        <div className="text-xs text-muted">{row.id}</div>
        {!row.bot_member && (
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="warn">bot không còn trong channel</Badge>
            <Btn danger disabled={busy} onClick={unbind}>Gỡ</Btn>
          </div>
        )}
      </td>
      <td className="py-2 pr-3">
        <div className="font-mono text-sm whitespace-nowrap">{row.agent || '(default agent)'}</div>
        <div className="text-xs text-muted">memory: {row.memory_store || '—'}</div>
      </td>
      {backends?.supported && (
        <td className="py-2 pr-3">
          <BackendSelect row={row} backends={backends} hasMaintainers={hasMaintainers} onSaved={onNotice} onError={onError} />
        </td>
      )}
      <td className="py-2 pr-3 w-[38%] min-w-[320px]">
        <Input aria-label={`Workspace của #${row.name || row.id}`} title={dir} className="w-full font-mono text-xs" value={dir} onChange={(e) => setDir(e.target.value)} disabled={!row.agent} />
      </td>
      <td className="py-2 pr-3">
        <Select label="Activation" value={activation} options={ACTIVATIONS} onChange={setActivation} />
      </td>
      <td className="py-2 pr-3">
        <Toggle checked={follow} onChange={setFollow} label="thread_follow" />
      </td>
      <td className="py-2 pr-3">
        <Toggle checked={open} onChange={(v) => { void setOpen(v) }} label={`Mở #${row.name || row.id} cho mọi thành viên channel`} />
      </td>
      <td className="py-2 w-[72px]">
        {dirty && <Btn primary disabled={busy} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu'}</Btn>}
      </td>
    </tr>
  )
}

function PendingRow({ row, settings, onDone, onError }: { row: Row; settings: Settings; onDone: () => void; onError: (m: string) => void }) {
  const api = useAppApi()
  const [busy, setBusy] = useState(false)
  const onboard = async () => {
    setBusy(true)
    try {
      await api.post(`${BASE}/onboard`, { channel_id: row.id, channel_name: row.name })
      onDone()
    } catch (e) {
      onError(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <tr className="border-t border-[var(--border)]" data-testid={`pending-${row.id}`}>
      <td className="py-2 pr-3">
        <div className="font-medium">#{row.name || row.id}</div>
        <div className="text-xs text-muted">{row.id}</div>
      </td>
      <td className="py-2 pr-3 text-sm text-muted">
        → agent <span className="font-mono">{row.name || row.id}</span>, workspace{' '}
        <span className="font-mono">{settings.workspace_root}/{row.name || row.id}</span>
        {settings.dedicated_memory ? ', memory riêng' : ', memory chung'}
      </td>
      <td className="py-2">
        <Btn primary disabled={busy} onClick={onboard}>{busy ? 'Đang tạo…' : 'Onboard'}</Btn>
      </td>
    </tr>
  )
}

// ------------------------------------------------------- people (slice 4)

interface Member { slack_id: string; name: string; display?: string }
interface PeopleChannel { id: string; name: string; agent: string; workspace_dir: string; maintainers: string[]; commands: string[]; open: boolean; programs: string[] }
interface CommandDef { id: string; label: string; example: string }
interface People {
  owner: { slack_id: string; display: string }
  members: Member[]
  channels: PeopleChannel[]
  command_catalog: CommandDef[]
  roles_path: string
  roles_error: string
}

const label = (m: Member | undefined, id: string) => (m && (m.display || m.name)) || id

function MembersCard({ people, onSaved, onError }: { people: People; onSaved: (msg: string) => void; onError: (m: string) => void }) {
  const api = useAppApi()
  const [newId, setNewId] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async (members: Member[]) => {
    setBusy(true)
    try {
      const r = await api.put<{ hot_applied: boolean }>(`${BASE}/members`, { members: members.map(({ slack_id, name }) => ({ slack_id, name })) })
      onSaved(r.hot_applied ? 'Đã lưu, có hiệu lực ngay.' : 'Đã lưu. Gateway chưa nhận nóng — cần restart để áp dụng.')
    } catch (e) {
      onError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const add = async () => {
    const id = newId.trim().toUpperCase()
    if (!id) return
    setBusy(true)
    try {
      const u = await api.post<{ slack_id: string; name: string }>(`${BASE}/resolve-user`, { slack_id: id })
      setNewId('')
      await save([...people.members, { slack_id: u.slack_id, name: u.name }])
    } catch (e) {
      onError(String(e))
      setBusy(false)
    }
  }

  const remove = (id: string) => {
    const m = people.members.find((x) => x.slack_id === id)
    if (!window.confirm(`Gỡ ${label(m, id)} khỏi danh sách member? Người này cũng mất quyền maintainer ở mọi channel.`)) return
    void save(people.members.filter((x) => x.slack_id !== id))
  }

  return (
    <Card>
      <CardTitle>Member</CardTitle>
      <ul className="text-xs text-muted mb-2 list-disc pl-5 space-y-0.5">
        <li>Chat được với bot ở mọi channel bot có mặt, nhưng <b>chỉ đọc</b>: đọc file trong workspace của channel đó (trừ .env, khoá, .git/…), không sửa file, không chạy lệnh.</li>
        <li>Không DM, không bấm nút của bot, không spawn/cron/gửi tin.</li>
        <li>Người ngoài danh sách vẫn chat được ở channel bật cột <b>Mở</b> bên trên, với cùng quyền chỉ đọc.</li>
      </ul>
      <table className="w-full text-left text-sm"><tbody>
        <tr className="border-t border-[var(--border)]">
          <td className="py-2 pr-3">{people.owner.display || people.owner.slack_id}</td>
          <td className="py-2 pr-3 font-mono text-xs text-muted">{people.owner.slack_id}</td>
          <td className="py-2"><Badge variant="ok">owner · toàn quyền</Badge></td>
        </tr>
        {people.members.map((m) => (
          <tr key={m.slack_id} className="border-t border-[var(--border)]" data-testid={`member-${m.slack_id}`}>
            <td className="py-2 pr-3">{label(m, m.slack_id)}</td>
            <td className="py-2 pr-3 font-mono text-xs text-muted">{m.slack_id}</td>
            <td className="py-2"><Btn disabled={busy} onClick={() => remove(m.slack_id)}>Gỡ</Btn></td>
          </tr>
        ))}
      </tbody></table>
      <div className="mt-3 flex gap-2 items-center">
        <Input aria-label="Slack user ID cần thêm" placeholder="Slack user ID, ví dụ U0XXXXXXXXX" value={newId} onChange={(e) => setNewId(e.target.value)} />
        <Btn primary={!!newId.trim()} disabled={busy || !newId.trim()} onClick={add}>{busy ? 'Đang lưu…' : 'Thêm member'}</Btn>
      </div>
      <p className="text-xs text-muted mt-2">Lấy ID: mở profile người đó trên Slack → ⋮ → Copy member ID.</p>
    </Card>
  )
}

function ChannelRoleRow({ ch, members, catalog, onSaved, onError }: { ch: PeopleChannel; members: Member[]; catalog: CommandDef[]; onSaved: (msg: string) => void; onError: (m: string) => void }) {
  const api = useAppApi()
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState('')
  const [expanded, setExpanded] = useState(false)
  const byId = new Map(members.map((m) => [m.slack_id, m]))
  const candidates = members.filter((m) => !ch.maintainers.includes(m.slack_id))
  const hasRules = ch.commands.length > 0 || ch.programs.length > 0

  const save = async (ids: string[]) => {
    setBusy(true)
    try {
      await api.put(`${BASE}/maintainers`, { channel_id: ch.id, maintainers: ids })
      onSaved('Đã lưu maintainer, có hiệu lực ngay.')
    } catch (e) {
      onError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-t border-[var(--border)] py-2" data-testid={`maint-${ch.id}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-[180px]">
          <div className="font-medium">#{ch.name || ch.id}</div>
          <div className="text-xs text-muted font-mono truncate max-w-[260px]" title={ch.workspace_dir}>{ch.workspace_dir || '(chưa có workspace)'}</div>
        </div>
        <div className="flex flex-wrap gap-1 flex-1 min-w-[160px]">
          {ch.maintainers.map((id) => (
            <span key={id} className="inline-flex items-center gap-1">
              <Badge variant="aim">{label(byId.get(id), id)}</Badge>
              <button type="button" aria-label={`Gỡ maintainer ${label(byId.get(id), id)}`} className="text-xs text-muted hover:text-danger" disabled={busy}
                onClick={() => save(ch.maintainers.filter((x) => x !== id))}>✕</button>
            </span>
          ))}
          {ch.maintainers.length === 0 && <span className="text-xs text-muted">Chưa có maintainer</span>}
        </div>
        {(ch.maintainers.length > 0 || hasRules) && (
          <button type="button" className="text-xs text-accent hover:underline" aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)} data-testid={`maint-toggle-${ch.id}`}>
            {ch.commands.length} lệnh · {ch.programs.length} chương trình {expanded ? '▴' : '▾'}
          </button>
        )}
        <div className="flex gap-2 items-center">
          <select aria-label={`Thêm maintainer cho #${ch.name || ch.id}`} className="bg-[var(--bg-input,transparent)] border border-[var(--border)] rounded px-2 py-1 text-sm"
            value={pick} onChange={(e) => setPick(e.target.value)} disabled={busy || candidates.length === 0 || !ch.workspace_dir}>
            <option value="">{candidates.length ? 'Thêm maintainer…' : 'Không còn member'}</option>
            {candidates.map((m) => <option key={m.slack_id} value={m.slack_id}>{label(m, m.slack_id)}</option>)}
          </select>
          {pick && <Btn primary disabled={busy} onClick={() => { void save([...ch.maintainers, pick]); setPick('') }}>Thêm</Btn>}
        </div>
      </div>
      {expanded && <CommandsPanel ch={ch} catalog={catalog} onSaved={onSaved} onError={onError} />}
    </div>
  )
}

function CommandsPanel({ ch, catalog, onSaved, onError }: { ch: PeopleChannel; catalog: CommandDef[]; onSaved: (msg: string) => void; onError: (m: string) => void }) {
  const api = useAppApi()
  const [sel, setSel] = useState<string[]>(ch.commands)
  const [busy, setBusy] = useState(false)
  const dirty = sel.slice().sort().join(',') !== ch.commands.slice().sort().join(',')
  const toggle = (id: string, on: boolean) => setSel((cur) => (on ? [...cur.filter((x) => x !== id), id] : cur.filter((x) => x !== id)))
  const save = async () => {
    if (sel.includes('deploy') && !ch.commands.includes('deploy')
      && !window.confirm('Deploy chạy lên PRODUCTION bằng tài khoản Cloudflare của bạn. Cho phép maintainer tự deploy?')) return
    setBusy(true)
    try {
      await api.put(`${BASE}/commands`, { channel_id: ch.id, commands: sel })
      onSaved('Đã lưu lệnh được duyệt, có hiệu lực ngay.')
    } catch (e) {
      onError(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt-2 ml-2 pl-3 border-l-2 border-[var(--border)]" data-testid={`cmds-${ch.id}`}>
      <div className="text-xs text-muted mb-1">Lệnh được duyệt — maintainer chạy không cần hỏi:</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {catalog.map((c) => (
          <label key={c.id} className="inline-flex items-center gap-1 text-sm" title={c.example}>
            <input type="checkbox" checked={sel.includes(c.id)} disabled={busy} onChange={(e) => toggle(c.id, e.target.checked)} />
            {c.label}
          </label>
        ))}
      </div>
      {dirty && <div className="mt-2"><Btn primary disabled={busy} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu lệnh'}</Btn></div>}
      <ProgramsEditor ch={ch} onSaved={onSaved} onError={onError} />
    </div>
  )
}

function ProgramsEditor({ ch, onSaved, onError }: { ch: PeopleChannel; onSaved: (msg: string) => void; onError: (m: string) => void }) {
  const api = useAppApi()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async (progs: string[]) => {
    setBusy(true)
    try {
      await api.put(`${BASE}/programs`, { channel_id: ch.id, programs: progs })
      onSaved('Đã lưu chương trình được duyệt.')
    } catch (e) {
      onError(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt-3">
      <div className="text-xs text-muted mb-1">Chương trình được duyệt thêm:</div>
      <div className="flex flex-wrap gap-2 items-center">
        {ch.programs.map((p) => (
          <span key={p} className="inline-flex items-center gap-1">
            <Badge variant="aim">{p}</Badge>
            <button type="button" aria-label={`Gỡ chương trình ${p}`} className="text-xs text-muted hover:text-danger" disabled={busy}
              onClick={() => { void save(ch.programs.filter((x) => x !== p)) }}>✕</button>
          </span>
        ))}
        <Input aria-label={`Thêm chương trình cho #${ch.name || ch.id}`} placeholder="vd: sed, jq" className="max-w-[220px]" value={name} onChange={(e) => setName(e.target.value)} />
        {name.trim() && <Btn primary disabled={busy} onClick={() => { const n = name.trim(); setName(''); void save([...ch.programs, n]) }}>Thêm</Btn>}
      </div>
    </div>
  )
}

function MaintainersCard({ people, onSaved, onError }: { people: People; onSaved: (msg: string) => void; onError: (m: string) => void }) {
  // Channels that carry a maintainer or saved rules first; the rest keep the list order.
  const weight = (c: PeopleChannel) => (c.maintainers.length ? 0 : c.commands.length || c.programs.length ? 1 : 2)
  const rows = [...people.channels].sort((a, b) => weight(a) - weight(b))
  return (
    <Card>
      <CardTitle>Maintainer theo channel</CardTitle>
      <ul className="text-xs text-muted mb-2 list-disc pl-5 space-y-0.5">
        <li>Maintainer sửa được file trong workspace của channel đó (trừ .git/, .kiro/, .env*, khoá, file cấu hình build) và chạy các lệnh đã duyệt. Ở channel khác họ chỉ là member. Phải là member trước.</li>
        <li>Lệnh chưa có quyền: bot hỏi owner trên Slack — <i>Cho phép 1 lần</i> / <i>Cho phép cả lượt này</i> / <i>Luôn cho phép</i> / <i>Từ chối</i>. «Luôn cho phép» hiện ở đây.</li>
        <li>Chương trình duyệt thêm vẫn bị kiểm đường dẫn (trong workspace, không phải file bí mật). Shell, python/node, curl, npm… và npm install, DB remote không bao giờ duyệt được.</li>
      </ul>
      <div className="text-sm">
        {rows.map((ch) => (
          <ChannelRoleRow key={`${ch.id}:${ch.maintainers.join(',')}:${ch.commands.join(',')}:${ch.programs.join(',')}`}
            ch={ch} members={people.members} catalog={people.command_catalog} onSaved={onSaved} onError={onError} />
        ))}
      </div>
      <p className="text-xs text-muted mt-2 font-mono">{people.roles_path}</p>
    </Card>
  )
}

function SettingsCard({ settings, onSaved, onError }: { settings: Settings; onSaved: () => void; onError: (m: string) => void }) {
  const api = useAppApi()
  const [s, setS] = useState<Settings>(settings)
  useEffect(() => setS(settings), [settings])
  const save = async () => {
    try {
      await api.put(`${BASE}/settings`, s)
      onSaved()
    } catch (e) {
      onError(String(e))
    }
  }
  return (
    <Card>
      <CardTitle>Cài đặt tự động</CardTitle>
      <div className="grid gap-3 text-sm grid-cols-[180px_1fr] items-center">
        <label htmlFor="co-mode">Chế độ phát hiện</label>
        <Select label="Chế độ" value={s.mode} options={['auto', 'notify', 'off']} onChange={(v) => setS({ ...s, mode: v as Settings['mode'] })} />
        <label htmlFor="co-root">Thư mục gốc workspace</label>
        <Input id="co-root" value={s.workspace_root} onChange={(e) => setS({ ...s, workspace_root: e.target.value })} />
        <span>Activation mặc định</span>
        <Select label="Activation mặc định" value={s.activation} options={ACTIVATIONS} onChange={(v) => setS({ ...s, activation: v })} />
        <span>thread_follow mặc định</span>
        <Toggle checked={s.thread_follow} onChange={(v) => setS({ ...s, thread_follow: v })} label="thread_follow mặc định" />
        <span>Chỉ khi owner ở trong channel</span>
        <Toggle checked={s.require_owner_member} onChange={(v) => setS({ ...s, require_owner_member: v })} label="Chỉ khi owner ở trong channel" />
        <span>Memory riêng cho mỗi channel</span>
        <Toggle checked={s.dedicated_memory} onChange={(v) => setS({ ...s, dedicated_memory: v })} label="Memory riêng" />
        <label htmlFor="co-poll">Chu kỳ quét (giây, 60–3600)</label>
        <Input id="co-poll" type="number" min={60} max={3600} value={s.poll_secs} onChange={(e) => setS({ ...s, poll_secs: Number(e.target.value) })} />
      </div>
      <div className="mt-3"><Btn primary onClick={save}>Lưu cài đặt</Btn></div>
      <p className="text-xs text-muted mt-2">
        auto: tự tạo agent khi bot được thêm vào channel mới rồi DM cho bạn. notify: chỉ DM báo. off: tắt quét nền.
      </p>
    </Card>
  )
}

export default function ChannelOnboard() {
  const api = useAppApi()
  const [data, setData] = useState<ListResponse | null>(null)
  const [people, setPeople] = useState<People | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(() => {
    setError('')
    api.get<ListResponse>(`${BASE}/channels`).then(setData).catch((e) => setError(String(e)))
    api.get<People>(`${BASE}/people`).then(setPeople).catch((e) => setError(String(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- api is the host's scoped client
  }, [])
  useEffect(() => { load() }, [load])
  const saved = (msg: string) => { setNotice(msg); load() }

  const configured = data?.channels.filter((c) => c.configured) ?? []
  const pending = data?.channels.filter((c) => !c.configured && c.bot_member && !c.id.startsWith('D')) ?? []
  const openIds = new Set((people?.channels ?? []).filter((c) => c.open).map((c) => c.id))
  const maintained = new Set((people?.channels ?? []).filter((c) => c.maintainers.length > 0).map((c) => c.id))
  const backends = data?.backends

  return (
    <>
      <PageHeader title="Channel Onboard" subtitle="Mỗi Slack channel một agent, workspace và memory riêng" actions={<Btn onClick={load}>Làm mới</Btn>} />
      <div className="px-6 pb-8 overflow-y-auto flex-1 min-h-0 space-y-4">
        {error && <Card><div role="alert" className="text-danger text-sm">{error}</div></Card>}
        {notice && <Card><div role="status" className="text-sm">{notice}</div></Card>}
        {data?.slack_error && <Card><div role="alert" className="text-warn text-sm">Không đọc được danh sách channel từ Slack: {data.slack_error}</div></Card>}
        {people?.roles_error && <Card><div role="alert" className="text-danger text-sm">File vai trò lỗi, không ghi đè: {people.roles_error}</div></Card>}
        <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
          <StatCard label="Đã cấu hình" value={data ? configured.length : null} accent />
          <StatCard label="Chờ onboard" value={data ? pending.length : null} />
          <StatCard label="Channel mở" value={people ? openIds.size : null} />
          <StatCard label="Chế độ" value={data ? data.settings.mode : null} />
        </div>

        <Card>
          <CardTitle>Chờ onboard</CardTitle>
          {data && pending.length === 0 ? (
            <EmptyState icon="✓" title="Không có channel nào đang chờ" subtitle="Thêm bot vào một channel mới để nó xuất hiện ở đây." />
          ) : (
            <table className="w-full text-left"><tbody>
              {pending.map((r) => data && <PendingRow key={r.id} row={r} settings={data.settings} onDone={load} onError={setError} />)}
            </tbody></table>
          )}
        </Card>

        <Card>
          <CardTitle>Channel đã cấu hình</CardTitle>
          <p className="text-xs text-muted mb-2">
            <b>Mở</b>: mọi thành viên của channel (không gồm guest và người ngoài workspace) chat được với bot ở channel đó, quyền chỉ đọc, kể cả khi không có trong danh sách Member.
            {backends?.supported && <> <b>Agent backend</b>: harness agent của channel chạy trên, áp dụng cho thread mới. Backend chưa cài hoặc bị chặn thì bot từ chối chạy và báo lý do trong thread, không tự chuyển sang Kiro CLI.</>}
          </p>
          <table className="w-full text-left text-sm">
            <thead><tr className="text-xs text-muted">
              <th className="pb-2 pr-3">Channel</th><th className="pb-2 pr-3">Agent</th>
              {backends?.supported && <th className="pb-2 pr-3">Agent backend</th>}
              <th className="pb-2 pr-3">Workspace</th><th className="pb-2 pr-3">Activation</th>
              <th className="pb-2 pr-3">thread_follow</th><th className="pb-2 pr-3">Mở</th><th className="pb-2" />
            </tr></thead>
            <tbody>
              {configured.map((r) => (
                <ConfiguredRow key={`${r.id}:${r.workspace_dir}:${r.activation}:${r.thread_follow}:${openIds.has(r.id)}:${r.acp_backend ?? INHERIT}`}
                  row={r} open={openIds.has(r.id)} backends={backends} hasMaintainers={maintained.has(r.id)}
                  onSaved={load} onNotice={saved} onError={setError} />
              ))}
            </tbody>
          </table>
        </Card>

        {people && <MembersCard people={people} onSaved={saved} onError={setError} />}
        {people && <MaintainersCard people={people} onSaved={saved} onError={setError} />}

        {data && <SettingsCard settings={data.settings} onSaved={load} onError={setError} />}
      </div>
    </>
  )
}
