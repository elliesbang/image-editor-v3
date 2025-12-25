
import { GoogleGenAI, Type } from "@google/genai";
import { GeminiAnalysisResponse } from "./types";

/**
 * Service to handle image analysis and generation using Google Gemini API.
 */
export async function generateAIImages(prompt: string, count: number = 4, referenceImage?: string): Promise<string[]> {
  // Gemini 3 Pro Image 모델은 고품질 사진 및 배경 생성에 최적화되어 있습니다.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-image-preview';

  const promises = Array.from({ length: count }).map(async () => {
    try {
      const parts: any[] = [];
      
      // 참조 이미지가 있는 경우 (배경 생성/편집 모드)
      if (referenceImage) {
        parts.push({
          inlineData: {
            data: referenceImage.split(",")[1],
            mimeType: "image/png",
          },
        });
      }
      
      // 텍스트 프롬프트 추가
      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model,
        contents: { parts },
        config: { 
          imageConfig: { 
            aspectRatio: "1:1",
            imageSize: "1K" // 고해상도 설정
          } 
        }
      });

      if (response.candidates && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    } catch (e) { 
      console.error("Generation failed", e); 
    }
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
