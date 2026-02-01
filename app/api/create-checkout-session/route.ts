import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

if (!STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY is not set')
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    })
  : null

export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: 'Payment service is not configured. Please contact support.' },
        { status: 500 }
      )
    }

    const { items, customerInfo, orderDetails } = await request.json()

    // Validate payload structure first
    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: 'Cart is empty' },
        { status: 400 }
      )
    }

    if (!customerInfo) {
      return NextResponse.json(
        { error: 'Customer information is required' },
        { status: 400 }
      )
    }

    // Normalize and validate customer info
    const customerFirstName = (customerInfo.firstName || '').trim()
    const customerLastName = (customerInfo.lastName || '').trim()
    const customerPhone = (customerInfo.phone || '').trim()
    const customerEmail = (customerInfo.email || '').trim()
    const normalizedCustomerName = `${customerFirstName} ${customerLastName}`.trim()

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

    // Validate item structure
    for (const item of items) {
      if (!item.id || !item.name || typeof item.price !== 'number' || !item.quantity) {
        return NextResponse.json(
          { error: 'Invalid item data' },
          { status: 400 }
        )
      }
      if (item.price < 0 || item.quantity < 1) {
        return NextResponse.json(
          { error: 'Invalid item price or quantity' },
          { status: 400 }
        )
      }
    }

    // Calculate totals including addons
    const subtotal = items.reduce((sum: number, item: any) => {
      let itemPrice = item.price
      if (item.selectedAddons && item.selectedAddons.length > 0) {
        itemPrice += item.selectedAddons.reduce((addonSum: number, addon: any) => addonSum + addon.price, 0)
      }
      return sum + itemPrice * item.quantity
    }, 0)
    const TAX_RATE = 0.08 // 8% tax
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

    // Build line items including addons
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = []
    items.forEach((item: any) => {
      // Add main item
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.name,
            description: item.selectedOptions?.length > 0 
              ? `Options: ${item.selectedOptions.join(', ')}` 
              : undefined,
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      })

      // Add addons as separate line items
      if (item.selectedAddons && item.selectedAddons.length > 0) {
        item.selectedAddons.forEach((addon: any) => {
          lineItems.push({
            price_data: {
              currency: 'usd',
              product_data: {
                name: `+ ${addon.name}`,
              },
              unit_amount: Math.round(addon.price * 100),
            },
            quantity: item.quantity,
          })
        })
      }
    })

    if (tax > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Sales Tax',
          },
          unit_amount: Math.round(tax * 100),
        },
        quantity: 1,
      })
    }

    if (tipAmount > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Tip',
          },
          unit_amount: Math.round(tipAmount * 100),
        },
        quantity: 1,
      })
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${request.nextUrl.origin}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${request.nextUrl.origin}/payment-cancel`,
      metadata: {
        customer_name: normalizedCustomerName,
        customer_first_name: customerFirstName,
        customer_last_name: customerLastName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        tip_percent: normalizedTipPercent.toFixed(2),
        tip_amount: tipAmount.toFixed(2),
        comments: normalizedComments,
        tax: tax.toFixed(2),
        // IMPORTANT:
        // Do NOT store the full cart JSON in Stripe metadata (size limits can prevent order creation).
      },
    })

    return NextResponse.json({ sessionId: session.id })
  } catch (error: any) {
    console.error('Error creating checkout session:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
