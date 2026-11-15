import { createClient } from '@supabase/supabase-js'
export async function adminClient() {
  const required = (name: string) => {
    const value = process.env[name]
    if (!value) throw new Error(`Impostare ${name} nell’ambiente del terminale.`)
    return value
  }
  const client = createClient(
    required('LISAS_SUPABASE_URL'),
    required('LISAS_SUPABASE_PUBLISHABLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: true } },
  )
  const signed = await client.auth.signInWithPassword({
    email: required('LISAS_ADMIN_EMAIL'),
    password: required('LISAS_ADMIN_PASSWORD'),
  })
  if (signed.error) throw new Error('Accesso amministrativo non riuscito.')
  if ((await client.rpc('is_admin')).data !== true) {
    await client.auth.signOut()
    throw new Error('Ruolo amministrativo richiesto.')
  }
  return client
}
