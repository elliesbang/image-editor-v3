import { Type } from "@google/genai";
import { GeminiAnalysisResponse } from "../types";

let generationInFlight = false;
let analysisInFlight = false;

async function callGeminiEndpoint(body: Record<string, unknown>) {
  const response = await fetch("/api/generate-image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

/**
 * Service to handle image analysis and generation using backend Gemini proxy.
 */
export async function generateAIImages(prompt: string, count: number = 4, referenceImage?: string): Promise<string[]> {
  if (generationInFlight) {
    throw new Error("이미지 생성이 이미 진행 중입니다. 잠시 후 다시 시도해 주세요.");
  }
  generationInFlight = true;

  try {
    const requests = Array.from({ length: count }).map(async () => {
      const response = await callGeminiEndpoint({
        prompt,
        referenceImage,
        model: "gemini-2.0-flash-exp",
        config: {
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: "1K",
          },
        },
      });

      if (response.candidates && response.candidates[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      return null;
    });

    const generated = await Promise.all(requests);
    const filtered = generated.filter((img): img is string => img !== null);

    if (filtered.length === 0) {
      throw new Error("생성된 이미지가 없습니다. 다시 시도해 주세요.");
    }

    return filtered;
  } catch (e) {
    console.error("Generation failed", e);
    throw e instanceof Error ? e : new Error("이미지 생성에 실패했습니다.");
  } finally {
    generationInFlight = false;
  }
}

export async function analyzeImages(
  images: { id: string; base64: string }[]
): Promise<GeminiAnalysisResponse> {
  if (analysisInFlight) {
    throw new Error("Analysis already in progress");
  }
  analysisInFlight = true;

  const parts = images.map((img) => ({
    inlineData: {
      data: img.base64.split(",")[1],
      mimeType: "image/png",
    },
  }));

  const prompt = `이 ${images.length}개의 이미지를 분석하여 '미리캔버스' 스톡 사이트 SEO에 최적화된 키워드와 제목을 한국어로 추출해 주세요.

1. **키워드 추출 원칙 (미리캔버스 최적화)**:
   - **순수 내용 중심**: '누끼', '배경 제거', '고해상도', '이미지', '질감' 같은 기술적/포맷팅 용어를 절대 사용하지 마세요.
   - **이미지 객체 묘사**: 오직 이미지 속에 보이는 객체, 상황, 감정, 장소에 집중하세요. (예: 학사모, 졸업하는 어린이, 유치원 졸업, 축하, 꽃다발)
   - **명사 위주**: 검색 효율이 높은 한국어 명사 위주로 나열하세요.
   - **개수**: 각 이미지별로 20개 이상, 전체 공통 키워드(commonKeywords)는 가장 핵심적인 것 25개를 추출하세요.

2. **제목 생성**:
   - 추출된 핵심 키워드들을 자연스럽게 조합하여 검색이 잘 될 만한 명료한 한국어 제목을 작성하세요.

3. **응답 형식**:
   - 반드시 JSON 구조를 지키세요.
   {
     "files": [
       { "id": "아이디", "keywords": ["한국어키워드1", "한국어키워드2", ...], "title": "한국어제목" }
     ],
     "commonKeywords": ["공통핵심키워드1", ..., "총25개"]
   }`;

  try {
    const response = await callGeminiEndpoint({
      prompt,
      images,
      model: "gemini-2.0-flash-exp",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            files: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                  title: { type: Type.STRING },
                },
                required: ["id", "keywords", "title"],
              },
            },
            commonKeywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ["files", "commonKeywords"],
        },
      },
    });

    return JSON.parse(response.text || "{}") as GeminiAnalysisResponse;
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    throw new Error("분석 데이터 생성 실패");
  } finally {
    analysisInFlight = false;
  }
}
