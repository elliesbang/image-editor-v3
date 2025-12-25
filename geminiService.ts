
import { GoogleGenAI, Type } from "@google/genai";
import { GeminiAnalysisResponse } from "./types";

/**
 * Service to handle image analysis and generation using Google Gemini API.
 */
export async function generateAIImages(prompt: string, count: number = 4): Promise<string[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const promises = Array.from({ length: count }).map(async () => {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: `${prompt} --seed ${Math.floor(Math.random() * 1000000)}` }]
        },
        config: { imageConfig: { aspectRatio: "1:1" } }
      });
      if (response.candidates && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    } catch (e) { console.error("Generation failed", e); }
    return null;
  });
  const generated = await Promise.all(promises);
  return generated.filter((img): img is string => img !== null);
}

export async function analyzeImages(
  images: { id: string; base64: string }[]
): Promise<GeminiAnalysisResponse> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-flash-preview";

  const parts = images.map((img) => ({
    inlineData: {
      data: img.base64.split(",")[1],
      mimeType: "image/png",
    },
  }));

  const prompt = `이 ${images.length}개의 이미지를 분석하여 스톡 사이트 SEO에 최적화된 키워드와 제목을 추출해 주세요. 
  **중요: 모든 키워드와 제목은 반드시 한국어(한글)로만 작성해야 합니다.**

1. **키워드 추출 원칙 (한국어 SEO)**:
   - **명사 위주**: 핵심 객체, 재질, 배경, 환경, 테마를 명확한 한국어 명사로 나열하세요.
   - **상업적 키워드**: '누끼', '흰색 배경', '고해상도', '상업용 예술' 등 구매자가 검색할 법한 단어를 한국어로 포함하세요.
   - **금지 단어**: '아름다운', '멋진', '최고의' 같은 주관적 형용사는 사용하지 마세요.
   - **개별 분석**: 각 이미지별로 20개 이상의 한국어 키워드를 추출하세요.
   - **공통 분석**: 전체를 관통하는 핵심 한국어 키워드 25개를 'commonKeywords'에 담으세요.

2. **제목 생성**:
   - 검색 엔진이 좋아하도록 핵심 키워드를 전면에 배치한 명료한 한국어 제목을 작성하세요.

3. **응답 형식**:
   - JSON 구조를 엄격히 지키세요.
   {
     "files": [
       { "id": "아이디", "keywords": ["한국어키워드1", "한국어키워드2", ...], "title": "한국어제목" }
     ],
     "commonKeywords": ["공통한국어키워드1", ..., "총25개"]
   }`;

  const response = await ai.models.generateContent({
    model,
    contents: [{ parts: [...parts, { text: prompt }] }],
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

  try {
    return JSON.parse(response.text || "{}") as GeminiAnalysisResponse;
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    throw new Error("분석 데이터 생성 실패");
  }
}
