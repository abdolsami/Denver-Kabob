import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Direct order creation endpoint for testing (bypasses Stripe webhook)
export async function POST(request: NextRequest) {
  try {
    const { customerInfo, items, sessionId, orderDetails } = await request.json()

    // Validate required fields first
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Cart items are required' },
        { status: 400 }
      )
    }

    if (!customerInfo) {
      return NextResponse.json(
        { error: 'Customer information is required' },
        { status: 400 }
      )
    }

    // Normalize customer info
    const customerFirstName = (customerInfo.firstName || '').trim()
    const customerLastName = (customerInfo.lastName || '').trim()
    const customerPhone = (customerInfo.phone || '').trim()
    const customerPhoneDigits = customerPhone.replace(/\D/g, '')
    const customerEmail = (customerInfo.email || '').trim()
    const normalizedCustomerName = `${customerFirstName} ${customerLastName}`.trim()

    // Validate customer info
    if (!customerFirstName || !customerLastName) {
      return NextResponse.json(
        { error: 'Customer first and last name are required' },
        { status: 400 }
      )
    }

    if (!customerPhone) {
      return NextResponse.json(
        { error: 'Customer phone number is required' },
        { status: 400 }
      )
    }
    if (customerPhoneDigits.length < 10) {
      return NextResponse.json(
        { error: 'Customer phone number is invalid' },
        { status: 400 }
      )
    }

    // Calculate totals
    const subtotal = items.reduce((sum: number, item: any) => {
      let itemPrice = item.price || 0
      if (item.selectedAddons && item.selectedAddons.length > 0) {
        itemPrice += item.selectedAddons.reduce((addonSum: number, addon: any) => addonSum + (addon.price || 0), 0)
      }
      return sum + itemPrice * (item.quantity || 1)
    }, 0)
    
    const TAX_RATE = 0.08
    const tax = Number((subtotal * TAX_RATE).toFixed(2))

    const rawTipPercent = Number(orderDetails?.tipPercent ?? 0)
    const normalizedTipPercent = Number.isFinite(rawTipPercent)
      ? Math.min(Math.max(rawTipPercent, 0), 100)
      : 0
    const tipAmount = Number((subtotal * (normalizedTipPercent / 100)).toFixed(2))

    const normalizedComments = (orderDetails?.comments || '').toString().trim().slice(0, 400)

    const total = Number((subtotal + tax + tipAmount).toFixed(2))

    if (!Number.isFinite(total) || total <= 0) {
      return NextResponse.json(
        { error: 'Invalid order total. Please review your cart and try again.' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()
    const isMissingColumnError = (message?: string) => {
      if (!message) return false
      const normalized = message.toLowerCase()
      return (
        (normalized.includes('column') && normalized.includes('does not exist')) ||
        normalized.includes('could not find') ||
        normalized.includes('schema cache')
      )
    }

    // Check if order already exists
    let existingOrder: { id: string; order_number?: number | null } | null = null
    let orderNumberColumnMissing = false

    const existingOrderResult = await supabase
      .from('orders')
      .select('id, order_number')
      .eq('stripe_session_id', sessionId)
      .maybeSingle()

    if (existingOrderResult.error) {
      if (isMissingColumnError(existingOrderResult.error.message)) {
        orderNumberColumnMissing = true
        const fallbackExistingOrderResult = await supabase
          .from('orders')
          .select('id')
          .eq('stripe_session_id', sessionId)
          .maybeSingle()
        if (fallbackExistingOrderResult.error && fallbackExistingOrderResult.error.code !== 'PGRST116') {
          console.error('Error checking existing order (fallback):', fallbackExistingOrderResult.error)
        }
        existingOrder = (fallbackExistingOrderResult.data as any) || null
      } else if (existingOrderResult.error.code !== 'PGRST116') {
        console.error('Error checking existing order:', existingOrderResult.error)
      }
    } else {
      existingOrder = existingOrderResult.data as any
    }

    if (existingOrder) {
      console.log('Order already exists for session:', sessionId, existingOrder.id)
      // Return the existing order with full details
      const { data: fullOrder } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (*)
        `)
        .eq('id', existingOrder.id)
        .single()
      
      return NextResponse.json({ 
        order: fullOrder || existingOrder,
        message: 'Order already exists' 
      })
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

    // Create order
    const fullInsertPayload = {
      customer_name: normalizedCustomerName,
      customer_first_name: customerFirstName || null,
      customer_last_name: customerLastName || null,
      customer_phone: customerPhoneDigits,
      customer_email: customerEmail || null,
      tip_percent: normalizedTipPercent,
      tip_amount: tipAmount,
      comments: normalizedComments || null,
      total_amount: total,
      tax_amount: tax,
      status: 'pending',
      stripe_session_id: sessionId,
    }
    const orderNumberPayload = orderNumberColumnMissing || !nextOrderNumber
      ? {}
      : { order_number: nextOrderNumber }

    const minimalInsertPayload = {
      customer_name: normalizedCustomerName,
      customer_phone: customerPhoneDigits,
      customer_email: customerEmail || null,
      total_amount: total,
      tax_amount: tax,
      status: 'pending',
      stripe_session_id: sessionId,
    }

    let insertResult = await supabase
      .from('orders')
      .insert({ ...fullInsertPayload, ...orderNumberPayload })
      .select()
      .single()

    if (insertResult.error && isMissingColumnError(insertResult.error.message)) {
      console.warn('Order insert retrying without new columns:', insertResult.error.message)
      insertResult = await supabase
        .from('orders')
        .insert({ ...minimalInsertPayload, ...orderNumberPayload })
        .select()
        .single()
    }

    const { data: order, error: orderError } = insertResult

    if (orderError) {
      console.error('Error creating order:', orderError)
      console.error('Order data attempted:', {
        customer_name: normalizedCustomerName,
        customer_phone: customerPhone,
        total_amount: total,
        tax_amount: tax,
        status: 'pending',
        stripe_session_id: sessionId,
      })
      throw orderError
    }

    if (!order) {
      throw new Error('Order was not created but no error was returned')
    }

    console.log('Order created successfully:', order.id)

    // Create order items
    const orderItemsData = items.flatMap((item: any) => {
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
        quantity: item.quantity || 1,
        price: item.price || 0,
      })
      
      // Add addons
      if (item.selectedAddons && item.selectedAddons.length > 0) {
        item.selectedAddons.forEach((addon: any) => {
          items.push({
            order_id: order.id,
            menu_item_id: `${item.id}-addon-${addon.name}`,
            menu_item_name: `+ ${addon.name}`,
            quantity: item.quantity || 1,
            price: addon.price || 0,
          })
        })
      }
      
      return items
    })

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItemsData)

    if (itemsError) {
      console.error('Error creating order items:', itemsError)
      // Try to delete the order if items failed
      await supabase.from('orders').delete().eq('id', order.id)
      throw itemsError
    }

    console.log('Order items created successfully:', orderItemsData.length, 'items')

    // Fetch the complete order with items
    const { data: completeOrder, error: fetchError } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .eq('id', order.id)
      .single()

    if (fetchError) {
      console.error('Error fetching complete order:', fetchError)
      // Still return the order we created
      return NextResponse.json({ 
        order,
        message: 'Order created successfully (items may not be loaded)' 
      })
    }

    return NextResponse.json({ 
      order: completeOrder || order,
      message: 'Order created successfully' 
    })
  } catch (error: any) {
    console.error('Error in direct order creation:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create order' },
      { status: 500 }
    )
  }
}
