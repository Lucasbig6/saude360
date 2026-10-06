"use client"

import { use } from "react"
import { LegacyRedirect } from "@/components/shared/legacy-redirect"

export default function AnaliseLegacyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return <LegacyRedirect target="analysis" id={id} />
}
