import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    const supabase = createServerClient()
    const { data: order, error } = await supabase
      .from('orders')
      .select(
        `
        *,
        order_items (*)
      `
      )
      .eq('stripe_session_id', sessionId)
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({ order: order || null })
  } catch (error: any) {
    console.error('Error fetching order by session:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch order by session' },
      { status: 500 }
    )
  }
}

