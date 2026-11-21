import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

const buttonStyles = {
  primary: "bg-accent text-zinc-950 font-semibold active:bg-accent-strong",
  secondary: "bg-zinc-800 text-zinc-100 active:bg-zinc-700",
  danger: "bg-red-950 text-red-300 active:bg-red-900",
  ghost: "text-zinc-300 active:bg-zinc-800",
};

export function Button({ variant = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof buttonStyles }) {
  return (
    <button
      type="button"
      className={`min-h-11 rounded-xl px-4 text-base transition-colors disabled:opacity-40 ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  );
}

const fieldStyles = "min-h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-accent";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldStyles} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${fieldStyles} appearance-none ${className}`} {...props} />;
}

export function Label({ title, children }: { title: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-zinc-400">{title}</span>
      {children}
    </label>
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-2xl bg-zinc-900 p-4 ${className}`}>{children}</div>;
}

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-zinc-950/90 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur">
      <h1 className="truncate text-2xl font-bold">{title}</h1>
      {action}
    </header>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="rounded-xl bg-red-950/60 px-3 py-2 text-sm text-red-300">{error instanceof Error ? error.message : String(error)}</p>;
}

export function Loading() {
  return <p className="px-4 py-8 text-center text-zinc-500">Loading…</p>;
}
