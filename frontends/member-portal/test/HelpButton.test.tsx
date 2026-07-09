import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { HelpButton } from "../src/HelpButton";

test("the help button opens and closes a localized dialog", async () => {
  render(<HelpButton />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /help/i }));
  const dialog = screen.getByRole("dialog");
  expect(dialog).toBeInTheDocument();
  expect(dialog).toHaveTextContent(/spendable/i);

  await userEvent.click(screen.getByRole("button", { name: /close/i }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
