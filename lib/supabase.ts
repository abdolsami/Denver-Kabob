import { createClient } from '@supabase/supabase-js'

// Server-side Supabase client
export const createServerClient = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  
  if (!supabaseUrl) {
    throw new Error(
      'SUPABASE_URL is required for server-side operations. ' +
      'Please add it to your environment variables.'
    )
  }

  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required for server-side operations. ' +
      'Please add it to your environment variables.'
    )
  }
  
  return createClient(
    supabaseUrl,
    serviceRoleKey
  )
}
