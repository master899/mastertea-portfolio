import { getStore } from "@netlify/blobs";

const store = getStore("portfolio-projects");

export default async (request) => {
  if (request.method !== "GET") return new Response("Method not allowed.", { status: 405 });

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  const screenshotIndex = Number(url.searchParams.get("index"));
  const isFeaturedProject = /^featured-(tuberculosis-screening|departmental-portal|campus-transport)$/.test(
    projectId || ""
  );
  if (
    !projectId ||
    !/^[\w-]{1,80}$/.test(projectId) ||
    (!isFeaturedProject && projectId.startsWith("featured-")) ||
    !Number.isInteger(screenshotIndex) ||
    screenshotIndex < 0 ||
    screenshotIndex > 4
  ) {
    return new Response("Screenshot was not found.", { status: 404 });
  }

  try {
    const project = projectId.startsWith("featured-")
      ? await store.get(projectId, { type: "json" })
      : await store.get(`project-${projectId}`, { type: "json" });
    const screenshot = project?.screenshots[screenshotIndex];
    if (!screenshot) return new Response("Screenshot was not found.", { status: 404 });

    const image = await store.get(screenshot.key, { type: "arrayBuffer" });
    if (!image) return new Response("Screenshot was not found.", { status: 404 });

    return new Response(image, {
      headers: {
        "Content-Type": screenshot.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Could not load screenshot from Netlify storage.", { status: 500 });
  }
};
