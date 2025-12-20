
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Story, CastMember, Genre, Mood, StoryPage, StoryStyle, Voice } from "./types";

const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key environment variable is missing.");
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
  const castStr = cast.map(c => `${c.name} (a ${c.role})`).join(", ");
  
  const systemInstruction = `
    You are a professional story designer. Create a high-quality ${pageCount}-page story.
    Genre: ${genre}, Mood: ${mood}, Visual Theme: ${style}, Cast: ${castStr}.
    Plot Hook: ${plotPrompt || "Create a unique, compelling original narrative."}

    CRITICAL INSTRUCTION FOR RELEVANCE:
    Every page MUST have a matching "imagePrompt". 
    The "imagePrompt" MUST be a literal, visual description of exactly what is happening in that page's text.
    Include specific details about characters' appearance (hair color, clothing) in every "imagePrompt" to maintain visual consistency.
    Do not use abstract concepts in "imagePrompt"; use physical descriptions.

    Output strictly in JSON format.
    The response must contain:
    1. "title": A creative title.
    2. "pages": Exactly ${pageCount} objects with "text" (Markdown) and "imagePrompt" (Literal visual scene description).
  `;

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
  // Using gemini-2.5-flash-image for maximum stability and prompt following
  const enhancedPrompt = `A professional storybook illustration. Style: ${genre}. Scene: ${prompt}. High quality, cinematic lighting, perfectly relevant to the story, 4k resolution.`;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: enhancedPrompt }] },
      config: { 
        imageConfig: { 
          aspectRatio: "1:1"
        } 
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
  } catch (error: any) {
    console.error("Visual generation failed:", error);
  }
  
  // Return a themed black/white placeholder if generation fails, NEVER a random unrelated photo.
  return `https://placehold.co/1024x1024/000000/FFFFFF?text=Visualizing+the+Story...`;
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
    return undefined;
  }
};
