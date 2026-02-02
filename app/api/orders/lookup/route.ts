import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const phone = searchParams.get('phone')
    const orderId = searchParams.get('orderId')

    if (!phone && !orderId) {
      return NextResponse.json(
        { error: 'Phone number or Order ID is required' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    let query = supabase
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .order('created_at', { ascending: false })

    if (orderId) {
      query = query.eq('id', orderId)
    } else if (phone) {
      // Normalize phone number (remove non-digits for comparison)
      const normalizedPhone = phone.replace(/\D/g, '')
      // Prefer exact match (we store digits-only), and fall back to partial match for older rows.
      query = query.eq('customer_phone', normalizedPhone)
    }

    let { data: orders, error } = await query

    // Fallback: if no results and phone search, try partial match (supports older formatted rows).
    if (!error && phone && !orderId && Array.isArray(orders) && orders.length === 0) {
      const normalizedPhone = phone.replace(/\D/g, '')
      const fallback = await supabase
        .from('orders')
        .select(
          `
        *,
        order_items (*)
      `
        )
        .ilike('customer_phone', `%${normalizedPhone}%`)
        .order('created_at', { ascending: false })

      orders = fallback.data || []
      error = fallback.error as any
    }

    if (error) {
      throw error
    }

    // If searching by phone, only return recent orders (last 30 days)
    if (phone && !orderId) {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      
      const filteredOrders = orders?.filter((order: any) => {
        const orderDate = new Date(order.created_at)
        return orderDate >= thirtyDaysAgo
      }) || []

      return NextResponse.json(
        { orders: filteredOrders },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      )
    }

    return NextResponse.json(
      { orders: orders || [] },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error: any) {
    console.error('Error looking up orders:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to lookup orders' },
      { status: 500 }
    )
  }
}
