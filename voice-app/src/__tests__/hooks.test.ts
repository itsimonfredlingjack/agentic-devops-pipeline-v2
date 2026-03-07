import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCollapsible } from "../hooks/useCollapsible";

describe("useCollapsible", () => {
  it("should start closed by default", () => {
    const { result } = renderHook(() => useCollapsible());
    expect(result.current.isOpen).toBe(false);
  });

  it("should start open when initial=true", () => {
    const { result } = renderHook(() => useCollapsible(true));
    expect(result.current.isOpen).toBe(true);
  });

  it("should toggle open state", () => {
    const { result } = renderHook(() => useCollapsible());
    expect(result.current.isOpen).toBe(false);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it("should maintain stable toggle function reference", () => {
    const { result, rerender } = renderHook(() => useCollapsible());
    const firstToggle = result.current.toggle;
    rerender();
    expect(result.current.toggle).toBe(firstToggle);
  });
});

describe("useKeyboardShortcuts", () => {
  // We test keyboard shortcut behavior indirectly through fireEvent
  // because the hook attaches event listeners to window

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should call onToggleRecord on Space keydown", async () => {
    const onToggleRecord = vi.fn();
    const onEscape = vi.fn();

    // Dynamically import to avoid module caching issues
    const { useKeyboardShortcuts } =
      await import("../hooks/useKeyboardShortcuts");

    renderHook(() =>
      useKeyboardShortcuts({
        onToggleRecord,
        onEscape,
      }),
    );

    const event = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
    });
    window.dispatchEvent(event);

    expect(onToggleRecord).toHaveBeenCalledOnce();
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("should call onEscape on Escape keydown", async () => {
    const onToggleRecord = vi.fn();
    const onEscape = vi.fn();

    const { useKeyboardShortcuts } =
      await import("../hooks/useKeyboardShortcuts");

    renderHook(() =>
      useKeyboardShortcuts({
        onToggleRecord,
        onEscape,
      }),
    );

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
    });
    window.dispatchEvent(event);

    expect(onEscape).toHaveBeenCalledOnce();
    expect(onToggleRecord).not.toHaveBeenCalled();
  });

  it("should not fire when disabled", async () => {
    const onToggleRecord = vi.fn();
    const onEscape = vi.fn();

    const { useKeyboardShortcuts } =
      await import("../hooks/useKeyboardShortcuts");

    renderHook(() =>
      useKeyboardShortcuts({
        onToggleRecord,
        onEscape,
        disabled: true,
      }),
    );

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

    expect(onToggleRecord).not.toHaveBeenCalled();
    expect(onEscape).not.toHaveBeenCalled();
  });
});
