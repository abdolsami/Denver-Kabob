import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

if (!STRIPE_SECRET_KEY || !webhookSecret) {
  console.error('Missing Stripe configuration: STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET')
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    })
  : null

export async function POST(request: NextRequest) {
  if (!stripe || !webhookSecret) {
    console.error('Stripe webhook not configured')
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500 }
    )
  }

  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing signature' },
      { status: 400 }
    )
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    try {
      // Ensure payment is actually successful
      if (session.payment_status && session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
        console.warn('Ignoring checkout.session.completed with non-paid status:', session.id, session.payment_status)
        return NextResponse.json({ received: true })
      }

      const supabase = createServerClient()

      // Extract order data from session metadata
      const {
        customer_name,
        customer_first_name,
        customer_last_name,
        customer_phone,
        customer_email,
        tip_percent,
        tip_amount,
        comments,
        tax,
        items,
      } = session.metadata || {}

      if (!customer_name || !customer_phone) {
        throw new Error('Missing required order metadata (customer_name/customer_phone)')
      }

      const normalizedCustomerPhone = customer_phone.toString().replace(/\D/g, '')
      if (normalizedCustomerPhone.length < 10) {
        throw new Error('Invalid customer phone in metadata')
      }

      // Use provided names or derive from full name
      const nameParts = customer_name.split(' ').filter(Boolean)
      const derivedFirstName = customer_first_name || nameParts[0] || customer_name
      const derivedLastName = customer_last_name || nameParts.slice(1).join(' ') || null

      // Prefer cart JSON from metadata (older versions). If missing, reconstruct from Stripe line items.
      let orderItems: any[] = []
      if (items) {
        try {
          orderItems = JSON.parse(items)
        } catch {
          orderItems = []
        }
      }
      if (!Array.isArray(orderItems) || orderItems.length === 0) {
        const lineItemsResp = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 })
        const lineItems = Array.isArray(lineItemsResp.data) ? lineItemsResp.data : []
        orderItems = lineItems
          .filter((li) => {
            const name = (li.description || '').toLowerCase()
            return name !== 'sales tax' && name !== 'tip'
          })
          .map((li) => {
            const unitAmount = typeof li.price?.unit_amount === 'number' ? li.price.unit_amount : 0
            const quantity = typeof li.quantity === 'number' ? li.quantity : 1
            return {
              id: li.id,
              name: li.description || 'Item',
              price: unitAmount / 100,
              quantity,
              selectedOptions: [],
              selectedAddons: [],
            }
          })
      }

      const isMissingColumnError = (message?: string) => {
        if (!message) return false
        const normalized = message.toLowerCase()
        return (
          (normalized.includes('column') && normalized.includes('does not exist')) ||
          normalized.includes('could not find') ||
          normalized.includes('schema cache')
        )
      }

      // Check if order with this session ID already exists (prevent duplicates)
      let orderNumberColumnMissing = false
      let existingOrder: { id: string; order_number?: number | null } | null = null

      const existingOrderResult = await supabase
        .from('orders')
        .select('id, order_number')
        .eq('stripe_session_id', session.id)
        .single()

      if (existingOrderResult.error) {
        if (isMissingColumnError(existingOrderResult.error.message)) {
          orderNumberColumnMissing = true
          const fallbackExistingOrderResult = await supabase
            .from('orders')
            .select('id')
            .eq('stripe_session_id', session.id)
            .maybeSingle()
          existingOrder = (fallbackExistingOrderResult.data as any) || null
        } else if (existingOrderResult.error.code !== 'PGRST116') {
          console.error('Error checking existing order:', existingOrderResult.error)
        }
      } else {
        existingOrder = existingOrderResult.data as any
      }

      if (existingOrder) {
        console.log('Order already exists for session:', session.id)
        return NextResponse.json({ received: true, message: 'Order already processed' })
      }

      // Get the next order number (if column exists)
      let nextOrderNumber: number | null = null
      if (!orderNumberColumnMissing) {
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
            : 1000 // Start from 1000
        }
      }

      // Create order in Supabase
      const parsedTaxRaw = tax ? parseFloat(tax) : 0
      const taxAmount = Number.isFinite(parsedTaxRaw) ? parsedTaxRaw : 0

      const parsedTipAmountRaw =
        tip_amount !== undefined && tip_amount !== null && tip_amount !== ''
          ? parseFloat(tip_amount)
          : 0
      const tipAmount = Number.isFinite(parsedTipAmountRaw) && parsedTipAmountRaw >= 0
        ? parsedTipAmountRaw
        : 0

      const parsedTipPercentRaw =
        tip_percent !== undefined && tip_percent !== null && tip_percent !== ''
          ? parseFloat(tip_percent)
          : 0
      const tipPercent = Number.isFinite(parsedTipPercentRaw) && parsedTipPercentRaw >= 0
        ? parsedTipPercentRaw
        : 0

      const normalizedTipAmount =
        tipAmount > 0 ? tipAmount : 0

      // Total comes from Stripe's session amount_total (includes our tax/tip line items).
      const stripeTotalRaw = typeof session.amount_total === 'number' ? session.amount_total / 100 : 0
      const totalAmount = Number.isFinite(stripeTotalRaw) ? Number(stripeTotalRaw.toFixed(2)) : 0
      const subtotalAmount = Number((totalAmount - taxAmount - normalizedTipAmount).toFixed(2))

      const fullInsertPayload = {
        customer_name,
        customer_first_name: derivedFirstName,
        customer_last_name: derivedLastName,
        customer_phone: normalizedCustomerPhone,
        customer_email: customer_email || null,
        tip_percent: Number.isFinite(tipPercent) ? tipPercent : null,
        tip_amount: Number.isFinite(normalizedTipAmount) ? normalizedTipAmount : null,
        comments: comments ? comments.toString().slice(0, 400) : null,
        total_amount: totalAmount,
        tax_amount: taxAmount,
        status: 'pending',
        stripe_session_id: session.id,
      }

      const orderNumberPayload = orderNumberColumnMissing || !nextOrderNumber
        ? {}
        : { order_number: nextOrderNumber }

      const minimalInsertPayload = {
        customer_name,
        customer_phone: normalizedCustomerPhone,
        customer_email: customer_email || null,
        total_amount: totalAmount,
        tax_amount: taxAmount,
        status: 'pending',
        stripe_session_id: session.id,
      }

      const insertWithNumber = !orderNumberColumnMissing && nextOrderNumber !== null

      let insertResult = await supabase
        .from('orders')
        .insert(insertWithNumber ? { ...fullInsertPayload, ...orderNumberPayload } : fullInsertPayload)
        .select()
        .single()

      if (insertResult.error && isMissingColumnError(insertResult.error.message)) {
        console.warn('Webhook order insert retrying without new columns:', insertResult.error.message)
        insertResult = await supabase
          .from('orders')
          .insert(insertWithNumber ? { ...minimalInsertPayload, ...orderNumberPayload } : minimalInsertPayload)
          .select()
          .single()
      }

      const { data: order, error: orderError } = insertResult

      if (orderError) {
        throw orderError
      }

      // Create order items with options and addons
      const orderItemsData = orderItems.flatMap((item: any) => {
        // Build item name with options
        let itemName = item.name
        if (item.selectedOptions && item.selectedOptions.length > 0) {
          itemName += ` (${item.selectedOptions.join(', ')})`
        }
        
        const items = []
        
        // Main item
        items.push({
          order_id: order.id,
          menu_item_id: item.id,
          menu_item_name: itemName,
          quantity: item.quantity,
          price: item.price,
        })
        
        // Add addons as separate line items
        if (item.selectedAddons && item.selectedAddons.length > 0) {
          item.selectedAddons.forEach((addon: any) => {
            items.push({
              order_id: order.id,
              menu_item_id: `${item.id}-addon-${addon.name}`,
              menu_item_name: `+ ${addon.name}`,
              quantity: item.quantity,
              price: addon.price,
            })
          })
        }
        
        return items
      })

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItemsData)

      if (itemsError) {
        throw itemsError
      }

      console.log('Order created successfully:', order.id)
    } catch (error: any) {
      console.error('Error processing webhook:', error)
      return NextResponse.json(
        { error: 'Failed to process order' },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ received: true })
}
