
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
    setGenerationProgress({ current: 0, total: pageCount, step: 'Formulating narrative arc...' });
    
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

      setStories(prev => [newStory, ...prev]);
      setActiveStory(newStory);
      setCurrentPageIndex(0);
      setView('reader');
    } catch (error) {
      console.error(error);
      alert("We encountered an issue crafting your story.");
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
                <label className="font-bold text-slate-700 tracking-tight">Genre</label>
                <Dropdown value={genre} options={Object.values(Genre)} onChange={setGenre} />
              </div>
              <div className="flex flex-col gap-3">
                <label className="font-bold text-slate-700 tracking-tight">Mood</label>
                <Dropdown value={mood} options={Object.values(Mood)} onChange={setMood} />
              </div>
              <div className="flex flex-col gap-3">
                <label className="font-bold text-slate-700 tracking-tight">Art Style</label>
                <Dropdown value={style} options={Object.values(StoryStyle)} onChange={setStyle} />
              </div>
              <div className="space-y-4 pt-4 border-t border-slate-50">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 tracking-tight">Length</label>
                  <span className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-lg">{pageCount} Pages</span>
                </div>
                <input type="range" min="3" max="10" value={pageCount} onChange={(e) => setPageCount(parseInt(e.target.value))} />
              </div>
            </div>
            
            <button 
              onClick={handleGenerate}
              disabled={isGenerating}
              className="hidden lg:block mt-12 w-full py-6 bg-slate-900 text-white rounded-[2rem] font-bold text-lg hover:bg-slate-800 transition-all shadow-2xl active:scale-[0.97] disabled:opacity-50"
            >
              {isGenerating ? 'Drafting Story...' : 'Create Story'}
            </button>
          </div>
        </div>

        <div className="lg:w-2/3 flex flex-col gap-8 order-2">
          <div className="modern-card p-8 lg:p-10 animate-slide-up flex flex-col" style={{ animationDelay: '0.2s' }}>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-8">Protagonists</h2>
            <div className="space-y-4 mb-8">
              {cast.map((c, idx) => (
                <div key={c.id} className="soft-input p-6 flex flex-col sm:flex-row items-center gap-6 group animate-slide-up">
                  <input placeholder="Name" value={c.name} onChange={(e) => setCast(cast.map(char => char.id === c.id ? { ...char, name: e.target.value } : char))} className="w-full sm:flex-1 bg-transparent border-b border-slate-200 py-2 outline-none focus:border-slate-900 transition-all font-bold text-slate-700" />
                  <input placeholder="Role" value={c.role} onChange={(e) => setCast(cast.map(char => char.id === c.id ? { ...char, role: e.target.value } : char))} className="w-full sm:flex-1 bg-transparent border-b border-slate-200 py-2 outline-none focus:border-slate-900 transition-all font-bold text-slate-700" />
                  {cast.length > 1 && <button onClick={() => setCast(cast.filter(char => char.id !== c.id))} className="text-red-300 hover:text-red-500">×</button>}
                </div>
              ))}
            </div>
            <button onClick={() => setCast([...cast, { id: Date.now().toString(), name: '', role: '' }])} className="w-full py-5 border-2 border-dashed border-slate-100 rounded-[2rem] text-slate-400 font-bold hover:border-slate-300 transition-all">+ Add character</button>
          </div>

          <div className="modern-card p-8 lg:p-10 animate-slide-up flex flex-col flex-grow" style={{ animationDelay: '0.3s' }}>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-8">Starting Plot</h2>
            <div className="soft-input p-10 flex-grow">
              <textarea placeholder="Give us a hook or leave it blank..." value={plot} onChange={(e) => setPlot(e.target.value)} className="w-full h-full min-h-[160px] bg-transparent outline-none resize-none font-bold text-slate-600 text-lg leading-relaxed placeholder:text-slate-300 no-scrollbar" />
            </div>
          </div>
          
          <button onClick={handleGenerate} disabled={isGenerating} className="lg:hidden w-full py-6 bg-slate-900 text-white rounded-[2rem] font-bold text-lg hover:bg-slate-800 transition-all shadow-2xl active:scale-[0.97] disabled:opacity-50 mt-4 order-last">
            {isGenerating ? 'Drafting Story...' : 'Create Story'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderLibrary = () => (
    <div className="max-w-7xl mx-auto py-16 px-6 lg:px-8 mt-16 lg:mt-0">
      <header className="mb-16 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 animate-slide-up">
        <h1 className="text-5xl font-extrabold text-slate-900 tracking-tight">My Library</h1>
        <div className="bg-white px-8 py-4 rounded-3xl shadow-sm text-sm font-extrabold text-slate-900 border border-slate-100">{stories.length} Items</div>
      </header>
      {stories.length === 0 ? (
        <div className="modern-card py-40 flex flex-col items-center justify-center animate-slide-up">
          <h2 className="text-3xl font-extrabold text-slate-300">Your collection is empty</h2>
          <button onClick={() => setView('generator')} className="mt-10 px-12 py-5 bg-slate-900 text-white rounded-[2rem] font-bold shadow-2xl">Start Writing</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {stories.map((story, i) => (
            <div key={story.id} className="modern-card overflow-hidden flex flex-col group animate-slide-up h-full" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="h-72 relative overflow-hidden">
                <img src={story.pages[0]?.imageUrl || 'https://images.unsplash.com/photo-1543004223-249377484407'} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                <div className="absolute bottom-8 left-8 right-8">
                   <h3 className="text-2xl font-extrabold text-white line-clamp-2">{story.title}</h3>
                </div>
              </div>
              <div className="p-10 flex-grow flex flex-col">
                <button onClick={() => openStory(story)} className="w-full bg-slate-900 text-white py-5 rounded-[1.5rem] font-extrabold text-sm mb-4">Read Book</button>
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => exportToPDF(story)} className="bg-slate-50 text-slate-600 py-4 rounded-[1.5rem] font-bold text-xs">Export PDF</button>
                  <button onClick={() => deleteStory(story.id)} className="bg-red-50 text-red-400 py-4 rounded-[1.5rem] font-bold text-xs">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderReader = () => {
    if (!activeStory || !activeStory.pages || activeStory.pages.length === 0) {
      return (
        <div className="fixed inset-0 bg-slate-950 z-[200] flex items-center justify-center flex-col text-white gap-6">
          <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-xl font-bold tracking-widest uppercase animate-pulse">Initializing Folio...</p>
        </div>
      );
    }
    const page = activeStory.pages[currentPageIndex];
    return (
      <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col overflow-hidden animate-in fade-in duration-700">
        <div className="h-24 bg-white/5 backdrop-blur-2xl border-b border-white/10 px-6 lg:px-10 flex items-center justify-between shrink-0">
          <button onClick={() => { stopAudio(); setView('library'); }} className="text-white/60 hover:text-white transition-all font-black text-[10px] tracking-[0.4em]">← LIBRARY</button>
          <div className="hidden md:block text-center flex-1 mx-8 overflow-hidden">
            <h2 className="text-white font-extrabold text-xl truncate uppercase">{activeStory.title}</h2>
          </div>
          <button onClick={() => exportToPDF(activeStory)} className="px-8 py-3 bg-white text-slate-900 rounded-full font-black text-[10px] tracking-widest">EXPORT VOLUME</button>
        </div>
        <div className="flex-grow flex items-center justify-center p-4 lg:p-12 relative overflow-hidden">
          <button disabled={currentPageIndex === 0} onClick={() => { stopAudio(); setCurrentPageIndex(p => p - 1); }} className={`absolute left-4 lg:left-12 w-20 h-20 rounded-[2rem] bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white text-3xl transition-all z-20 ${currentPageIndex === 0 ? 'opacity-0' : 'hover:bg-white/15'}`}>←</button>
          <button disabled={currentPageIndex === activeStory.pages.length - 1} onClick={() => { stopAudio(); setCurrentPageIndex(p => p + 1); }} className={`absolute right-4 lg:right-12 w-20 h-20 rounded-[2rem] bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white text-3xl transition-all z-20 ${currentPageIndex === activeStory.pages.length - 1 ? 'opacity-0' : 'hover:bg-white/15'}`}>→</button>
          <div className="w-full max-w-[1500px] h-full max-h-[850px] bg-[#fdfbf7] rounded-[2.5rem] lg:rounded-[3.5rem] overflow-hidden flex flex-col lg:flex-row shadow-2xl relative animate-slide-up border-x-[1.25rem] border-slate-900/40">
            <div className="w-full lg:w-1/2 h-1/2 lg:h-full bg-slate-900/5 relative overflow-hidden flex-shrink-0">
              {page?.imageUrl && <img src={page.imageUrl} className="w-full h-full object-cover animate-in fade-in zoom-in-110 duration-1000" />}
            </div>
            <div className="w-full lg:w-1/2 h-1/2 lg:h-full p-8 lg:p-20 xl:p-24 flex flex-col relative overflow-y-auto no-scrollbar bg-white">
              <div className="flex justify-between items-center mb-12 relative z-10 shrink-0">
                <span className="text-[11px] font-black text-slate-300 tracking-[0.5em] uppercase">PAGE {currentPageIndex + 1}</span>
                {page?.audioData && <button onClick={() => isNarrating ? stopAudio() : playNarration(page.audioData!)} className={`w-14 h-14 rounded-[1.25rem] flex items-center justify-center transition-all ${isNarrating ? 'bg-slate-900 text-white animate-pulse' : 'bg-white text-slate-400 border border-slate-100'}`}>{isNarrating ? '■' : '▶'}</button>}
              </div>
              <div className="flex-grow flex flex-col relative z-10">
                <div className="prose prose-xl lg:prose-2xl max-w-none font-crimson text-slate-800 leading-relaxed drop-cap">{page?.text?.replace(/[*]/g, '')}</div>
              </div>
              <div className="mt-12 text-center relative z-10 shrink-0">
                <span className="text-xs font-black text-slate-200 tracking-[0.5em] uppercase">{currentPageIndex + 1} / {activeStory.pages.length}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="h-2 bg-white/5 w-full relative shrink-0"><div className="h-full bg-white transition-all duration-700 ease-out shadow-[0_0_20px_white]" style={{ width: `${((currentPageIndex + 1) / activeStory.pages.length) * 100}%` }} /></div>
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
        <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center text-white">
          <div className="w-56 h-56 mb-14 relative flex items-center justify-center">
             <svg className="w-full h-full animate-spin duration-[3000ms]" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="2" />
                <circle cx="50" cy="50" r="46" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeDasharray="60 200" />
             </svg>
             <div className="absolute inset-0 flex items-center justify-center"><span className="text-7xl animate-pulse">📖</span></div>
          </div>
          <h2 className="text-6xl font-extrabold tracking-[0.4em] mb-6 uppercase">Manifesting...</h2>
          <p className="text-slate-300 font-crimson italic text-4xl text-center leading-relaxed opacity-80 px-12">"{generationProgress.step}"</p>
        </div>
      )}
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}
