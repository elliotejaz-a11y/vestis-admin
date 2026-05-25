import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD as string

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

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value.toLocaleString()}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function FunnelChart({ stats }: { stats: Stats }) {
  const steps = [
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
      description: 'Added at least 1 clothing item',
    },
    {
      label: 'Generated Outfits',
      value: stats.usersWithOutfits,
      color: 'bg-green-500',
      description: 'Created at least 1 outfit',
    },
  ]

  const max = stats.totalUsers || 1

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-5">User Funnel</h2>
      <div className="space-y-4">
        {steps.map((step, i) => {
          const pct = Math.round((step.value / max) * 100)
          const prevValue = i > 0 ? steps[i - 1].value : null
          const dropoff = prevValue ? Math.round(((prevValue - step.value) / prevValue) * 100) : null
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
                  style={{ width: `${Math.max(pct, pct === 0 ? 0 : 1)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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

  useEffect(() => {
    if (authed) loadData()
  }, [authed])

  async function loadData() {
    setLoading(true)
    setLoadError(null)

    const [profilesRes, itemsRes, outfitsRes] = await Promise.all([
      supabase.from('profiles').select('id, display_name, username, created_at'),
      supabase.from('clothing_items').select('user_id'),
      supabase.from('outfits').select('user_id'),
    ])

    if (profilesRes.error) {
      setLoadError(`Profiles error: ${profilesRes.error.message}`)
      setLoading(false)
      return
    }
    if (itemsRes.error) {
      setLoadError(`Items error: ${itemsRes.error.message}`)
      setLoading(false)
      return
    }
    if (outfitsRes.error) {
      setLoadError(`Outfits error: ${outfitsRes.error.message}`)
      setLoading(false)
      return
    }

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
      usersWithItems: rows.filter(u => u.item_count > 0).length,
      usersWithOutfits: rows.filter(u => u.outfit_count > 0).length,
      totalItems: rows.reduce((s, u) => s + u.item_count, 0),
      totalOutfits: rows.reduce((s, u) => s + u.outfit_count, 0),
    })
    setUsers(rows)
    setLoading(false)
  }

  function tryLogin() {
    if (password === ADMIN_PASSWORD) {
      setAuthed(true)
    } else {
      setAuthError('Incorrect password')
    }
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

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Vestis Admin</h1>
            <p className="text-sm text-gray-400 mt-0.5">User analytics</p>
          </div>
          <button
            onClick={loadData}
            className="text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 bg-white transition-colors"
          >
            Refresh
          </button>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <StatCard label="Total Users" value={stats.totalUsers} />
            <StatCard
              label="Have Wardrobe Items"
              value={stats.usersWithItems}
              sub={pct(stats.usersWithItems, stats.totalUsers)}
            />
            <StatCard
              label="Generated Outfits"
              value={stats.usersWithOutfits}
              sub={pct(stats.usersWithOutfits, stats.totalUsers)}
            />
            <StatCard label="Total Items Added" value={stats.totalItems} />
            <StatCard label="Total Outfits Made" value={stats.totalOutfits} />
          </div>
        )}

        {loadError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {stats && <FunnelChart stats={stats} />}

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
                    <th
                      className="px-4 py-3 font-medium cursor-pointer hover:text-gray-900 select-none"
                      onClick={() => toggleSort('display_name')}
                    >
                      Name <SortIcon col="display_name" />
                    </th>
                    <th
                      className="px-4 py-3 font-medium cursor-pointer hover:text-gray-900 select-none"
                      onClick={() => toggleSort('username')}
                    >
                      Username <SortIcon col="username" />
                    </th>
                    <th
                      className="px-4 py-3 font-medium cursor-pointer hover:text-gray-900 select-none"
                      onClick={() => toggleSort('item_count')}
                    >
                      Wardrobe Items <SortIcon col="item_count" />
                    </th>
                    <th
                      className="px-4 py-3 font-medium cursor-pointer hover:text-gray-900 select-none"
                      onClick={() => toggleSort('outfit_count')}
                    >
                      Outfits Generated <SortIcon col="outfit_count" />
                    </th>
                    <th
                      className="px-4 py-3 font-medium cursor-pointer hover:text-gray-900 select-none"
                      onClick={() => toggleSort('created_at')}
                    >
                      Joined <SortIcon col="created_at" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(u => (
                    <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {u.display_name || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {u.username ? `@${u.username}` : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            u.item_count > 0
                              ? 'bg-green-50 text-green-700'
                              : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {u.item_count}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            u.outfit_count > 0
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {u.outfit_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {u.created_at
                          ? new Date(u.created_at).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                        No users found
                      </td>
                    </tr>
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
