import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Components } from "react-markdown"

const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-words font-medium text-teal-700 underline underline-offset-2 hover:text-teal-900"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-slate-800">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => <h1 className="mt-3 mb-1.5 text-base font-semibold text-slate-900">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-3 mb-1.5 text-sm font-semibold text-slate-900">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-2.5 mb-1 text-sm font-semibold text-slate-900">{children}</h3>,
  h4: ({ children }) => (
    <h4 className="mt-2 mb-1 text-xs font-semibold tracking-wide text-slate-700 uppercase">
      {children}
    </h4>
  ),
  h5: ({ children }) => <h5 className="mt-2 mb-1 text-xs font-semibold text-slate-700">{children}</h5>,
  h6: ({ children }) => (
    <h6 className="mt-2 mb-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
      {children}
    </h6>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-outside list-disc space-y-1 pl-5 marker:text-slate-400">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-outside list-decimal space-y-1 pl-5 marker:text-slate-400">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="[&_p]:mb-0 [&_ol]:my-1 [&_ul]:my-1 marker:font-medium">{children}</li>
  ),
  code: ({ children }) => (
    <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] break-words text-slate-800">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100 [&_code]:block [&_code]:bg-transparent [&_code]:px-0 [&_code]:py-0 [&_code]:text-inherit [&_code]:whitespace-pre">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-teal-300 pl-3 text-slate-500 italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-slate-200" />,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-100 text-left">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-slate-200 px-2 py-1.5 font-semibold text-slate-700">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-slate-100 px-2 py-1.5 align-top text-slate-700 last:border-b-0">
      {children}
    </td>
  ),
}

/**
 * Renderiza a resposta do Copiloto como Markdown (com GFM: tabelas, títulos,
 * listas). Não usa `dangerouslySetInnerHTML` nem `rehype-raw`: HTML vindo do
 * LLM nunca vira elemento no DOM.
 */
export function CopilotMarkdown({ children }: { children: string }) {
  return (
    <div className="break-words [&>*:first-child]:mt-0 [&>*:first-child]:mb-0 [&>*:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
