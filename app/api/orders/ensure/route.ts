import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null

const isMissingColumnError = (message?: string) => {
  if (!message) return false
  const normalized = message.toLowerCase()
  return (
    (normalized.includes('column') && normalized.includes('does not exist')) ||
    normalized.includes('could not find') ||
    normalized.includes('schema cache')
  )
}

export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
    }

    const body = await request.json().catch(() => ({}))
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    const supabase = createServerClient()

    // If already created, return it.
    const existing = await supabase
      .from('orders')
      .select(`*, order_items (*)`)
      .eq('stripe_session_id', sessionId)
      .maybeSingle()
    if (existing.error) throw existing.error
    if (existing.data) {
      return NextResponse.json({ order: existing.data, created: false })
    }

    // Retrieve session + line items from Stripe.
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.payment_status && session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      return NextResponse.json({ error: 'Session is not paid' }, { status: 400 })
    }

    const meta = session.metadata || {}
    const customerName = (meta.customer_name || session.customer_details?.name || '').toString().trim()
    const customerPhone = (meta.customer_phone || session.customer_details?.phone || '').toString().trim()
    const customerPhoneDigits = customerPhone.replace(/\D/g, '')
    const customerEmail = (meta.customer_email || session.customer_details?.email || '').toString().trim()

    if (!customerName || !customerPhoneDigits) {
      return NextResponse.json(
        { error: 'Missing customer_name/customer_phone on session' },
        { status: 400 }
      )
    }
    if (customerPhoneDigits.length < 10) {
      return NextResponse.json(
        { error: 'Invalid customer_phone on session' },
        { status: 400 }
      )
    }

    const customerFirstName = (meta.customer_first_name || '').toString().trim()
    const customerLastName = (meta.customer_last_name || '').toString().trim()
    const comments = (meta.comments || '').toString().trim().slice(0, 400)

    const parsedTaxRaw = meta.tax ? parseFloat(String(meta.tax)) : 0
    const taxAmount = Number.isFinite(parsedTaxRaw) ? parsedTaxRaw : 0

    const parsedTipRaw = meta.tip_amount ? parseFloat(String(meta.tip_amount)) : 0
    const tipAmount = Number.isFinite(parsedTipRaw) ? parsedTipRaw : 0

    const parsedTipPercentRaw = meta.tip_percent ? parseFloat(String(meta.tip_percent)) : 0
    const tipPercent = Number.isFinite(parsedTipPercentRaw) ? parsedTipPercentRaw : 0

    const stripeTotalRaw = typeof session.amount_total === 'number' ? session.amount_total / 100 : 0
    const totalAmount = Number.isFinite(stripeTotalRaw) ? Number(stripeTotalRaw.toFixed(2)) : 0
    const subtotalAmount = Number((totalAmount - taxAmount - tipAmount).toFixed(2))

    // Order number (best-effort; if column missing we skip).
    let orderNumberColumnMissing = false
    let nextOrderNumber: number | null = null

    const lastOrderResult = await supabase
      .from('orders')
      .select('order_number')
      .order('order_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastOrderResult.error) {
      if (isMissingColumnError(lastOrderResult.error.message)) {
        orderNumberColumnMissing = true
      } else {
        console.error('Error getting last order number:', lastOrderResult.error)
      }
    } else {
      nextOrderNumber = lastOrderResult.data?.order_number
        ? (lastOrderResult.data.order_number as number) + 1
        : 1000
    }

    const orderNumberPayload = orderNumberColumnMissing || nextOrderNumber === null ? {} : { order_number: nextOrderNumber }

    const fullInsertPayload = {
      customer_name: customerName,
      customer_first_name: customerFirstName || null,
      customer_last_name: customerLastName || null,
      customer_phone: customerPhoneDigits,
      customer_email: customerEmail || null,
      tip_percent: Number.isFinite(tipPercent) ? tipPercent : null,
      tip_amount: Number.isFinite(tipAmount) ? tipAmount : null,
      comments: comments || null,
      total_amount: totalAmount,
      tax_amount: taxAmount,
      status: 'pending',
      stripe_session_id: sessionId,
      ...orderNumberPayload,
    }

    const minimalInsertPayload = {
      customer_name: customerName,
      customer_phone: customerPhoneDigits,
      customer_email: customerEmail || null,
      total_amount: totalAmount,
      tax_amount: taxAmount,
      status: 'pending',
      stripe_session_id: sessionId,
      ...orderNumberPayload,
    }

    let insertResult = await supabase.from('orders').insert(fullInsertPayload).select().single()
    if (insertResult.error && isMissingColumnError(insertResult.error.message)) {
      insertResult = await supabase.from('orders').insert(minimalInsertPayload).select().single()
    }
    if (insertResult.error) {
      // Race with webhook? Try fetch again.
      const retry = await supabase
        .from('orders')
        .select(`*, order_items (*)`)
        .eq('stripe_session_id', sessionId)
        .maybeSingle()
      if (!retry.error && retry.data) {
        return NextResponse.json({ order: retry.data, created: false })
      }
      throw insertResult.error
    }

    const order = insertResult.data

    const lineItemsResp = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 })
    const lineItems = Array.isArray(lineItemsResp.data) ? lineItemsResp.data : []

    const orderItemsData = lineItems
      .filter((li) => {
        const name = (li.description || '').toLowerCase()
        return name !== 'sales tax' && name !== 'tip'
      })
      .map((li) => {
        const unitAmount = typeof li.price?.unit_amount === 'number' ? li.price.unit_amount : 0
        const quantity = typeof li.quantity === 'number' ? li.quantity : 1
        return {
          order_id: order.id,
          menu_item_id: li.id,
          menu_item_name: li.description || 'Item',
          quantity,
          price: unitAmount / 100,
        }
      })

    if (orderItemsData.length > 0) {
      const { error: itemsError } = await supabase.from('order_items').insert(orderItemsData)
      if (itemsError) {
        // Best-effort: don't delete the order; just report.
        console.error('Error inserting order_items:', itemsError)
      }
    }

    const complete = await supabase
      .from('orders')
      .select(`*, order_items (*)`)
      .eq('id', order.id)
      .single()
    if (complete.error) {
      return NextResponse.json({ order, created: true })
    }

    return NextResponse.json({ order: complete.data, created: true, subtotal: subtotalAmount })
  } catch (error: any) {
    console.error('Error ensuring order:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to ensure order' },
      { status: 500 }
    )
  }
}

