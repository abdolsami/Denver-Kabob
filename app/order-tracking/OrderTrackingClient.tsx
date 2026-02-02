'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, Phone, Hash, Clock, ChefHat, Package, CheckCircle, Loader2 } from 'lucide-react'
import { Order } from '@/lib/types'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const statusConfig = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  preparing: { label: 'Preparing', color: 'bg-blue-100 text-blue-800', icon: ChefHat },
  ready: { label: 'Ready', color: 'bg-green-100 text-green-800', icon: Package },
  completed: { label: 'Completed', color: 'bg-gray-100 text-gray-800', icon: CheckCircle },
}

const formatCustomerName = (order: Order) => {
  const first = order.customer_first_name?.trim()
  const last = order.customer_last_name?.trim()
  if (first || last) return `${first || ''} ${last || ''}`.trim()
  return order.customer_name
}

const formatRequestedTime = (order: Order) => {
  if (order.time_choice === 'scheduled' && order.scheduled_time) {
    const parsed = new Date(order.scheduled_time)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    }
  }
  return 'As soon as possible'
}

export default function OrderTrackingClient() {
  const searchParams = useSearchParams()
  const [searchType, setSearchType] = useState<'phone' | 'orderId'>('phone')
  const [searchValue, setSearchValue] = useState('')
  const [lastQuery, setLastQuery] = useState<{ type: 'phone' | 'orderId'; value: string } | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const didAutoSearchRef = useRef(false)

  const REFRESH_INTERVAL_MS = 2000

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)

  // Create browser Supabase client once (for realtime updates).
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anon) return
    supabaseRef.current = createClient(url, anon)
  }, [])

  const fetchTrackedOrders = useCallback(
    async (
      query: { type: 'phone' | 'orderId'; value: string },
      opts?: { silent?: boolean }
    ) => {
      const silent = !!opts?.silent
      if (silent) {
        setIsRefreshing(true)
      } else {
        setLoading(true)
        setError(null)
        setHasSearched(true)
      }

      try {
        const param = query.type === 'phone' ? 'phone' : 'orderId'
        // Add a timestamp param to defeat any intermediary caching (CDN/proxy/browser).
        const url = `/api/orders/lookup?${param}=${encodeURIComponent(query.value)}&_ts=${Date.now()}`
        const response = await fetch(url, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-store, max-age=0',
            'Pragma': 'no-cache',
          },
        })

        const data = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.error || 'Failed to search for orders')
        }

        const nextOrders: Order[] = Array.isArray(data.orders) ? data.orders : []
        setOrders(nextOrders)

        // Only show "no orders" / errors on an explicit search, not background refresh.
        if (!silent) {
          if (nextOrders.length === 0) {
            setError('No orders found. Please check your phone number or order ID.')
          }
        }
      } catch (err: any) {
        if (!silent) {
          setError(err.message || 'Failed to search for orders')
          setOrders([])
        }
      } finally {
        if (silent) {
          setIsRefreshing(false)
        } else {
          setLoading(false)
        }
      }
    },
    []
  )

  const handleSearch = async () => {
    const trimmed = searchValue.trim()
    if (!trimmed) {
      setError('Please enter a phone number or order ID')
      return
    }

    // Validate phone number format
    if (searchType === 'phone') {
      const phoneDigits = trimmed.replace(/\D/g, '')
      if (phoneDigits.length < 10) {
        setError('Please enter a valid phone number (at least 10 digits)')
        return
      }
    }

    const query = { type: searchType, value: trimmed }
    setLastQuery(query)
    await fetchTrackedOrders(query)
  }

  // Auto-refresh results so status changes show up
  useEffect(() => {
    if (!hasSearched || !lastQuery) return
    const interval = setInterval(() => {
      fetchTrackedOrders(lastQuery, { silent: true })
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [hasSearched, lastQuery, fetchTrackedOrders, REFRESH_INTERVAL_MS])

  // Realtime: subscribe to status updates so it changes immediately when admin updates.
  useEffect(() => {
    if (!hasSearched || !lastQuery) return
    const supabase = supabaseRef.current
    if (!supabase) return

    const normalizedPhone = lastQuery.type === 'phone' ? lastQuery.value.replace(/\D/g, '') : ''
    const filter =
      lastQuery.type === 'orderId'
        ? `id=eq.${lastQuery.value}`
        : normalizedPhone
          ? `customer_phone=eq.${normalizedPhone}`
          : ''

    if (!filter) return

    const channel = supabase
      .channel(`orders-tracking-${lastQuery.type}-${normalizedPhone || lastQuery.value}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter },
        (payload: any) => {
          const next = payload?.new
          if (!next?.id) return
          setOrders((prev) =>
            prev.map((o) => (o.id === next.id ? { ...o, ...next } : o))
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [hasSearched, lastQuery])

  // If the user switches away and comes back, refresh immediately (mobile/background timers get throttled).
  useEffect(() => {
    if (!hasSearched || !lastQuery) return
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchTrackedOrders(lastQuery, { silent: true })
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [hasSearched, lastQuery, fetchTrackedOrders])

  // Auto-search when arriving from order confirmation
  useEffect(() => {
    if (didAutoSearchRef.current) return
    const orderIdParam = searchParams.get('orderId')
    const phoneParam = searchParams.get('phone')
    const value = (orderIdParam || phoneParam || '').trim()
    if (!value) return

    didAutoSearchRef.current = true
    const type: 'orderId' | 'phone' = orderIdParam ? 'orderId' : 'phone'
    setSearchType(type)
    setSearchValue(value)
    setError(null)
    const query = { type, value }
    setLastQuery(query)
    fetchTrackedOrders(query)
  }, [searchParams, fetchTrackedOrders])

  const formatPhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
    }
    return phone
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-24 sm:pt-28 pb-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-gray-900 mb-2 sm:mb-4">
            Track Your Order
          </h1>
          <p className="text-base sm:text-lg text-gray-600">
            Enter your phone number or order ID to view your order status
          </p>
        </div>

        {/* Search Form */}
        <div className="bg-white rounded-2xl sm:rounded-xl shadow-sm sm:shadow-lg p-4 sm:p-6 mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:gap-2">
              <button
                onClick={() => {
                  setSearchType('phone')
                  setSearchValue('')
                  setLastQuery(null)
                  setOrders([])
                  setError(null)
                  setHasSearched(false)
                }}
                className={`w-full justify-center flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold transition-colors ${
                  searchType === 'phone'
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Phone size={18} />
                Phone
              </button>
              <button
                onClick={() => {
                  setSearchType('orderId')
                  setSearchValue('')
                  setLastQuery(null)
                  setOrders([])
                  setError(null)
                  setHasSearched(false)
                }}
                className={`w-full justify-center flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold transition-colors ${
                  searchType === 'orderId'
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Hash size={18} />
                Order ID
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type={searchType === 'phone' ? 'tel' : 'text'}
              value={searchValue}
              onChange={(e) => {
                setSearchValue(e.target.value)
                setError(null)
              }}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={searchType === 'phone' ? 'Enter your phone number' : 'Enter your order ID'}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black bg-white"
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="w-full sm:w-auto px-6 py-3 bg-black text-white rounded-lg font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <Search size={18} />
                  <span>Search</span>
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Results */}
        {hasSearched && (
          <>
            {orders.length > 0 ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                    {orders.length === 1 ? 'Your Order' : `Your Orders (${orders.length})`}
                  </h2>
                  {(loading || isRefreshing) && (
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <Loader2 className="animate-spin" size={14} />
                      <span>Updating…</span>
                    </div>
                  )}
                </div>
                {orders.map((order) => {
                  const StatusIcon = statusConfig[order.status].icon
                  return (
                    <div
                      key={order.id}
                      className="bg-white rounded-2xl sm:rounded-xl shadow-sm sm:shadow-lg p-4 sm:p-6 border border-gray-200"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                        <div>
                          <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">
                            Order #{(order as any).order_number || order.id.substring(0, 8)}
                          </h3>
                          <p className="text-sm text-gray-600">Placed on {formatDate(order.created_at)}</p>
                        </div>
                        <div className="sm:mt-0">
                          <div
                            className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg ${statusConfig[order.status].color}`}
                          >
                            <StatusIcon size={18} />
                            <span className="font-semibold">{statusConfig[order.status].label}</span>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-gray-200 pt-4 mt-4">
                        <h4 className="font-semibold text-gray-900 mb-3">Order Items</h4>
                        <div className="space-y-2 mb-4">
                          {order.order_items?.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-sm text-gray-700">
                              <span>
                                {item.quantity}x {item.menu_item_name}
                              </span>
                              <span className="font-semibold">${(item.price * item.quantity).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="border-t border-gray-200 pt-3 space-y-1">
                          {(() => {
                            const tipAmount = typeof order.tip_amount === 'number' ? order.tip_amount : 0
                            const subtotal = order.total_amount - order.tax_amount - tipAmount
                            return (
                              <>
                                <div className="flex justify-between text-sm text-gray-600">
                                  <span>Subtotal</span>
                                  <span>${subtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm text-gray-600">
                                  <span>Tax</span>
                                  <span>${order.tax_amount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm text-gray-600">
                                  <span>Tip</span>
                                  <span>${tipAmount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between font-bold text-lg text-gray-900 pt-2 border-t border-gray-200">
                                  <span>Total</span>
                                  <span>${order.total_amount.toFixed(2)}</span>
                                </div>
                              </>
                            )
                          })()}
                        </div>
                      </div>

                      <div className="border-t border-gray-200 pt-4 mt-4">
                        <p className="text-sm text-gray-600">
                          <strong>Customer:</strong> {formatCustomerName(order)}
                        </p>
                        <p className="text-sm text-gray-600">
                          <strong>Phone:</strong> {formatPhone(order.customer_phone)}
                        </p>
                        {order.customer_email && (
                          <p className="text-sm text-gray-600">
                            <strong>Email:</strong> {order.customer_email}
                          </p>
                        )}
                        <p className="text-sm text-gray-600">
                          <strong>Requested time:</strong> {formatRequestedTime(order)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-lg p-8 text-center">
                <p className="text-lg text-gray-600">
                  No orders found. Please check your information and try again.
                </p>
              </div>
            )}
          </>
        )}

        {/* Help Section */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-5 sm:p-6">
          <h3 className="font-semibold text-blue-900 mb-2">Need Help?</h3>
          <p className="text-sm text-blue-800 mb-4">
            If you&apos;re having trouble finding your order, please contact us directly.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href="tel:+17205733605"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              <Phone size={18} />
              Call (720) 573-3605
            </a>
            <Link
              href="/"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border-2 border-blue-600 text-blue-900 px-6 py-3 rounded-lg font-semibold hover:bg-blue-100 transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

