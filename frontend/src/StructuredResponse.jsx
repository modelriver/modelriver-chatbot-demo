/**
 * StructuredResponse Component
 * 
 * Displays AI-generated structured responses in a user-friendly format
 * with sentiment indicators, confidence scores, topics, and action items.
 */

import React from 'react';
import './StructuredResponse.css';
import {
    CheckCircle2,
    AlertTriangle,
    Info,
    HelpCircle,
    TrendingUp,
    List,
    MessageSquare,
    FileText,
    Tag,
    Check
} from 'lucide-react';

const StructuredResponse = ({ data }) => {
    // Parse data if it's a string
    const parsedData = typeof data === 'string' ? JSON.parse(data) : data;

    // Extract the actual data object (it might be nested in response.data)
    const responseData = parsedData.data || parsedData;

    // Debug logging
    console.log('🔍 StructuredResponse data:', { parsedData, responseData });

    const {
        summary,
        sentiment,
        confidence,
        topics = [],
        action_items = [],
        message, // The actual message content from the AI
        reply // The AI's reply/answer to the user's question
    } = responseData;

    // Sentiment icon mapping
    const getSentimentIcon = (sentiment) => {
        const sentimentMap = {
            'positive': <CheckCircle2 size={24} className="text-emerald-400" />,
            'neutral': <Info size={24} className="text-blue-400" />,
            'negative': <AlertTriangle size={24} className="text-rose-400" />,
            'mixed': <HelpCircle size={24} className="text-amber-400" />
        };
        return sentimentMap[sentiment?.toLowerCase()] || <MessageSquare size={24} />;
    };

    // Confidence color mapping
    const getConfidenceColor = (confidence) => {
        if (confidence >= 0.8) return '#10b981'; // Emerald 500
        if (confidence >= 0.6) return '#f59e0b'; // Amber 500
        return '#ef4444'; // Red 500
    };

    // Priority icon mapping
    const getPriorityIcon = (priority) => {
        // Just use a dot with color for now, managed via CSS classes
        return <div className={`priority-dot priority-${priority?.toLowerCase()}`} />;
    };

    return (
        <div className="structured-response">
            {/* Header with Sentiment and Confidence */}
            <div className="response-header">
                <div className="sentiment-indicator">
                    {getSentimentIcon(sentiment)}
                    <span className="sentiment-label">{sentiment || 'neutral'}</span>
                </div>
                {confidence !== undefined && (
                    <div className="confidence-indicator">
                        <div className="confidence-bar-container">
                            <div
                                className="confidence-bar"
                                style={{
                                    width: `${confidence * 100}%`,
                                    backgroundColor: getConfidenceColor(confidence)
                                }}
                            />
                        </div>
                        <span className="confidence-label">
                            <TrendingUp size={14} />
                            {(confidence * 100).toFixed(0)}%
                        </span>
                    </div>
                )}
            </div>

            {/* Reply - Main AI Response */}
            {reply && (
                <div className="response-reply">
                    <p>{reply}</p>
                </div>
            )}

            {/* Message Content */}
            {message && (
                <div className="response-message">
                    <h4><MessageSquare size={16} /> Status</h4>
                    <p>{message}</p>
                </div>
            )}

            {/* Summary */}
            {summary && (
                <div className="response-summary">
                    <h4><FileText size={16} /> Summary</h4>
                    <p>{summary}</p>
                </div>
            )}

            {/* Topics */}
            {topics.length > 0 && (
                <div className="response-topics">
                    <h4><Tag size={16} /> Topics</h4>
                    <div className="topics-list">
                        {topics.map((topic, index) => (
                            <span key={index} className="topic-tag">
                                {topic}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Action Items */}
            {action_items.length > 0 && (
                <div className="response-actions">
                    <h4><List size={16} /> Action Items</h4>
                    <ul className="actions-list">
                        {action_items.map((item, index) => (
                            <li key={index} className={`action-item priority-${item.priority?.toLowerCase()}`}>
                                <div className="action-checkbox">
                                    <Check size={14} />
                                </div>
                                <span className="action-text">{item.task}</span>
                                <span className={`priority-badge ${item.priority?.toLowerCase()}`}>
                                    {item.priority}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default StructuredResponse;
