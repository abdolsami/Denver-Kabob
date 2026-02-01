import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getAdminPassword = (): string => {
  // Server-only env var. Do NOT prefix with NEXT_PUBLIC_.
  const pw = process.env.ADMIN_PASSWORD
  if (!pw) {
    throw new Error('Missing ADMIN_PASSWORD environment variable')
  }
  return pw
}

const safeEqual = (a: string, b: string): boolean => {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const password = typeof body?.password === 'string' ? body.password : ''

    const expected = getAdminPassword()
    if (!password || !safeEqual(password, expected)) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
}

