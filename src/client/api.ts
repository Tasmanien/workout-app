import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EntryInput, ExerciseInput, MovementInput, SchemeInput } from "../shared/schemas";
import type { Entry, ExerciseDetail, ExerciseSummary, Movement, Scheme } from "../shared/types";

export class ApiError extends Error {}

type Saved = { id: string } | undefined;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    redirect: "manual",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.type === "opaqueredirect" || response.status === 401) {
    window.location.reload();
    throw new ApiError("Session expired, signing in again…");
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(payload?.error ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const queryKeys = {
  exercises: ["exercises"] as const,
  exercise: (id: string) => ["exercises", id] as const,
  movements: ["movements"] as const,
  schemes: ["schemes"] as const,
  entry: (id: string) => ["entries", id] as const,
};

export const useExercises = () => useQuery({ queryKey: queryKeys.exercises, queryFn: () => request<ExerciseSummary[]>("GET", "/exercises") });
export const useExercise = (id: string) => useQuery({ queryKey: queryKeys.exercise(id), queryFn: () => request<ExerciseDetail>("GET", `/exercises/${id}`) });
export const useMovements = () => useQuery({ queryKey: queryKeys.movements, queryFn: () => request<Movement[]>("GET", "/movements") });
export const useSchemes = () => useQuery({ queryKey: queryKeys.schemes, queryFn: () => request<Scheme[]>("GET", "/schemes") });
export const useEntry = (id: string | undefined) =>
  useQuery({ queryKey: queryKeys.entry(id ?? ""), queryFn: () => request<Entry>("GET", `/entries/${id}`), enabled: !!id });

function useApiMutation<TVariables, TResult = unknown>(mutationFn: (variables: TVariables) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries() });
}

export const useSaveMovement = () =>
  useApiMutation(({ id, input }: { id?: string; input: MovementInput }) =>
    id ? request<Saved>("PATCH", `/movements/${id}`, input) : request<Saved>("POST", "/movements", input));
export const useDeleteMovement = () => useApiMutation((id: string) => request<void>("DELETE", `/movements/${id}`));

export const useSaveExercise = () =>
  useApiMutation(({ id, input }: { id?: string; input: ExerciseInput }) =>
    id ? request<Saved>("PUT", `/exercises/${id}`, input) : request<Saved>("POST", "/exercises", input));
export const useDeleteExercise = () => useApiMutation((id: string) => request<void>("DELETE", `/exercises/${id}`));

export const useSaveScheme = () =>
  useApiMutation(({ id, input }: { id?: string; input: SchemeInput }) =>
    id ? request<Saved>("PUT", `/schemes/${id}`, input) : request<Saved>("POST", "/schemes", input));
export const useDeleteScheme = () => useApiMutation((id: string) => request<void>("DELETE", `/schemes/${id}`));

export const useSaveEntry = () =>
  useApiMutation(({ id, input }: { id?: string; input: EntryInput }) =>
    id ? request<Saved>("PUT", `/entries/${id}`, input) : request<Saved>("POST", "/entries", input));
export const useDeleteEntry = () => useApiMutation((id: string) => request<void>("DELETE", `/entries/${id}`));
