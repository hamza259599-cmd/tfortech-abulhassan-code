import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FaRobot, FaTimes, FaPaperPlane } from "react-icons/fa";

import "./AIChatbot.css";

const API_URL = (
  process.env.REACT_APP_BACKEND_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const STORAGE_KEY = "tfortech_ai_chat_history";

const WELCOME = {
  role: "assistant",
  content:
    "Assalam o Alaikum! 👋 I'm the T For Tech AI assistant. Tell me your budget and what you need the laptop for, and I'll suggest the best options.",
};

const QUICK_QUESTIONS = [
  "Best laptop under 100k?",
  "Gaming laptop chahiye",
  "Shop location?",
  "How do I order?",
];

/* ------------------------------------------------------------
   Render **bold**, [text](url) links and line breaks safely
------------------------------------------------------------ */
const renderInline = (text, keyPrefix) => {
  const parts = [];
  const regex = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match;
  let index = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      const href = match[2];

      if (href.startsWith("/")) {
        parts.push(
          <Link key={`${keyPrefix}-${index}`} to={href}>
            {match[1]}
          </Link>
        );
      } else if (/^https?:\/\//i.test(href)) {
        parts.push(
          <a
            key={`${keyPrefix}-${index}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {match[1]}
          </a>
        );
      } else {
        parts.push(match[1]);
      }
    } else if (match[3]) {
      parts.push(<strong key={`${keyPrefix}-${index}`}>{match[3]}</strong>);
    }

    lastIndex = regex.lastIndex;
    index += 1;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
};

const renderMessage = (content) =>
  content.split("\n").map((line, lineIndex) => (
    <React.Fragment key={lineIndex}>
      {renderInline(line, lineIndex)}
      {lineIndex < content.split("\n").length - 1 && <br />}
    </React.Fragment>
  ));

const loadHistory = () => {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : null;
    return Array.isArray(parsed) && parsed.length ? parsed : [WELCOME];
  } catch (error) {
    return [WELCOME];
  }
};

const AIChatbot = () => {
  const location = useLocation();

  const [enabled, setEnabled] = useState(false);
  const [side, setSide] = useState("left");
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(loadHistory);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const bodyRef = useRef(null);
  const inputRef = useRef(null);

  // Check if chatbot is configured + sit opposite to WhatsApp button
  useEffect(() => {
    let isMounted = true;

    fetch(`${API_URL}/api/chat/status`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (isMounted && data?.enabled) {
          setEnabled(true);
        }
      })
      .catch(() => {});

    fetch(`${API_URL}/api/whatsapp/public`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!isMounted) return;
        const whatsappPosition = data?.floating?.position;
        setSide(whatsappPosition === "bottom-left" ? "right" : "left");
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch (error) {
      /* ignore */
    }
  }, [messages]);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, isLoading, isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const sendMessage = async (text) => {
    const content = (text ?? input).trim();

    if (!content || isLoading) return;

    const nextMessages = [...messages, { role: "user", content }];

    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/chat/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages
            .filter((message) => message !== WELCOME)
            .slice(-12),
        }),
      });

      const data = await response.json().catch(() => null);

      const reply =
        response.ok && data?.reply
          ? data.reply
          : data?.detail ||
            "Sorry, something went wrong. Please try again or contact us on WhatsApp.";

      setMessages((current) => [...current, { role: "assistant", content: reply }]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: "Network error. Please check your internet and try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    sendMessage();
  };

  const resetChat = () => {
    setMessages([WELCOME]);
  };

  // Hide on admin pages and when backend isn't configured
  if (!enabled || location.pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <div className={`ai-chatbot ai-chatbot-${side}`}>
      {isOpen && (
        <div className="ai-chatbot-window" role="dialog" aria-label="T For Tech AI assistant">
          <div className="ai-chatbot-header">
            <div className="ai-chatbot-header-info">
              <span className="ai-chatbot-avatar">
                <FaRobot />
              </span>
              <div>
                <div className="ai-chatbot-title">T For Tech Assistant</div>
                <div className="ai-chatbot-subtitle">
                  <span className="ai-chatbot-dot" /> Online · AI powered
                </div>
              </div>
            </div>
            <div className="ai-chatbot-header-actions">
              <button type="button" className="ai-chatbot-reset" onClick={resetChat} title="New chat">
                New
              </button>
              <button
                type="button"
                className="ai-chatbot-close"
                onClick={() => setIsOpen(false)}
                aria-label="Close chat"
              >
                <FaTimes />
              </button>
            </div>
          </div>

          <div className="ai-chatbot-body" ref={bodyRef}>
            {messages.map((message, index) => (
              <div key={index} className={`ai-chatbot-msg ai-chatbot-msg-${message.role}`}>
                {renderMessage(message.content)}
              </div>
            ))}

            {isLoading && (
              <div className="ai-chatbot-msg ai-chatbot-msg-assistant ai-chatbot-typing">
                <span />
                <span />
                <span />
              </div>
            )}

            {messages.length === 1 && !isLoading && (
              <div className="ai-chatbot-quick">
                {QUICK_QUESTIONS.map((question) => (
                  <button key={question} type="button" onClick={() => sendMessage(question)}>
                    {question}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form className="ai-chatbot-input" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              maxLength={1000}
              placeholder="Type your question..."
              onChange={(event) => setInput(event.target.value)}
            />
            <button type="submit" disabled={!input.trim() || isLoading} aria-label="Send">
              <FaPaperPlane />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        className="ai-chatbot-toggle"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={isOpen ? "Close AI assistant" : "Open AI assistant"}
        title="Ask our AI assistant"
      >
        {isOpen ? <FaTimes /> : <FaRobot />}
        {!isOpen && <span className="ai-chatbot-toggle-label">Ask AI</span>}
      </button>
    </div>
  );
};

export default AIChatbot;
