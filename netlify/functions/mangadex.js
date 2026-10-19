
const API_HOST = "https://api.mangadex.org";
const IMAGE_HOST = "https://uploads.mangadex.org";

const FUNCTION_PREFIX = "/.netlify/functions/mangadex";

function headers(contentType = "application/json", cache = "public, max-age=60") {
  return {
    "Content-Type": contentType,
    "Cache-Control": cache,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "X-Content-Type-Options": "nosniff"
  };
}

function response(statusCode, body, contentType = "application/json") {
  return {
    statusCode,
    headers: headers(contentType),
    body: typeof body === "string" ? body : JSON.stringify(body)
  };
}

// Reconstruct the query string without losing repeated parameters.
function getQueryString(event) {
  if (typeof event.rawQuery === "string") {
    return event.rawQuery.replace(/^\?/, "");
  }

  const params = new URLSearchParams();
  const multi = event.multiValueQueryStringParameters;

  if (multi && Object.keys(multi).length) {
    for (const [key, values] of Object.entries(multi)) {
      for (const value of values || []) {
        params.append(key, value);
      }
    }
  } else {
    for (const [key, value] of Object.entries(
      event.queryStringParameters || {}
    )) {
      if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    }
  }

  return params.toString();
}

function getApiPath(event) {
  const fullPath = event.path || "";
  let path = fullPath.startsWith(FUNCTION_PREFIX)
    ? fullPath.slice(FUNCTION_PREFIX.length)
    : "";

  // Support function path parameters as well.
  if (!path && event.pathParameters?.proxy) {
    path = "/" + event.pathParameters.proxy;
  }

  if (!path.startsWith("/")) {
    path = "/" + path;
  }

  return path;
}

function errorMessage(error) {
  return String(error?.message || error || "Unknown error");
}

exports.handler = async (event) => {
  const method = (event.httpMethod || "GET").toUpperCase();

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: headers(),
      body: ""
    };
  }

  if (method !== "GET" && method !== "HEAD") {
    return response(405, { error: "Method not allowed" });
  }

  const path = getApiPath(event);

  if (!path || path === "/") {
    return response(400, {
      error: "Missing MangaDex API path"
    });
  }

  // Do not allow arbitrary hosts or path traversal.
  if (
    path.includes("..") ||
    path.includes("\\") ||
    path.includes("\0")
  ) {
    return response(400, { error: "Invalid request path" });
  }

  const isImage = path.startsWith("/image/");
  const isAtHome = path.startsWith("/at-home/server/");

  // Only proxy the MangaDex API and the MangaDex image host.
  if (
    !isImage &&
    !path.startsWith("/manga") &&
    !path.startsWith("/chapter") &&
    !path.startsWith("/author") &&
    !path.startsWith("/group") &&
    !path.startsWith("/cover") &&
    !path.startsWith("/statistics") &&
    !isAtHome
  ) {
    return response(404, { error: "Unsupported MangaDex endpoint" });
  }

  const query = getQueryString(event);
  const upstreamBase = isImage
    ? IMAGE_HOST + path.slice("/image".length)
    : API_HOST + path;

  const target = query
    ? upstreamBase + "?" + query
    : upstreamBase;

  try {
    const upstream = await fetch(target, {
      method,
      headers: {
        Accept: isImage
          ? "image/avif,image/webp,image/png,image/jpeg,image/*,*/*"
          : "application/json",
        "User-Agent": "PanelMangaReader/1.0"
      }
    });

    const contentType =
      upstream.headers.get("content-type") ||
      (isImage ? "application/octet-stream" : "application/json");

    const cache = isImage
      ? "public, max-age=86400"
      : "public, max-age=60";

    if (!upstream.ok) {
      const errorBody = await upstream.text();

      return {
        statusCode: upstream.status,
        headers: headers(contentType),
        body: errorBody
      };
    }

    // Images must be returned as base64 through Netlify Functions.
    if (isImage) {
      const bytes = Buffer.from(await upstream.arrayBuffer());

      return {
        statusCode: upstream.status,
        headers: headers(contentType, cache),
        isBase64Encoded: true,
        body: bytes.toString("base64")
      };
    }

    const text = await upstream.text();
    let body = text;

    // Route chapter image requests through this same function.
    if (isAtHome) {
      try {
        const json = JSON.parse(text);

        if (json.baseUrl) {
          json.baseUrl = FUNCTION_PREFIX + "/image";
        }

        body = JSON.stringify(json);
      } catch {
        return response(502, {
          error: "MangaDex returned invalid chapter-server data"
        });
      }
    }

    return {
      statusCode: upstream.status,
      headers: headers(contentType, cache),
      body
    };
  } catch (error) {
    return response(502, {
      error: "Unable to reach MangaDex",
      detail: errorMessage(error)
    });
  }
};
