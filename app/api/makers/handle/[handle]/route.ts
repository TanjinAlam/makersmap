import { handleError, isReservedHandle, normalizeHandle } from "@/app/handle";
import { resolveMakerByHandle } from "@/app/makers-lookup";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle: raw } = await params;
  const handle = normalizeHandle(raw);
  const except = normalizeHandle(new URL(request.url).searchParams.get("except"));
  const formatError = handleError(handle);

  if (formatError) {
    return Response.json({ handle, available: false, reason: formatError });
  }

  if (isReservedHandle(handle)) {
    return Response.json({ handle, available: false, reason: "That handle is reserved." });
  }

  const existing = await resolveMakerByHandle(handle);
  if (existing && except === handle) {
    return Response.json({ handle, available: true });
  }
  if (existing) {
    return Response.json({ handle, available: false, reason: `@${handle} is already taken.` });
  }

  return Response.json({ handle, available: true });
}
