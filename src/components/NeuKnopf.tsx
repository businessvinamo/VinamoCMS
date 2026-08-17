'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { legeEintragAn } from '@/app/t/[slug]/[type]/actions'

export function NeuKnopf({
  tenantSlug, typeKey, beschriftung,
}: { tenantSlug: string; typeKey: string; beschriftung: string }) {
  const router = useRouter()
  const [laeuft, starte] = useTransition()

  return (
    <button
      type="button"
      disabled={laeuft}
      onClick={() =>
        starte(async () => {
          const id = await legeEintragAn(tenantSlug, typeKey)
          router.push(`/t/${tenantSlug}/${typeKey}/${id}`)
        })
      }
    >
      {laeuft ? 'Wird angelegt …' : beschriftung}
    </button>
  )
}
