import { Button } from "@my-better-t-app/ui/components/button";
import { FieldGroup } from "@my-better-t-app/ui/components/field";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import { AuthField, AuthShell } from "./auth-field";
import Loader from "./loader";

export default function SignUpForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
  const navigate = useNavigate({
    from: "/",
  });
  const { isPending } = authClient.useSession();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      name: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signUp.email(
        {
          email: value.email,
          password: value.password,
          name: value.name,
        },
        {
          onSuccess: () => {
            navigate({
              to: "/dashboard",
            });
            toast.success("Sign up successful");
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
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
      title="Create account"
      intro="Claim a pricing page and Pricelog captures its published pricing terms and checks for changes every week."
      footer={
        <>
          Already have an account?{" "}
          <Button type="button" variant="link" size="xs" onClick={onSwitchToSignIn}>
            Sign in
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
          <form.Field name="name">
            {(field) => (
              <AuthField
                field={field}
                label="Name"
                autoComplete="name"
                placeholder="Ada Lovelace"
              />
            )}
          </form.Field>

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
                autoComplete="new-password"
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
              {isSubmitting ? "Creating account…" : "Create account"}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthShell>
  );
}
