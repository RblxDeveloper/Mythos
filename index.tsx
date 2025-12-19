
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Story, 
  View, 
  Genre, 
  Mood, 
  StoryStyle,
  CastMember, 
  StoryPage 
} from './types';
import { generateStoryContent, generateImageForPage, generateNarration } from './geminiService';
import { exportToPDF } from './components/PDFExporter';
import Sidebar from './components/Sidebar';

// Modern Custom Dropdown with Full-Bleed Selection
const Dropdown = ({ value, options, onChange }: { value: string, options: string[], onChange: (val: any) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={containerRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-slate-50 px-6 py-4 rounded-2xl text-sm font-bold text-slate-700 flex items-center justify-between hover:bg-slate-100 transition-all border border-transparent focus:border-slate-200 shadow-sm"
      >
        <span className="truncate uppercase tracking-wider">{value}</span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isOpen && (
        <div className="absolute top-[calc(100%+8px)] left-0 w-full bg-white shadow-[0_30px_60px_-12px_rgba(0,0,0,0.25)] rounded-[1.5rem] border border-slate-100 overflow-hidden z-[100] animate-in fade-in zoom-in-95 duration-200 no-scrollbar max-h-72 overflow-y-auto">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setIsOpen(false); }}
              className={`w-full text-left px-6 py-4 text-sm font-bold transition-all block ${value === opt ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
            >
              {opt.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Audio Helpers
function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const App = () => {
  const [view, setView] = useState<View>('generator');
  const [stories, setStories] = useState<Story[]>([]);
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0, step: 'Drafting...' });
  const [isNarrating, setIsNarrating] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Form State - Defaults updated: Epic and Oil Painting
  const [genre, setGenre] = useState<Genre>(Genre.Fantasy);
  const [mood, setMood] = useState<Mood>(Mood.Epic);
  const [style, setStyle] = useState<StoryStyle>(StoryStyle.OilPainting);
  const [pageCount, setPageCount] = useState(5);
  const [plot, setPlot] = useState('');
  const [cast, setCast] = useState<CastMember[]>([
    { id: '1', name: '', role: '' }
  ]);

  useEffect(() => {
    const saved = localStorage.getItem('mythos_stories');
    if (saved) {
      try { 
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setStories(parsed);
      } catch (e) {
        console.error("Failed to load stories", e);
      }
    }
  }, []);

  useEffect(() => {
    if (stories.length > 0) {
      localStorage.setItem('mythos_stories', JSON.stringify(stories));
    }
  }, [stories]);

  const stopAudio = () => {
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch (e) {}
      audioSourceRef.current = null;
    }
    setIsNarrating(false);
  };

  const playNarration = async (base64Audio: string) => {
    stopAudio();
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') await ctx.resume();
    const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.onended = () => setIsNarrating(false);
    audioSourceRef.current = source;
    source.start();
    setIsNarrating(true);
  };

  const handleGenerate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setGenerationProgress({ current: 0, total: pageCount, step: 'Drafting your epic...' });
    
    try {
      const result = await generateStoryContent(genre, mood, pageCount, cast, plot, style);
      
      if (!result || !result.pages) throw new Error("Invalid story generation result");

      const newStory: Story = {
        id: Date.now().toString(),
        title: result.title,
        genre,
        mood,
        style,
        plot,
        cast,
        pages: result.pages,
        createdAt: Date.now(),
        isFavorite: false,
        isGeneratingImages: true
      };

      setGenerationProgress(prev => ({ ...prev, step: 'Crafting illustrations...' }));
      
      const assetPromises = result.pages.map(async (page, index) => {
        try {
          const imageUrl = await generateImageForPage(page.imagePrompt, genre);
          const audioData = await generateNarration(page.text, mood);
          setGenerationProgress(prev => ({ 
            ...prev, 
            current: prev.current + 1,
            step: `Chapter ${prev.current + 1} of ${pageCount} complete...` 
          }));
          return { ...page, imageUrl, audioData };
        } catch (err) {
          console.error(`Asset failed for page ${index}`, err);
          return { ...page, imageUrl: 'https://images.unsplash.com/photo-1543004223-249377484407' };
        }
      });

      const finalPages = await Promise.all(assetPromises);
      newStory.pages = finalPages;
      newStory.isGeneratingImages = false;

      // Robust state transition
      setStories(prev => [newStory, ...prev]);
      setActiveStory(newStory);
      setCurrentPageIndex(0);
      setView('reader');
    } catch (error) {
      console.error(error);
      alert("We encountered an issue crafting your story. Please try refining your plot or characters.");
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleFavorite = (id: string) => {
    setStories(prev => prev.map(s => s.id === id ? { ...s, isFavorite: !s.isFavorite } : s));
  };

  const openStory = (story: Story) => {
    setActiveStory(story);
    setCurrentPageIndex(0);
    setView('reader');
  };

  const deleteStory = (id: string) => {
    if (confirm("Permanently delete this story?")) {
      setStories(prev => prev.filter(s => s.id !== id));
      if (activeStory?.id === id) {
        setActiveStory(null);
        setView('library');
      }
    }
  };

  const renderGenerator = () => (
    <div className="max-w-7xl mx-auto py-12 px-6 lg:px-8 mt-16 lg:mt-0">
      <div className="flex flex-col lg:flex-row gap-8 items-stretch mb-24">
        {/* Story Configuration Column */}
        <div className="lg:w-1/3 flex flex-col gap-8 order-1">
          <div className="modern-card p-8 lg:p-10 w-full animate-slide-up flex flex-col" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center gap-4 mb-10">
              <div className="w-14 h-14 bg-slate-900 rounded-[1.5rem] flex items-center justify-center text-xl shadow-xl shadow-slate-200">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Configuration</h2>
                <p className="text-slate-400 text-sm font-medium">Define your story's foundation</p>
              </div>
            </div>

            <div className="space-y-8 flex-grow">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🏷️</span>
                  <label className="font-bold text-slate-700 tracking-tight">Genre</label>
                </div>
                <Dropdown value={genre} options={Object.values(Genre)} onChange={setGenre} />
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🎭</span>
                  <label className="font-bold text-slate-700 tracking-tight">Mood</label>
                </div>
                <Dropdown value={mood} options={Object.values(Mood)} onChange={setMood} />
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🎨</span>
                  <label className="font-bold text-slate-700 tracking-tight">Art Style</label>
                </div>
                <Dropdown value={style} options={Object.values(StoryStyle)} onChange={setStyle} />
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📏</span>
                    <label className="font-bold text-slate-700 tracking-tight">Length</label>
                  </div>
                  <span className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-lg">{pageCount} Pages</span>
                </div>
                <div className="px-1">
                  <input type="range" min="3" max="10" value={pageCount} onChange={(e) => setPageCount(parseInt(e.target.value))} />
                </div>
              </div>
            </div>
            
            {/* Hidden on mobile to place button at the very bottom */}
            <button 
              onClick={handleGenerate}
              disabled={isGenerating}
              className="hidden lg:block mt-12 w-full py-6 bg-slate-900 text-white rounded-[2rem] font-bold text-lg hover:bg-slate-800 transition-all shadow-2xl active:scale-[0.97] disabled:opacity-50"
            >
              {isGenerating ? 'Drafting Story...' : 'Create Story'}
            </button>
          </div>
        </div>

        {/* Characters and Plot Column */}
        <div className="lg:w-2/3 flex flex-col gap-8 order-2">
          <div className="modern-card p-8 lg:p-10 animate-slide-up flex flex-col" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center gap-4 mb-10">
              <span className="text-3xl">👥</span>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Protagonists</h2>
            </div>
            
            <div className="space-y-4 mb-8">
              {cast.map((c, idx) => (
                <div key={c.id} className="soft-input p-6 flex flex-col sm:flex-row items-center gap-6 group animate-slide-up">
                  <div className="w-12 h-12 rounded-[1.25rem] bg-white flex items-center justify-center text-slate-200 font-extrabold border border-slate-100 shadow-sm text-lg shrink-0">
                    {idx + 1}
                  </div>
                  <input 
                    placeholder="Name" 
                    value={c.name} 
                    onChange={(e) => setCast(cast.map(char => char.id === c.id ? { ...char, name: e.target.value } : char))}
                    className="w-full sm:flex-1 bg-transparent border-b border-slate-200 py-2 outline-none focus:border-slate-900 transition-all font-bold text-slate-700 placeholder:text-slate-300"
                  />
                  <input 
                    placeholder="Role" 
                    value={c.role} 
                    onChange={(e) => setCast(cast.map(char => char.id === c.id ? { ...char, role: e.target.value } : char))}
                    className="w-full sm:flex-1 bg-transparent border-b border-slate-200 py-2 outline-none focus:border-slate-900 transition-all font-bold text-slate-700 placeholder:text-slate-300"
                  />
                  {cast.length > 1 && (
                    <button onClick={() => setCast(cast.filter(char => char.id !== c.id))} className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-50 text-red-300 hover:bg-red-100 hover:text-red-500 transition-all opacity-100 lg:opacity-0 group-hover:opacity-100">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button onClick={() => setCast([...cast, { id: Date.now().toString(), name: '', role: '' }])} className="w-full py-5 border-2 border-dashed border-slate-100 rounded-[2rem] text-slate-400 font-bold text-sm hover:border-slate-300 hover:text-slate-600 transition-all group">
              <span className="group-hover:scale-110 inline-block transition-transform">+ Add character</span>
            </button>
          </div>

          <div className="modern-card p-8 lg:p-10 animate-slide-up flex flex-col flex-grow" style={{ animationDelay: '0.3s' }}>
            <div className="flex items-center gap-4 mb-8">
              <span className="text-3xl">✏️</span>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Starting Plot</h2>
            </div>
            <div className="soft-input p-10 flex-grow">
              <textarea 
                placeholder="Give us a hook or leave it blank..." 
                value={plot}
                onChange={(e) => setPlot(e.target.value)}
                className="w-full h-full min-h-[160px] bg-transparent outline-none resize-none font-bold text-slate-600 text-lg leading-relaxed placeholder:text-slate-300 no-scrollbar"
              />
            </div>
          </div>
          
          {/* Mobile only button - positioned at bottom of entire form stack */}
          <button 
            onClick={handleGenerate}
            disabled={isGenerating}
            className="lg:hidden w-full py-6 bg-slate-900 text-white rounded-[2rem] font-bold text-lg hover:bg-slate-800 transition-all shadow-2xl active:scale-[0.97] disabled:opacity-50 mt-4"
          >
            {isGenerating ? 'Drafting Story...' : 'Create Story'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderLibrary = () => (
    <div className="max-w-7xl mx-auto py-16 px-6 lg:px-8 mt-16 lg:mt-0">
      <header className="mb-16 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 animate-slide-up">
        <div>
          <h1 className="text-5xl font-extrabold text-slate-900 tracking-tight">My Library</h1>
          <p className="text-slate-400 font-bold mt-2">Your collection of handcrafted folios.</p>
        </div>
        <div className="bg-white px-8 py-4 rounded-3xl shadow-sm text-sm font-extrabold text-slate-900 border border-slate-100">
          {stories.length} Items
        </div>
      </header>

      {stories.length === 0 ? (
        <div className="modern-card py-40 flex flex-col items-center justify-center animate-slide-up">
          <div className="text-9xl mb-12 opacity-10">📖</div>
          <h2 className="text-3xl font-extrabold text-slate-300">Your collection is empty</h2>
          <button onClick={() => setView('generator')} className="mt-10 px-12 py-5 bg-slate-900 text-white rounded-[2rem] font-bold shadow-2xl hover:scale-105 transition-all active:scale-95">Start Writing</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {stories.map((story, i) => (
            <div key={story.id} className="modern-card overflow-hidden flex flex-col group animate-slide-up h-full" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="h-72 relative overflow-hidden">
                <img src={story.pages[0]?.imageUrl || 'https://images.unsplash.com/photo-1543004223-249377484407'} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-8 left-8 right-8">
                   <div className="flex gap-3 mb-3">
                     <span className="px-4 py-1.5 bg-white/20 backdrop-blur-xl rounded-[0.5rem] text-[10px] text-white font-black uppercase tracking-[0.2em]">{story.genre}</span>
                     <span className="px-4 py-1.5 bg-indigo-500/80 backdrop-blur-xl rounded-[0.5rem] text-[10px] text-white font-black uppercase tracking-[0.2em]">{story.mood}</span>
                   </div>
                   <h3 className="text-2xl font-extrabold text-white line-clamp-2 tracking-tight leading-tight">{story.title}</h3>
                </div>
              </div>
              <div className="p-10 flex-grow flex flex-col">
                <div className="flex justify-between items-center mb-10">
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{new Date(story.createdAt).toLocaleDateString()}</p>
                  <button onClick={() => toggleFavorite(story.id)} className="w-12 h-12 flex items-center justify-center rounded-2xl bg-slate-50 transition-all hover:scale-110 active:scale-90 text-2xl">
                    {story.isFavorite ? '❤️' : '🤍'}
                  </button>
                </div>
                <div className="mt-auto flex flex-col gap-4">
                  <button onClick={() => openStory(story)} className="w-full bg-slate-900 text-white py-5 rounded-[1.5rem] font-extrabold text-sm hover:shadow-2xl hover:shadow-slate-300 transition-all active:scale-95">Read Book</button>
                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => exportToPDF(story)} className="bg-slate-50 text-slate-600 py-4 rounded-[1.5rem] font-bold text-xs hover:bg-slate-100 transition-all flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      Export
                    </button>
                    <button onClick={() => deleteStory(story.id)} className="bg-red-50 text-red-400 py-4 rounded-[1.5rem] font-bold text-xs hover:bg-red-100 transition-all flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderReader = () => {
    // Robust check for state synchronization
    if (!activeStory || !activeStory.pages || activeStory.pages.length === 0) {
      return (
        <div className="fixed inset-0 bg-slate-950 z-[200] flex items-center justify-center flex-col text-white gap-6">
          <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-xl font-bold tracking-widest uppercase animate-pulse">Initializing Folio...</p>
          <button onClick={() => setView('library')} className="px-10 py-4 bg-white/10 hover:bg-white/20 transition-all text-white rounded-full font-bold uppercase text-xs tracking-widest mt-4">Cancel</button>
        </div>
      );
    }
    const page = activeStory.pages[currentPageIndex];
    const wordCount = page?.text?.split(/\s+/)?.length || 0;

    return (
      <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col overflow-hidden animate-in fade-in duration-700">
        {/* Navigation Bar */}
        <div className="h-24 bg-white/5 backdrop-blur-2xl border-b border-white/10 px-6 lg:px-10 flex items-center justify-between shrink-0">
          <button onClick={() => { stopAudio(); setView('library'); }} className="text-white/60 hover:text-white transition-all font-black tracking-[0.4em] text-[10px] flex items-center gap-3 group">
            <span className="text-xl group-hover:-translate-x-1 transition-transform">←</span> LIBRARY
          </button>
          <div className="hidden md:block text-center flex-1 mx-8 overflow-hidden">
            <h2 className="text-white font-extrabold tracking-tight text-xl truncate">{activeStory.title}</h2>
            <p className="text-[10px] text-white/30 font-black tracking-widest uppercase mt-1">PAGE {currentPageIndex + 1}</p>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={() => exportToPDF(activeStory)} className="px-8 py-3 bg-white text-slate-900 rounded-full font-black text-[10px] tracking-widest hover:bg-slate-200 transition-all shadow-xl shadow-black/50 active:scale-95">EXPORT VOLUME</button>
          </div>
        </div>

        {/* Story Reader Surface */}
        <div className="flex-grow flex items-center justify-center p-4 lg:p-12 relative overflow-hidden">
          {/* Controls - Layered above book */}
          <button 
            disabled={currentPageIndex === 0}
            onClick={() => { stopAudio(); setCurrentPageIndex(p => p - 1); }}
            className={`absolute left-4 lg:left-12 w-16 h-16 lg:w-20 lg:h-20 rounded-[2rem] bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white text-2xl lg:text-3xl transition-all z-20 ${currentPageIndex === 0 ? 'opacity-0 pointer-events-none' : 'hover:bg-white/15 hover:scale-105 active:scale-95 shadow-2xl'}`}
          >←</button>
          
          <button 
            disabled={currentPageIndex === activeStory.pages.length - 1}
            onClick={() => { stopAudio(); setCurrentPageIndex(p => p + 1); }}
            className={`absolute right-4 lg:right-12 w-16 h-16 lg:w-20 lg:h-20 rounded-[2rem] bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white text-2xl lg:text-3xl transition-all z-20 ${currentPageIndex === activeStory.pages.length - 1 ? 'opacity-0 pointer-events-none' : 'hover:bg-white/15 hover:scale-105 active:scale-95 shadow-2xl'}`}
          >→</button>

          <div className="w-full max-w-[1500px] h-full max-h-[850px] bg-[#fdfbf7] rounded-[2.5rem] lg:rounded-[3.5rem] overflow-hidden flex flex-col lg:flex-row shadow-[0_50px_100px_-20px_rgba(0,0,0,0.8)] paper-texture relative animate-slide-up lg:border-x-[1.25rem] border-slate-900/40">
            {/* Visual Part */}
            <div className="w-full lg:w-1/2 h-1/2 lg:h-full bg-slate-900/5 relative overflow-hidden flex-shrink-0">
              {page?.imageUrl ? (
                <img src={page.imageUrl} className="w-full h-full object-cover animate-in fade-in zoom-in-110 duration-1000" key={page.imageUrl} />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-200">
                  <div className="w-12 h-12 border-4 border-slate-400 border-t-slate-900 rounded-full animate-spin mb-4" />
                  <p className="font-black tracking-[0.2em] text-[10px] text-slate-500 uppercase">Crafting Scene...</p>
                </div>
              )}
              <div className="hidden lg:block absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-black/20 to-transparent pointer-events-none" />
            </div>

            {/* Narrative Part */}
            <div className="w-full lg:w-1/2 h-1/2 lg:h-full p-8 lg:p-20 xl:p-24 flex flex-col relative overflow-y-auto no-scrollbar bg-white">
              <div className="hidden lg:block absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-black/10 to-transparent pointer-events-none" />
              
              <div className="flex justify-between items-center mb-8 lg:mb-12 relative z-10 shrink-0">
                <div className="flex flex-col">
                  <span className="text-[11px] font-black text-slate-300 tracking-[0.5em] uppercase">FOLIO {currentPageIndex + 1}</span>
                  <span className="text-[9px] font-bold text-slate-200 uppercase tracking-widest mt-1">{wordCount} WORDS</span>
                </div>
                {page?.audioData && (
                  <button 
                    onClick={() => isNarrating ? stopAudio() : playNarration(page.audioData!)} 
                    className={`w-12 h-12 lg:w-14 lg:h-14 rounded-[1.25rem] flex items-center justify-center transition-all shadow-lg ${isNarrating ? 'bg-slate-900 text-white animate-pulse' : 'bg-white text-slate-400 hover:text-slate-900 hover:shadow-slate-100 border border-slate-100'}`}
                  >
                    {isNarrating ? <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
                  </button>
                )}
              </div>

              <div className="flex-grow flex flex-col relative z-10">
                <div className="prose prose-xl lg:prose-2xl max-w-none font-crimson text-slate-800 leading-relaxed drop-cap selection:bg-slate-100">
                  {page?.text?.split('').map((char, i) => <span key={i} className={char === '*' ? 'font-bold text-slate-900 italic' : ''}>{char === '*' ? '' : char}</span>)}
                </div>
              </div>

              <div className="mt-12 text-center relative z-10 shrink-0">
                <div className="h-[1px] w-32 bg-slate-100 mx-auto mb-6" />
                <span className="text-xs font-black text-slate-200 tracking-[0.5em] uppercase">{currentPageIndex + 1} / {activeStory.pages.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Reading Progress Indicator */}
        <div className="h-2 bg-white/5 w-full relative shrink-0">
          <div className="h-full bg-white shadow-[0_0_20px_rgba(255,255,255,0.5)] transition-all duration-700 ease-out" style={{ width: `${((currentPageIndex + 1) / activeStory.pages.length) * 100}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen lg:pl-64 transition-all">
      <Sidebar currentView={view} onViewChange={(v) => { stopAudio(); setView(v); }} />
      <main className="min-h-screen bg-[#f8fafc]">
        {view === 'generator' && renderGenerator()}
        {view === 'library' && renderLibrary()}
        {view === 'reader' && renderReader()}
      </main>
      
      {isGenerating && (
        <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center text-white overflow-hidden">
          <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-500/30 via-transparent to-transparent"></div>
          
          <div className="w-40 h-40 lg:w-56 lg:h-56 mb-14 relative flex items-center justify-center">
             {/* Circular Progress Design */}
             <svg className="w-full h-full animate-spin duration-[3000ms]" viewBox="0 0 100 100">
                <circle 
                  cx="50" cy="50" r="46" 
                  fill="none" 
                  stroke="rgba(255,255,255,0.03)" 
                  strokeWidth="2" 
                />
                <circle 
                  cx="50" cy="50" r="46" 
                  fill="none" 
                  stroke="white" 
                  strokeWidth="3" 
                  strokeLinecap="round" 
                  strokeDasharray="60 200"
                />
             </svg>
             <div className="absolute inset-0 flex items-center justify-center">
               <span className="text-5xl lg:text-7xl drop-shadow-[0_0_30px_rgba(255,255,255,0.4)] animate-pulse">📖</span>
             </div>
          </div>
          
          <h2 className="text-4xl lg:text-6xl font-extrabold tracking-[0.4em] mb-6 text-center drop-shadow-lg px-6 uppercase">Manifesting...</h2>
          
          <div className="flex flex-col items-center gap-8 max-w-2xl px-12">
            <p className="text-slate-300 font-crimson italic text-2xl lg:text-4xl text-center leading-relaxed opacity-80">
              "{generationProgress.step}"
            </p>
            
            <div className="w-72 lg:w-96 h-[3px] bg-white/5 rounded-full overflow-hidden relative">
               <div 
                 className="h-full bg-white transition-all duration-1000 ease-in-out shadow-[0_0_15px_white]"
                 style={{ width: `${(generationProgress.current / (generationProgress.total || 1)) * 100}%` }}
               />
            </div>

            <div className="flex flex-col items-center gap-4">
              <p className="text-[10px] font-black tracking-[0.8em] text-white/20 uppercase">
                 FOLIO IN PROGRESS
              </p>
              <div className="flex gap-2.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{animationDelay: `${i * 0.15}s`}} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
