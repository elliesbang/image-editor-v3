import { GoogleGenAI } from "@google/genai";

export const onRequestPost: PagesFunction<{
  GEMINI_API_KEY: string;
}> = async ({ request, env }) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch (error) {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { prompt, referenceImage, images, config, model } = body || {};

  if (!prompt) {
    return new Response("Prompt is required", { status: 400 });
  }

  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const modelId = model || "gemini-2.0-flash-exp";

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

  const response = await ai.models.generateContent({
    model: modelId,
    contents: [{ parts }],
    config,
  });

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
