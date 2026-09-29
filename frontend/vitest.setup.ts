import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

// RTL só registra o auto-cleanup quando existem globals de teste.
afterEach(cleanup)
