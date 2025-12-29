export async function onRequestPost(context: {
  request: Request;
  env: { GEMINI_API_KEY?: string } & Record<string, unknown>;
}) {
  const { request, env } = context;

  console.log("[generate-image] Function entry");

  const geminiEndpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent";

  let body: any;
  try {
    body = await request.json();
  } catch (error) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { prompt, referenceImage, images, config } = body || {};

  if (!prompt) {
    return new Response(JSON.stringify({ error: "Prompt is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!env.GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: "Gemini API key is not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const parts: any[] = [];

    if (Array.isArray(images)) {
      for (const image of images) {
        if (typeof image?.base64 === "string") {
          parts.push({
            inlineData: {
              data: image.base64.split(",")[1],
              mimeType: "image/png",
            },
          });
        }
      }
    }

    if (typeof referenceImage === "string") {
      parts.push({
        inlineData: {
          data: referenceImage.split(",")[1],
          mimeType: "image/png",
        },
      });
    }

    parts.push({ text: prompt });

    const generationConfig = config || {};

    console.log("[generate-image] Gemini fetch starting");

    const response = await fetch(`${geminiEndpoint}?key=${env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig,
      }),
    });

    console.log("[generate-image] Gemini response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: errorText || "Gemini request failed" }), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    const message = error?.message || "Failed to generate image";
    const status = typeof error?.status === "number" ? error.status : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
