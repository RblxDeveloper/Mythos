
export interface CastMember {
  id: string;
  name: string;
  role: string;
}

export interface StoryPage {
  text: string;
  imagePrompt: string;
  imageUrl?: string;
  audioData?: string; // Base64 PCM data from TTS
}

export interface Story {
  id: string;
  title: string;
  genre: string;
  mood: string;
  style: string;
  plot: string;
  cast: CastMember[];
  pages: StoryPage[];
  createdAt: number;
  isFavorite: boolean;
  isGeneratingImages?: boolean;
}

export type View = 'generator' | 'library' | 'reader';

export enum Genre {
  Fantasy = 'Fantasy',
  SciFi = 'Sci-Fi',
  Mystery = 'Mystery',
  Horror = 'Horror',
  Adventure = 'Adventure',
  Fairytale = 'Fairytale',
  Mythology = 'Mythology',
  Steampunk = 'Steampunk',
  Noir = 'Noir',
  Romance = 'Romance'
}

export enum Mood {
  Epic = 'Epic',
  Funny = 'Funny',
  Spooky = 'Spooky',
  Whimsical = 'Whimsical',
  Dark = 'Dark',
  Hopeful = 'Hopeful',
  Melancholic = 'Melancholic',
  Tense = 'Tense'
}

export enum StoryStyle {
  OilPainting = 'Oil Painting',
  Cinematic = 'Cinematic',
  WaterColor = 'Water Color',
  PencilSketch = 'Pencil Sketch',
  Cyberpunk = 'Cyberpunk',
  Vintage = 'Vintage',
  ConceptArt = 'Concept Art'
}
