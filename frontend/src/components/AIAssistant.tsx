import { useState, useRef, useEffect } from 'react'
import { aiApi } from '../services/api'
import { FilterState } from '../App'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  open: boolean
  onClose: () => void
  filters: FilterState
}

const SUGGESTIONS = [
  'Who spends the most time on email triage?',
  'What is the highest-ROI automation next quarter?',
  'Which department wastes the most money on repetitive tasks?',
  'Show everyone with rep share going up week-over-week.',
  'How much does Finance spend on Invoice Processing?',
]

const WELCOME = `Hello! I'm your Workforce Pulse AI assistant, grounded in your normalized employee activity data (Oct 6–24, 2025).

I can answer questions like:
- **"Who in Finance is spending the most time on email triage?"**
- **"What's our single highest-ROI automation opportunity?"**
- **"Break down repetitive tasks by department"**

Every number I give you is traceable to the dataset. Ask me anything! 🎯`

export default function AIAssistant({ open, onClose, filters }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: WELCOME }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, open])

  const sendMessage = async (text?: string) => {
    const content = text || input.trim()
    if (!content || loading) return

    setInput('')
    setError(null)

    const userMsg: Message = { role: 'user', content }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setLoading(true)

    // Add empty assistant message to stream into
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      const response = await aiApi.streamChat(
        updatedMessages.map(m => ({ role: m.role, content: m.content }))
      )

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) throw new Error('No response body')

      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') break
          if (!raw) continue

          try {
            const parsed = JSON.parse(raw)
            if (parsed.error) {
              setError(parsed.error)
              break
            }
            if (parsed.content) {
              accumulated += parsed.content
              setMessages(prev => {
                const next = [...prev]
                next[next.length - 1] = { role: 'assistant', content: accumulated }
                return next
              })
            }
          } catch {
            // ignore malformed chunks
          }
        }
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Unknown error'
      setError(`Failed to get response: ${errMsg}`)
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = {
          role: 'assistant',
          content: '⚠️ I encountered an error. Please try again.',
        }
        return next
      })
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function renderContent(content: string) {
    // Simple markdown: bold, code, line breaks
    return content
      .split('\n')
      .map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
        return (
          <span key={i}>
            {parts.map((part, j) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={j}>{part.slice(2, -2)}</strong>
              }
              if (part.startsWith('`') && part.endsWith('`')) {
                return <code key={j}>{part.slice(1, -1)}</code>
              }
              return part
            })}
            {i < content.split('\n').length - 1 && <br />}
          </span>
        )
      })
  }

  return (
    <div className={`ai-panel ${open ? 'open' : ''}`} role="complementary" aria-label="AI Assistant">
      <div className="ai-header">
        <div className="ai-title-row">
          <div className="ai-avatar">🤖</div>
          <div>
            <div className="ai-name">Pulse AI</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <div className="ai-status-dot" />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {loading ? 'Thinking...' : 'Online · Groq llama-3.3-70b'}
              </span>
            </div>
          </div>
        </div>
        <button className="ai-close" onClick={onClose}>✕ Close</button>
      </div>

      <div className="ai-messages" id="ai-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`ai-message ${msg.role}`}>
            <div className={`msg-avatar ${msg.role}`}>
              {msg.role === 'assistant' ? '🤖' : '👤'}
            </div>
            <div className={`msg-bubble ${msg.role === 'assistant' ? 'ai' : 'user'}`}>
              {msg.content === '' && loading && i === messages.length - 1 ? (
                <div className="loading-dots">
                  <span /><span /><span />
                </div>
              ) : (
                renderContent(msg.content)
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div style={{
          margin: '0 16px 8px',
          padding: '8px 12px',
          background: 'rgba(248,113,113,0.1)',
          border: '1px solid rgba(248,113,113,0.25)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--accent-danger)',
        }}>
          ⚠️ {error}
        </div>
      )}

      {messages.length === 1 && (
        <div className="ai-suggestions">
          {SUGGESTIONS.map((s, i) => (
            <button key={i} className="ai-suggestion" onClick={() => sendMessage(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="ai-input-area">
        <textarea
          ref={textareaRef}
          id="ai-input"
          className="ai-input"
          placeholder="Ask about your workforce data..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          rows={1}
        />
        <button
          id="ai-send-btn"
          className="ai-send-btn"
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
          title="Send (Enter)"
        >
          {loading ? '⏳' : '↑'}
        </button>
      </div>
    </div>
  )
}
