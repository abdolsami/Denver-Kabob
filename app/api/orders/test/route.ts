import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Test endpoint to verify database connection and order creation
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient()

    // Test 1: Check connection
    const { data: testOrders, error: testError } = await supabase
      .from('orders')
      .select('count')
      .limit(1)

    if (testError) {
      return NextResponse.json({
        success: false,
        error: 'Database connection failed',
        details: testError.message,
        code: testError.code,
      }, { status: 500 })
    }

    // Test 2: Get order count
    const { count, error: countError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })

    // Test 3: Try to fetch recent orders
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select(`
        id,
        customer_name,
        status,
        created_at,
        stripe_session_id
      `)
      .order('created_at', { ascending: false })
      .limit(5)

    return NextResponse.json({
      success: true,
      database: 'Connected',
      totalOrders: count || 0,
      recentOrders: orders || [],
      errors: {
        count: countError?.message,
        fetch: fetchError?.message,
      },
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error',
    }, { status: 500 })
  }
}
