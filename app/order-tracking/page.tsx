import { Suspense } from 'react'
import OrderTrackingClient from './OrderTrackingClient'

export const dynamic = 'force-dynamic'

export default function OrderTrackingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 pt-24 sm:pt-28 pb-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-white rounded-xl shadow-sm p-6 text-center text-gray-700">
              Loading…
            </div>
          </div>
        </div>
      }
    >
      <OrderTrackingClient />
    </Suspense>
  )
}
