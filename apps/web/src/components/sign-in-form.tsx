import { Button } from "@my-better-t-app/ui/components/button";
import { FieldGroup } from "@my-better-t-app/ui/components/field";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import { AuthField, AuthShell } from "./auth-field";
import Loader from "./loader";

export default function SignInForm({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
  const navigate = useNavigate({
    from: "/",
  });
  const { isPending } = authClient.useSession();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            navigate({
              to: "/dashboard",
            });
            toast.success("Sign in successful");
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <AuthShell
      title="Sign in"
      intro="Monitor the pricing pages you own and read every scan against the same question set."
      footer={
        <>
          Need an account?{" "}
          <Button type="button" variant="link" size="xs" onClick={onSwitchToSignUp}>
            Create one
          </Button>
        </>
      }
    >
      <form
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <FieldGroup>
          <form.Field name="email">
            {(field) => (
              <AuthField
                field={field}
                label="Email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
              />
            )}
          </form.Field>

          <form.Field name="password">
            {(field) => (
              <AuthField
                field={field}
                label="Password"
                type="password"
                autoComplete="current-password"
              />
            )}
          </form.Field>
        </FieldGroup>

        <form.Subscribe
          selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Button
              className="mt-1.5 h-11 w-full text-sm"
              size="lg"
              type="submit"
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthShell>
  );
}
