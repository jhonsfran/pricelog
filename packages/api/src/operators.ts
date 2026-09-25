import type { Context } from "./context";

/**
 * Page operators may open and scan every page, not only the pages they own. They are
 * configured by email in PAGE_OPERATOR_EMAILS for testing. Sign-up does not verify email,
 * so only list emails whose accounts already exist.
 */
export function parseOperatorEmails(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isPageOperator(context: Pick<Context, "session" | "operatorEmails">): boolean {
  const email = context.session?.user.email?.trim().toLowerCase();
  return !!email && (context.operatorEmails ?? []).includes(email);
}
