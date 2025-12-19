
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Story, CastMember, Genre, Mood, StoryPage, StoryStyle } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateStoryContent = async (
  genre: Genre,
  mood: Mood,
  pageCount: number,
  cast: CastMember[],
  plotPrompt: string,
  style: StoryStyle
): Promise<{ title: string; pages: StoryPage[] }> => {
  const castStr = cast.map(c => `${c.name} as ${c.role}`).join(", ");
  
  const systemInstruction = `
    You are a professional story designer. Create a high-quality ${pageCount}-page story.
    Genre: ${genre}
    Mood: ${mood}
    Visual Theme: ${style}
    Cast: ${castStr}
    Plot Hook: ${plotPrompt || "Create a unique, compelling original narrative."}

    Output strictly in JSON format.
    The response must contain:
    1. "title": A creative title for the story.
    2. "pages": An array of exactly ${pageCount} objects. Each object has:
       - "text": The story text for that page (roughly 100-150 words). Use standard Markdown for bold/italics.
       - "imagePrompt": A highly detailed descriptive prompt for an illustrator that captures the scene on this page. Focus on lighting, composition, and mood consistent with the ${style} theme.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: "Write the content now.",
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
  const enhancedPrompt = `High-end professional illustration. Scene: ${prompt}. Artistic influence from ${genre} aesthetics. High resolution, clear composition.`;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: enhancedPrompt }]
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  } catch (error) {
    console.error("Visual asset generation failed:", error);
  }
  return `https://picsum.photos/1024/1024?random=${Math.random()}`;
};

/**
 * Strips Markdown characters to prevent TTS 500 errors caused by special formatting
 */
const cleanTextForTTS = (text: string): string => {
  return text
    .replace(/[*_#~`]/g, '') // Remove markdown symbols
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim()
    .slice(0, 1000);          // Truncate to a safe length for preview models
};

export const generateNarration = async (text: string, mood: Mood, retries = 2): Promise<string | undefined> => {
  const cleanedText = cleanTextForTTS(text);
  
  const voiceMap: Record<string, string> = {
    [Mood.Epic]: 'Kore',
    [Mood.Funny]: 'Puck',
    [Mood.Spooky]: 'Charon',
    [Mood.Whimsical]: 'Zephyr',
    [Mood.Dark]: 'Charon',
    [Mood.Hopeful]: 'Kore',
    [Mood.Melancholic]: 'Fenrir',
    [Mood.Tense]: 'Fenrir'
  };

  for (let i = 0; i <= retries; i++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Read this with a ${mood} tone: ${cleanedText}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceMap[mood] || 'Kore' },
            },
          },
        },
      });

      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioData) return audioData;
    } catch (error) {
      console.warn(`Narration attempt ${i + 1} failed:`, error);
      if (i === retries) {
        console.error("Audio generation failed after all retries", error);
        return undefined;
      }
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  return undefined;
};
