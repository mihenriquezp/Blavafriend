import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Spinner } from '../components/ui'
import { api } from '../lib/api'
import type { Tool } from '../lib/types'

const storageKey = (id: string) => `blavafriend-tool-${id}`
const MAX_SAVED = 200_000 // characters kept per tool on this device

function loadSaved(id: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(storageKey(id)) ?? '{}') ?? {}
  } catch {
    return {}
  }
}

/**
 * The page runs in a sandbox with no access to the app's origin, where the
 * browser blocks localStorage. This stand-in keeps the tool's own saved values
 * (handed over by the app, sent back on every change) so choices survive a visit.
 */
function withStorageShim(html: string, saved: Record<string, string>) {
  const data = JSON.stringify(saved).replace(/</g, '\\u003c')
  const shim = `<script>(function(){var d=${data};function p(){parent.postMessage({bfToolStorage:d},'*')}
var s={getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v);p()},
removeItem:function(k){delete d[k];p()},clear:function(){d={};p()},key:function(i){var k=Object.keys(d);return i<k.length?k[i]:null},
get length(){return Object.keys(d).length}};try{Object.defineProperty(window,'localStorage',{value:s,configurable:true})}catch(e){}})();</script>`
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + shim)
  if (/^\s*<!doctype[^>]*>/i.test(html)) return html.replace(/^\s*<!doctype[^>]*>/i, (m) => m + shim)
  return shim + html
}

export default function ToolPage() {
  const { id = '' } = useParams()
  const [tool, setTool] = useState<Tool | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    let live = true
    Promise.all([api.listTools(), api.getToolHtml(id)]).then(
      ([list, h]) => {
        if (!live) return
        setTool(list.find((t) => t.id === id) ?? null)
        setHtml(h)
      },
      () => live && setError('This tool is no longer available.'),
    )
    return () => {
      live = false
    }
  }, [id])

  // Save what the tool stores, only from this tool's own frame.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return
      const data = (e.data as { bfToolStorage?: unknown } | null)?.bfToolStorage
      if (!data || typeof data !== 'object') return
      const text = JSON.stringify(data)
      if (text.length > MAX_SAVED) return
      try {
        localStorage.setItem(storageKey(id), text)
      } catch {
        /* storage full or blocked: the tool still works, just doesn't remember */
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [id])

  const srcDoc = useMemo(() => (html === null ? null : withStorageShim(html, loadSaved(id))), [html, id])

  if (error)
    return (
      <div className="space-y-3">
        <Link to="/" className="text-sm font-semibold text-oxford-500 hover:underline">
          ← Back
        </Link>
        <p className="text-gray-600">{error}</p>
      </div>
    )
  if (!srcDoc) return <Spinner />

  return (
    <div className="space-y-3">
      <Link to="/" className="text-sm font-semibold text-oxford-500 hover:underline">
        ← Back
      </Link>
      {tool && (
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-oxford-50 text-2xl" aria-hidden>
            {tool.icon}
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-2xl leading-tight font-bold text-oxford-900">{tool.title}</h1>
            {tool.description && <p className="text-sm text-gray-500">{tool.description}</p>}
          </div>
        </div>
      )}
      <iframe
        ref={frame}
        title={tool?.title ?? 'Tool'}
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
        className="h-[calc(100dvh-14rem)] min-h-[520px] w-full rounded-2xl bg-white ring-1 ring-gray-200"
      />
      <p className="text-xs text-gray-400">
        Runs in a secure sandbox: it can’t see your account or your data in Blavafriend. Anything it saves stays on this
        device.
      </p>
    </div>
  )
}
