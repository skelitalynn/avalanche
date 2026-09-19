export async function api<T = any>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const multipart = body instanceof FormData;
  const response = await fetch("/api/v1" + path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body === undefined || multipart
        ? {}
        : { "Content-Type": "application/json" }),
      ...(method === "POST" && !path.startsWith("/auth/")
        ? { "Idempotency-Key": crypto.randomUUID() }
        : {}),
    },
    ...(body === undefined
      ? {}
      : { body: multipart ? body : JSON.stringify(body) }),
  });
  if (response.status === 204) return undefined as T;
  const result = await response.json().catch(() => {
    throw Error("后端未启动或入口未配置（未返回 JSON）");
  });
  if (!response.ok)
    throw Object.assign(Error(result.error?.message ?? "请求未完成"), {
      status: response.status,
      code: result.error?.code,
    });
  if (
    !result ||
    typeof result !== "object" ||
    !("data" in result) ||
    "error" in result
  )
    throw Error("后端响应格式不正确");
  return result.data;
}
