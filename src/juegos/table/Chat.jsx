import { useEffect, useRef, useState } from 'react'
import Avatar from '../Avatar.jsx'
import { useBubblesEnabled } from './SeatBubble.jsx'
import './chat.css'

const time = (at) => new Date(at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

// Chat de la sala: un botón flotante con los mensajes sin leer y un panel que no tapa la mesa más de la cuenta.
function Chat({ messages, me, send }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [bubbles, setBubbles] = useBubblesEnabled()
  const [seen, setSeen] = useState(messages.length ? messages.at(-1).id : 0)
  const list = useRef(null)
  const input = useRef(null)
  const last = messages.at(-1)?.id ?? 0
  const unread = open ? 0 : messages.filter((m) => m.id > seen && m.from !== null && m.from !== me?.id).length

  // Siempre al último mensaje.
  useEffect(() => {
    if (open && list.current) list.current.scrollTop = list.current.scrollHeight
  }, [open, last])

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  // Al abrir o cerrar, todo lo que había queda leído.
  function toggle(next) {
    setSeen(last)
    setOpen(next)
  }

  function submit(event) {
    event.preventDefault()
    const clean = text.trim()
    if (!clean) return
    if (send({ t: 'chat', text: clean })) setText('')
  }

  return (
    <div className={`chat ${open ? 'chat--open' : ''}`}>
      {open && (
        <section
          className="chat__panel"
          aria-label="Chat de la sala"
          // Las teclas del chat no llegan a los atajos del juego.
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') toggle(false)
          }}
        >
          <header className="chat__head">
            <h2>Chat de la sala</h2>
            <button
              type="button"
              className="chat__bubbles"
              aria-pressed={bubbles}
              title="Mostrar los mensajes en un globo sobre cada jugador"
              onClick={() => setBubbles(!bubbles)}
            >
              Globos
            </button>
            <button type="button" className="chat__close" aria-label="Cerrar el chat" onClick={() => toggle(false)}>
              ×
            </button>
          </header>
          <ol className="chat__list" ref={list} aria-live="polite">
            {messages.length === 0 && <li className="chat__empty">Nadie ha escrito todavía. ¡Saluda!</li>}
            {messages.map((m) =>
              m.from === null ? (
                <li key={m.id} className="chat__system">
                  {m.text}
                </li>
              ) : (
                <li key={m.id} className={`chat__msg ${m.from === me?.id ? 'chat__msg--me' : ''}`}>
                  <Avatar name={m.name} src={m.avatar} size={28} />
                  <div className="chat__bubble">
                    <p className="chat__meta">
                      <b>{m.from === me?.id ? 'Tú' : m.name}</b> <time>{time(m.at)}</time>
                    </p>
                    <p className="chat__text">{m.text}</p>
                  </div>
                </li>
              ),
            )}
          </ol>
          <form className="chat__form" onSubmit={submit}>
            <input
              ref={input}
              value={text}
              maxLength={200}
              placeholder="Escribe a la mesa…"
              aria-label="Mensaje"
              onChange={(event) => setText(event.target.value)}
            />
            <button type="submit" disabled={!text.trim()}>
              Enviar
            </button>
          </form>
        </section>
      )}
      <button
        type="button"
        className="chat__toggle"
        aria-expanded={open}
        aria-label={unread ? `Chat, ${unread} sin leer` : 'Chat'}
        onClick={() => toggle(!open)}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            fill="currentColor"
            d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 6.5a1.5 1.5 0 1 0 0 .01Zm5 0a1.5 1.5 0 1 0 0 .01Zm5 0a1.5 1.5 0 1 0 0 .01Z"
          />
        </svg>
        <span className="chat__label">Chat</span>
        {unread > 0 && <span className="chat__badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
    </div>
  )
}

export default Chat
