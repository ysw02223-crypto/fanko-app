import { LoginForm } from "@/components/login-form";
import { Suspense } from "react";

export default function LoginPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-zinc-100 px-4 py-16 dark:bg-zinc-950">
      <Suspense fallback={<div className="text-sm text-zinc-500">불러오는 중…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
