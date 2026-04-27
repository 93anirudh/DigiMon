import { useState } from 'react'
import type { Client } from '../types/practice'

interface Props {
  existing?: Client
  onClose: () => void
  onSaved: () => void
}

export function ClientForm({ existing, onClose, onSaved }: Props) {
  const [name, setName] = useState(existing?.name || '')
  const [gstin, setGstin] = useState(existing?.gstin || '')
  const [pan, setPan] = useState(existing?.pan || '')
  const [contactEmail, setContactEmail] = useState(existing?.contact_email || '')
  const [contactPhone, setContactPhone] = useState(existing?.contact_phone || '')
  const [businessType, setBusinessType] = useState(existing?.business_type || '')
  const [notes, setNotes] = useState(existing?.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!existing

  const submit = async () => {
    if (!name.trim()) { setError('Client name is required'); return }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: name.trim(),
        gstin: gstin.trim() || null,
        pan: pan.trim().toUpperCase() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
        business_type: businessType.trim() || null,
        notes: notes.trim() || null,
      }
      if (isEdit && existing) {
        await window.electronAPI.updateClient(existing.id, payload)
      } else {
        await window.electronAPI.createClient(payload)
      }
      onSaved()
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, backdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface-solid)',
          border: '1px solid var(--border-md)',
          borderRadius: 14,
          padding: 24,
          width: '92%',
          maxWidth: 480,
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 18 }}>
          {isEdit ? 'Edit Client' : 'New Client'}
        </div>

        <FormField label="Client Name *">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="ABC Traders Pvt Ltd"
            autoFocus
            style={inputStyle}
          />
        </FormField>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="GSTIN">
            <input
              value={gstin}
              onChange={e => setGstin(e.target.value.toUpperCase())}
              placeholder="22ABCDE1234F1Z5"
              maxLength={15}
              style={{ ...inputStyle, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
            />
          </FormField>
          <FormField label="PAN">
            <input
              value={pan}
              onChange={e => setPan(e.target.value.toUpperCase())}
              placeholder="ABCDE1234F"
              maxLength={10}
              style={{ ...inputStyle, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
            />
          </FormField>
        </div>

        <FormField label="Business Type">
          <input
            value={businessType}
            onChange={e => setBusinessType(e.target.value)}
            placeholder="Trading / Manufacturing / Services"
            style={inputStyle}
          />
        </FormField>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="Contact Email">
            <input
              type="email"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              placeholder="cfo@example.com"
              style={inputStyle}
            />
          </FormField>
          <FormField label="Contact Phone">
            <input
              value={contactPhone}
              onChange={e => setContactPhone(e.target.value)}
              placeholder="+91 98765 43210"
              style={inputStyle}
            />
          </FormField>
        </div>

        <FormField label="Notes">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Any internal notes..."
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </FormField>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            color: '#EF4444',
            padding: '10px 12px',
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 12,
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              background: 'transparent',
              color: 'var(--text2)',
              border: '1px solid var(--border-md)',
              padding: '9px 16px',
              borderRadius: 8,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !name.trim()}
            style={{
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              padding: '9px 18px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              opacity: saving || !name.trim() ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving…' : (isEdit ? 'Save' : 'Create Client')}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  padding: '9px 12px',
  borderRadius: 8,
  fontSize: 13,
  outline: 'none',
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6, fontWeight: 500 }}>
        {label}
      </div>
      {children}
    </div>
  )
}
