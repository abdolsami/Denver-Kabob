'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { CheckCircle, Clock, X, Phone, Mail } from 'lucide-react'
import Link from 'next/link'
import { clearCart } from '@/lib/cart'

function OrderConfirmationContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionId = searchParams.get('session_id')
  const [orderStatus, setOrderStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [orderDetails, setOrderDetails] = useState<any>(null)
  const [debugMessage, setDebugMessage] = useState<string | null>(null)
  const [savedPhone, setSavedPhone] = useState<string | null>(null)

  useEffect(() => {
    if (sessionId) {
      // Verify the order was created
      verifyOrder()
    } else {
      setOrderStatus('error')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => {
    try {
      const customerData = localStorage.getItem('denver-kabob-customer-info')
      const parsed = customerData ? JSON.parse(customerData) : null
      const phone = typeof parsed?.phone === 'string' ? parsed.phone : null
      setSavedPhone(phone)
    } catch {
      setSavedPhone(null)
    }
  }, [])

  const verifyOrder = async (attempt = 1) => {
    try {
      const MAX_ATTEMPTS = 12
      const RETRY_DELAY_MS = 2000

      // First, try to fetch orders and find the one matching this session
      const response = await fetch('/api/orders', { cache: 'no-store' })
      if (response.ok) {
        const { orders } = await response.json()
        const order = orders.find((o: any) => o.stripe_session_id === sessionId)
        if (order) {
          setOrderDetails(order)
          setOrderStatus('success')
          clearCart()
          localStorage.removeItem('denver-kabob-customer-info')
          localStorage.removeItem('denver-kabob-order-details')
          return
        }
      }
      
      // If order not found, ALWAYS try direct creation (for $0 orders or webhook failures)
      // Get cart data from localStorage (if still available)
      if (attempt <= 2) {
        try {
          const cartData = localStorage.getItem('denver-kabob-cart')
          const customerData = localStorage.getItem('denver-kabob-customer-info')
          const orderDetailsData = localStorage.getItem('denver-kabob-order-details')
          
          if (cartData && customerData) {
            const cart = JSON.parse(cartData)
            const customerInfo = JSON.parse(customerData)
            const orderDetails = orderDetailsData ? JSON.parse(orderDetailsData) : null
            
            console.log('Attempting to create order directly...', { sessionId, cartLength: cart.length })
            
            // Try to create order directly (for $0 orders or webhook failures)
            const createResponse = await fetch('/api/orders/create-direct', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId,
                customerInfo,
                orderDetails,
                items: cart.map((item: any) => {
                  let itemPrice = item.price || 0
                  if (item.selectedAddons && item.selectedAddons.length > 0) {
                    itemPrice += item.selectedAddons.reduce((sum: number, addon: any) => sum + (addon.price || 0), 0)
                  }
                  return {
                    id: item.id,
                    name: item.name,
                    price: itemPrice,
                    quantity: item.quantity,
                    selectedOptions: item.selectedOptions || [],
                    selectedAddons: item.selectedAddons || [],
                  }
                }),
              }),
            })
            
            const createData = await createResponse.json()
            console.log('Order creation response:', createResponse.ok, createData)
            
            if (createResponse.ok) {
              const { order } = createData
              if (order) {
                // Wait a moment for database to update, then fetch the full order
                await new Promise(resolve => setTimeout(resolve, 500))
                
                // Fetch the full order with items
                const orderResponse = await fetch('/api/orders', { cache: 'no-store' })
                if (orderResponse.ok) {
                  const { orders } = await orderResponse.json()
                  const fullOrder = orders.find((o: any) => o.id === order.id || o.stripe_session_id === sessionId)
                  if (fullOrder) {
                    console.log('Order found and set:', fullOrder.id)
                    setOrderDetails(fullOrder)
                    setOrderStatus('success')
                    clearCart()
                    localStorage.removeItem('denver-kabob-customer-info')
                    localStorage.removeItem('denver-kabob-order-details')
                    return
                  }
                }
              }
            } else {
              console.error('Order creation failed:', createData.error)
              setDebugMessage(createData?.error ? String(createData.error) : 'Direct order creation failed')
            }
          } else {
            console.warn('Cart or customer data not found in localStorage')
            setDebugMessage('Cart/customer data not found to create order. Please contact support if you were charged.')
          }
        } catch (directError) {
          console.error('Direct order creation error:', directError)
          setDebugMessage('Direct order creation error. Please contact support if you were charged.')
        }
      }
      
      // Retry for up to ~24 seconds (webhooks can be delayed).
      if (attempt < MAX_ATTEMPTS) {
        setTimeout(() => {
          verifyOrder(attempt + 1)
        }, RETRY_DELAY_MS)
      } else {
        console.warn('Order verification timed out, showing error page')
        setOrderStatus('error')
      }
    } catch (error) {
      console.error('Error verifying order:', error)
      if (attempt < 12) {
        setTimeout(() => {
          verifyOrder(attempt + 1)
        }, 2000)
      } else {
        setOrderStatus('error')
      }
    }
  }

  if (orderStatus === 'loading') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center">
          <Clock className="animate-spin mx-auto text-gray-600 mb-4" size={48} />
          <p className="text-lg text-gray-600">Processing your order...</p>
          <p className="text-sm text-gray-500 mt-2">Please wait while we confirm your payment</p>
        </div>
      </div>
    )
  }

  if (orderStatus === 'error') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="max-w-md mx-auto text-center">
          <div className="mb-6">
            <X className="mx-auto text-red-500 mb-4" size={64} />
            <h1 className="font-display text-4xl font-bold text-gray-900 mb-4">
              Order Error
            </h1>
            <p className="text-lg text-gray-600 mb-2">
              There was an issue processing your order.
            </p>
            <p className="text-sm text-gray-500 mb-8">
              If you were charged, please contact us with your order details and we&apos;ll resolve this immediately.
            </p>
            {debugMessage ? (
              <p className="text-xs text-gray-500 mb-6">
                {debugMessage}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/cart"
              className="inline-block bg-black text-white px-8 py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
            >
              Return to Cart
            </Link>
            <Link
              href={
                savedPhone
                  ? `/order-tracking?phone=${encodeURIComponent(savedPhone)}`
                  : '/order-tracking'
              }
              className="inline-flex items-center justify-center gap-2 border-2 border-gray-300 text-gray-900 px-8 py-3 rounded-lg font-semibold hover:border-black transition-colors"
            >
              Track Order
            </Link>
            <button
              type="button"
              onClick={() => {
                setOrderStatus('loading')
                setDebugMessage(null)
                verifyOrder(1)
              }}
              className="inline-flex items-center justify-center gap-2 border-2 border-gray-300 text-gray-900 px-8 py-3 rounded-lg font-semibold hover:border-black transition-colors"
            >
              Retry
            </button>
            <a
              href="tel:+17205733605"
              className="inline-flex items-center justify-center gap-2 border-2 border-gray-300 text-gray-900 px-8 py-3 rounded-lg font-semibold hover:border-black transition-colors"
            >
              <Phone size={20} />
              Call Us
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="mb-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="text-green-600" size={48} />
            </div>
            <h1 className="font-display text-4xl font-bold text-gray-900 mb-2">
              {(() => {
                const first = orderDetails?.customer_first_name?.trim()
                const last = orderDetails?.customer_last_name?.trim()
                const name = first || last ? `${first || ''} ${last || ''}`.trim() : null
                return name ? `Order confirmed, ${name}!` : 'Order Confirmed!'
              })()}
            </h1>
            <p className="text-lg text-gray-600">
              Thank you for your order at Denver Kabob.
            </p>
            {orderDetails ? (
              <p className="text-sm text-gray-500 mt-2">
                Order #{(orderDetails as any).order_number ?? orderDetails.id.substring(0, 8)}
              </p>
            ) : null}
          </div>

          <div className="bg-gray-50 rounded-lg p-6 mb-8 text-left">
            <h2 className="font-semibold text-xl text-gray-900 mb-4 flex items-center gap-2">
              <Clock size={20} />
              What&apos;s Next?
            </h2>
            <ul className="space-y-3 text-gray-700">
              <li className="flex items-start gap-3">
                <span className="text-green-600 font-bold">✓</span>
                <span>Your payment has been processed successfully</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-600 font-bold">✓</span>
                <span>Your order is now being prepared with care</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-600 font-bold">✓</span>
                <span>We&apos;ll notify you when your order is ready for pickup</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-green-600 font-bold">✓</span>
                <span>Estimated preparation time: 20-30 minutes</span>
              </li>
            </ul>
          </div>

          {orderDetails ? (
            <>
              <div className="bg-gray-50 rounded-lg p-6 mb-6 text-left">
                <h3 className="font-semibold text-lg text-gray-900 mb-3">Order Items</h3>
                <ul className="space-y-2 text-sm text-gray-700 mb-4">
                  {orderDetails.order_items?.map((item: any, idx: number) => (
                    <li key={idx} className="flex justify-between">
                      <span>{item.quantity}x {item.menu_item_name}</span>
                      <span className="font-semibold">${(item.price * item.quantity).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-gray-50 rounded-lg p-6 mb-8 text-left">
                <h3 className="font-semibold text-lg text-gray-900 mb-3">Order Summary</h3>
                <div className="space-y-2 text-sm text-gray-700">
                  {(() => {
                    const tipAmount = typeof orderDetails.tip_amount === 'number' ? orderDetails.tip_amount : 0
                    const subtotal = orderDetails.total_amount - orderDetails.tax_amount - tipAmount
                    return (
                      <>
                        <div className="flex justify-between">
                          <span>Subtotal:</span>
                          <span className="font-semibold">${subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Tax:</span>
                          <span className="font-semibold">${orderDetails.tax_amount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Tip:</span>
                          <span className="font-semibold">${tipAmount.toFixed(2)}</span>
                        </div>
                      </>
                    )
                  })()}
                  <div className="border-t border-gray-300 pt-2 mt-2 flex justify-between font-bold text-lg">
                    <span>Total:</span>
                    <span>${orderDetails.total_amount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              {orderDetails.comments && (
                <div className="bg-gray-50 rounded-lg p-6 mb-8 text-left">
                  <h3 className="font-semibold text-lg text-gray-900 mb-2">Comments</h3>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{orderDetails.comments}</p>
                </div>
              )}
            </>
          ) : (
            <div className="bg-gray-50 rounded-lg p-6 mb-8 text-left">
              <p className="text-sm text-gray-600">
                Your order details are being processed. You will receive a confirmation email shortly.
              </p>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
            <p className="text-sm text-blue-900">
              <strong>Need to make changes?</strong> Call us at{' '}
              <a href="tel:+17205733605" className="font-semibold underline">
                (720) 573-3605
              </a>{' '}
              and we&apos;ll be happy to help!
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={
                orderDetails?.id
                  ? `/order-tracking?orderId=${encodeURIComponent(orderDetails.id)}`
                  : '/order-tracking'
              }
              className="inline-flex items-center justify-center bg-black text-white px-8 py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
            >
              Track Your Order
            </Link>
            <Link
              href="/menu"
              className="inline-flex items-center justify-center border-2 border-gray-300 text-gray-900 px-8 py-3 rounded-lg font-semibold hover:border-black transition-colors"
            >
              Order More
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center border-2 border-gray-300 text-gray-900 px-8 py-3 rounded-lg font-semibold hover:border-black transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OrderConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="text-center">
            <Clock className="animate-spin mx-auto text-gray-600 mb-4" size={48} />
            <p className="text-lg text-gray-600">Loading...</p>
          </div>
        </div>
      }
    >
      <OrderConfirmationContent />
    </Suspense>
  )
}
