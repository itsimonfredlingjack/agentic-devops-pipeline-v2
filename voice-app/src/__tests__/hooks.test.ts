import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCollapsible } from "../hooks/useCollapsible";
import * as audioCapture from "../lib/audioCapture";

vi.mock("../lib/audioCapture", () => ({
  subscribeToMicLevels: vi.fn(() => () => {}),
}));

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
    const onToggleCommandPalette = vi.fn();
    const onSubmitPrimary = vi.fn();

    // Dynamically import to avoid module caching issues
    const { useKeyboardShortcuts } =
      await import("../hooks/useKeyboardShortcuts");

    renderHook(() =>
      useKeyboardShortcuts({
        onToggleRecord,
        onEscape,
        onToggleCommandPalette,
        onSubmitPrimary,
      }),
    );

    const event = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
    });
    window.dispatchEvent(event);

    expect(onToggleRecord).toHaveBeenCalledOnce();
    expect(onEscape).not.toHaveBeenCalled();
    expect(onToggleCommandPalette).not.toHaveBeenCalled();
    expect(onSubmitPrimary).not.toHaveBeenCalled();
  });

  it("should call onEscape on Escape keydown", async () => {
    const onToggleRecord = vi.fn();
    const onEscape = vi.fn();
    const onToggleCommandPalette = vi.fn();
    const onSubmitPrimary = vi.fn();

    const { useKeyboardShortcuts } =
      await import("../hooks/useKeyboardShortcuts");

    renderHook(() =>
      useKeyboardShortcuts({
        onToggleRecord,
        onEscape,
        onToggleCommandPalette,
        onSubmitPrimary,
      }),
    );

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
    });
    window.dispatchEvent(event);

    expect(onEscape).toHaveBeenCalledOnce();
    expect(onToggleRecord).not.toHaveBeenCalled();
    expect(onToggleCommandPalette).not.toHaveBeenCalled();
    expect(onSubmitPrimary).not.toHaveBeenCalled();
  });

  it("should not fire when disabled", async () => {
    const onToggleRecord = vi.fn();
    const onEscape = vi.fn();
    const onToggleCommandPalette = vi.fn();
    const onSubmitPrimary = vi.fn();

    const { useKeyboardShortcuts } =
      await import("../hooks/useKeyboardShortcuts");

    renderHook(() =>
      useKeyboardShortcuts({
        onToggleRecord,
        onEscape,
        onToggleCommandPalette,
        onSubmitPrimary,
        disabled: true,
      }),
    );

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }),
    );

    expect(onToggleRecord).not.toHaveBeenCalled();
    expect(onEscape).not.toHaveBeenCalled();
    expect(onToggleCommandPalette).not.toHaveBeenCalled();
    expect(onSubmitPrimary).not.toHaveBeenCalled();
  });

  it("should call onToggleCommandPalette on Cmd/Ctrl+K", async () => {
    const onToggleRecord = vi.fn();
    const onEscape = vi.fn();
    const onToggleCommandPalette = vi.fn();
    const onSubmitPrimary = vi.fn();

    const { useKeyboardShortcuts } =
      await import("../hooks/useKeyboardShortcuts");

    renderHook(() =>
      useKeyboardShortcuts({
        onToggleRecord,
        onEscape,
        onToggleCommandPalette,
        onSubmitPrimary,
      }),
    );

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
    );

    expect(onToggleCommandPalette).toHaveBeenCalledTimes(2);
    expect(onToggleRecord).not.toHaveBeenCalled();
    expect(onEscape).not.toHaveBeenCalled();
    expect(onSubmitPrimary).not.toHaveBeenCalled();
  });

  it("should call onSubmitPrimary on Cmd/Ctrl+Enter", async () => {
    const onToggleRecord = vi.fn();
    const onEscape = vi.fn();
    const onToggleCommandPalette = vi.fn();
    const onSubmitPrimary = vi.fn();

    const { useKeyboardShortcuts } =
      await import("../hooks/useKeyboardShortcuts");

    renderHook(() =>
      useKeyboardShortcuts({
        onToggleRecord,
        onEscape,
        onToggleCommandPalette,
        onSubmitPrimary,
      }),
    );

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }),
    );

    expect(onSubmitPrimary).toHaveBeenCalledTimes(2);
    expect(onToggleRecord).not.toHaveBeenCalled();
    expect(onEscape).not.toHaveBeenCalled();
    expect(onToggleCommandPalette).not.toHaveBeenCalled();
  });

  it("should ignore Space when focused in text inputs", async () => {
    const onToggleRecord = vi.fn();
    const onEscape = vi.fn();
    const onToggleCommandPalette = vi.fn();
    const onSubmitPrimary = vi.fn();

    const { useKeyboardShortcuts } =
      await import("../hooks/useKeyboardShortcuts");

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    renderHook(() =>
      useKeyboardShortcuts({
        onToggleRecord,
        onEscape,
        onToggleCommandPalette,
        onSubmitPrimary,
      }),
    );

    input.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));

    expect(onToggleRecord).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});

describe("useMicLevel", () => {
  beforeEach(() => {
    vi.mocked(audioCapture.subscribeToMicLevels).mockReset();
  });

  it("should subscribe and normalize RMS levels while active", async () => {
    let listener: ((rms: number) => void) | null = null;
    vi.mocked(audioCapture.subscribeToMicLevels).mockImplementation((callback) => {
      listener = callback;
      return () => {};
    });

    const { useMicLevel } = await import("../hooks/useMicLevel");
    const { result } = renderHook(() => useMicLevel(true));

    act(() => {
      listener?.(0.05);
      listener?.(0.1);
    });

    expect(result.current).toEqual([0.4, 0.8]);
  });

  it("should clear levels when inactive", async () => {
    const { useMicLevel } = await import("../hooks/useMicLevel");
    const { result, rerender } = renderHook(({ active }) => useMicLevel(active), {
      initialProps: { active: true },
    });

    rerender({ active: false });

    expect(result.current).toEqual([]);
  });
});
