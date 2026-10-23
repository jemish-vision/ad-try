import React from "react";
import { Bot, Loader2 } from "lucide-react";
import ChatMessageText from "../../../helper/chatbot/reporting/ChatMessageText";
import ChatReportRenderer from "../../../helper/chatbot/reporting/ChatReportRenderer";
import { TypingDots } from "../../../helper/chatbot/TypingDots";
import { fmtTime } from "../../../helper/chatbot/chatbotStreamHelper";
import "./AssistantMessage.css";

/** A readable answer first, with its supporting report immediately below it. */
export default function AssistantMessage({ message, profileNames, currencyCode, isDark, onFollowUp }) {
  const isWorking = Boolean(message.status || message.isStreaming);

  return (
    <article className="assistant-message" aria-label="Advertise IQ response" aria-busy={isWorking}>
      <header className="assistant-message__header">
        <span className="assistant-message__avatar" aria-hidden="true"><Bot size={17} /></span>
        <span className="assistant-message__author">Advertise IQ</span>
        <span className="assistant-message__time">{fmtTime(message.time)}</span>
      </header>

      {message.status && (
        <div className="assistant-message__status" role="status">
          <Loader2 size={14} className="assistant-message__spinner" aria-hidden="true" />
          <span>{message.status}</span>
        </div>
      )}

      {message.text && (
        <div className={`assistant-message__answer${message.report ? " assistant-message__answer--report" : ""}`}>
          {message.report && <h2 className="assistant-message__summary-label">At a glance</h2>}
          <ChatMessageText text={message.text} isReport={message.isReport} currencyCode={currencyCode} />
        </div>
      )}

      {message.report && (
        <div className="assistant-message__report">
          <ChatReportRenderer
            report={message.report}
            profileNames={profileNames}
            currencyCode={currencyCode}
            isExpanded={true}
            isDark={isDark}
            layoutVariant="workspace"
            onFollowUp={onFollowUp}
          />
        </div>
      )}

      {message.isStreaming && !message.text && !message.status && (
        <div className="assistant-message__typing" role="status" aria-label="Preparing your answer">
          <TypingDots />
        </div>
      )}
    </article>
  );
}
