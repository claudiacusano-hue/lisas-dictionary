import { validateProposal, ValidationError } from './validation.ts'
import type { ProposalInput, VocabularyField, VocabularyTerm } from './domain.ts'

export interface SubmitDependencies {
  origins: string[]
  enabled: boolean
  /** Il gateway deve sovrascrivere questo header; mai fidarsi di un IP nel body. */
  ipHeader: string
  hashIp: (ip: string) => Promise<string>
  rateLimit: (key: string, limit: number, seconds: number) => Promise<boolean>
  verifyCaptcha: (token: string, ip: string) => Promise<boolean>
  vocabulary: () => Promise<{ fields: VocabularyField[]; terms: VocabularyTerm[] }>
  save: (proposal: ProposalInput) => Promise<string>
}
export function createSubmitHandler(deps: SubmitDependencies) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin') || ''
    const allowed = deps.origins.includes(origin)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    }
    if (allowed) {
      headers['Access-Control-Allow-Origin'] = origin
      headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info'
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    }
    const reply = (status: number, message: string, extra = {}) =>
      new Response(JSON.stringify({ message, ...extra }), { status, headers })
    if (!allowed) return reply(403, 'Origine non autorizzata.')
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (req.method !== 'POST') return reply(405, 'Metodo non supportato.')
    if (!deps.enabled) return reply(503, 'I contributi non sono ancora aperti. Riprova più avanti.')
    if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
      return reply(415, 'Formato della richiesta non valido.')
    const maxBytes = 65_536
    if (Number(req.headers.get('content-length')) > maxBytes)
      return reply(413, 'La proposta è troppo grande. Riduci i testi o gli esempi.')
    try {
      // Ultimo hop del gateway. Applicare comunque un limite globale contro IP falsificati.
      const ip = req.headers.get(deps.ipHeader)?.split(',').at(-1)?.trim()
      if (!ip || ip.length > 100)
        return reply(503, 'Controllo dei contributi temporaneamente non disponibile.')
      const key = await deps.hashIp(ip)
      if (!(await deps.rateLimit('global', 200, 3600)) || !(await deps.rateLimit(key, 8, 3600)))
        return reply(429, 'Hai raggiunto il limite di invii. Riprova tra un’ora.')
      const reader = req.body?.getReader()
      if (!reader) return reply(400, 'Proposta vuota.')
      const chunks: Uint8Array[] = []
      let size = 0
      while (true) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.length
        if (size > maxBytes) {
          await reader.cancel()
          return reply(413, 'La proposta è troppo grande.')
        }
        chunks.push(part.value)
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.length
      }
      let body: unknown
      try {
        body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
      } catch {
        return reply(400, 'La proposta non è leggibile.')
      }
      if (!body || typeof body !== 'object' || Array.isArray(body))
        return reply(400, 'Proposta non valida.')
      const input = body as Record<string, unknown>
      if (Object.keys(input).some((k) => !['proposal', 'turnstile_token', 'website'].includes(k)))
        return reply(400, 'Campi inattesi nella richiesta.')
      if (input.website !== '') return reply(400, 'Invio non valido.')
      if (
        typeof input.turnstile_token !== 'string' ||
        input.turnstile_token.length < 1 ||
        input.turnstile_token.length > 2048
      )
        return reply(400, 'Completa il controllo antispam.')
      if (!(await deps.verifyCaptcha(input.turnstile_token, ip)))
        return reply(400, 'Controllo antispam scaduto o non valido. Ripetilo e invia di nuovo.')
      const vocab = await deps.vocabulary()
      const proposal = validateProposal(input.proposal, vocab.fields, vocab.terms)
      const id = await deps.save(proposal)
      return reply(201, 'Proposta ricevuta. Sarà pubblicata soltanto dopo la revisione.', { id })
    } catch (error) {
      if (error instanceof ValidationError) return reply(400, error.message)
      // Mai esporre query, chiavi, indirizzi o payload nelle risposte/log pubblici.
      return reply(503, 'Non è stato possibile salvare la proposta. Riprova più tardi.')
    }
  }
}
