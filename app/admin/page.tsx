'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Order } from '@/lib/types'
import { Clock, ChefHat, CheckCircle, Package, Phone, X } from 'lucide-react'

const ADMIN_SESSION_KEY = 'denver-kabob-admin-authenticated'

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

// Helper functions for admin session persistence
const getAdminSession = (): boolean => {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(ADMIN_SESSION_KEY) === 'true'
  } catch {
    return false
  }
}

const setAdminSession = (authenticated: boolean): void => {
  if (typeof window === 'undefined') return
  try {
    if (authenticated) {
      localStorage.setItem(ADMIN_SESSION_KEY, 'true')
    } else {
      localStorage.removeItem(ADMIN_SESSION_KEY)
    }
  } catch (error) {
    console.error('Failed to save admin session:', error)
  }
}

export default function AdminDashboard() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [password, setPassword] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [error, setError] = useState('')
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [hasNewOrder, setHasNewOrder] = useState(false)
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set())
  const [showNewOrderAlert, setShowNewOrderAlert] = useState(false)
  const [newOrderNumber, setNewOrderNumber] = useState<number | null>(null)
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastOrderCountRef = useRef(0)
  const lastOrderIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    // Use your custom alarm sound
    // Note: browsers require user interaction before audio can autoplay
    const audio = new Audio('/sounds/alarm.wav')
    audio.loop = true
    audio.preload = 'auto'
    audio.volume = 1
    audioRef.current = audio
  }, [])

  const playNotificationSound = useCallback(() => {
    if (!audioRef.current) return
    try {
      const maybePromise = audioRef.current.play()
      if (maybePromise && typeof (maybePromise as any).catch === 'function') {
        ;(maybePromise as any).catch(() => {
          // Ignore audio play errors (user interaction required)
        })
      }
    } catch {
      // Ignore audio errors
    }
  }, [])

  const playContinuousSound = useCallback(() => {
    // Stop any existing loop
    if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current)
      audioIntervalRef.current = null
    }
    // Ensure audio plays (loop is enabled)
    playNotificationSound()
  }, [playNotificationSound])

  const stopSound = () => {
    if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current)
      audioIntervalRef.current = null
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      } catch {
        // Ignore audio errors
      }
    }
  }

  useEffect(() => {
    return () => {
      stopSound()
    }
  }, [])

  const fetchOrders = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent
    try {
      setFetchError(null)
      if (silent) {
        setIsRefreshing(true)
      } else {
        setLoading(true)
      }
      
      const response = await fetch('/api/orders', {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        let errorData
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { error: errorText || `HTTP ${response.status}: Failed to fetch orders` }
        }
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch orders`)
      }
      
      const data = await response.json()
      
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response format from server')
      }
      
      const fetchedOrders: Order[] = Array.isArray(data.orders) ? data.orders : []
      
      // Check for new orders by comparing order IDs
      const currentOrderIds = new Set(fetchedOrders.map((o: Order) => o.id))
      
      if (lastOrderIdsRef.current.size > 0) {
        // Find new orders
        const newIds = Array.from(currentOrderIds).filter((id) => !lastOrderIdsRef.current.has(id))
        
        if (newIds.length > 0) {
          // Get the newest order details
          const newOrders = fetchedOrders.filter((o) => newIds.includes(o.id))
          const newestOrder = newOrders.sort((a: Order, b: Order) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )[0]
          const orderNumber = (newestOrder as any)?.order_number || null
          
          setHasNewOrder(true)
          setNewOrderIds(new Set<string>(newIds))
          setNewOrderNumber(orderNumber)
          setShowNewOrderAlert(true)
          
          // Play continuous sound alert
          playContinuousSound()
          
          // Show browser notification if permitted
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('New Order Received!', {
              body: orderNumber ? `Order #${orderNumber}` : `You have ${newIds.length} new order(s)`,
              icon: '/favicon.ico',
              tag: 'new-order',
            })
          }
        }
      }
      
      // Update refs after checking
      lastOrderCountRef.current = fetchedOrders.length
      lastOrderIdsRef.current = currentOrderIds
      setOrders(fetchedOrders)
      setLastFetchTime(new Date())
      if (silent) {
        setIsRefreshing(false)
      } else {
        setLoading(false)
      }
    } catch (error: any) {
      console.error('Error fetching orders:', error)
      const errorMessage = error?.message || 'Failed to fetch orders. Check your connection and try refreshing.'
      setFetchError(errorMessage)
      if (silent) {
        setIsRefreshing(false)
      } else {
        setLoading(false)
      }
    }
  }, [playContinuousSound])

  const handleLogin = async () => {
    setError('')
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        setError('Incorrect password')
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!data?.ok) {
        setError('Incorrect password')
        return
      }
      setAuthenticated(true)
      setAdminSession(true)
      fetchOrders()
    } catch {
      setError('Login failed. Please try again.')
    }
  }

  // Check for existing session on mount
  useEffect(() => {
    const isAuthenticated = getAdminSession()
    if (isAuthenticated) {
      setAuthenticated(true)
    } else {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authenticated) {
      // Initial fetch
      fetchOrders()
      
      // Set up polling interval
      const interval = setInterval(() => {
        fetchOrders({ silent: true })
      }, 5000) // Poll every 5 seconds
      
      // Request notification permission
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission()
      }
      
      return () => clearInterval(interval)
    }
  }, [authenticated, fetchOrders])

  const updateOrderStatus = async (orderId: string, newStatus: Order['status']) => {
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!response.ok) throw new Error('Failed to update order')
      
      await fetchOrders()
      setSelectedOrder(null)
    } catch (error) {
      console.error('Error updating order:', error)
      alert('Failed to update order status')
    }
  }

  const callCustomer = (phone: string) => {
    window.location.href = `tel:${phone}`
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-8 max-w-md w-full">
          <h1 className="font-display text-3xl font-bold text-gray-900 mb-6 text-center">
            Admin Login
          </h1>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black bg-white"
                placeholder="Enter admin password"
                autoFocus
              />
            </div>
            <button
              onClick={handleLogin}
              className="w-full bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
            >
              Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  const pendingOrders = orders.filter((o) => o.status === 'pending')
  const preparingOrders = orders.filter((o) => o.status === 'preparing')
  const readyOrders = orders.filter((o) => o.status === 'ready')

  const formatTime = (date: Date | null) => {
    if (!date) return 'Never'
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    })
  }

  const handleDismissAlert = () => {
    setShowNewOrderAlert(false)
    setHasNewOrder(false)
    setNewOrderIds(new Set())
    stopSound()
  }

  return (
    <>
      {/* Full-Screen New Order Alert */}
      {showNewOrderAlert && (
        <div 
          className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center animate-fade-in"
          onClick={handleDismissAlert}
        >
          <div className="text-center animate-bounce">
            <div className="relative mb-8">
              <div className="w-32 h-32 bg-green-500 rounded-full mx-auto flex items-center justify-center shadow-2xl animate-pulse">
                <div className="w-24 h-24 bg-green-400 rounded-full flex items-center justify-center">
                  <div className="w-16 h-16 bg-green-300 rounded-full flex items-center justify-center">
                    <CheckCircle className="text-white" size={48} />
                  </div>
                </div>
              </div>
              {/* Pulsing rings */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 border-4 border-green-400 rounded-full animate-ping opacity-75"></div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-40 h-40 border-4 border-green-300 rounded-full animate-ping opacity-50" style={{ animationDelay: '0.5s' }}></div>
              </div>
            </div>
            <h2 className="text-6xl font-bold text-white mb-4 animate-pulse">
              NEW ORDER!
            </h2>
            {newOrderNumber && (
              <p className="text-4xl font-semibold text-green-300 mb-8">
                Order #{newOrderNumber}
              </p>
            )}
            <p className="text-2xl text-white/90 mb-12">
              Click anywhere to view
            </p>
            <div className="flex items-center justify-center gap-2 text-white/70">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-sm">Sound will continue until you click</span>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="font-display text-4xl font-bold text-gray-900">
              Admin Dashboard
            </h1>
            {lastFetchTime && (
              <p className="text-sm text-gray-500 mt-1">
                Last updated: {formatTime(lastFetchTime)} • {orders.length} total order{orders.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={async () => {
                // Test database connection
                try {
                  const testResponse = await fetch('/api/orders/test')
                  const testData = await testResponse.json()
                  console.log('Database test:', testData)
                  if (testData.success) {
                    alert(`Database connected! Total orders: ${testData.totalOrders}`)
                  } else {
                    alert(`Database error: ${testData.error}`)
                  }
                } catch (e) {
                  console.error('Test failed:', e)
                }
                fetchOrders()
              }}
              disabled={loading}
              className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg font-medium transition-colors disabled:opacity-50 text-sm"
            >
              Test DB
            </button>
            <button
              onClick={() => fetchOrders()}
              disabled={loading || isRefreshing}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {loading || isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              onClick={() => {
                setAuthenticated(false)
                setAdminSession(false)
                setPassword('')
                setOrders([])
                setHasNewOrder(false)
                setNewOrderIds(new Set())
                lastOrderCountRef.current = 0
                lastOrderIdsRef.current = new Set()
              }}
              className="text-gray-600 hover:text-black font-semibold"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Error Display */}
        {fetchError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-red-900 mb-1">Error Fetching Orders</p>
                <p className="text-sm text-red-700">{fetchError}</p>
              </div>
              <button
                onClick={() => setFetchError(null)}
                className="text-red-600 hover:text-red-800"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        )}

        {/* New Order Alert */}
        {hasNewOrder && (
          <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg flex items-center justify-between animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-yellow-400 rounded-full animate-ping"></div>
              <span className="font-semibold text-yellow-900">New order received!</span>
            </div>
            <button
              onClick={() => setHasNewOrder(false)}
              className="text-yellow-700 hover:text-yellow-900"
            >
              <X size={20} />
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-yellow-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Pending Orders</p>
                <p className="text-3xl font-bold text-gray-900">{pendingOrders.length}</p>
              </div>
              <Clock className="text-yellow-500" size={32} />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Preparing</p>
                <p className="text-3xl font-bold text-gray-900">{preparingOrders.length}</p>
              </div>
              <ChefHat className="text-blue-500" size={32} />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Ready</p>
                <p className="text-3xl font-bold text-gray-900">{readyOrders.length}</p>
              </div>
              <Package className="text-green-500" size={32} />
            </div>
          </div>
        </div>

        {/* Orders List */}
        {loading && orders.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="animate-spin mx-auto text-gray-400 mb-4" size={48} />
            <p className="text-lg text-gray-600">Loading orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <p className="text-lg text-gray-600">No orders yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const StatusIcon = statusConfig[order.status].icon
              const isNewOrder = newOrderIds.has(order.id)
              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-all border-l-4 ${
                    isNewOrder ? 'ring-2 ring-yellow-400 animate-pulse' : ''
                  } ${
                    order.status === 'pending' ? 'border-yellow-500' :
                    order.status === 'preparing' ? 'border-blue-500' :
                    order.status === 'ready' ? 'border-green-500' : 'border-gray-500'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-4">
                        <StatusIcon
                          className={`${statusConfig[order.status].color} p-2 rounded-lg`}
                          size={24}
                        />
                        <div>
                          <h3 className="font-display text-xl font-semibold text-gray-900">
                            Order #{(order as any).order_number || order.id.substring(0, 8)}
                          </h3>
                          <p className="text-sm text-gray-600">
                            {new Date(order.created_at).toLocaleString()}
                          </p>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-semibold ${statusConfig[order.status].color}`}
                        >
                          {statusConfig[order.status].label}
                        </span>
                      </div>

                      <div className="mb-4 space-y-2">
                        <p className="text-gray-700">
                          <span className="font-semibold">Customer:</span> {formatCustomerName(order)}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-700">Phone:</span>
                          <a
                            href={`tel:${order.customer_phone}`}
                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                          >
                            <Phone size={16} />
                            {order.customer_phone}
                          </a>
                        </div>
                        {order.customer_email && (
                          <p className="text-gray-700">
                            <span className="font-semibold">Email:</span> {order.customer_email}
                          </p>
                        )}
                        {typeof order.tip_amount === 'number' && order.tip_amount > 0 && (
                          <p className="text-gray-700">
                            <span className="font-semibold">Tip:</span> ${order.tip_amount.toFixed(2)}
                          </p>
                        )}
                        {order.comments && (
                          <p className="text-gray-700">
                            <span className="font-semibold">Comments:</span> {order.comments}
                          </p>
                        )}
                      </div>

                      <div className="mb-4">
                        <p className="font-semibold text-gray-900 mb-2">Items:</p>
                        <ul className="space-y-1 text-gray-700">
                          {order.order_items?.map((item: any, idx: number) => (
                            <li key={idx} className="text-sm">
                              {item.quantity}x {item.menu_item_name} - ${(item.price * item.quantity).toFixed(2)}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="text-lg font-semibold text-gray-900">
                          Total: ${order.total_amount.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      {order.status === 'pending' && (
                        <button
                          onClick={() => updateOrderStatus(order.id, 'preparing')}
                          className="bg-green-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-600 transition-colors text-sm"
                        >
                          Accept & Start Preparing
                        </button>
                      )}
                      {order.status === 'preparing' && (
                        <button
                          onClick={() => updateOrderStatus(order.id, 'ready')}
                          className="bg-green-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-600 transition-colors text-sm"
                        >
                          Mark Ready
                        </button>
                      )}
                      {order.status === 'ready' && (
                        <button
                          onClick={() => updateOrderStatus(order.id, 'completed')}
                          className="bg-gray-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-gray-600 transition-colors text-sm"
                        >
                          Complete Order
                        </button>
                      )}
                      <button
                        onClick={() => callCustomer(order.customer_phone)}
                        className="bg-black text-white px-4 py-2 rounded-lg font-semibold hover:bg-gray-800 transition-colors text-sm flex items-center justify-center gap-2"
                      >
                        <Phone size={16} />
                        Call Customer
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
    </>
  )
}
