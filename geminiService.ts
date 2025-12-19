
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Story, CastMember, Genre, Mood, StoryPage, StoryStyle, Voice } from "./types";

const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key is missing.");
  return new GoogleGenAI({ apiKey });
};

export const generateStoryContent = async (
  genre: Genre,
  mood: Mood,
  pageCount: number,
  cast: CastMember[],
  plotPrompt: string,
  style: StoryStyle
): Promise<{ title: string; pages: StoryPage[] }> => {
  const ai = getAI();
  const castStr = cast.map(c => `${c.name} as ${c.role}`).join(", ");
  
  const systemInstruction = `
    You are a professional story designer. Create a high-quality ${pageCount}-page story.
    Genre: ${genre}, Mood: ${mood}, Visual Theme: ${style}, Cast: ${castStr}.
    Plot Hook: ${plotPrompt || "Create a unique, compelling original narrative."}

    CRITICAL INSTRUCTION FOR VISUALS:
    Every page MUST have a matching "imagePrompt". 
    The "imagePrompt" for the LAST page MUST be a definitive, concluding scene that features the main characters in a way that resolves the narrative visually.
    Ensure visual consistency by describing the same character features and setting details in every prompt.

    Output strictly in JSON format.
    The response must contain:
    1. "title": A creative title.
    2. "pages": Exactly ${pageCount} objects with "text" (Markdown) and "imagePrompt" (Detailed description).
  `;

  // Explicitly using gemini-3-flash-preview as requested for core story generation
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: "Manifest the chronicle.",
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          pages: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                imagePrompt: { type: Type.STRING }
              },
              required: ["text", "imagePrompt"]
            }
          }
        },
        required: ["title", "pages"]
      }
    }
  });

  return JSON.parse(response.text);
};

export const generateImageForPage = async (prompt: string, genre: Genre): Promise<string> => {
  const ai = getAI();
  const enhancedPrompt = `High-end professional illustration. Scene: ${prompt}. Artistic style: ${genre}. 4k, cinematic lighting, ultra-detailed.`;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: enhancedPrompt }] },
      config: { imageConfig: { aspectRatio: "1:1" } }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
  } catch (error) {
    console.error("Visual generation failed:", error);
  }
  return `https://picsum.photos/1024/1024?random=${Math.random()}`;
};

export const generateNarration = async (text: string, voice: Voice): Promise<string | undefined> => {
  const ai = getAI();
  const voiceName = voice === Voice.Male ? 'Puck' : 'Kore';
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text.replace(/[*_#]/g, '') }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (error: any) {
    // Gracefully handle rate limits (429) or other TTS errors to ensure story generation continues
    if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('QUOTA')) {
      console.warn("Narration quota exhausted. Proceeding without speech.");
      return undefined;
    }
    console.warn("TTS Failed:", error);
    return undefined;
  }
};
