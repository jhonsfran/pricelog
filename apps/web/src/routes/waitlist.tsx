import { ORPCError } from "@orpc/client";
import { Button, buttonVariants } from "@pricelog/ui/components/button";
import { Field, FieldLabel } from "@pricelog/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@pricelog/ui/components/input-group";
import { useMutation } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Eye, Mail, Plus } from "lucide-react";
import { useState } from "react";

import { Lede, PageHeader, PageShell } from "@/components/page";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/waitlist")({
  head: () => ({
    meta: [
      { title: "Join the waitlist · Pricelog" },
      {
        name: "description",
        content:
          "Track your own pricing pages, watch competitors, and get a weekly digest of what changed.",
      },
    ],
  }),
  component: WaitlistPage,
});

const PROMISE = [
  {
    icon: Plus,
    title: "Add your pages",
    detail:
      "Submit any public pricing page. Pricelog captures it now, then every week, and checks each price against the page.",
  },
  {
    icon: Eye,
    title: "Watch competitors",
    detail: "Follow the products you compete with and see each plan and price change, dated.",
  },
  {
    icon: Mail,
    title: "Weekly digest",
    detail: "One email a week with what moved on the pages you follow.",
  },
] as const;

function WaitlistPage() {
  return (
    <PageShell narrow>
      <PageHeader eyebrow="Early access" title="Track the pricing pages you care about">
        <Lede>
          Accounts are not open yet. Join the waitlist and we will email you when they are.
        </Lede>
      </PageHeader>
      <WaitlistForm />
      <section aria-labelledby="waitlist-promise" className="mt-10">
        <h2 id="waitlist-promise" className="kicker mb-3 text-muted-foreground">
          What an account adds
        </h2>
        <ul className="grid pt-px pl-px sm:grid-cols-3">
          {PROMISE.map(({ icon: Icon, title, detail }) => (
            <li key={title} className="-mt-px -ml-px grid content-start gap-2 border p-4">
              <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
              <h3 className="text-base leading-tight font-semibold">{title}</h3>
              <p className="text-sm/relaxed text-muted-foreground">{detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}

function WaitlistForm() {
  const [email, setEmail] = useState("");
  const join = useMutation(orpc.waitlist.join.mutationOptions());

  if (join.isSuccess) {
    return (
      <section
        role="status"
        className="border border-gray-5 bg-gray-2/40 p-4 motion-safe:animate-rise sm:p-5"
      >
        <p className="kicker text-muted-foreground">On the list</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em]">You're on the waitlist.</h2>
        <p className="mt-1.5 text-muted-foreground wrap-anywhere">
          We will email {join.data.email} when accounts open.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/" className={buttonVariants({ variant: "outline" })}>
            Browse the directory <ArrowRight data-icon="inline-end" />
          </Link>
          <Button variant="ghost" onClick={() => join.reset()}>
            Use a different address
          </Button>
        </div>
      </section>
    );
  }

  const error = join.isError ? joinErrorMessage(join.error) : null;
  return (
    <form
      // Before hydration a native submit must not put the address in a GET query string.
      method="post"
      className="border border-gray-5 bg-gray-2/40 p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        join.mutate({ email });
      }}
    >
      <Field data-invalid={error !== null}>
        <FieldLabel htmlFor="waitlist-email">Email</FieldLabel>
        <InputGroup className="h-12 bg-background">
          <InputGroupInput
            id="waitlist-email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@company.com"
            aria-invalid={error !== null}
            aria-describedby="waitlist-notice"
            className="px-4 text-base md:text-base"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (join.isError) join.reset();
            }}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="submit"
              variant="default"
              size="sm"
              className="h-9 px-4"
              disabled={join.isPending}
            >
              {join.isPending ? "Joining…" : "Join waitlist"}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </Field>
      <p id="waitlist-notice" className="mt-2.5 text-xs/relaxed text-muted-foreground">
        We store this address and the date you joined, and use it only to email you when accounts
        open.
      </p>
    </form>
  );
}

function joinErrorMessage(error: Error) {
  return error instanceof ORPCError && error.code === "BAD_REQUEST"
    ? "Enter a full email address, like you@company.com."
    : "Your email was not saved. Check your connection and try again.";
}
