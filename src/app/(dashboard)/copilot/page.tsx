'use client'
import { useState, useRef, useEffect } from 'react'
import useSWR from 'swr'
import { Brain, Send, RefreshCw, Zap, Server, HardDrive, AlertTriangle, Plus, History } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface Message { role: 'user' | 'assistant'; content: string }

interface UsageResponse {
  today: {
    requests: number
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  allTime: {
    requests: number
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

interface HistoryEntry {
  id: string
  prompt: string
  createdAt: string
}

interface HistoryResponse {
  entries: HistoryEntry[]
}

const STARTER_QUESTIONS = [
  { icon: AlertTriangle, text: 'Which servers are at risk of failure?', color: 'text-red-400' },
  { icon: Zap, text: 'What\'s causing high temperatures in the datacenter?', color: 'text-orange-400' },
  { icon: HardDrive, text: 'Show storage capacity forecast for the next 30 days', color: 'text-blue-400' },
  { icon: Server, text: 'Summarise the current incidents and recommended actions', color: 'text-purple-400' },
  { icon: Brain, text: 'Which racks should I prioritise for maintenance this week?', color: 'text-green-400' },
]

export default function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { data: usage, mutate: refreshUsage } = useSWR<UsageResponse>('/api/copilot/usage', fetcher, { refreshInterval: 30000 })
  const { data: history, mutate: refreshHistory } = useSWR<HistoryResponse>('/api/copilot/history', fetcher, { refreshInterval: 30000 })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const todayUsage = usage?.today ?? { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  const allTimeUsage = usage?.allTime ?? { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  const historyEntries = history?.entries ?? []
  const historyCount = historyEntries.length

  function startNewChat() {
    setMessages([])
    setInput('')
    setShowHistory(false)
  }

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return
    const userMsg: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg] }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.message || data.error || 'No response' }])
      refreshUsage()
      refreshHistory()
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to connect to the AI copilot. Please check your settings.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] max-w-4xl mx-auto p-4 sm:p-6 gap-3">
      {/* Header / Usage */}
      <div className="rounded-xl border border-slate-800/60 bg-slate-950/55 px-4 py-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Brain size={15} className="text-purple-400 shrink-0" />
            <h2 className="text-sm font-semibold text-white truncate">AI Copilot</h2>
            <span className="text-[10px] text-slate-500 truncate">Datacenter operations assistant with configurable AI provider</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={startNewChat}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:bg-slate-800/70 hover:text-white"
            >
              <Plus size={13} />
              New
            </button>
            <button
              onClick={() => setShowHistory(v => !v)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors ${showHistory ? 'bg-slate-800/80 text-white' : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'}`}
            >
              <History size={13} />
              History
              <span className="ml-0.5 rounded-full bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">{historyCount}</span>
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
          <span className="text-emerald-400">✧</span>
          <span>Today: {todayUsage.requests} req / {todayUsage.totalTokens.toLocaleString()} tokens</span>
          <span>All time: {allTimeUsage.totalTokens.toLocaleString()} tokens</span>
        </div>
      </div>

      {showHistory && (
        <div className="rounded-xl border border-slate-800/60 bg-slate-950/55 p-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-slate-500">
            <span>History</span>
            <span>Past prompts</span>
          </div>
          <div className="mt-2 space-y-1.5">
            {historyEntries.length === 0 && (
              <div className="text-xs text-slate-500 py-2">No previous prompts yet.</div>
            )}
            {historyEntries.map(entry => (
              <button
                key={entry.id}
                onClick={() => {
                  setInput(entry.prompt)
                  setShowHistory(false)
                }}
                className="w-full rounded-lg border border-slate-800/70 bg-slate-900/45 px-3 py-2 text-left transition-colors hover:border-slate-700 hover:bg-slate-900/70"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-xs text-slate-200">{entry.prompt}</span>
                  <span className="shrink-0 text-[10px] text-slate-500">{new Date(entry.createdAt).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="space-y-4 pt-4">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center mx-auto mb-3">
                <Brain size={22} className="text-purple-400" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">VynDC AI Copilot</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">Ask anything about your datacenter — servers, incidents, predictions, power, or storage.</p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Brain size={13} className="text-purple-400" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl p-3 text-xs leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-orange-500/20 text-orange-100 border border-orange-500/30'
                : 'bg-[#111827] border border-slate-800/60 text-slate-300'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0">
              <Brain size={13} className="text-purple-400" />
            </div>
            <div className="bg-[#111827] border border-slate-800/60 rounded-2xl p-3 text-xs text-slate-500 flex items-center gap-2">
              <RefreshCw size={11} className="animate-spin" /> Thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 space-y-2 border-t border-slate-800/60 bg-slate-950/40 pt-3 backdrop-blur-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {STARTER_QUESTIONS.map((q, i) => (
            <button key={i} onClick={() => sendMessage(q.text)} disabled={loading}
              className="flex items-start gap-3 p-3 rounded-xl bg-[#111827] border border-slate-800/60 hover:border-slate-700 text-left transition-colors group disabled:opacity-40">
              <q.icon size={14} className={`${q.color} mt-0.5 shrink-0`} />
              <span className="text-xs text-slate-400 group-hover:text-slate-300">{q.text}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage(input))}
            placeholder="Ask about your datacenter..."
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/60 disabled:opacity-50"
          />
          <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading}
            className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors">
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
