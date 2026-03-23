interface ImportMeta {
  glob<T = unknown>(
    pattern: string,
    options?: {
      query?: string
      import?: string
      eager?: boolean
    },
  ): Record<string, T>
}
