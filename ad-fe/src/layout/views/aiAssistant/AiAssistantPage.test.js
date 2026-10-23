import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import AiAssistantPage from "./AiAssistantPage";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { ApiGetChatSessions } from "../../../api-wrapper/customer/ApiCustomer";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: value => value }),
  initReactI18next: { type: "3rdParty", init: () => {} }
}));
jest.mock("../../../common/helper/toast/Toast", () => ({
  error: jest.fn(),
  success: jest.fn(),
  info: jest.fn(),
  warning: jest.fn()
}));
jest.mock("../../../helper/usecontext/useContext", () => ({
  ProfileContext: require("react").createContext({}),
}));
jest.mock("../../../helper/modal/CustomModal", () => ({ CustomModal: () => null }));
jest.mock("../../../helper/chatbot/reporting/ChatReportRenderer", () => () => <div>Report workspace</div>);
jest.mock("../../../api-wrapper/customer/ApiCustomer", () => ({
  ApiGetChatSessions: jest.fn(),
  ApiCustomChatBotStream: jest.fn(),
  ApiSaveChatSession: jest.fn(() => Promise.resolve({ isSuccess: true })),
  ApiDeleteChatSession: jest.fn(),
  ApiClearChatSessions: jest.fn(),
  ApiRenameChatSession: jest.fn(),
  ApiMigrateChatSessions: jest.fn(() => Promise.resolve({ isSuccess: true })),
}));

const profile = { profileId: "123", name: "Tagdo", currencyCode: "INR" };
const context = { profileId: "123", profileList: [profile], selectedAdType: "SP", loginUser: { fullName: "Customer" } };

beforeEach(() => {
  localStorage.clear();
  HTMLElement.prototype.scrollTo = jest.fn();
  window.matchMedia = jest.fn(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
});

test("mobile history opens as a drawer, closes with Escape or session selection, and restores focus", async () => {
  window.matchMedia.mockReturnValue({ matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() });
  const session = { id: "mobile-session", title: "Mobile history", createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
  ApiGetChatSessions.mockResolvedValue({ isSuccess: true, data: [session], pagination: { hasMore: false } });
  render(<ProfileContext.Provider value={context}><AiAssistantPage /></ProfileContext.Provider>);
  await screen.findByRole("heading", { name: "Mobile history" });

  const toggle = screen.getByRole("button", { name: "Open chat history" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(screen.getByRole("dialog", { name: "Chat history" })).toHaveAttribute("aria-modal", "true");
  expect(screen.getByRole("button", { name: "Close history panel" })).toHaveFocus();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(toggle).toHaveFocus();

  fireEvent.click(toggle);
  fireEvent.click(within(screen.getByRole("dialog")).getByText("Mobile history"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(toggle).toHaveFocus();
});

test("the actual assistant page renders its sidebar, saved question, answer and report without missing symbols", async () => {
  const session = {
    id: "saved-session", title: "Yesterday", createdAt: Date.now(), updatedAt: Date.now(),
    messages: [
      { id: "question", from: "user", text: "How did yesterday go?", time: Date.now() },
      { id: "answer", from: "bot", text: "Here are your results.", time: Date.now(), report: { id: "report" } },
    ],
  };
  localStorage.setItem("advertiseiq_ai_assistant_sessions_123", JSON.stringify([session]));
  ApiGetChatSessions.mockResolvedValue({ isSuccess: true, data: [{ ...session, title: "Loaded yesterday" }], pagination: { hasMore: false } });
  render(<ProfileContext.Provider value={context}><AiAssistantPage /></ProfileContext.Provider>);

  expect(await screen.findByRole("heading", { name: "Loaded yesterday" })).toBeInTheDocument();
  expect(ApiGetChatSessions).toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "AI Assistant" })).toBeInTheDocument();
  expect(screen.getByText("How did yesterday go?")).toBeInTheDocument();
  expect(screen.getByRole("article", { name: "Advertise IQ response" })).toHaveTextContent("Here are your results.");
  expect(screen.getByText("Report workspace")).toBeInTheDocument();
  expect(screen.getByText("Beginning of conversation")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Ask anything about your advertising performance...")).toBeEnabled();
});

test("enforces view-only permission: hides create, rename, delete and disables input", async () => {
  const session = {
    id: "session-view-only",
    title: "Read Only Session",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [
      { id: "q1", from: "user", text: "What was ACOS?", time: Date.now() },
      { id: "a1", from: "bot", text: "Your ACOS was 20%.", time: Date.now() }
    ]
  };

  const viewOnlyPermissionContext = {
    ...context,
    pagePermission: [
      {
        pageName: "AI Assistant",
        pageSlug: "ai-assistant",
        allocatedActions: [
          { actionType: "View Only", status: true },
          { actionType: "Create", status: false },
          { actionType: "Update", status: false },
          { actionType: "Remove", status: false }
        ]
      }
    ]
  };

  ApiGetChatSessions.mockResolvedValue({ isSuccess: true, data: [session], pagination: { hasMore: false } });

  render(
    <ProfileContext.Provider value={viewOnlyPermissionContext}>
      <AiAssistantPage />
    </ProfileContext.Provider>
  );

  expect(await screen.findByRole("heading", { name: "Read Only Session" })).toBeInTheDocument();

  // New Chat button should NOT be rendered
  expect(screen.queryByRole("button", { name: /new chat/i })).not.toBeInTheDocument();

  // Rename button should NOT be rendered
  expect(screen.queryByTitle("Rename chat")).not.toBeInTheDocument();

  // Delete button should NOT be rendered
  expect(screen.queryByTitle("Delete conversation")).not.toBeInTheDocument();

  // View Only badge should be displayed
  expect(screen.getByText("View Only")).toBeInTheDocument();

  // Input should be disabled with View Only message
  const input = screen.getByPlaceholderText(/You do not have permission to continue this chat \(View Only mode\)/i);
  expect(input).toBeDisabled();
});
