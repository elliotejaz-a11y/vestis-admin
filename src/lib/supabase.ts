import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY as string | undefined

export const supabaseMisconfigured = !supabaseUrl || !supabaseServiceKey

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseServiceKey ?? 'placeholder',
  { auth: { persistSession: false } }
)
