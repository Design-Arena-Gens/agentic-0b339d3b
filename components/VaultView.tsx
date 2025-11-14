"use client"

import { useEffect, useMemo, useState } from 'react'
import { decryptVault, encryptVault, generatePassword, type VaultData, type VaultRecord } from '@/lib/crypto'
import { deleteRecord, exportCipher, upsertRecord } from '@/lib/storage'
import { z } from 'zod'

const recordSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  username: z.string().optional().or(z.literal('')),
  password: z.string().optional().or(z.literal('')),
  url: z.string().url().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  tags: z.array(z.string()).optional()
})

type Props = {
  masterKey: CryptoKey
  onVaultChange: (cipher: string) => void
  loadCipher: () => string
}

export function VaultView({ masterKey, onVaultChange, loadCipher }: Props) {
  const [vault, setVault] = useState<VaultData | null>(null)
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState<null | { mode: 'create' | 'edit', draft: VaultRecord }>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const run = async () => {
      const cipher = loadCipher()
      const v = await decryptVault(cipher, masterKey)
      setVault(v)
    }
    run()
  }, [masterKey, loadCipher])

  const filtered = useMemo(() => {
    if (!vault) return []
    const q = query.trim().toLowerCase()
    if (!q) return vault.records
    return vault.records.filter(r => {
      const hay = [r.title, r.username, r.url, r.notes, ...(r.tags || [])].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [vault, query])

  async function persist(next: VaultData) {
    setBusy(true)
    try {
      const cipher = await encryptVault(next, masterKey)
      onVaultChange(cipher)
      setVault(next)
    } finally {
      setBusy(false)
    }
  }

  async function handleSave(draft: VaultRecord) {
    const parse = recordSchema.safeParse(draft)
    if (!parse.success) return
    await persist(upsertRecord(vault!, { ...draft, ...parse.data }))
    setModal(null)
  }

  async function handleDelete(id: string) {
    await persist(deleteRecord(vault!, id))
  }

  function newDraft(): VaultRecord {
    return {
      id: crypto.randomUUID(),
      title: '',
      username: '',
      password: generatePassword(),
      url: '',
      notes: '',
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  }

  function copy(text?: string) {
    if (!text) return
    navigator.clipboard.writeText(text)
  }

  if (!vault) return (
    <div className="flex flex-1 items-center justify-center text-white/60">Decrypting?</div>
  )

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="relative w-full">
          <input className="input w-full" placeholder="Search titles, users, URLs, tags?" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'create', draft: newDraft() })}>New</button>
        <ExportImport vaultCipherLoader={loadCipher} onImport={onVaultChange} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map(r => (
          <div key={r.id} className="card p-4">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">{r.title}</h3>
                <p className="text-xs text-white/50">{r.url || '?'}</p>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-ghost px-2 text-xs" onClick={() => setModal({ mode: 'edit', draft: r })}>Edit</button>
                <button className="btn btn-ghost px-2 text-xs" onClick={() => handleDelete(r.id)}>Delete</button>
              </div>
            </div>
            <div className="space-y-1 text-sm">
              <Field label="Username" value={r.username} onCopy={() => copy(r.username)} />
              <Field label="Password" value={'?'.repeat(Math.min(r.password?.length || 10, 24))} onCopy={() => copy(r.password)} sensitive />
              <Field label="Notes" value={r.notes} multi />
              <div className="flex flex-wrap gap-1 pt-1">
                {(r.tags || []).map(t => <span key={t} className="rounded border border-htb-green/30 px-2 py-0.5 text-xs text-htb-green">{t}</span>)}
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full py-16 text-center text-white/50">No entries match your search.</div>
        )}
      </div>

      {modal && (
        <EditModal
          draft={modal.draft}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {busy && <div className="fixed inset-0 z-40 bg-black/40" />}
    </div>
  )
}

function Field({ label, value, onCopy, multi, sensitive }: { label: string, value?: string, onCopy?: () => void, multi?: boolean, sensitive?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-white/45">{label}</span>
        {onCopy && value && <button onClick={onCopy} className="text-xs text-htb-green hover:text-htb-accent">Copy</button>}
      </div>
      {multi ? (
        <p className="whitespace-pre-wrap rounded-md border border-white/5 bg-white/5 p-2 text-white/80">{value || '?'}</p>
      ) : (
        <p className={`truncate rounded-md border border-white/5 bg-white/5 p-2 ${sensitive ? 'tracking-widest' : ''}`}>{value || '?'}</p>
      )}
    </div>
  )
}

function EditModal({ draft, onClose, onSave }: { draft: VaultRecord, onClose: () => void, onSave: (d: VaultRecord) => void }) {
  const [d, setD] = useState<VaultRecord>({ ...draft })
  function set<K extends keyof VaultRecord>(key: K, value: VaultRecord[K]) {
    setD(prev => ({ ...prev, [key]: value }))
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="card w-full max-w-lg p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{draft.title ? 'Edit Entry' : 'New Entry'}</h3>
          <button className="text-white/60 hover:text-white" onClick={onClose}>Close</button>
        </div>
        <div className="grid gap-3">
          <L label="Title"><input className="input" value={d.title} onChange={e => set('title', e.target.value)} /></L>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <L label="Username"><input className="input" value={d.username || ''} onChange={e => set('username', e.target.value)} /></L>
            <L label="Password">
              <div className="flex gap-2">
                <input className="input" value={d.password || ''} onChange={e => set('password', e.target.value)} />
                <button className="btn btn-ghost" type="button" onClick={() => set('password', generatePassword())}>Generate</button>
              </div>
            </L>
          </div>
          <L label="URL"><input className="input" value={d.url || ''} onChange={e => set('url', e.target.value)} placeholder="https://" /></L>
          <L label="Notes"><textarea className="input min-h-24" value={d.notes || ''} onChange={e => set('notes', e.target.value)} /></L>
          <L label="Tags"><TagInput value={d.tags || []} onChange={tags => set('tags', tags)} /></L>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(d)} disabled={!d.title}>Save</button>
        </div>
      </div>
    </div>
  )
}

function L({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-white/70">{label}</span>
      {children}
    </label>
  )
}

function TagInput({ value, onChange }: { value: string[], onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('')
  function add(tag: string) {
    const t = tag.trim()
    if (!t) return
    onChange(Array.from(new Set([...value, t])))
    setInput('')
  }
  function remove(tag: string) {
    onChange(value.filter(v => v !== tag))
  }
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {value.map(t => (
          <span key={t} className="inline-flex items-center gap-1 rounded border border-htb-green/30 px-2 py-0.5 text-xs text-htb-green">
            {t}
            <button type="button" className="text-white/50 hover:text-white" onClick={() => remove(t)}>?</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="input" value={input} onChange={e => setInput(e.target.value)} placeholder="Add tag and press Enter" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(input) } }} />
        <button className="btn btn-ghost" type="button" onClick={() => add(input)}>Add</button>
      </div>
    </div>
  )
}

function ExportImport({ vaultCipherLoader, onImport }: { vaultCipherLoader: () => string, onImport: (cipher: string) => void }) {
  function handleExport() {
    const cipher = vaultCipherLoader()
    const blob = new Blob([exportCipher(cipher)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `htb-vault-backup-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result)
        JSON.parse(text) // basic validation
        onImport(text)
      } catch {
        alert('Invalid backup file')
      }
    }
    reader.readAsText(file)
    e.currentTarget.value = ''
  }
  return (
    <div className="flex items-center gap-2">
      <button className="btn btn-ghost" onClick={handleExport}>Export</button>
      <label className="btn btn-ghost cursor-pointer">
        Import
        <input type="file" accept="application/json" className="hidden" onChange={handleImport} />
      </label>
    </div>
  )
}
