"use client";

import { useActionState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signInAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

interface LoginFormProps {
  returnTo: string;
}

/**
 * Login form (D17: react-hook-form + zod).
 *
 * Client-side validation runs first; if valid, dispatches the server action
 * which calls Better Auth's `signInUsername` endpoint. On failure the server
 * returns a single generic error message that does not reveal which field was
 * wrong (spec: "Wrong credentials").
 */
export function LoginForm({ returnTo }: LoginFormProps) {
  const [serverState, dispatch, isServerPending] = useActionState(
    signInAction,
    null,
  );
  const [, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  function onSubmit(data: LoginFormData) {
    const formData = new FormData();
    formData.set("username", data.username);
    formData.set("password", data.password);
    formData.set("returnTo", returnTo);
    startTransition(() => dispatch(formData));
  }

  const isPending = isServerPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="username" className="block text-sm font-medium">
          Username
        </label>
        <input
          {...register("username")}
          id="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={isPending}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          placeholder="admin"
          aria-describedby={errors.username ? "username-error" : undefined}
        />
        {errors.username && (
          <p id="username-error" className="text-sm text-destructive">
            {errors.username.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          {...register("password")}
          id="password"
          type="password"
          autoComplete="current-password"
          disabled={isPending}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          aria-describedby={errors.password ? "password-error" : undefined}
        />
        {errors.password && (
          <p id="password-error" className="text-sm text-destructive">
            {errors.password.message}
          </p>
        )}
      </div>

      {serverState?.error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverState.error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
