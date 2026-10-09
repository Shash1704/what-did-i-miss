import { useState } from 'react'

interface Props {
  initial: string
  suggestions: string[]
  onSave: (identity: string) => void
  onClose: () => void
}

/** "Who are you?": free text, so you can be found even in groups you never posted in. */
export function IdentityPopover({ initial, suggestions, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(initial)
  const save = () => { if (draft.trim()) { onSave(draft); onClose() } }
  const addAlias = (name: string) => setDraft(d => {
    const list = d.split(',').map(x => x.trim()).filter(Boolean)
    return list.some(x => x.toLowerCase() === name.toLowerCase()) ? d : [...list, name].join(', ')
  })

  return (
    <>
      <div className="who-backdrop" onClick={onClose} />
      <div className="who-pop" role="dialog" aria-label="Who are you?">
        <h4>Who are you in this chat?</h4>
        <p>We use this to find your mentions, questions and tasks. You don't need to have posted in the group. Saved on this device only.</p>
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onClose() }}
          placeholder="e.g. Shashwat, Shash, 98765 43210"
          aria-label="Your names, usernames or phone number"
        />
        {suggestions.length > 0 && (
          <div className="who-suggest">
            {suggestions.slice(0, 12).map(n => <button key={n} onClick={() => addAlias(n)}>{n}</button>)}
          </div>
        )}
        <small>Add nicknames, your @username or phone number, separated by commas. WhatsApp often @mentions unsaved contacts by number.</small>
        <div className="who-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-orange" disabled={!draft.trim()} onClick={save}>Save</button>
        </div>
      </div>
    </>
  )
}
