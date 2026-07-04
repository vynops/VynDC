'use client'
import { useState, useRef, useEffect } from 'react'
import useSWR from 'swr'
import { Brain, Send, RefreshCw, Zap, Server, HardDrive, AlertTriangle } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface Message { role: 'user' | 'assistant'; content: string }

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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { data: usage, mutate: refreshUsage } = useSWR('/api/copilot/usage', fetcher, { refreshInterval: 30000 })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to connect to the AI copilot. Please check your settings.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] max-w-4xl mx-auto p-4 sm:p-6 gap-4">
      {/* Header / Usage */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-purple-400" />
          <h2 className="text-sm font-bold text-white">AI DataCenter Copilot</h2>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/20 text-purple-400 border border-purple-500/30">Powered by Groq</span>
        </div>
        {usage && (
          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            <span>Today: {usage.today.requests} req</span>
            <span>{(usage.today.promptTokens + usage.today.completionTokens).toLocaleString()} tokens</span>
          </div>
        )}
      </div>

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

        {/* Starter prompts — always visible */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {STARTER_QUESTIONS.map((q, i) => (
            <button key={i} onClick={() => sendMessage(q.text)} disabled={loading}
              className="flex items-start gap-3 p-3 rounded-xl bg-[#111827] border border-slate-800/60 hover:border-slate-700 text-left transition-colors group disabled:opacity-40">
              <q.icon size={14} className={`${q.color} mt-0.5 shrink-0`} />
              <span className="text-xs text-slate-400 group-hover:text-slate-300">{q.text}</span>
            </button>
          ))}
        </div>

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
      <div className="flex gap-2 shrink-0">
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
  )
}
