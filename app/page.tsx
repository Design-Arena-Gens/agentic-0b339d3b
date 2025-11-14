"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { VaultView } from '@/components/VaultView'
import { createEmptyVault, loadVaultFromStorage, saveVaultToStorage } from '@/lib/storage'
import { decryptVault, deriveKeyFromPassword, encryptVault } from '@/lib/crypto'

export default function HomePage() {
  const [unlocked, setUnlocked] = useState(false)
  const [vaultJson, setVaultJson] = useState<string | null>(null)
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [idleMs, setIdleMs] = useState(0)
  const idleTimer = useRef<number | null>(null)

  useEffect(() => {
    const v = loadVaultFromStorage()
    setVaultJson(v)
    setIsLoading(false)
  }, [])

  function startIdleCountdown() {
    stopIdleCountdown()
    const start = Date.now()
    idleTimer.current = window.setInterval(() => {
      setIdleMs(Date.now() - start)
    }, 1000)
  }
  function stopIdleCountdown() {
    if (idleTimer.current) {
      clearInterval(idleTimer.current)
      idleTimer.current = null
    }
  }

  useEffect(() => {
    const onAny = () => startIdleCountdown()
    window.addEventListener('mousemove', onAny)
    window.addEventListener('keydown', onAny)
    startIdleCountdown()
    return () => {
      window.removeEventListener('mousemove', onAny)
      window.removeEventListener('keydown', onAny)
      stopIdleCountdown()
    }
  }, [])

  useEffect(() => {
    const autoLockSeconds = 5 * 60
    if (unlocked && idleMs > autoLockSeconds * 1000) {
      setUnlocked(false)
      setMasterKey(null)
    }
  }, [idleMs, unlocked])

  const hasVault = !!vaultJson

  async function handleUnlock(password: string) {
    setError(null)
    try {
      const key = await deriveKeyFromPassword(password)
      if (!vaultJson) {
        // New vault
        const emptyVault = createEmptyVault()
        const encrypted = await encryptVault(emptyVault, key)
        saveVaultToStorage(encrypted)
        setVaultJson(encrypted)
      } else {
        // Attempt decrypt
        await decryptVault(vaultJson, key)
      }
      setMasterKey(key)
      setUnlocked(true)
    } catch (e) {
      console.error(e)
      setError('Invalid password or corrupted vault')
    }
  }

  function handleLock() {
    setUnlocked(false)
    setMasterKey(null)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 pb-10 pt-12">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md border border-htb-green/30 bg-htb-gray/60 shadow-glow" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">HTB Vault</h1>
            <p className="text-xs text-white/50">Zero-knowledge client encryption</p>
          </div>
        </div>
        {unlocked && (
          <button className="btn btn-ghost" onClick={handleLock}>Lock</button>
        )}
      </header>

      {!unlocked ? (
        <UnlockCard hasVault={hasVault} onUnlock={handleUnlock} error={error} isLoading={isLoading} />
      ) : (
        <VaultView
          masterKey={masterKey!}
          onVaultChange={(cipher) => {
            saveVaultToStorage(cipher)
            setVaultJson(cipher)
          }}
          loadCipher={() => loadVaultFromStorage()!}
        />
      )}
    </main>
  )
}

function UnlockCard({ hasVault, onUnlock, error, isLoading }: { hasVault: boolean, onUnlock: (pwd: string) => void, error: string | null, isLoading: boolean }) {
  const [pwd, setPwd] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await onUnlock(pwd)
    } finally {
      setBusy(false)
    }
  }
  const subtitle = useMemo(() => hasVault ? 'Enter your master password to unlock' : 'Create a master password to initialize your vault', [hasVault])
  return (
    <div className="mx-auto mt-12 w-full max-w-md">
      <div className="card p-6">
        <h2 className="mb-1 text-lg font-medium">{hasVault ? 'Unlock Vault' : 'Create Vault'}</h2>
        <p className="mb-6 text-sm text-white/60">{isLoading ? 'Loading?' : subtitle}</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm text-white/70">Master Password</label>
            <div className="relative">
              <input
                className="input pr-10"
                type={show ? 'text' : 'password'}
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                required
                minLength={8}
                placeholder={hasVault ? 'Enter password' : 'Create strong password'}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShow(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white/60 hover:text-white"
              >{show ? 'Hide' : 'Show'}</button>
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button disabled={busy} className="btn btn-primary w-full" type="submit">{busy ? 'Please wait?' : hasVault ? 'Unlock' : 'Create & Unlock'}</button>
        </form>
        <p className="mt-4 text-xs text-white/45">
          Your data is encrypted locally using AES-GCM with a key derived from your password via PBKDF2. Nothing is sent to any server.
        </p>
      </div>
    </div>
  )
}
