import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SessionDrawer from "./SessionDrawer";
import type { OttoReplyData, OttoSessionContext } from "../types";

const latestReply: OttoReplyData = {
  messageId: "msg-1",
  createdAt: "2026-03-21T10:00:00.000Z",
  subject: "The British Museum",
  subjectType: "landmark",
  answer: "This is the British Museum in London. It is known for large historical collections and free public entry.",
  confidence: "high",
  usedVision: true,
  usedWebSearch: true,
  suggestedFollowUps: ["What are the opening hours?", "Which galleries should I start with?"],
  actions: [
    { label: "Open best source", url: "https://example.com/source", type: "source" },
    { label: "Get directions", url: "https://example.com/map", type: "directions" },
  ],
  sources: [
    {
      title: "Official site",
      url: "https://example.com/source",
      snippet: "Visitor information and museum highlights.",
      sourceType: "web",
    },
  ],
  structuredDetails: [
    { label: "What Otto saw", value: "A large stone museum entrance with columns." },
    { label: "Web verification", value: "Checked the official museum site." },
  ],
  callProposal: null,
};

const sessionContext: OttoSessionContext = {
  sessionId: "session-1",
  activeSubject: "The British Museum",
  activeSubjectType: "landmark",
  summary: "The user is exploring the British Museum and wants practical visitor context.",
  turns: [
    {
      id: "turn-user",
      role: "user",
      content: "What is this building?",
      createdAt: "2026-03-21T09:59:30.000Z",
      usedVision: true,
    },
    {
      id: "msg-1",
      role: "assistant",
      content: latestReply.answer,
      createdAt: latestReply.createdAt,
      usedVision: true,
      usedWebSearch: true,
      reply: latestReply,
    },
  ],
};

describe("SessionDrawer", () => {
  it("renders the session conversation and latest reply details", () => {
    render(
      <SessionDrawer
        visible
        onClose={() => {}}
        onResetSession={() => {}}
        latestReply={latestReply}
        sessionContext={sessionContext}
        canSpeak
        isMuted={false}
        isSpeaking={false}
        onReplay={() => {}}
        onToggleMute={() => {}}
        onReviewTaskProposal={() => {}}
      />
    );

    expect(screen.getByText("Current walk")).toBeInTheDocument();
    expect(screen.getAllByText("The British Museum")).toHaveLength(2);
    expect(screen.getByText("What is this building?")).toBeInTheDocument();
    expect(screen.getByText("Vision read")).toBeInTheDocument();
    expect(screen.getByText("Web verified")).toBeInTheDocument();
    expect(screen.getByText("What Otto saw")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open best source/i })).toHaveAttribute("href", "https://example.com/source");
  });

  it("wires replay, mute, and reset controls", () => {
    const onReplay = vi.fn();
    const onToggleMute = vi.fn();
    const onResetSession = vi.fn();

    render(
      <SessionDrawer
        visible
        onClose={() => {}}
        onResetSession={onResetSession}
        latestReply={latestReply}
        sessionContext={sessionContext}
        canSpeak
        isMuted={false}
        isSpeaking={false}
        onReplay={onReplay}
        onToggleMute={onToggleMute}
        onReviewTaskProposal={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Replay audio/i }));
    fireEvent.click(screen.getByRole("button", { name: /Mute replies/i }));
    fireEvent.click(screen.getByRole("button", { name: /Reset session/i }));

    expect(onReplay).toHaveBeenCalledTimes(1);
    expect(onToggleMute).toHaveBeenCalledTimes(1);
    expect(onResetSession).toHaveBeenCalledTimes(1);
  });
});
