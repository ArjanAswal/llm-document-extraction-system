/* @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getSession: vi.fn(),
  register: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  listJobs: vi.fn(),
  getJobResult: vi.fn(),
  uploadFiles: vi.fn(),
  retryJob: vi.fn(),
  cancelJob: vi.fn(),
  openJobEvents: vi.fn(),
  changePassword: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  deleteAccount: vi.fn(),
  csvUrl: vi.fn(),
}));

vi.mock("../../web/src/api", () => ({
  ApiError: class ApiError extends Error {},
  ...api,
}));

import { App } from "../../web/src/App";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Dashboard auth flow", () => {
  it("creates an account and opens the operations dashboard", async () => {
    api.getSession.mockResolvedValue(null);
    api.register.mockResolvedValue({
      user: { id: "user-1", email: "person@example.test" },
      csrfToken: "csrf",
    });
    api.listJobs.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await user.type(screen.getByLabelText("Email"), "person@example.test");
    await user.type(screen.getByLabelText("Password"), "LongPassword123!");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Operations dashboard" })).toBeTruthy(),
    );
    expect(api.register).toHaveBeenCalledWith(
      "person@example.test",
      "LongPassword123!",
    );
  });
});
