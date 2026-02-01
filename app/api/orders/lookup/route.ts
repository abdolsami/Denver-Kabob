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
      query = query.ilike('customer_phone', `%${normalizedPhone}%`)
    }

    const { data: orders, error } = await query

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

      return NextResponse.json({ orders: filteredOrders })
    }

    return NextResponse.json({ orders: orders || [] })
  } catch (error: any) {
    console.error('Error looking up orders:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to lookup orders' },
      { status: 500 }
    )
  }
}
