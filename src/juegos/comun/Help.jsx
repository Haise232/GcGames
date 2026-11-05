import { useRef } from 'react'

// Botón que abre una ventana encima del juego: las explicaciones no ocupan sitio en la pantalla.
function Help({ label = 'Ayuda', title, wide = false, className = '', children }) {
  const dialog = useRef(null)
  return (
    <>
      <button type="button" className={className} onClick={() => dialog.current?.showModal()}>
        {label}
      </button>
      <dialog
        ref={dialog}
        className={`modal ${wide ? 'modal--wide' : ''}`}
        aria-label={title}
        // Las teclas no llegan al juego mientras la ventana está abierta (Escape la sigue cerrando).
        onKeyDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current.close()
        }}
      >
        <div className="modal__body">
          <header className="modal__head">
            <h2>{title}</h2>
            <button type="button" className="modal__close" aria-label="Cerrar" onClick={() => dialog.current?.close()}>
              ×
            </button>
          </header>
          {children}
        </div>
      </dialog>
    </>
  )
}

export default Help
