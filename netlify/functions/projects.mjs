import { timingSafeEqual, randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";

const store = getStore("portfolio-projects");
const featuredProjects = [
  { id: "tuberculosis-screening", title: "Multilingual Tuberculosis Screening & Risk Assessment" },
  { id: "departmental-portal", title: "Web-Based Departmental Portal" },
  { id: "campus-transport", title: "Smart Campus Transport Booking System" },
];
const jsonResponse = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const errorResponse = (message, status) => jsonResponse({ message }, status);

const isAuthorized = (request) => {
  const expectedToken = process.env.PORTFOLIO_ADMIN_TOKEN;
  if (!expectedToken) return null;

  const suppliedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!suppliedToken) return false;

  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
};

const validImage = (contentType, bytes) => {
  if (contentType === "image/png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  }
  if (contentType === "image/webp") {
    return (
      bytes.length >= 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP"
    );
  }
  if (contentType === "image/gif") {
    const signature = bytes.toString("ascii", 0, 6);
    return signature === "GIF87a" || signature === "GIF89a";
  }
  return false;
};

const validateScreenshots = (screenshots) => {
  if (!Array.isArray(screenshots) || screenshots.length > 5) {
    return { error: "A project can have no more than five screenshots." };
  }

  let totalBytes = 0;
  const validatedScreenshots = [];
  for (const screenshot of screenshots) {
    if (
      screenshot === null ||
      typeof screenshot !== "object" ||
      typeof screenshot.data !== "string" ||
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(screenshot.contentType) ||
      screenshot.data.length > 850_000 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(screenshot.data)
    ) {
      return { error: "Screenshots must be valid PNG, JPEG, WebP, or GIF images under 600 KB each." };
    }

    const bytes = Buffer.from(screenshot.data, "base64");
    totalBytes += bytes.length;
    if (bytes.length > 600 * 1024 || !validImage(screenshot.contentType, bytes)) {
      return { error: "A screenshot is too large or its file contents do not match its image type." };
    }
    validatedScreenshots.push({ contentType: screenshot.contentType, bytes });
  }

  if (totalBytes > 2.5 * 1024 * 1024) {
    return { error: "Screenshots must total no more than 2.5 MB." };
  }
  return { screenshots: validatedScreenshots };
};

const validateProject = (payload) => {
  if (
    payload === null ||
    typeof payload !== "object" ||
    typeof payload.title !== "string" ||
    typeof payload.description !== "string" ||
    !Array.isArray(payload.technologies) ||
    !Array.isArray(payload.screenshots)
  ) {
    return { error: "Project details are incomplete or invalid." };
  }

  const title = payload.title.trim();
  const description = payload.description.trim();
  const technologies = payload.technologies.map((technology) =>
    typeof technology === "string" ? technology.trim() : ""
  );
  if (!title || title.length > 100 || !description || description.length > 700) {
    return { error: "Project title or description is missing or too long." };
  }
  if (
    technologies.length > 12 ||
    technologies.some((technology) => !technology || technology.length > 40)
  ) {
    return { error: "Provide no more than twelve valid technology tags." };
  }
  const screenshotValidation = validateScreenshots(payload.screenshots);
  if (screenshotValidation.error) return screenshotValidation;

  return { project: { title, description, technologies }, screenshots: screenshotValidation.screenshots };
};

export default async (request) => {
  if (request.method === "GET") {
    try {
      const { blobs } = await store.list({ prefix: "project-" });
      const projects = await Promise.all(
        blobs.map(({ key }) => store.get(key, { type: "json" }))
      );
      const featuredGalleries = await Promise.all(
        featuredProjects.map(async ({ id, title }) => {
          const gallery = await store.get(`featured-${id}`, { type: "json" });
          return {
            id,
            title,
            screenshotCount: gallery?.screenshots.length || 0,
          };
        })
      );
      return jsonResponse({
        featuredGalleries,
        projects: projects
          .filter(Boolean)
          .map(({ id, title, description, technologies, screenshots, createdAt }) => ({
            id,
            title,
            description,
            technologies,
            screenshotCount: screenshots.length,
            createdAt,
          }))
          .sort((first, second) => second.createdAt.localeCompare(first.createdAt)),
      });
    } catch {
      return errorResponse("Could not load public projects from Netlify storage.", 500);
    }
  }

  if (request.method !== "POST" && request.method !== "DELETE") {
    return errorResponse("Method not allowed.", 405);
  }

  const authorized = isAuthorized(request);
  if (authorized === null) {
    return errorResponse("Set PORTFOLIO_ADMIN_TOKEN in the Netlify site environment variables first.", 503);
  }
  if (!authorized) return errorResponse("Upload access key is invalid.", 401);

  if (request.method === "DELETE") {
    try {
      const id = new URL(request.url).searchParams.get("id");
      if (!id || !/^[\w-]{1,80}$/.test(id)) return errorResponse("Project ID is invalid.", 400);

      const projectKey = `project-${id}`;
      const project = await store.get(projectKey, { type: "json" });
      if (!project) return errorResponse("Project was not found.", 404);

      await store.delete(projectKey);
      await Promise.all(project.screenshots.map(({ key }) => store.delete(key)));
      return jsonResponse({ deleted: true });
    } catch {
      return errorResponse("Project was removed, but Netlify could not clean up all its screenshots.", 500);
    }
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 5 * 1024 * 1024) return errorResponse("Project upload is too large.", 413);

  let payload;
  try {
    const body = await request.text();
    if (body.length > 5 * 1024 * 1024) return errorResponse("Project upload is too large.", 413);
    payload = JSON.parse(body);
  } catch {
    return errorResponse("Request must contain valid project JSON.", 400);
  }

  if (typeof payload.featuredProjectId === "string") {
    const featuredProject = featuredProjects.find(({ id }) => id === payload.featuredProjectId);
    if (!featuredProject) return errorResponse("Featured project was not found.", 404);

    const screenshotValidation = validateScreenshots(payload.screenshots);
    if (screenshotValidation.error) return errorResponse(screenshotValidation.error, 400);
    if (screenshotValidation.screenshots.length === 0) {
      return errorResponse("Choose at least one screenshot to upload.", 400);
    }

    const galleryKey = `featured-${featuredProject.id}`;
    let newScreenshots = [];
    try {
      const existingGallery = await store.get(galleryKey, { type: "json" });
      const existingScreenshots = existingGallery?.screenshots || [];
      if (
        !Array.isArray(existingScreenshots) ||
        existingScreenshots.length > 5 ||
        existingScreenshots.some(
          (screenshot) =>
            typeof screenshot?.key !== "string" ||
            !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(screenshot.contentType)
        )
      ) {
        return errorResponse("Saved screenshots for this project are invalid.", 500);
      }
      if (existingScreenshots.length + screenshotValidation.screenshots.length > 5) {
        return errorResponse(
          `This project already has ${existingScreenshots.length} screenshots. You can add ${5 - existingScreenshots.length} more.`,
          409
        );
      }

      newScreenshots = screenshotValidation.screenshots.map(({ contentType }) => ({
        key: `image-featured-${featuredProject.id}-${randomUUID()}`,
        contentType,
      }));
      await Promise.all(
        screenshotValidation.screenshots.map(({ bytes }, index) =>
          store.set(newScreenshots[index].key, bytes, {
            metadata: { contentType: newScreenshots[index].contentType },
          })
        )
      );

      const nextGallery = {
        id: featuredProject.id,
        title: featuredProject.title,
        screenshots: [...existingScreenshots, ...newScreenshots],
      };
      try {
        await store.setJSON(galleryKey, nextGallery);
      } catch (error) {
        await Promise.all(newScreenshots.map(({ key }) => store.delete(key).catch(() => undefined)));
        throw error;
      }

      return jsonResponse({
        gallery: { id: featuredProject.id, screenshotCount: nextGallery.screenshots.length },
      }, 201);
    } catch {
      await Promise.all(newScreenshots.map(({ key }) => store.delete(key).catch(() => undefined)));
      return errorResponse("Could not save screenshots to Netlify Blobs.", 500);
    }
  }

  const validated = validateProject(payload);
  if (validated.error) return errorResponse(validated.error, 400);

  let blobs;
  try {
    ({ blobs } = await store.list({ prefix: "project-" }));
  } catch {
    return errorResponse("Could not access Netlify project storage.", 500);
  }
  if (blobs.length >= 100) return errorResponse("Portfolio project limit reached.", 409);

  const id = randomUUID();
  const screenshotRecords = validated.screenshots.map(({ contentType }, index) => ({
    key: `image-${id}-${index}`,
    contentType,
  }));
  const project = {
    id,
    ...validated.project,
    screenshots: screenshotRecords,
    createdAt: new Date().toISOString(),
  };

  try {
    await Promise.all(
      validated.screenshots.map(({ bytes }, index) =>
        store.set(screenshotRecords[index].key, bytes, {
          metadata: { contentType: screenshotRecords[index].contentType },
        })
      )
    );
    await store.setJSON(`project-${id}`, project);
  } catch {
    await Promise.all(screenshotRecords.map(({ key }) => store.delete(key).catch(() => undefined)));
    return errorResponse("Could not save the project and screenshots to Netlify Blobs.", 500);
  }

  return jsonResponse({
    project: {
      id,
      ...validated.project,
      screenshots: screenshotRecords,
      createdAt: project.createdAt,
    },
  }, 201);
};
