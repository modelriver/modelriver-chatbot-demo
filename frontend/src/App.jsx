/**
 * Chatbot Async App - Main React Component
 * 
 * This component provides a chat interface that:
 * 1. Sends messages to the backend (/chat endpoint)
 * 2. Receives WebSocket connection details
 * 3. Connects to ModelRiver WebSocket to receive AI responses
 * 
 * Data Flow:
 * User Message → Backend → ModelRiver → WebSocket → This Component
 */

import { useState, useRef, useEffect } from 'react'
import './App.css'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

// Backend API URL
const BACKEND_URL = 'http://localhost:4001'

function App() {
    // ============================================
    // State
    // ============================================

    const [messages, setMessages] = useState([])
    const [inputValue, setInputValue] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [connectionStatus, setConnectionStatus] = useState('disconnected')
    const [error, setError] = useState(null)
    const [devMode, setDevMode] = useState(false)

    // Refs
    const messagesEndRef = useRef(null)
    const wsRef = useRef(null)

    // ============================================
    // Auto-scroll to bottom when new messages arrive
    // ============================================

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    // Cleanup WebSocket on unmount
    useEffect(() => {
        return () => {
            if (wsRef.current) {
                wsRef.current.close()
            }
        }
    }, [])

    // ============================================
    // WebSocket Connection Handler
    // ============================================

    const connectWebSocket = (wsToken, websocketUrl, websocketChannel) => {
        // Phoenix channels often expect /websocket at the end of the URL
        let url = websocketUrl
        // Normalize URL: Ensure wss:// for production/443
        if (url.includes(":443") || url.includes("api.modelriver.com")) {
            url = url.replace("ws://", "wss://").replace(":443", "")
        }
        if (url.endsWith('/socket')) {
            url = `${url}/websocket`
        }

        // Construct WebSocket URL with encoded token
        const wsUrl = `${url}?token=${encodeURIComponent(wsToken)}`

        console.log('🔌 Connecting to WebSocket:', wsUrl)
        setConnectionStatus('connecting')

        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
            console.log('✅ WebSocket connected')
            setConnectionStatus('connected')

            // Join the channel using Phoenix protocol
            const joinMsg = JSON.stringify({
                topic: websocketChannel,
                event: 'phx_join',
                payload: {},
                ref: '1'
            })
            ws.send(joinMsg)
            console.log('📤 Joined channel:', websocketChannel)
        }

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data)
            console.log('📥 WebSocket message:', msg)

            // Handle different message types
            if (msg.event === 'ai_response_complete' || msg.event === 'response') {
                const payload = msg.payload

                // Check if this is actually an error response (status: 'error' in payload or data)
                const isError = payload?.status === 'error' || payload?.data?.status === 'error'

                if (isError) {
                    // Extract error message from various possible locations
                    const errorMessage =
                        payload?.error?.message ||
                        payload?.data?.error?.message ||
                        payload?.message ||
                        payload?.data?.message ||
                        'AI request failed'

                    console.log('❌ Error in response:', errorMessage)
                    setError(errorMessage)
                    setMessages(prev => [...prev, {
                        id: Date.now(),
                        role: 'assistant',
                        content: `❌ Error: ${errorMessage}`,
                        timestamp: new Date().toISOString(),
                        isError: true
                    }])
                    setIsLoading(false)
                    setConnectionStatus('error')
                    if (ws._timeoutId) clearTimeout(ws._timeoutId)
                    ws.close()
                    return
                }

                // Extract AI response from payload (success case)
                const aiContent =
                    payload?.response?.choices?.[0]?.message?.content ||
                    payload?.data?.choices?.[0]?.message?.content ||
                    payload?.choices?.[0]?.message?.content ||
                    JSON.stringify(payload)

                // Extract metadata if available
                const meta = payload?.meta || payload?.data?.meta || {}
                const usage = payload?.usage || payload?.data?.usage || {}
                const model = meta.requested_model || meta.model || 'unknown'

                // Add assistant message to chat
                setMessages(prev => [...prev, {
                    id: Date.now(),
                    role: 'assistant',
                    content: aiContent,
                    timestamp: new Date().toISOString(),
                    meta: {
                        ...meta,
                        ...usage,
                        model,
                        channelId: msg.topic
                    }
                }])

                setIsLoading(false)
                setConnectionStatus('disconnected')
                if (ws._timeoutId) clearTimeout(ws._timeoutId)
                ws.close()
            }

            if (msg.event === 'ai_response_error' || msg.event === 'error') {
                const errorMessage = msg.payload?.error || msg.payload?.message || 'Unknown error occurred'
                setError(errorMessage)
                // Add error message to chat so user can see it inline
                setMessages(prev => [...prev, {
                    id: Date.now(),
                    role: 'assistant',
                    content: `❌ Error: ${errorMessage}`,
                    timestamp: new Date().toISOString(),
                    isError: true
                }])
                setIsLoading(false)
                setConnectionStatus('error')
                if (ws._timeoutId) clearTimeout(ws._timeoutId)
                ws.close()
            }

            // Handle step updates (optional - for showing progress)
            if (msg.event === 'step') {
                console.log('📊 Step update:', msg.payload)
            }
        }

        ws.onerror = (error) => {
            console.error('❌ WebSocket error:', error)
            setError('WebSocket connection failed')
            setConnectionStatus('error')
            setIsLoading(false)
        }

        ws.onclose = (event) => {
            console.log('🔌 WebSocket disconnected', event.code, event.reason)
            // If we're still loading when the socket closes, it means we didn't get a response
            if (isLoading) {
                const errorMessage = event.reason || 'Connection closed before response was received'
                setError(errorMessage)
                // Add error message to chat so it's visible inline
                setMessages(prev => [...prev, {
                    id: Date.now(),
                    role: 'assistant',
                    content: `❌ Error: ${errorMessage}`,
                    timestamp: new Date().toISOString(),
                    isError: true
                }])
                setIsLoading(false)
            }
            if (connectionStatus !== 'error') {
                setConnectionStatus('disconnected')
            }
        }

        // Timeout: If no response after 2 minutes, show error
        const timeoutId = setTimeout(() => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                console.log('⏰ WebSocket timeout - no response received')
                setError('Request timed out - no response received')
                setMessages(prev => [...prev, {
                    id: Date.now(),
                    role: 'assistant',
                    content: '❌ Error: Request timed out - no response received',
                    timestamp: new Date().toISOString(),
                    isError: true
                }])
                setIsLoading(false)
                setConnectionStatus('error')
                ws.close()
            }
        }, 120000) // 2 minute timeout

        // Store timeout ref for cleanup
        ws._timeoutId = timeoutId
    }

    // ============================================
    // Send Message Handler
    // ============================================

    const sendMessage = async () => {
        if (!inputValue.trim() || isLoading) return

        const userMessage = inputValue.trim()
        setInputValue('')
        setError(null)
        setIsLoading(true)

        // Add user message to chat immediately
        setMessages(prev => [...prev, {
            id: Date.now(),
            role: 'user',
            content: userMessage,
            timestamp: new Date().toISOString()
        }])

        try {
            // Step 1: Send message to backend
            console.log('📤 Sending message to backend...')

            const response = await fetch(`${BACKEND_URL}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: userMessage
                })
            })

            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.error || `HTTP ${response.status}`)
            }

            const data = await response.json()
            console.log('✅ Backend response:', data)

            // Step 2: Connect to WebSocket to receive AI response
            const { ws_token, websocket_url, websocket_channel } = data

            if (!ws_token || !websocket_url || !websocket_channel) {
                throw new Error('Missing WebSocket connection details from backend')
            }

            connectWebSocket(ws_token, websocket_url, websocket_channel)

        } catch (err) {
            console.error('❌ Error sending message:', err)
            setError(err.message)
            setIsLoading(false)
        }
    }

    // ============================================
    // Handle Enter Key
    // ============================================

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    // ============================================
    // Render
    // ============================================

    return (
        <div className="chat-container">
            {/* Header */}
            <header className="chat-header">
                <div className="header-left">
                    <h1>💬 Chatbot Async App</h1>
                    <div className={`connection-status ${connectionStatus}`}>
                        <span className="status-dot"></span>
                        <span className="status-text">
                            {connectionStatus === 'connecting' ? 'Connecting...' :
                                connectionStatus === 'connected' ? 'Connected' :
                                    connectionStatus === 'error' ? 'Error' : 'Disconnected'}
                        </span>
                    </div>
                </div>
                <div className="header-right">
                    <label className="dev-mode-toggle">
                        <input
                            type="checkbox"
                            checked={devMode}
                            onChange={(e) => setDevMode(e.target.checked)}
                        />
                        <span className="slider"></span>
                        <span className="label-text">Dev Mode</span>
                    </label>
                </div>
            </header>

            {/* Messages */}
            <div className="messages-container">
                {messages.length === 0 ? (
                    <div className="empty-state">
                        <p>👋 Send a message to start chatting!</p>
                        <p className="hint">Your messages are processed through ModelRiver's async API</p>
                    </div>
                ) : (
                    messages.map((message) => (
                        <div
                            key={message.id}
                            className={`message ${message.role}${message.isError ? ' error' : ''}`}
                        >
                            <div className="message-avatar">
                                {message.role === 'user' ? '👤' : message.isError ? '⚠️' : '🤖'}
                            </div>
                            <div className="message-content">
                                <div className="message-text">
                                    {message.role === 'assistant' && !message.isError ? (
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                                code({ node, inline, className, children, ...props }) {
                                                    const match = /language-(\w+)/.exec(className || '')
                                                    return !inline && match ? (
                                                        <SyntaxHighlighter
                                                            style={vscDarkPlus}
                                                            language={match[1]}
                                                            PreTag="div"
                                                            {...props}
                                                        >
                                                            {String(children).replace(/\n$/, '')}
                                                        </SyntaxHighlighter>
                                                    ) : (
                                                        <code className={className} {...props}>
                                                            {children}
                                                        </code>
                                                    )
                                                }
                                            }}
                                        >
                                            {message.content}
                                        </ReactMarkdown>
                                    ) : (
                                        message.content
                                    )}
                                </div>
                                {devMode && message.meta && (
                                    <div className="message-metadata">
                                        <div className="meta-item">🆔 {message.meta.channelId?.slice(0, 8)}...</div>
                                        <div className="meta-item">🤖 {message.meta.model}</div>
                                        {message.meta.duration_ms && (
                                            <div className="meta-item">⏱️ {message.meta.duration_ms}ms</div>
                                        )}
                                    </div>
                                )}
                                <div className="message-time">
                                    {new Date(message.timestamp).toLocaleTimeString()}
                                </div>
                            </div>
                        </div>
                    ))
                )}

                {/* Loading indicator */}
                {isLoading && (
                    <div className="message assistant loading">
                        <div className="message-avatar">🤖</div>
                        <div className="message-content">
                            <div className="typing-indicator">
                                <span></span>
                                <span></span>
                                <span></span>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Error Display */}
            {error && (
                <div className="error-banner">
                    ⚠️ {error}
                    <button onClick={() => setError(null)}>✕</button>
                </div>
            )}

            {/* Input Area */}
            <div className="input-container">
                <textarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type your message..."
                    disabled={isLoading}
                    rows={Math.min(5, Math.max(1, inputValue.split('\n').length))}
                />
                <button
                    onClick={sendMessage}
                    disabled={isLoading || !inputValue.trim()}
                    className="send-button"
                >
                    {isLoading ? '⏳' : '📤'}
                </button>
            </div>
        </div>
    )
}

export default App
