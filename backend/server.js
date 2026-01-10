/**
 * Chatbot Async App - Backend Server
 * 
 * This server handles:
 * 1. POST /chat - Receives messages from React frontend, forwards to ModelRiver
 * 2. POST /webhook/modelriver - Receives webhook from ModelRiver, processes response
 * 
 * Data Flow:
 * React → /chat → ModelRiver (async) → /webhook/modelriver → callback → React (via WS)
 */

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 4000;

// ============================================
// Configuration
// ============================================

// ModelRiver API settings
const MODELRIVER_API_URL = process.env.MODELRIVER_API_URL || 'https://api.modelriver.com';
const MODELRIVER_API_KEY = process.env.MODELRIVER_API_KEY;

// This server's public URL (for webhook callback)
// In production, this would be your deployed backend URL
const BACKEND_PUBLIC_URL = process.env.BACKEND_PUBLIC_URL || `http://localhost:${PORT}`;

// ============================================
// In-Memory Storage (simulates database)
// ============================================

const conversations = new Map(); // channelId -> { messages: [], createdAt }
const pendingRequests = new Map(); // channelId -> { prompt, timestamp }

// ============================================
// Middleware
// ============================================

app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
    console.log(`\n📨 ${req.method} ${req.path}`);
    next();
});

// ============================================
// Routes
// ============================================

/**
 * POST /chat
 * 
 * Receives a chat message from the React frontend.
 * Forwards it to ModelRiver as an async request with a callback_url.
 * 
 * Request Body:
 * {
 *   "message": "User's message",
 *   "conversationId": "optional-existing-conversation-id"
 * }
 * 
 * Response:
 * {
 *   "channel_id": "...",
 *   "ws_token": "...",
 *   "websocket_url": "...",
 *   "websocket_channel": "..."
 * }
 */
app.post('/chat', async (req, res) => {
    try {
        const { message, conversationId, workflow } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        if (!MODELRIVER_API_KEY) {
            return res.status(500).json({
                error: 'MODELRIVER_API_KEY not configured. Set it in environment variables.'
            });
        }

        console.log('💬 Chat message received:', message);

        // Build the request payload for ModelRiver
        const payload = {
            workflow: workflow || 'mr_chatbot_workflow',
            messages: [
                { role: 'user', content: message }
            ],
            // Use websocket delivery so frontend can receive response directly
            delivery_method: 'websocket',
            // Explicitly tell ModelRiver where to send the webhook for this request
            webhook_url: `${BACKEND_PUBLIC_URL}/webhook/modelriver`,
            metadata: {
                conversation_id: conversationId || uuidv4(),
                original_prompt: message,
                timestamp: Date.now()
            }
        };

        console.log('🚀 Sending to ModelRiver:', MODELRIVER_API_URL);
        console.log('📦 Payload:', JSON.stringify(payload, null, 2));

        // Call ModelRiver async API
        const response = await axios.post(
            `${MODELRIVER_API_URL}/v1/ai/async`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${MODELRIVER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const { channel_id, ws_token, websocket_url, websocket_channel, project_id } = response.data;

        console.log('✅ ModelRiver response:', {
            channel_id,
            websocket_channel,
            websocket_url
        });

        // Store pending request for callback processing
        pendingRequests.set(channel_id, {
            prompt: message,
            timestamp: Date.now(),
            conversationId: conversationId || channel_id
        });

        // Return WebSocket connection details to frontend
        res.json({
            channel_id,
            ws_token,
            websocket_url,
            websocket_channel,
            project_id
        });

    } catch (error) {
        console.error('❌ Error in /chat:', error.response?.status, error.response?.data || error.message);
        console.error('❌ Full Error Details:', JSON.stringify(error.response?.data, null, 2));
        res.status(500).json({
            error: error.response?.data?.message || error.message,
            details: error.response?.data
        });
    }
});

/**
 * POST /webhook/modelriver
 * 
 * Receives webhook events from ModelRiver when AI response is ready.
 * Simulates saving to database by generating an ID.
 * Sends enriched data back to ModelRiver via callback_url if provided.
 * 
 * Webhook Payload:
 * {
 *   "channel_id": "...",
 *   "status": "success",
 *   "data": { ... },
 *   "meta": { ... }
 * }
 */
app.post('/webhook/modelriver', async (req, res) => {
    try {
        const { channel_id, status, data, meta } = req.body;
        const callbackUrl = req.headers['x-modelriver-callback-url'];

        console.log('\n📥 Webhook received from ModelRiver');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 Channel ID:', channel_id);
        console.log('📊 Status:', status);

        // Retrieve pending request info
        const pendingRequest = pendingRequests.get(channel_id) || {};
        const { prompt, conversationId } = pendingRequest;

        // ============================================
        // Simulate Database Save
        // ============================================

        // Generate a unique ID for this message (simulates DB auto-increment/UUID)
        const messageId = uuidv4();

        // Extract the AI response content
        const aiResponse = data?.choices?.[0]?.message?.content ||
            data?.response?.choices?.[0]?.message?.content ||
            JSON.stringify(data);

        // Create the enriched record (what would be saved to DB)
        const record = {
            id: messageId,
            prompt: prompt || 'Unknown prompt',
            response: aiResponse,
            created_at: new Date().toISOString(),
            channel_id,
            conversation_id: conversationId,
            usage: meta?.usage || data?.usage
        };

        console.log('💾 Simulated DB Save:', {
            id: record.id,
            prompt: record.prompt?.substring(0, 50) + '...',
            response: record.response?.substring(0, 50) + '...'
        });

        // Store in memory (simulates DB)
        if (!conversations.has(conversationId)) {
            conversations.set(conversationId, { messages: [], createdAt: new Date() });
        }
        conversations.get(conversationId).messages.push(record);

        // Clean up pending request
        pendingRequests.delete(channel_id);

        // ============================================
        // Send Callback Response (if callback_url provided)
        // ============================================

        if (callbackUrl) {
            console.log('📤 Sending callback to:', callbackUrl);

            try {
                await axios.post(callbackUrl, record, {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                console.log('✅ Callback sent successfully');
            } catch (callbackError) {
                console.error('❌ Callback failed:', callbackError.message);
            }
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Acknowledge webhook receipt
        res.json({
            success: true,
            message: 'Webhook processed',
            record_id: messageId
        });

    } catch (error) {
        console.error('❌ Error processing webhook:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /conversations/:id
 * 
 * Retrieve conversation history (from in-memory storage)
 */
app.get('/conversations/:id', (req, res) => {
    const conversation = conversations.get(req.params.id);

    if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json(conversation);
});

/**
 * GET /health
 * 
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        config: {
            modelriver_api_url: MODELRIVER_API_URL,
            backend_public_url: BACKEND_PUBLIC_URL,
            api_key_configured: !!MODELRIVER_API_KEY
        }
    });
});

// ============================================
// Start Server
// ============================================

app.listen(PORT, () => {
    console.log('\n🚀 Chatbot Async Backend');
    console.log('========================');
    console.log(`📡 Server running on http://localhost:${PORT}`);
    console.log(`💬 Chat endpoint: POST http://localhost:${PORT}/chat`);
    console.log(`📥 Webhook endpoint: POST http://localhost:${PORT}/webhook/modelriver`);
    console.log(`❤️  Health check: GET http://localhost:${PORT}/health`);
    console.log('');

    if (MODELRIVER_API_KEY) {
        console.log('✅ MODELRIVER_API_KEY is configured');
    } else {
        console.log('⚠️  MODELRIVER_API_KEY not set - set it in environment variables');
    }

    console.log('\nWaiting for requests...\n');
});
