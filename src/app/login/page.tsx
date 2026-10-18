import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { getCurrentUser } from "@/lib/current-user";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
