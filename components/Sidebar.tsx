
import React from 'react';
import { View } from '../types';

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange }) => {
  const menuItems = [
    { id: 'generator' as View, icon: '✍️', label: 'CREATE', desc: 'New story' },
    { id: 'library' as View, icon: '📚', label: 'COLLECTION', desc: 'Saved books' },
  ];

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-100 z-30 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center text-xl shadow-lg shrink-0">
            <span className="scale-75">📖</span>
          </div>
          <span className="font-black text-lg tracking-tighter text-slate-900 uppercase">MYTHOS</span>
        </div>
        <div className="flex gap-4">
          {menuItems.map(item => (
            <button 
              key={item.id} 
              onClick={() => onViewChange(item.id)}
              className={`p-2 rounded-lg transition-colors ${currentView === item.id ? 'text-slate-900 bg-slate-50' : 'text-slate-300'}`}
            >
              <span className="text-xl">{item.icon}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-slate-100 h-screen flex-col p-8 fixed left-0 top-0 z-40">
        <div className="flex items-center gap-4 mb-20 px-2">
          {/* Circular Dark Logo Container as requested */}
          <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center text-3xl shadow-2xl shadow-slate-200 shrink-0 border-4 border-slate-50">
            <span className="drop-shadow-sm scale-110">📖</span>
          </div>
          <div className="flex flex-col">
            <h1 className="font-black text-2xl tracking-tighter text-slate-900 leading-tight uppercase">MYTHOS</h1>
            <p className="text-[9px] uppercase font-bold text-slate-400 tracking-[0.25em] mt-0.5 leading-none">PERSONAL EDITION</p>
          </div>
        </div>

        <nav className="space-y-4 flex-grow">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`
                w-full flex items-center gap-5 p-6 rounded-[2rem] transition-all relative group
                ${currentView === item.id 
                  ? 'bg-slate-900 text-white shadow-2xl shadow-slate-300' 
                  : 'hover:bg-slate-50 text-slate-400'}
              `}
            >
              {currentView === item.id && (
                <div className="absolute left-3 w-1 h-6 bg-white/30 rounded-full" />
              )}
              
              <span className={`text-2xl transition-transform duration-500 group-hover:scale-110 ${currentView === item.id ? 'opacity-100' : 'opacity-40'}`}>
                {item.icon}
              </span>
              <div className="text-left">
                <span className="font-black text-[10px] tracking-[0.2em]">{item.label}</span>
                <p className={`text-[9px] font-bold mt-1 tracking-tight ${currentView === item.id ? 'text-slate-500' : 'text-slate-300'}`}>{item.desc}</p>
              </div>
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-8">
          <div className="p-8 rounded-[2.5rem] bg-slate-50 border border-slate-100 shadow-inner">
            <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-sm text-lg">💡</div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">QUOTATION</p>
            <p className="text-xs text-slate-600 font-bold leading-relaxed italic font-crimson">
              "Great legends aren't written; they are manifested."
            </p>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
