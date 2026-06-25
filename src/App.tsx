import { useState, useEffect, useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { supabase, supabaseMisconfigured } from './lib/supabase'

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD as string
const DOWNLOADS_KEY = 'vestis_admin_downloads'

interface UserRow {
  id: string
  display_name: string | null
  username: string | null
  created_at: string
  item_count: number
  outfit_count: number
}

interface Stats {
  totalUsers: number
  usersWithItems: number
  usersWithOutfits: number
  totalItems: number
  totalOutfits: number
}

interface Snapshot {
  id: string
  snapshot_date: string
  total_downloads: number
  total_users: number
  users_added_item: number
  users_generated_outfit: number
  total_items_added: number
  total_outfits_made: number
  created_at: string
}

type DateRange = 'last7' | 'last30' | 'all'

function localDateISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Stat cards ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value.toLocaleString()}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function DownloadsCard({
  downloads,
  onChange,
}: {
  downloads: number
  onChange: (n: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')

  function startEdit() {
    setInput(downloads.toString())
    setEditing(true)
  }

  function save() {
    const n = parseInt(input, 10)
    if (!isNaN(n) && n >= 0) onChange(n)
    setEditing(false)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500">Total Downloads</p>
      {editing ? (
        <div className="mt-1">
          <input
            type="text"
            inputMode="numeric"
            value={input}
            onChange={e => setInput(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
            onBlur={save}
            className="w-full text-3xl font-bold text-gray-900 border-0 border-b-2 border-black outline-none bg-transparent p-0 leading-tight"
            autoFocus
          />
          <p className="text-xs text-gray-400 mt-1">Press Enter to save</p>
        </div>
      ) : (
        <div className="mt-1 cursor-text group/num" onClick={startEdit} title="Click to edit">
          <p className="text-3xl font-bold text-gray-900 group-hover/num:text-gray-500 transition-colors">
            {downloads.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-1">Click to edit</p>
        </div>
      )}
    </div>
  )
}

// ─── Funnel chart ───────────────────────────────────────────────────────────────

function FunnelChart({ stats, downloads }: { stats: Stats; downloads: number }) {
  const steps = [
    {
      label: 'Total Downloads',
      value: downloads,
      color: 'bg-purple-500',
      description: 'App downloaded',
    },
    {
      label: 'Total Users',
      value: stats.totalUsers,
      color: 'bg-gray-800',
      description: 'Signed up',
    },
    {
      label: 'Added to Wardrobe',
      value: stats.usersWithItems,
      color: 'bg-blue-500',
      description: 'Ever added at least 1 clothing item',
    },
    {
      label: 'Generated Outfits',
      value: stats.usersWithOutfits,
      color: 'bg-green-500',
      description: 'Ever created at least 1 outfit',
    },
  ]

  const max = downloads || stats.totalUsers || 1

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-5">User Funnel</h2>
      <div className="space-y-4">
        {steps.map((step, i) => {
          const pct = Math.round((step.value / max) * 100)
          const prevValue = i > 0 ? steps[i - 1].value : null
          const dropoff = prevValue && prevValue > 0
            ? Math.round(((prevValue - step.value) / prevValue) * 100)
            : null
          return (
            <div key={step.label}>
              <div className="flex items-center justify-between mb-1.5">
                <div>
                  <span className="text-sm font-medium text-gray-900">{step.label}</span>
                  <span className="text-xs text-gray-400 ml-2">{step.description}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  {dropoff !== null && (
                    <span className="text-xs text-red-400 font-medium">↓ {dropoff}% drop</span>
                  )}
                  <span className="text-sm font-bold text-gray-900 w-12 text-right">
                    {step.value.toLocaleString()}
                  </span>
                  <span className="text-xs text-gray-400 w-9 text-right">{pct}%</span>
                </div>
              </div>
              <div className="h-9 bg-gray-100 rounded-lg overflow-hidden">
                <div
                  className={`h-full ${step.color} rounded-lg transition-all duration-700`}
                  style={{ width: `${Math.max(pct, step.value > 0 ? 1 : 0)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Snapshot panel ─────────────────────────────────────────────────────────────

function SaveSnapshotPanel({
  downloads,
  existingSnapshot,
  onSave,
  onCancel,
  saving,
  error,
}: {
  downloads: number
  existingSnapshot: Snapshot | null
  onSave: (n: number) => void
  onCancel: () => void
  saving: boolean
  error: string | null
}) {
  const [input, setInput] = useState(
    existingSnapshot != null
      ? existingSnapshot.total_downloads.toString()
      : downloads.toString()
  )

  const todayLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  function confirm() {
    const n = parseInt(input, 10)
    if (!isNaN(n) && n >= 0) onSave(n)
  }

  return (
    <div className="mt-3 bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start gap-6 flex-wrap">
        <div className="flex-1 min-w-48">
          <p className="text-xs font-medium text-gray-500 mb-0.5">Snapshot date</p>
          <p className="text-sm text-gray-900">{todayLabel}</p>
          {existingSnapshot != null && (
            <p className="text-xs text-amber-600 mt-1">
              A snapshot for today already exists and will be updated.
            </p>
          )}
        </div>
        <div>
          <label
            className="text-xs font-medium text-gray-500 block mb-1"
            htmlFor="snapshot-downloads"
          >
            Total Downloads
          </label>
          <input
            id="snapshot-downloads"
            type="text"
            inputMode="numeric"
            value={input}
            onChange={e => setInput(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={e => { if (e.key === 'Enter') confirm() }}
            className="w-36 border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-black"
            autoFocus
          />
        </div>
        <div className="flex items-end gap-2">
          <button
            onClick={confirm}
            disabled={saving}
            className="bg-black text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save snapshot'}
          </button>
          <button
            onClick={onCancel}
            disabled={saving}
            className="text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 bg-white disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
      {error != null && (
        <p className="text-xs text-red-500 mt-2">{error}</p>
      )}
    </div>
  )
}

// ─── Trend charts ────────────────────────────────────────────────────────────────

function tooltipContent(unit: string) {
  return function ({ active, payload, label }: TooltipContentProps) {
    if (!active || !payload.length) return null
    return (
      <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm text-xs">
        <p className="font-medium text-gray-700 mb-1">{String(label ?? '')}</p>
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: p.color }}
            />
            <span className="text-gray-500">{String(p.name ?? '')}:</span>
            <span className="font-medium text-gray-900">
              {(typeof p.value === 'number' ? p.value : Number(p.value ?? 0)).toLocaleString()}
              {unit}
            </span>
          </div>
        ))}
      </div>
    )
  }
}

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  last7: 'Last 7 snapshots',
  last30: 'Last 30 days',
  all: 'All time',
}

function TrendSection({
  snapshots,
  snapshotsLoading,
}: {
  snapshots: Snapshot[]
  snapshotsLoading: boolean
}) {
  const [dateRange, setDateRange] = useState<DateRange>('all')

  const filtered = useMemo((): Snapshot[] => {
    if (dateRange === 'last7') return snapshots.slice(-7)
    if (dateRange === 'last30') {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 30)
      return snapshots.filter(s => new Date(s.snapshot_date) >= cutoff)
    }
    return snapshots
  }, [snapshots, dateRange])

  const chartData = useMemo(() =>
    filtered.map(s => ({
      date: new Date(s.snapshot_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      'Total Downloads': s.total_downloads,
      'Total Users': s.total_users,
      'Added to Wardrobe': s.users_added_item,
      'Generated Outfits': s.users_generated_outfit,
    })),
    [filtered]
  )

  const rateData = useMemo(() =>
    filtered.map(s => ({
      date: new Date(s.snapshot_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      'Download to Sign-up': s.total_downloads > 0
        ? Math.round((s.total_users / s.total_downloads) * 100)
        : 0,
      'Sign-up to Added Item': s.total_users > 0
        ? Math.round((s.users_added_item / s.total_users) * 100)
        : 0,
      'Added Item to Outfit': s.users_added_item > 0
        ? Math.round((s.users_generated_outfit / s.users_added_item) * 100)
        : 0,
    })),
    [filtered]
  )

  if (snapshotsLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 text-center text-sm text-gray-400">
        Loading trend data…
      </div>
    )
  }

  const isEmpty = snapshots.length === 0
  const rangeEmpty = !isEmpty && filtered.length === 0

  const yAxisTickFormatter = (v: number) =>
    v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toString()

  const dateRangePicker = (
    <div className="flex gap-1.5">
      {(Object.keys(DATE_RANGE_LABELS) as DateRange[]).map(range => (
        <button
          key={range}
          onClick={() => setDateRange(range)}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
            dateRange === range
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
          }`}
        >
          {DATE_RANGE_LABELS[range]}
        </button>
      ))}
    </div>
  )

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <h2 className="text-sm font-semibold text-gray-700">Growth Over Time</h2>
          {!isEmpty && dateRangePicker}
        </div>

        {isEmpty ? (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-400">No snapshots yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Click "Save Today's Snapshot" to start tracking trends.
            </p>
          </div>
        ) : rangeEmpty ? (
          <div className="py-12 text-center text-sm text-gray-400">
            No snapshots in this date range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={yAxisTickFormatter}
              />
              <Tooltip content={tooltipContent('')} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
              <Line type="monotone" dataKey="Total Downloads" stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="Total Users" stroke="#1f2937" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="Added to Wardrobe" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="Generated Outfits" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-5">
          Funnel Conversion Rates Over Time
        </h2>

        {isEmpty ? (
          <div className="py-12 text-center text-sm text-gray-400">No snapshots yet.</div>
        ) : rangeEmpty ? (
          <div className="py-12 text-center text-sm text-gray-400">
            No snapshots in this date range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={rateData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                width={40}
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip content={tooltipContent('%')} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
              <Line type="monotone" dataKey="Download to Sign-up" stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="Sign-up to Added Item" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="Added Item to Outfit" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </>
  )
}

// ─── App ────────────────────────────────────────────────────────────────────────

type SortKey = keyof UserRow

export default function App() {
  const [authed, setAuthed] = useState(!ADMIN_PASSWORD)
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [users, setUsers] = useState<UserRow[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'item_count',
    dir: 'desc',
  })
  const [downloads, setDownloads] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(DOWNLOADS_KEY)
      return saved ? parseInt(saved, 10) : 0
    } catch {
      return 0
    }
  })

  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [snapshotsLoading, setSnapshotsLoading] = useState(false)
  const [showSnapshotPanel, setShowSnapshotPanel] = useState(false)
  const [savingSnapshot, setSavingSnapshot] = useState(false)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)

  function handleDownloadsChange(n: number) {
    setDownloads(n)
    try { localStorage.setItem(DOWNLOADS_KEY, n.toString()) } catch { /* ignore */ }
  }

  useEffect(() => {
    if (authed && !supabaseMisconfigured) {
      loadData()
      loadSnapshots()
    }
  }, [authed])

  async function loadData() {
    setLoading(true)
    setLoadError(null)

    const [profilesRes, itemsRes, outfitsRes] = await Promise.all([
      supabase.from('profiles').select('id, display_name, username, created_at, has_ever_added_item, has_ever_generated_outfit'),
      supabase.from('clothing_items').select('user_id'),
      supabase.from('outfits').select('user_id'),
    ])

    if (profilesRes.error) { setLoadError(`Profiles error: ${profilesRes.error.message}`); setLoading(false); return }
    if (itemsRes.error) { setLoadError(`Items error: ${itemsRes.error.message}`); setLoading(false); return }
    if (outfitsRes.error) { setLoadError(`Outfits error: ${outfitsRes.error.message}`); setLoading(false); return }

    const itemCounts = new Map<string, number>()
    itemsRes.data?.forEach((i: { user_id: string }) =>
      itemCounts.set(i.user_id, (itemCounts.get(i.user_id) ?? 0) + 1)
    )
    const outfitCounts = new Map<string, number>()
    outfitsRes.data?.forEach((o: { user_id: string }) =>
      outfitCounts.set(o.user_id, (outfitCounts.get(o.user_id) ?? 0) + 1)
    )

    const rows: UserRow[] = (profilesRes.data || []).map((u: any) => ({
      id: u.id,
      display_name: u.display_name,
      username: u.username,
      created_at: u.created_at,
      item_count: itemCounts.get(u.id) ?? 0,
      outfit_count: outfitCounts.get(u.id) ?? 0,
    }))

    setStats({
      totalUsers: rows.length,
      usersWithItems: (profilesRes.data || []).filter((u: any) => u.has_ever_added_item).length,
      usersWithOutfits: (profilesRes.data || []).filter((u: any) => u.has_ever_generated_outfit).length,
      totalItems: rows.reduce((s, u) => s + u.item_count, 0),
      totalOutfits: rows.reduce((s, u) => s + u.outfit_count, 0),
    })
    setUsers(rows)
    setLoading(false)
  }

  async function loadSnapshots() {
    setSnapshotsLoading(true)
    const { data, error } = await supabase
      .from('admin_analytics_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: true })
    setSnapshotsLoading(false)
    if (!error && data) {
      setSnapshots(data as Snapshot[])
    }
  }

  async function handleSaveSnapshot(downloadsNum: number) {
    if (!stats) return
    setSavingSnapshot(true)
    setSnapshotError(null)

    const { error } = await supabase
      .from('admin_analytics_snapshots')
      .upsert(
        {
          snapshot_date: localDateISO(),
          total_downloads: downloadsNum,
          total_users: stats.totalUsers,
          users_added_item: stats.usersWithItems,
          users_generated_outfit: stats.usersWithOutfits,
          total_items_added: stats.totalItems,
          total_outfits_made: stats.totalOutfits,
        },
        { onConflict: 'snapshot_date' }
      )

    setSavingSnapshot(false)
    if (error) {
      setSnapshotError(error.message)
    } else {
      setShowSnapshotPanel(false)
      await loadSnapshots()
    }
  }

  function tryLogin() {
    if (password === ADMIN_PASSWORD) { setAuthed(true) }
    else { setAuthError('Incorrect password') }
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 w-80 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Vestis Admin</h1>
          <p className="text-sm text-gray-400 mb-6">Enter your password to continue</p>
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setAuthError('') }}
            onKeyDown={e => e.key === 'Enter' && tryLogin()}
            placeholder="Password"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:ring-2 focus:ring-black"
            autoFocus
          />
          {authError && <p className="text-red-500 text-xs mb-3">{authError}</p>}
          <button
            onClick={tryLogin}
            className="w-full bg-black text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Sign in
          </button>
        </div>
      </div>
    )
  }

  const filtered = users
    .filter(u => {
      const q = search.toLowerCase()
      return !q || u.display_name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const av = a[sort.key] ?? ''
      const bv = b[sort.key] ?? ''
      if (av < bv) return sort.dir === 'asc' ? -1 : 1
      if (av > bv) return sort.dir === 'asc' ? 1 : -1
      return 0
    })

  function toggleSort(key: SortKey) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' })
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sort.key !== col) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>
  }

  const pct = (n: number, total: number) =>
    total === 0 ? '0%' : `${Math.round((n / total) * 100)}% of users`

  const todayStr = localDateISO()
  const todaysSnapshot = snapshots.find(s => s.snapshot_date === todayStr) ?? null

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Vestis Admin</h1>
              <p className="text-sm text-gray-400 mt-0.5">User analytics</p>
            </div>
            <div className="flex items-center gap-2">
              {stats && (
                <button
                  onClick={() => { setShowSnapshotPanel(p => !p); setSnapshotError(null) }}
                  className={`text-sm border rounded-lg px-3 py-1.5 transition-colors ${
                    showSnapshotPanel
                      ? 'bg-gray-900 text-white border-gray-900 hover:bg-gray-700'
                      : 'text-gray-500 hover:text-gray-900 border-gray-200 bg-white'
                  }`}
                >
                  Save Today's Snapshot
                </button>
              )}
              <button
                onClick={() => { loadData(); loadSnapshots() }}
                className="text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 bg-white transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>

          {showSnapshotPanel && stats && (
            <SaveSnapshotPanel
              downloads={downloads}
              existingSnapshot={todaysSnapshot}
              onSave={handleSaveSnapshot}
              onCancel={() => { setShowSnapshotPanel(false); setSnapshotError(null) }}
              saving={savingSnapshot}
              error={snapshotError}
            />
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
          {stats ? (
            <>
              <StatCard label="Total Users" value={stats.totalUsers} />
              <StatCard label="Ever Added Item" value={stats.usersWithItems} sub={pct(stats.usersWithItems, stats.totalUsers)} />
              <StatCard label="Ever Generated Outfit" value={stats.usersWithOutfits} sub={pct(stats.usersWithOutfits, stats.totalUsers)} />
              <StatCard label="Total Items Added" value={stats.totalItems} />
              <StatCard label="Total Outfits Made" value={stats.totalOutfits} />
            </>
          ) : (
            <div className="col-span-5 bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-center text-sm text-gray-400">
              {loading ? 'Loading…' : 'No data'}
            </div>
          )}
          <DownloadsCard downloads={downloads} onChange={handleDownloadsChange} />
        </div>

        {supabaseMisconfigured && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 mb-6 text-sm text-yellow-800">
            <strong>Missing env vars:</strong> VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_KEY must be set in Vercel → Environment Variables, then redeploy.
          </div>
        )}

        {loadError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {stats && <FunnelChart stats={stats} downloads={downloads} />}

        <TrendSection snapshots={snapshots} snapshotsLoading={snapshotsLoading} />

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center gap-3">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or username…"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-black"
            />
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {filtered.length} of {users.length} users
            </span>
          </div>

          {loading ? (
            <div className="p-16 text-center text-gray-400 text-sm">Loading…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500 bg-gray-50">
                    <th className="px-4 py-3 font-medium cursor-pointer hover:text-gray-900 select-none" onClick={() => toggleSort('display_name')}>
                      Name <SortIcon col="display_name" />
                    </th>
                    <th className="px-4 py-3 font-medium cursor-pointer hover:text-gray-900 select-none" onClick={() => toggleSort('username')}>
                      Username <SortIcon col="username" />
                    </th>
                    <th className="px-4 py-3 font-medium cursor-pointer hover:text-gray-900 select-none" onClick={() => toggleSort('item_count')}>
                      Wardrobe Items <SortIcon col="item_count" />
                    </th>
                    <th className="px-4 py-3 font-medium cursor-pointer hover:text-gray-900 select-none" onClick={() => toggleSort('outfit_count')}>
                      Outfits Generated <SortIcon col="outfit_count" />
                    </th>
                    <th className="px-4 py-3 font-medium cursor-pointer hover:text-gray-900 select-none" onClick={() => toggleSort('created_at')}>
                      Joined <SortIcon col="created_at" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(u => (
                    <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{u.display_name || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-gray-400">{u.username ? `@${u.username}` : <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${u.item_count > 0 ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                          {u.item_count}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${u.outfit_count > 0 ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                          {u.outfit_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">No users found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
