
import React from 'react';
import { View } from '../types';

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange }) => {
  const menuItems = [
    { 
      id: 'generator' as View, 
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ), 
      label: 'CREATE', 
      desc: 'New story' 
    },
    { 
      id: 'library' as View, 
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ), 
      label: 'Library', 
      desc: 'Saved books' 
    },
  ];

  return (
    <>
      {/* Mobile Top Navigation */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-20 bg-white/95 backdrop-blur-2xl z-50 border-b border-slate-100 flex items-center justify-between px-6 shadow-sm font-inter">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center text-lg shadow-lg shrink-0 text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="font-inter font-black text-sm tracking-tighter leading-none text-[#000000]">MythicTales</span>
            <span className="text-[6px] font-inter font-black uppercase tracking-[0.2em] text-slate-300 leading-none mt-1">Personal Stories</span>
          </div>
        </div>
        <div className="flex gap-2">
          {menuItems.map(item => (
            <button 
              key={item.id} 
              onClick={() => onViewChange(item.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl transition-all ${currentView === item.id ? 'bg-[#000000] text-white shadow-xl' : 'text-slate-400 opacity-40'}`}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="text-[8px] font-inter font-black tracking-widest">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Monochrome Sidebar */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-slate-50 h-screen flex-col p-10 fixed left-0 top-0 z-40 font-inter">
        <div className="flex flex-col items-center text-center mb-20">
          <div className="w-14 h-14 bg-black rounded-[1.25rem] flex items-center justify-center shadow-2xl shrink-0 border-4 border-white mb-4 text-white">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h1 className="font-inter font-black text-2xl tracking-tighter text-black leading-none uppercase">MythicTales</h1>
          <p className="text-[8px] font-inter uppercase font-black text-slate-300 tracking-[0.4em] mt-2 leading-none">Personal Stories</p>
        </div>

        <nav className="space-y-6 flex-grow">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`
                w-full flex items-center gap-4 px-6 py-5 rounded-[2.5rem] transition-all group relative 
                ${currentView === item.id 
                  ? 'bg-black text-white shadow-2xl scale-[1.02]' 
                  : 'hover:bg-slate-50 text-slate-300 opacity-40 hover:opacity-100'}
              `}
            >
              <div className={`transition-transform duration-500 ${currentView === item.id ? 'scale-110' : 'group-hover:scale-110'}`}>
                {item.icon}
              </div>
              <div className="text-left">
                <span className="font-inter font-black text-[10px] tracking-[0.2em]">{item.label}</span>
                <p className={`text-[8px] font-inter font-bold mt-0.5 tracking-tight ${currentView === item.id ? 'text-slate-500' : 'text-slate-200'}`}>{item.desc}</p>
              </div>
              {currentView === item.id && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-white rounded-full ml-1.5" />
              )}
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
