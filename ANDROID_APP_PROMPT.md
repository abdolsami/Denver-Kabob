# Android Admin Dashboard App - Development Prompt

## ⚡ SUPABASE DIRECT INTEGRATION - ANSWER TO AGENT QUESTION

**YES - We are using Supabase as the backend!** The Next.js API routes are just wrappers. You can connect directly to Supabase for **INSTANT real-time updates**.

### What You Need:

1. **Supabase Credentials:**
   - `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL (e.g., `https://xxxxx.supabase.co`)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon key (NOT service role - use anon key for client)

2. **Table Names:**
   - `orders` - Main orders table
   - `order_items` - Order line items (nested relationship)

3. **Schema Details:**
   - See `SUPABASE_ANDROID_SETUP.md` for complete schema
   - Key fields: `id` (UUID), `order_number` (INTEGER - required!), `status`, `customer_name`, `customer_phone`, etc.
   - `order_items` has foreign key `order_id` → `orders.id`

4. **Status Updates:**
   - Direct UPDATE on `orders` table: `.update({ status: 'preparing' }).eq('id', orderId)`
   - Status values: `'pending' | 'preparing' | 'ready' | 'completed'`
   - Update `updated_at` timestamp when status changes

5. **RLS Rules (REQUIRED - Update these!):**
   ```sql
   -- Allow anon key to read all orders
   CREATE POLICY "orders are readable by anon" ON orders
     FOR SELECT USING (true);
   
   -- Allow anon key to update order status
   CREATE POLICY "orders are updatable by anon" ON orders
     FOR UPDATE USING (true) WITH CHECK (true);
   
   -- Allow anon key to read order_items
   CREATE POLICY "order_items are readable by anon" ON order_items
     FOR SELECT USING (true);
   ```
   **IMPORTANT**: Current RLS policies use "service role" - you need to update them for anon key access!

6. **Real-Time Subscriptions:**
   - Enable Realtime in Supabase Dashboard → Database → Replication → Enable for `orders` table
   - Use Supabase Realtime subscriptions for **INSTANT** order notifications (better than polling!)

**See `SUPABASE_ANDROID_SETUP.md` for complete implementation guide!**

---

## Project Overview
Build a React Native Android application that replicates the exact admin dashboard from a Next.js web application. The app should be a native Android APK (not for Play Store distribution) optimized for Android tablets/iPads. The design, colors, functionality, and user experience must match the web version exactly.

**CRITICAL: Real-Time Performance**
- Orders must appear **IMMEDIATELY** when placed (within 1-2 seconds maximum)
- Use aggressive polling (every 2-3 seconds) or WebSocket connection for instant updates
- The app must feel instant and responsive - no delays in order notifications
- When a customer places an order on the website, it should appear on the Android app within 2-3 seconds
- Full-screen alert with sound must trigger immediately upon new order detection
- NO delays, NO lag - this is a restaurant kitchen app that needs instant notifications

**Restaurant Context**
- Restaurant Name: **Denver Kabob** (display prominently throughout app)
- Tagline: "Authentic Afghan Cuisine"
- Display restaurant branding in:
  - Login screen header
  - Dashboard header
  - Full-screen new order alert
  - Android notifications
  - App title/name

## Technical Requirements

### Stack
- **Framework**: React Native (Expo or bare React Native)
- **Language**: TypeScript
- **Platform**: Android (APK file output)
- **Target Devices**: Android tablets (optimized for iPad-sized screens)
- **State Management**: React Hooks (useState, useEffect, useRef, useCallback)
- **Storage**: AsyncStorage (for session persistence)
- **HTTP Client**: Axios or fetch API
- **Icons**: React Native Vector Icons (or similar - match Lucide icons)
- **Styling**: StyleSheet API (match Tailwind CSS classes exactly)

## Design Specifications

### Color Palette (EXACT MATCH REQUIRED)
```typescript
Colors: {
  // Primary
  black: '#000000',
  white: '#ffffff',
  gray50: '#fafafa',
  gray100: '#f5f5f5',
  gray200: '#e5e5e5',
  gray300: '#d4d4d4',
  gray400: '#a3a3a3',
  gray500: '#737373',
  gray600: '#525252',
  gray700: '#404040',
  gray800: '#262626',
  gray900: '#171717',
  
  // Status Colors
  yellow100: '#fef3c7', // bg-yellow-100
  yellow800: '#92400e', // text-yellow-800
  yellow400: '#facc15', // border-yellow-400
  yellow500: '#eab308', // border-yellow-500
  
  blue100: '#dbeafe', // bg-blue-100
  blue800: '#1e40af', // text-blue-800
  blue500: '#3b82f6', // border-blue-500
  
  green100: '#d1fae5', // bg-green-100
  green800: '#065f46', // text-green-800
  green300: '#86efac', // bg-green-300
  green400: '#4ade80', // bg-green-400
  green500: '#22c55e', // border-green-500
  
  red50: '#fef2f2', // bg-red-50
  red200: '#fecaca', // border-red-200
  red600: '#dc2626', // text-red-600
  red700: '#b91c1c', // text-red-700
  red900: '#991b1b', // text-red-900
}
```

### Typography
- **Primary Font**: Poppins (Regular 400, Semibold 600, Bold 700)
- **Display Font**: Outfit (for headings)
- **Font Sizes**: Match web exactly
  - Headings: 4xl (36px), 3xl (30px), 2xl (24px), xl (20px)
  - Body: base (16px), sm (14px), xs (12px)

### Layout & Spacing
- **Container**: Max width with padding (match web's max-w-7xl)
- **Padding**: p-4 (16px), p-6 (24px), p-8 (32px)
- **Gap**: gap-4 (16px), gap-6 (24px), gap-8 (32px)
- **Border Radius**: rounded-lg (8px), rounded-xl (12px), rounded-2xl (16px)
- **Shadows**: shadow-md, shadow-lg (match web exactly)

## Core Features & Functionality

### 1. Authentication Screen
**Design:**
- White background (#ffffff)
- Centered login card with border and shadow
- **Restaurant Branding**: Display "Denver Kabob" logo/name at top (font-display, 2xl, bold)
- Subtitle: "Admin Dashboard" (gray-600)
- Black heading "Admin Login" (font-display, 3xl, bold)
- Password input field (black border, rounded-lg)
- Black "Login" button
- Error message display (red background, red text)

**Functionality:**
- Password: "admin123" (configurable via environment variable)
- Store authentication in AsyncStorage (key: 'denver-kabob-admin-authenticated')
- Auto-login if session exists (check on app start)
- Show error message for incorrect password

### 2. Main Dashboard Screen

#### Header Section
- **Restaurant Name**: "Denver Kabob" (font-display, 2xl, bold, gray-900) - Display prominently
- **Title**: "Admin Dashboard" (font-display, 4xl, bold, gray-900)
- **Subtitle**: "Last updated: [time] • [X] total orders" (small, gray-500)
- **Buttons** (right side):
  - "Test DB" button (blue background, blue text)
  - "Refresh" button (gray background, gray text)
  - "Logout" button (gray text)

#### Stats Cards (3 cards in a row)
Each card has:
- White background, rounded-lg, shadow-md
- Colored left border (4px)
- Icon on right (32px size)
- Small gray text label
- Large bold number (3xl)

**Cards:**
1. **Pending Orders** - Yellow border (#eab308), Clock icon, yellow-500 icon color
2. **Preparing** - Blue border (#3b82f6), ChefHat icon, blue-500 icon color
3. **Ready** - Green border (#22c55e), Package icon, green-500 icon color

#### Error Display
- Red background (#fef2f2)
- Red border (#fecaca)
- "Error Fetching Orders" heading (red-900, semibold)
- Error message text (red-700, small)
- X button to dismiss (red-600)

#### New Order Banner (if new orders exist)
- Yellow background (#fef3c7)
- Yellow border-2 (#facc15)
- Pulsing yellow dot
- "New order received!" text (yellow-900, semibold)
- X button to dismiss

#### Orders List
Each order card:
- White background, rounded-lg, shadow-md
- Colored left border (4px) based on status:
  - Pending: yellow-500
  - Preparing: blue-500
  - Ready: green-500
  - Completed: gray-500
- Hover effect: shadow-lg
- If new order: ring-2 ring-yellow-400, animate-pulse

**Order Card Content:**
1. **Top Row**:
   - Status icon (colored background matching status)
   - Order number: "Order #[numeric]" (font-display, xl, semibold, gray-900)
   - Date/time (small, gray-600)
   - Status badge (rounded-full, colored background)

2. **Customer Info**:
   - "Customer: [name]" (gray-700)
   - "Phone: [number]" with clickable phone icon (blue-600)
   - "Email: [email]" (if exists, gray-700)

3. **Items List**:
   - "Items:" heading (semibold, gray-900)
   - List of items: "[quantity]x [name] - $[price]" (small, gray-700)

4. **Total**:
   - "Total: $[amount]" (large, semibold, gray-900)

5. **Action Buttons** (based on status):
   - **Pending**: "Accept & Start Preparing" (green-500 background #22c55e, white text)
   - **Preparing**: "Mark Ready" (green-500 background #22c55e, white text)
   - **Ready**: "Complete Order" (gray-500 background #737373, white text)
   - **Call Customer** button (black background #000000, white text) - opens phone dialer

### 3. Full-Screen New Order Alert (CRITICAL FEATURE)

**When a new order arrives:**
- **Full-screen overlay** covering entire screen
- **Background**: Black with 80% opacity + backdrop blur
- **Z-index**: Highest (9999)
- **Animation**: Fade-in on appear

**Content (centered):**
- **Green Circle Animation**:
  - Large green circle (128px) with pulsing animation
  - Nested circles (96px, 64px) creating depth
  - CheckCircle icon (48px, white) in center
  - Pulsing rings around it (animate-ping effect)
  
- **Text**:
  - "NEW ORDER!" (6xl, bold, white, pulsing animation)
  - "Denver Kabob" (3xl, semibold, white/80) - Restaurant name
  - "Order #[number]" (4xl, semibold, green-300)
  - "Click anywhere to view" (2xl, white/90)
  - Small indicator: "Sound will continue until you click"

**Sound Behavior:**
- Play notification sound immediately
- Repeat sound every 2 seconds
- Sound continues until user clicks anywhere on the overlay
- Sound stops when alert is dismissed

**Dismissal:**
- Click anywhere on the overlay to dismiss
- Stops sound immediately
- Hides alert and shows dashboard

### 4. Real-Time Updates (CRITICAL - MUST BE INSTANT)
- **Aggressive Polling**: Fetch orders every **2-3 seconds** when authenticated (NOT 5 seconds - must be faster!)
- **Alternative**: Implement WebSocket connection for instant push notifications (preferred for real-time)
- **New Order Detection**: Compare order IDs to detect new orders immediately
- **Instant Alert**: Full-screen alert must appear within 1-2 seconds of order placement
- **Sound Notification**: Play sound immediately when new order detected
- **System Notification**: Show Android notification (if permission granted)
- **Visual Indicators**: Highlight new orders with yellow ring and pulse
- **Performance**: Use request deduplication to prevent multiple simultaneous requests
- **Background Polling**: Continue polling even when app is in background (if possible)

### 5. Order Status Management
- Update order status via PATCH request to `/api/orders/[id]`
- Status options: 'pending', 'preparing', 'ready', 'completed'
- Show loading state during update
- Refresh orders list after update
- Show error alert if update fails

## Complete TypeScript Type Definitions

### All Required Interfaces

```typescript
// Menu Item Interface
export interface MenuItem {
  id: string
  name: string
  description: string
  price: number
  category: 'Kabobs' | 'Rice Dishes' | 'Appetizers' | 'Drinks' | 'Desserts' | 'Sandwiches' | 'Combo Plates'
  image_url?: string
  created_at?: string
}

// Cart Item Interface
export interface CartItem {
  id: string
  name: string
  price: number
  quantity: number
  image_url?: string
  selectedOptions?: string[]
  selectedAddons?: Array<{ name: string; price: number }>
}

// Order Status Type
export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed'

// Order Item Interface
export interface OrderItem {
  id: string
  order_id: string
  menu_item_id: string
  menu_item_name: string
  quantity: number
  price: number
}

// Main Order Interface
export interface Order {
  id: string
  order_number: number  // Numeric order number (1000, 1001, etc.) - REQUIRED
  customer_name: string
  customer_first_name?: string
  customer_last_name?: string
  customer_phone: string
  customer_email?: string
  order_type?: 'pickup' | 'delivery'
  time_choice?: 'asap' | 'scheduled'
  scheduled_time?: string | null
  payment_method?: string
  tip_percent?: number | null
  tip_amount?: number | null
  comments?: string | null
  total_amount: number
  tax_amount: number
  status: OrderStatus
  created_at: string
  stripe_session_id?: string
  order_items: OrderItem[]
}

// Order Form Data Interface
export interface OrderFormData {
  name: string
  phone: string
  email?: string
}

// Status Configuration Interface
export interface StatusConfig {
  label: string
  color: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

// API Response Types
export interface OrdersResponse {
  orders: Order[]
}

export interface OrderUpdateResponse {
  order: Order
}

export interface OrderTestResponse {
  success: boolean
  database: string
  totalOrders: number
  recentOrders: Order[]
  errors?: {
    count?: string
    fetch?: string
  }
}

// App State Types
export interface AppState {
  orders: Order[]
  loading: boolean
  authenticated: boolean
  error: string
  fetchError: string | null
  hasNewOrder: boolean
  showNewOrderAlert: boolean
  newOrderNumber: number | null
  lastFetchTime: Date | null
}
```

## Backend Integration Options

### Option 1: Direct Supabase Integration (RECOMMENDED - Fastest & Real-Time)

**Use Supabase directly instead of API routes for instant updates!**

#### Supabase Configuration
- **Project URL**: `NEXT_PUBLIC_SUPABASE_URL` (e.g., `https://xxxxx.supabase.co`)
- **Anon Key**: `NEXT_PUBLIC_SUPABASE_ANON_KEY` (use anon key, NOT service role)
- **Package**: `@supabase/supabase-js` for React Native

#### Tables
- **`orders`** - Main orders table
- **`order_items`** - Order line items (nested in orders)

#### Schema Details
See `SUPABASE_ANDROID_SETUP.md` for complete schema, RLS policies, and implementation details.

#### Real-Time Subscriptions (CRITICAL for instant updates!)
```typescript
// Subscribe to new orders - INSTANT notifications!
const subscription = supabase
  .channel('orders')
  .on('postgres_changes', 
    { event: 'INSERT', schema: 'public', table: 'orders' }, 
    (payload) => {
      const newOrder = payload.new as Order
      // Show alert IMMEDIATELY - no polling delay!
      setShowNewOrderAlert(true)
      setNewOrderNumber(newOrder.order_number)
      playContinuousSound()
    }
  )
  .subscribe()
```

**Benefits:**
- ✅ Orders appear **INSTANTLY** (no 2-3 second delay)
- ✅ Real-time sync across devices
- ✅ No API server needed
- ✅ Better performance

### Option 2: Next.js API Routes (Fallback)

If you prefer to use the API routes:
- **Base URL**: Configurable via `API_BASE_URL` environment variable
- Example: `https://your-domain.com`
- All API calls: `${API_BASE_URL}/api/orders`
- **Note**: This requires polling every 2-3 seconds (slower than Supabase Realtime)

### Endpoints

#### 1. GET `/api/orders`
**Purpose**: Fetch all orders
**Response**:
```typescript
{
  orders: Order[]
}
```

**Order Interface**:
```typescript
interface Order {
  id: string
  order_number: number  // Numeric order number (1000, 1001, etc.)
  customer_name: string
  customer_phone: string
  customer_email?: string
  total_amount: number
  tax_amount: number
  status: 'pending' | 'preparing' | 'ready' | 'completed'
  created_at: string
  order_items: OrderItem[]
}

interface OrderItem {
  id: string
  order_id: string
  menu_item_id: string
  menu_item_name: string
  quantity: number
  price: number
}
```

#### 2. PATCH `/api/orders/[id]`
**Purpose**: Update order status
**Body**:
```typescript
{
  status: 'pending' | 'preparing' | 'ready' | 'completed'
}
```
**Response**:
```typescript
{
  order: Order
}
```

#### 3. GET `/api/orders/test`
**Purpose**: Test database connection
**Response**:
```typescript
{
  success: boolean
  database: string
  totalOrders: number
  recentOrders: Order[]
  errors?: {
    count?: string
    fetch?: string
  }
}
```

## Icons Required
Match these Lucide React icons exactly:
- `Clock` - For pending status
- `ChefHat` - For preparing status
- `Package` - For ready status
- `CheckCircle` - For completed status and new order alert
- `Phone` - For phone number display
- `X` - For close/dismiss buttons

Use React Native Vector Icons or similar library that provides equivalent icons.

## Animations & Interactions

### Required Animations
1. **Fade-in**: For full-screen alert (0.3s ease-in)
2. **Pulse**: For new order indicators (continuous)
3. **Ping**: For pulsing rings around green circle (continuous)
4. **Bounce**: For new order alert content (subtle)
5. **Spin**: For loading indicators

### Sound Implementation
- Use React Native Sound library or Expo AV
- Sound file: Generate 800Hz sine wave tone, 0.3 seconds duration
- Play sound every 2 seconds when new order alert is active
- Stop sound when alert is dismissed

## State Management

### Required State Variables (Complete TypeScript)
```typescript
const [orders, setOrders] = useState<Order[]>([])
const [loading, setLoading] = useState<boolean>(true)
const [password, setPassword] = useState<string>('')
const [authenticated, setAuthenticated] = useState<boolean>(false)
const [error, setError] = useState<string>('')
const [fetchError, setFetchError] = useState<string | null>(null)
const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
const [hasNewOrder, setHasNewOrder] = useState<boolean>(false)
const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set())
const [showNewOrderAlert, setShowNewOrderAlert] = useState<boolean>(false)
const [newOrderNumber, setNewOrderNumber] = useState<number | null>(null)
const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null)
```

### Refs (Complete TypeScript)
```typescript
const lastOrderCountRef = useRef<number>(0)
const lastOrderIdsRef = useRef<Set<string>>(new Set())
const audioIntervalRef = useRef<NodeJS.Timeout | null>(null)
const isFetchingRef = useRef<boolean>(false) // Prevent duplicate requests
```

### Status Configuration (Complete TypeScript)
```typescript
const statusConfig: Record<OrderStatus, StatusConfig> = {
  pending: { 
    label: 'Pending', 
    color: 'bg-yellow-100 text-yellow-800',
    icon: Clock 
  },
  preparing: { 
    label: 'Preparing', 
    color: 'bg-blue-100 text-blue-800',
    icon: ChefHat 
  },
  ready: { 
    label: 'Ready', 
    color: 'bg-green-100 text-green-800',
    icon: Package 
  },
  completed: { 
    label: 'Completed', 
    color: 'bg-gray-100 text-gray-800',
    icon: CheckCircle 
  },
}
```

### Restaurant Configuration
```typescript
const RESTAURANT_CONFIG = {
  name: 'Denver Kabob',
  tagline: 'Authentic Afghan Cuisine',
  phone: '+17205733605',
  address: '19245 E 56th Ave, Denver, CO 80249',
}
```

## Key Functions to Implement

### 1. Authentication
```typescript
const handleLogin = () => {
  if (password === ADMIN_PASSWORD) {
    setAuthenticated(true)
    saveSession(true) // AsyncStorage
    fetchOrders()
  } else {
    setError('Incorrect password')
  }
}

const checkSession = async () => {
  const session = await AsyncStorage.getItem('denver-kabob-admin-authenticated')
  if (session === 'true') {
    setAuthenticated(true)
    fetchOrders()
  } else {
    setLoading(false)
  }
}
```

### 2. Order Fetching - Supabase Direct (INSTANT REAL-TIME!)

#### Option A: Supabase Realtime Subscriptions (BEST - Instant!)
```typescript
useEffect(() => {
  if (!authenticated) return

  // Initial fetch
  fetchOrders()

  // Set up Supabase Realtime subscription for INSTANT updates
  const channel = supabase
    .channel('orders-realtime')
    .on('postgres_changes', 
      { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'orders' 
      }, 
      async (payload) => {
        // NEW ORDER - Show alert INSTANTLY (no delay!)
        const newOrder = payload.new as Order
        
        // Fetch full order with items
        const { data: fullOrder } = await supabase
          .from('orders')
          .select('*, order_items (*)')
          .eq('id', newOrder.id)
          .single()
        
        if (fullOrder) {
          setShowNewOrderAlert(true)
          setNewOrderNumber(fullOrder.order_number)
          setHasNewOrder(true)
          playContinuousSound()
          
          // Add to orders list
          setOrders(prev => [fullOrder, ...prev])
          
          // Android notification
          if (Platform.OS === 'android') {
            Notifications.scheduleNotificationAsync({
              content: {
                title: 'New Order - Denver Kabob',
                body: `Order #${fullOrder.order_number}`,
                sound: true,
                priority: 'high',
              },
              trigger: null,
            })
          }
        }
      }
    )
    .on('postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders'
      },
      async (payload) => {
        // Order status updated - refresh in list
        const updatedOrder = payload.new as Order
        const { data: fullOrder } = await supabase
          .from('orders')
          .select('*, order_items (*)')
          .eq('id', updatedOrder.id)
          .single()
        
        if (fullOrder) {
          setOrders(prev => 
            prev.map(o => o.id === fullOrder.id ? fullOrder : o)
          )
        }
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [authenticated])

// Fetch orders function (for initial load and manual refresh)
const fetchOrders = useCallback(async () => {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*, order_items (*)')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    
    setOrders(orders || [])
    setLastFetchTime(new Date())
    setFetchError(null)
  } catch (error: any) {
    setFetchError(error.message || 'Failed to fetch orders')
  } finally {
    setLoading(false)
  }
}, [])
```

#### Option B: Aggressive Polling (Fallback if Realtime doesn't work)
```typescript
const fetchOrders = useCallback(async () => {
  if (isFetchingRef.current) return
  isFetchingRef.current = true
  
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*, order_items (*)')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    
    // Detect new orders
    const currentOrderIds = new Set(orders?.map((o: Order) => o.id) || [])
    if (lastOrderIdsRef.current.size > 0) {
      const newIds = Array.from(currentOrderIds)
        .filter(id => !lastOrderIdsRef.current.has(id))
      
      if (newIds.length > 0) {
        const newOrders = orders?.filter((o: Order) => newIds.includes(o.id)) || []
        const newestOrder = newOrders[0]
        
        setShowNewOrderAlert(true)
        setNewOrderNumber(newestOrder?.order_number || null)
        playContinuousSound()
      }
    }
    
    lastOrderIdsRef.current = currentOrderIds
    setOrders(orders || [])
    setLastFetchTime(new Date())
  } catch (error: any) {
    setFetchError(error.message)
  } finally {
    setLoading(false)
    isFetchingRef.current = false
  }
}, [])

// Poll every 2-3 seconds (only if Realtime not available)
useEffect(() => {
  if (authenticated) {
    fetchOrders()
    const interval = setInterval(fetchOrders, 2500)
    return () => clearInterval(interval)
  }
}, [authenticated, fetchOrders])
```

### 3. Status Update - Supabase Direct
```typescript
const updateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
  try {
    // Validate status
    const validStatuses: OrderStatus[] = ['pending', 'preparing', 'ready', 'completed']
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`)
    }

    // Update directly in Supabase
    const { data, error } = await supabase
      .from('orders')
      .update({ 
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .select('*, order_items (*)')
      .single()

    if (error) throw error

    // Update in local state (Realtime will also trigger, but this is immediate)
    setOrders(prev => 
      prev.map(o => o.id === orderId ? data : o)
    )
  } catch (error: any) {
    Alert.alert('Error', error.message || 'Failed to update order status')
  }
}
```

### 4. Sound Management
```typescript
const playNotificationSound = () => {
  // Play 800Hz tone for 0.3 seconds
  // Use React Native Sound or Expo AV
}

const playContinuousSound = () => {
  playNotificationSound()
  audioIntervalRef.current = setInterval(() => {
    playNotificationSound()
  }, 2000)
}

const stopSound = () => {
  if (audioIntervalRef.current) {
    clearInterval(audioIntervalRef.current)
    audioIntervalRef.current = null
  }
}
```

## Build Requirements

### APK Generation
- Build a release APK file
- Sign the APK (can use debug signing for internal use)
- Optimize for Android tablets (large screens)
- Support Android 6.0+ (API level 23+)
- Test on Android tablet/emulator

### Environment Configuration

#### Option 1: Direct Supabase (RECOMMENDED)
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
ADMIN_PASSWORD=your_admin_password_here
```

#### Option 2: Next.js API Routes
```env
API_BASE_URL=https://your-domain.com
ADMIN_PASSWORD=your_admin_password_here
```

**Important**: 
- If using Supabase directly, you **don't need** `API_BASE_URL`
- Use Supabase Realtime for instant order notifications (much faster than polling)
- See `SUPABASE_ANDROID_SETUP.md` for complete setup instructions

## Testing Checklist

1. ✅ Login with correct password
2. ✅ Login with incorrect password (shows error)
3. ✅ Session persistence (close app, reopen, still logged in)
4. ✅ Fetch orders on load
5. ✅ Display orders correctly
6. ✅ Update order status
7. ✅ **New order appears within 2-3 seconds of placement (CRITICAL)**
8. ✅ Full-screen alert appears IMMEDIATELY on new order
9. ✅ Sound plays continuously until dismissed
10. ✅ Click alert to dismiss
11. ✅ Phone number opens dialer
12. ✅ Refresh button works
13. ✅ Logout clears session
14. ✅ Error handling displays correctly
15. ✅ Stats cards show correct counts
16. ✅ Order numbers display correctly (numeric)
17. ✅ **Real-time polling every 2-3 seconds (NOT 5 seconds)**
18. ✅ Restaurant name "Denver Kabob" displayed throughout app
19. ✅ No duplicate API requests (request deduplication works)
20. ✅ App remains responsive during polling

## Deliverables

1. **React Native project** (complete source code)
2. **APK file** (signed, ready to install)
3. **README.md** with:
   - Setup instructions
   - Build instructions
   - Environment variable configuration
   - Installation guide
4. **Package.json** with all dependencies
5. **TypeScript types** matching the Order interfaces

## Important Notes

- **EXACT MATCH**: The design must match the web version pixel-perfect
- **Colors**: Use exact hex codes provided
- **Typography**: Match font sizes and weights exactly
- **Spacing**: Match padding, margins, and gaps exactly
- **Animations**: All animations must match web behavior
- **Sound**: Must play continuously until dismissed
- **Full-Screen Alert**: This is the most critical feature - must work perfectly
- **Order Numbers**: Must display numeric order numbers (1000, 1001, etc.), not UUIDs
- **Tablet Optimized**: Layout should work well on Android tablets (iPad-sized screens)
- **REAL-TIME PERFORMANCE**: Orders must appear within 2-3 seconds maximum - this is CRITICAL
- **Restaurant Branding**: "Denver Kabob" must be displayed prominently throughout the app
- **TypeScript**: All code must be fully typed with the interfaces provided above
- **No Delays**: The app should feel instant - use aggressive polling (2-3 seconds) or WebSocket
- **Request Optimization**: Implement request deduplication to prevent multiple simultaneous API calls

## Success Criteria

The app is considered complete when:
1. All features match the web version exactly
2. Full-screen alert works with continuous sound
3. Real-time order updates work correctly
4. APK builds successfully and installs on Android device
5. All UI elements match the web design exactly
6. Order management functions work correctly
7. Session persistence works
8. Error handling is robust

---

**Start building the React Native Android app now, ensuring every detail matches the web version exactly!**
