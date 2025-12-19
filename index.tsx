
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import { 
  Story, 
  View, 
  Genre, 
  Mood, 
  StoryStyle,
  CastMember, 
  Voice 
} from './types';
import { generateStoryContent, generateImageForPage, generateNarration } from './geminiService';
import { exportToPDF } from './components/PDFExporter';
import Sidebar from './components/Sidebar';

const DB_NAME = 'MythicTalesPersonalArchives';
const STORE_NAME = 'chronicles';

function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function customDecodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
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

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = (e: any) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveToDB = async (story: Story) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(story);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
};

const getFromDB = async (): Promise<Story[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const removeFromDB = async (id: string) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve(true);
  });
};

const Dropdown = ({ label, value, options, onChange }: { label?: string, value: string, options: string[], onChange: (val: any) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClick = (e: MouseEvent) => { 
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false); 
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="flex flex-col gap-2 mb-6" ref={containerRef}>
      {label && (
        <label className="text-[11px] font-inter font-bold text-slate-500 uppercase tracking-widest ml-1">
          {label}
        </label>
      )}
      <div className="relative">
        <button 
          onClick={() => setIsOpen(!isOpen)} 
          className={`w-full bg-slate-50 text-slate-900 px-6 py-4 rounded-2xl flex items-center justify-between font-inter font-bold text-sm transition-all border border-transparent hover:bg-white hover:border-slate-200 ${isOpen ? 'bg-white border-slate-200 shadow-sm' : ''}`}
        >
          <span className="tracking-wide">{value}</span>
          <svg 
            className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180 text-black' : ''}`} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isOpen && (
          <div className="absolute top-[calc(100%+8px)] left-0 w-full bg-white shadow-2xl rounded-2xl border border-slate-100 overflow-hidden z-[150] animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="max-h-60 overflow-y-auto no-scrollbar">
              {options.map((opt) => (
                <button 
                  key={opt} 
                  onClick={() => { onChange(opt); setIsOpen(false); }} 
                  className={`w-full text-left px-6 py-4 text-sm font-inter font-bold tracking-tight transition-all ${value === opt ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-black'}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const App = () => {
  const [view, setView] = useState<View>('generator');
  const [stories, setStories] = useState<Story[]>([]);
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0, step: '' });
  const [isNarrating, setIsNarrating] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const [genre, setGenre] = useState<Genre>(Genre.Fantasy);
  const [mood, setMood] = useState<Mood>(Mood.Epic);
  const [style, setStyle] = useState<StoryStyle>(StoryStyle.OilPainting);
  const [voice, setVoice] = useState<Voice>(Voice.Male);
  const [pageCount, setPageCount] = useState(5);
  const [plot, setPlot] = useState('');
  const [cast, setCast] = useState<CastMember[]>([{ id: '1', name: '', role: '' }]);

  useEffect(() => {
    getFromDB().then(data => setStories(data.sort((a, b) => b.createdAt - a.createdAt)));
    const initAudio = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
    };
    window.addEventListener('mousedown', initAudio, { once: true });
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (view !== 'reader' || !activeStory) return;
      if (e.key === 'ArrowRight') {
        setCurrentPageIndex(p => Math.min(activeStory.pages.length - 1, p + 1));
      } else if (e.key === 'ArrowLeft') {
        setCurrentPageIndex(p => Math.max(0, p - 1));
      } else if (e.key === 'Escape') {
        setView('library');
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', initAudio);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [view, activeStory]);

  useEffect(() => {
    if (isGenerating) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isGenerating]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenProgress({ current: 0, total: pageCount, step: 'Dreaming up your story...' });
    try {
      const result = await generateStoryContent(genre, mood, pageCount, cast, plot, style);
      const newStory: Story = {
        id: Date.now().toString(),
        title: result.title,
        genre, mood, style, plot, cast,
        pages: [],
        createdAt: Date.now(),
        isFavorite: false
      };
      const finalPages = [];
      for(let i = 0; i < result.pages.length; i++) {
        setGenProgress({ current: i + 1, total: pageCount, step: `Creating Chapter ${i + 1} of ${pageCount}...` });
        const imgUrl = await generateImageForPage(result.pages[i].imagePrompt, genre);
        const audio = await generateNarration(result.pages[i].text, voice);
        finalPages.push({ ...result.pages[i], imageUrl: imgUrl, audioData: audio });
      }
      newStory.pages = finalPages;
      await saveToDB(newStory);
      setStories([newStory, ...stories]);
      setActiveStory(newStory);
      setCurrentPageIndex(0);
      setView('reader');
    } catch (e) { 
      console.error(e);
      alert("Something went wrong while manifesting your story. Please check your connection and try again."); 
    } finally { setIsGenerating(false); }
  };

  const deleteStory = async (id: string) => {
    if (confirm("Are you sure you want to delete this story forever?")) {
      await removeFromDB(id);
      setStories(stories.filter(s => s.id !== id));
      if (activeStory?.id === id) setView('library');
    }
  };

  const removeCastMember = (id: string) => {
    if (cast.length > 1) {
      setCast(cast.filter(c => c.id !== id));
    }
  };

  const renderGenerator = () => (
    <div className="max-w-7xl mx-auto py-12 px-6 lg:px-12 pt-24 lg:pt-16 flex flex-col gap-12 pb-32">
      <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-4 duration-700">
        <h1 className="text-4xl lg:text-5xl font-inter font-black text-slate-900 tracking-tight">Create your Legend</h1>
        <p className="text-lg text-slate-500 font-inter font-medium">Configure your world, characters, and plot.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        <div className="lg:col-span-4 modern-card p-10 flex flex-col bg-white">
          <h2 className="text-xl font-inter font-bold mb-8 text-slate-900 flex items-center gap-3">
             <span className="p-2 bg-slate-900 text-white rounded-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
             </span>
             Configuration
          </h2>

          <div className="flex flex-col">
            <Dropdown label="Genre" value={genre} options={Object.values(Genre)} onChange={setGenre} />
            <Dropdown label="Mood" value={mood} options={Object.values(Mood)} onChange={setMood} />
            <Dropdown label="Visual Style" value={style} options={Object.values(StoryStyle)} onChange={setStyle} />
            <Dropdown label="Voice" value={voice} options={Object.values(Voice)} onChange={setVoice} />
          </div>

          <div className="mt-4 mb-10">
            <div className="flex justify-between items-center mb-6">
              <span className="text-[11px] font-inter font-bold text-slate-500 uppercase tracking-widest">Story Length</span>
              <span className="bg-slate-100 text-slate-900 px-4 py-1.5 rounded-full text-xs font-inter font-bold">{pageCount} Pages</span>
            </div>
            <input type="range" min="3" max="10" value={pageCount} onChange={(e) => setPageCount(parseInt(e.target.value))} />
          </div>

          <div className="hidden lg:block">
            <button 
              onClick={handleGenerate} 
              className="w-full bg-slate-900 text-white py-5 rounded-2xl font-inter font-bold text-sm uppercase tracking-widest shadow-xl hover:bg-black transition-all active:scale-[0.98] mt-2 group"
            >
              Manifest Story
              <span className="ml-2 group-hover:translate-x-1 inline-block transition-transform">→</span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-8 flex flex-col gap-10">
          <div className="modern-card p-12 bg-white">
            <h3 className="text-2xl font-inter font-bold mb-10 text-slate-900">Protagonists</h3>
            <div className="flex flex-col gap-6 mb-10">
              {cast.map((c, i) => (
                <div key={c.id} className="relative p-8 bg-slate-50 border border-slate-100 rounded-3xl group animate-in fade-in slide-in-from-left-4 duration-500" style={{ animationDelay: `${i * 100}ms` }}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div className="flex flex-col gap-3">
                      <label className="text-[10px] font-inter font-bold text-slate-400 uppercase tracking-widest">Hero's Name</label>
                      <input 
                        placeholder="e.g. Atlas" 
                        value={c.name} 
                        onChange={(e) => setCast(cast.map(char => char.id === c.id ? { ...char, name: e.target.value } : char))} 
                        className="w-full bg-white border border-slate-200 px-6 py-4 rounded-2xl font-inter font-bold text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900/10 transition-all shadow-sm" 
                      />
                    </div>
                    <div className="flex flex-col gap-3">
                      <label className="text-[10px] font-inter font-bold text-slate-400 uppercase tracking-widest">Role or Class</label>
                      <input 
                        placeholder="e.g. Rogue Knight" 
                        value={c.role} 
                        onChange={(e) => setCast(cast.map(char => char.id === c.id ? { ...char, role: e.target.value } : char))} 
                        className="w-full bg-white border border-slate-200 px-6 py-4 rounded-2xl font-inter font-bold text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900/10 transition-all shadow-sm" 
                      />
                    </div>
                  </div>
                  {cast.length > 1 && (
                    <button 
                      onClick={() => removeCastMember(c.id)}
                      className="absolute -top-3 -right-3 w-9 h-9 bg-white border border-slate-200 text-slate-400 rounded-full flex items-center justify-center hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all shadow-lg opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button 
              onClick={() => setCast([...cast, { id: Date.now().toString(), name: '', role: '' }])} 
              className="w-full py-5 border-2 border-dashed border-slate-200 rounded-3xl font-inter font-bold text-xs text-slate-400 uppercase tracking-widest hover:bg-slate-50 hover:text-slate-600 transition-all active:scale-[0.99]"
            >
              + Add another character
            </button>
          </div>

          <div className="modern-card p-12 flex flex-col bg-white">
            <h3 className="text-2xl font-inter font-bold mb-8 text-slate-900">Initial Plot Prompt</h3>
            <div className="bg-slate-50 p-8 rounded-3xl min-h-[250px] w-full border border-slate-100 flex flex-col focus-within:bg-white focus-within:border-slate-200 transition-all duration-300">
              <textarea 
                placeholder="Briefly describe how your story begins, or let the AI weave its own tale..." 
                value={plot} 
                onChange={(e) => setPlot(e.target.value)} 
                className="w-full h-full min-h-[180px] bg-transparent outline-none resize-none font-inter font-medium text-slate-700 text-lg leading-relaxed placeholder:text-slate-300 no-scrollbar flex-grow" 
              />
            </div>
          </div>
        </div>
      </div>

      <div className="lg:hidden mt-4">
        <button 
          onClick={handleGenerate} 
          className="w-full bg-slate-900 text-white py-5 rounded-2xl font-inter font-bold text-sm uppercase tracking-widest shadow-xl hover:bg-black transition-all active:scale-[0.98] group"
        >
          Manifest Story
          <span className="ml-2 group-hover:translate-x-1 inline-block transition-transform">→</span>
        </button>
      </div>
    </div>
  );

  const renderLibrary = () => (
    <div className="max-w-7xl mx-auto py-12 px-6 lg:px-12 pt-24 lg:pt-16 pb-32">
      <header className="mb-12 animate-in fade-in slide-in-from-top-4 duration-700">
        <h1 className="text-4xl lg:text-5xl font-inter font-black text-slate-900 tracking-tight">Your Library</h1>
        <p className="text-lg text-slate-500 font-inter font-medium mt-2">Relive your adventures.</p>
      </header>

      {stories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center modern-card bg-white border-dashed border-2">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-6 border border-slate-100">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h3 className="text-2xl font-inter font-bold text-slate-900">Your shelf is empty</h3>
          <button 
            onClick={() => setView('generator')} 
            className="mt-10 px-10 py-4 bg-slate-900 text-white rounded-2xl font-inter font-bold text-sm tracking-widest uppercase shadow-xl hover:scale-105 transition-all"
          >
            Manifest Story
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {stories.map((story, i) => (
            <div key={story.id} className="modern-card overflow-hidden flex flex-col group bg-white animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${i * 100}ms` }}>
              <div className="h-64 relative overflow-hidden">
                <img src={story.pages[0]?.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6">
                  <span className="text-[10px] font-inter font-bold tracking-widest uppercase text-white/50 mb-2 block">{story.genre}</span>
                  <h3 className="text-2xl font-inter font-bold text-white line-clamp-2 leading-tight tracking-tight">{story.title}</h3>
                </div>
              </div>
              <div className="p-8 flex-grow flex flex-col gap-4">
                <button onClick={() => { setActiveStory(story); setCurrentPageIndex(0); setView('reader'); }} className="w-full bg-slate-900 text-white py-4 rounded-xl font-inter font-bold text-xs uppercase tracking-widest active:scale-95 transition-transform shadow-lg">Open Book</button>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => exportToPDF(story)} className="bg-slate-50 text-slate-600 py-3.5 rounded-xl font-inter font-bold text-[10px] uppercase tracking-widest hover:bg-slate-100 transition-colors">Export PDF</button>
                  <button onClick={() => deleteStory(story.id)} className="bg-red-50 text-red-500 py-3.5 rounded-xl font-inter font-bold text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderReader = () => {
    const page = activeStory?.pages[currentPageIndex];
    if (!page) return null;

    const handleNarrationPlay = async () => {
      if (isNarrating) {
        audioSourceRef.current?.stop();
        setIsNarrating(false);
        return;
      }
      if (page.audioData) {
        try {
          if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
          }
          const ctx = audioContextRef.current;
          const audioBytes = decodeBase64(page.audioData);
          const audioBuffer = await customDecodeAudioData(audioBytes, ctx, 24000, 1);
          
          const src = ctx.createBufferSource();
          src.buffer = audioBuffer;
          src.connect(ctx.destination);
          src.onended = () => setIsNarrating(false);
          src.start();
          audioSourceRef.current = src;
          setIsNarrating(true);
        } catch (e) {
          setIsNarrating(false);
        }
      }
    };

    return (
      <div className="fixed inset-0 bg-[#000000] z-[100] flex flex-col animate-in fade-in duration-700 overflow-y-auto lg:overflow-hidden font-inter">
        {/* Header Section */}
        <div className="shrink-0 h-20 px-6 lg:px-12 flex items-center justify-between text-white/90 z-[110] relative bg-black/50 backdrop-blur-md">
          <button 
            onClick={() => setView('library')} 
            className="flex items-center gap-3 text-[11px] font-inter font-bold tracking-widest uppercase hover:text-white transition-all bg-white/10 hover:bg-white/20 px-6 py-3 rounded-2xl backdrop-blur-xl border border-white/10"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7"/></svg>
            Library
          </button>
          
          <div className="hidden lg:flex flex-col items-center">
            <h2 className="font-inter font-bold text-2xl tracking-tight text-white">{activeStory?.title}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-inter font-bold text-white/40 tracking-widest uppercase">{activeStory?.genre} • Chapter {currentPageIndex + 1}</span>
            </div>
          </div>

          <button 
            onClick={() => exportToPDF(activeStory!)} 
            className="px-6 py-3 bg-white text-slate-900 rounded-2xl font-inter font-bold text-[11px] tracking-widest uppercase shadow-2xl hover:scale-105 active:scale-95 transition-all"
          >
            Export PDF
          </button>
        </div>

        {/* Responsive Content Spread */}
        <div className="flex-grow flex items-center justify-center p-4 lg:p-12 relative">
          <div className="w-full h-auto lg:h-full max-w-[1600px] max-h-none lg:max-h-[850px] bg-white rounded-xl flex flex-col lg:flex-row overflow-hidden relative shadow-[0_50px_100px_-20px_rgba(0,0,0,0.8)] mb-20 lg:mb-0">
             
             {/* LEFT PAGE: IMAGE */}
             <div className="w-full lg:w-1/2 h-auto lg:h-full bg-black overflow-hidden relative">
                <img 
                  key={`img-${currentPageIndex}`}
                  src={page.imageUrl} 
                  className="w-full h-full object-contain lg:object-cover animate-book-page shadow-inner" 
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/10 via-transparent to-black/5 pointer-events-none" />
             </div>

             <div className="hidden lg:block book-spine-divider"></div>

             {/* RIGHT PAGE: TEXT */}
             <div className="w-full lg:w-1/2 h-auto lg:h-full p-8 lg:p-20 paper-texture relative flex flex-col animate-book-page overflow-hidden">
                <div className="flex justify-between items-start mb-10 shrink-0">
                   <div className="flex flex-col">
                     <span className="text-[11px] font-inter font-bold text-slate-400 uppercase tracking-widest mb-1">Story Page</span>
                     <span className="text-3xl font-inter italic font-bold text-slate-900 opacity-20">Chapter {currentPageIndex + 1}</span>
                   </div>
                   
                   {page.audioData && (
                     <button 
                       onClick={handleNarrationPlay} 
                       className={`w-14 h-14 lg:w-16 lg:h-16 rounded-full flex items-center justify-center shadow-2xl transition-all ${isNarrating ? 'bg-slate-900 text-white scale-110' : 'bg-white text-slate-900 hover:scale-110 border border-slate-100'}`}
                     >
                       {isNarrating ? (
                         <div className="flex gap-1.5 items-end h-5">
                            <div className="w-1.5 bg-white animate-[bounce_0.6s_infinite] h-4"></div>
                            <div className="w-1.5 bg-white animate-[bounce_0.8s_infinite] h-6"></div>
                            <div className="w-1.5 bg-white animate-[bounce_0.7s_infinite] h-5"></div>
                         </div>
                       ) : (
                         <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                       )}
                     </button>
                   )}
                </div>

                {/* TEXT CONTAINER - FITS CONTENT ON DESKTOP, SCROLLS NATURALLY ON MOBILE */}
                <div className="reader-prose drop-cap flex-grow overflow-y-auto lg:overflow-hidden no-scrollbar pr-2 font-inter">
                  <ReactMarkdown>{page.text}</ReactMarkdown>
                </div>

                <div className="mt-12 pt-8 border-t border-slate-200 flex flex-col items-center shrink-0">
                   <div className="flex items-center gap-6">
                      <button 
                        disabled={currentPageIndex === 0} 
                        onClick={() => setCurrentPageIndex(p => p - 1)} 
                        className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-900 disabled:opacity-30 hover:bg-slate-200 transition-all active:scale-90"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7"/></svg>
                      </button>
                      
                      <div className="text-sm font-inter italic font-bold text-slate-400">
                        Page {currentPageIndex + 1} of {activeStory!.pages.length}
                      </div>

                      <button 
                        disabled={currentPageIndex === activeStory!.pages.length - 1} 
                        onClick={() => setCurrentPageIndex(p => p + 1)} 
                        className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-900 disabled:opacity-30 hover:bg-slate-200 transition-all active:scale-90"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7"/></svg>
                      </button>
                   </div>
                </div>
             </div>
          </div>
        </div>

        {/* Simplified Progress Footer */}
        <div className="shrink-0 h-28 px-8 lg:px-12 flex flex-col items-center justify-center gap-4 text-white/30 bg-black">
           <div className="flex gap-2 lg:gap-4">
             {activeStory!.pages.map((_, idx) => (
               <button 
                 key={idx}
                 onClick={() => setCurrentPageIndex(idx)}
                 className={`h-2 transition-all duration-500 rounded-full ${currentPageIndex === idx ? 'w-16 bg-white' : 'w-4 bg-white/10 hover:bg-white/30'}`}
               />
             ))}
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen lg:pl-64 bg-slate-50 overflow-x-hidden font-inter">
      <Sidebar currentView={view} onViewChange={setView} />
      <main className="min-h-screen">
        {view === 'generator' && renderGenerator()}
        {view === 'library' && renderLibrary()}
        {view === 'reader' && renderReader()}
      </main>
      
      {isGenerating && (
        <div className="fixed inset-0 z-[500] bg-white/95 backdrop-blur-2xl flex flex-col items-center justify-center text-center p-8 animate-in fade-in duration-500">
          <div className="w-48 h-48 relative mb-12">
            <svg className="w-full h-full animate-[spin_5s_linear_infinite]" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="46" fill="none" stroke="#f1f5f9" strokeWidth="2" />
              <circle cx="50" cy="50" r="46" fill="none" stroke="#000000" strokeWidth="4" strokeDasharray="120 200" strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-12 h-12 text-slate-900 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
          </div>
          <h2 className="text-4xl font-inter font-bold text-slate-900 mb-4 uppercase tracking-tight">Manifesting...</h2>
          <div className="bg-slate-50 px-8 py-4 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-xl font-inter font-medium text-slate-600 leading-relaxed">"{genProgress.step}"</p>
          </div>
        </div>
      )}
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) createRoot(rootElement).render(<App />);
