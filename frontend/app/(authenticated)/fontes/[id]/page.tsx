"use client"

import { use } from "react"
import { LegacyRedirect } from "@/components/shared/legacy-redirect"

export default function FonteLegacyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return <LegacyRedirect target="source" id={id} />
}
