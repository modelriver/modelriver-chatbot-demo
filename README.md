# Chatbot Async App

A full-stack chatbot application using React (frontend) and Node.js/Express (backend), integrated with ModelRiver for AI responses.

## Features

- 💬 Real-time chat interface with modern dark theme
- 🚀 Async AI processing via ModelRiver
- 🔌 WebSocket-based response delivery
- 📥 Webhook endpoint for ModelRiver callbacks
- 💾 In-memory message storage (simulates database)

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   React     │────▶│   Backend   │────▶│ ModelRiver  │
│  Frontend   │     │  (Express)  │     │    API      │
└─────────────┘     └─────────────┘     └─────────────┘
       ▲                   ▲                   │
       │                   │                   │
       │                   └───────────────────┘
       │                   (Webhook callback)
       │
       └───────────────────────────────────────┐
                                               │
                                        (WebSocket)
                                               │
                                        ┌──────┴──────┐
                                        │ ModelRiver  │
                                        │  WebSocket  │
                                        └─────────────┘
```

## Data Flow

1. **User** types message in React app
2. **React** sends POST to `/chat` on backend
3. **Backend** forwards to ModelRiver `/api/v1/ai/async`
4. **ModelRiver** returns WebSocket connection details
5. **Backend** returns WS details to React
6. **React** connects to ModelRiver WebSocket
7. **ModelRiver** processes request, sends webhook to backend
8. **Backend** simulates DB save (assigns ID)
9. **ModelRiver** sends response via WebSocket
10. **React** displays AI response in chat

## Quick Start

### Prerequisites

- Node.js 16+
- ModelRiver API Key

### 1. Install Backend Dependencies

```bash
cd backend
npm install
```

### 2. Install Frontend Dependencies

```bash
cd frontend
npm install
```

### 3. Set Environment Variables

```bash
# In backend directory
export MODELRIVER_API_KEY=mr_live_YOUR_API_KEY_HERE
```

### 4. Start Backend Server

```bash
cd backend
npm start
```

Backend will run on `http://localhost:4000`

### 5. Start Frontend Dev Server

```bash
cd frontend
npm run dev
```

Frontend will run on `http://localhost:3006`

### 6. Open Browser

Navigate to `http://localhost:3006` and start chatting!

## API Endpoints

### Backend

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/chat` | POST | Send a chat message, returns WebSocket details |
| `/webhook/modelriver` | POST | Receives webhooks from ModelRiver |
| `/conversations/:id` | GET | Get conversation history |
| `/health` | GET | Health check |

### Request Example

```bash
curl -X POST http://localhost:4000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, how are you?"}'
```

### Workflow Configuration

By default, the application connects to the workflow named `mr_chatbot_workflow`. You can override this by sending a `workflow` parameter in the `/chat` request body:

```bash
curl -X POST http://localhost:4000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello", 
    "workflow": "custom-workflow-name"
  }'
```

## Environment Variables

### Backend

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend server port | `4000` |
| `MODELRIVER_API_KEY` | Your ModelRiver API key | Required |
| `MODELRIVER_API_URL` | ModelRiver API URL | `https://api.modelriver.com` |
| `BACKEND_PUBLIC_URL` | Public URL for webhook callbacks | `http://localhost:4000` |

## Project Structure

```
/Chatbot-async-app
├── /backend
│   ├── server.js        # Express server with /chat and /webhook endpoints
│   └── package.json
├── /frontend
│   ├── /src
│   │   ├── App.jsx      # Main chat component
│   │   ├── App.css      # Chat UI styles
│   │   ├── index.css    # Global styles
│   │   └── main.jsx     # React entry point
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── README.md
```

## Webhook Flow (Detailed)

When ModelRiver completes an AI request:

1. ModelRiver POSTs to `/webhook/modelriver`
2. Backend extracts the AI response
3. Backend generates a unique ID (simulates DB save)
4. Backend creates enriched record:
   ```json
   {
     "id": "generated-uuid",
     "prompt": "user input",
     "response": "AI output",
     "created_at": "timestamp"
   }
   ```
5. If `callback_url` header is present, backend sends record back to ModelRiver

## License

MIT
