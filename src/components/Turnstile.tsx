import { useEffect, useRef, useState } from 'react'
import { configuration } from '../lib/api'

interface TurnstileApi {
  render: (element: HTMLElement, options: Record<string, unknown>) => string
  remove: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}
let scriptPromise: Promise<void> | null = null
function loadScript() {
  if (window.turnstile) return Promise.resolve()
  if (!scriptPromise)
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => {
        script.remove()
        scriptPromise = null
        reject(new Error('Turnstile non disponibile'))
      }
      document.head.append(script)
    })
  return scriptPromise
}
export function Turnstile({
  onToken,
  resetKey,
}: {
  onToken: (token: string) => void
  resetKey: number
}) {
  const container = useRef<HTMLDivElement>(null)
  const callback = useRef(onToken)
  callback.current = onToken
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    let widget: string | undefined
    callback.current('')
    setError(false)
    loadScript()
      .then(() => {
        if (!active || !container.current || !window.turnstile) return
        widget = window.turnstile.render(container.current, {
          sitekey: configuration.captchaKey,
          action: 'contribution',
          language: 'it',
          theme: 'light',
          callback: (token: string) => {
            if (active) callback.current(token)
          },
          'expired-callback': () => callback.current(''),
          'error-callback': () => {
            callback.current('')
            setError(true)
          },
        })
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
      if (widget) window.turnstile?.remove(widget)
    }
  }, [resetKey])
  return (
    <div>
      <div ref={container} />
      {error && (
        <p role="alert">Il controllo antispam non è disponibile. Ricarica la pagina e riprova.</p>
      )}
    </div>
  )
}
