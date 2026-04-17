import { useEffect, useState, useRef } from 'react'

interface WAStatus {
  status: 'disconnected' | 'awaiting_qr' | 'authenticated' | 'error'
  qrDataUrl: string | null
  error: string | null
  serverRunning: boolean
}

export function WhatsAppSetup() {
  const [status, setStatus] = useState<WAStatus | null>(null)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const pollTimer = useRef<number | null>(null)

  // Load initial status when component mounts
  useEffect(() => {
    window.electronAPI.whatsappStatusSync().then(s => setStatus(s))
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current)
    }
  }, [])

  // Poll every 2s while the server is running and we're not yet authenticated
  useEffect(() => {
    if (!status?.serverRunning || status.status === 'authenticated') {
      if (pollTimer.current) {
        window.clearInterval(pollTimer.current)
        pollTimer.current = null
      }
      return
    }
    // Kick off polling
    if (!pollTimer.current) {
      pollTimer.current = window.setInterval(async () => {
        const s = await window.electronAPI.whatsappStatus()
        setStatus(s)
      }, 2000)
    }
    return () => {
      if (pollTimer.current) {
        window.clearInterval(pollTimer.current)
        pollTimer.current = null
      }
    }
  }, [status?.serverRunning, status?.status])

  const handleStart = async () => {
    setStarting(true)
    const result = await window.electronAPI.whatsappStart()
    setStarting(false)
    if (!result.ok) {
      setStatus({ status: 'error', qrDataUrl: null, error: result.error ?? 'Failed to start', serverRunning: false })
      return
    }
    // Immediately pull a fresh status so QR can appear ASAP
    const s = await window.electronAPI.whatsappStatus()
    setStatus(s)
  }

  const handleStop = async () => {
    setStopping(true)
    await window.electronAPI.whatsappStop()
    setStopping(false)
    const s = await window.electronAPI.whatsappStatusSync()
    setStatus(s)
  }

  const handleLogout = async () => {
    setStopping(true)
    await window.electronAPI.whatsappLogout()
    setStopping(false)
    const s = await window.electronAPI.whatsappStatusSync()
    setStatus(s)
  }

  if (!status) {
    return (
      <div className="settings-card">
        <div className="settings-card-body" style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>
          Loading WhatsApp status…
        </div>
      </div>
    )
  }

  return (
    <div className="settings-card">
      <div className="settings-card-body">
        {/* Disconnected state — user hasn't started anything yet */}
        {status.status === 'disconnected' && !status.serverRunning && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65, marginBottom: 14 }}>
              Link your WhatsApp account so DigiMon can send messages to your clients for payment
              reminders, filing alerts, or document requests. Uses WhatsApp Web under the hood — no
              business account required.
            </p>
            <button
              className="btn-primary"
              onClick={handleStart}
              disabled={starting}
              style={{ width: '100%' }}
            >
              {starting ? 'Starting…' : '🟢 Connect WhatsApp'}
            </button>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10, textAlign: 'center' }}>
              First time: downloads ~50 MB on first connect, then shows a QR code to scan.
            </p>
          </div>
        )}

        {/* Awaiting QR scan */}
        {status.status === 'awaiting_qr' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, marginBottom: 4 }}>
              Scan to link your phone
            </div>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.5 }}>
              Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
            </p>
            {status.qrDataUrl ? (
              <div className="wa-qr-wrap">
                <img src={status.qrDataUrl} alt="WhatsApp QR code" className="wa-qr-img" />
              </div>
            ) : (
              <div className="wa-qr-placeholder">
                <div className="typing-dots" style={{ justifyContent: 'center' }}>
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)' }}>
                  Waiting for QR code from WhatsApp Web…
                </div>
              </div>
            )}
            <button
              className="btn-ghost"
              onClick={handleStop}
              disabled={stopping}
              style={{ marginTop: 14, width: '100%' }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Authenticated */}
        {status.status === 'authenticated' && (
          <div>
            <div className="wa-connected">
              <div className="wa-connected-icon">✓</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                  WhatsApp connected
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  DigiMon can now send messages through your account.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn-ghost" onClick={handleStop} disabled={stopping} style={{ flex: 1 }}>
                {stopping ? 'Stopping…' : 'Disconnect'}
              </button>
              <button className="btn-disable" onClick={handleLogout} disabled={stopping} style={{ flex: 1 }}>
                Unlink account
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {status.status === 'error' && (
          <div>
            <div className="setup-result err">
              ✗ {status.error ?? 'Something went wrong'}
            </div>
            <button
              className="btn-primary"
              onClick={handleStart}
              disabled={starting}
              style={{ width: '100%', marginTop: 12 }}
            >
              {starting ? 'Retrying…' : '↺ Try again'}
            </button>
          </div>
        )}

        {/* Running but no QR yet — transient */}
        {status.status === 'disconnected' && status.serverRunning && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div className="typing-dots" style={{ justifyContent: 'center' }}>
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text3)' }}>
              Starting WhatsApp service…
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
