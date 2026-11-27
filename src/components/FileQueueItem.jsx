import React from "react";
import { Reorder } from "framer-motion";
import Icon from "./Icon";

const FileQueueItem = React.memo(({ 
  file, 
  index, 
  isDarkMode, 
  isProcessing, 
  currentIndex, 
  progress, 
  onViewComparison, 
  onRemove 
}) => {
  const isActive = file.status === 'processing' || currentIndex === index;

  return (
    <Reorder.Item
      key={file.path}
      value={file}
      dragListener={!isProcessing}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ 
        type: "spring", 
        stiffness: 400, 
        damping: 30,
        delay: index * 0.03
      }}
      className={`relative flex items-center p-2.5 rounded-xl border transition-all duration-300 ${
        isActive 
        ? (isDarkMode ? 'bg-studio-sage/12 border-studio-sage/40 shadow-studio-sm' : 'bg-studio-moss/15 border-studio-olive/30 shadow-sm') 
        : (isDarkMode ? 'bg-studio-obsidian/45 border-[#8AA282]/10 hover:border-[#8AA282]/25' : 'bg-[#FAF9F5] border-[#E4E0D5] hover:border-[#CBC5B7] shadow-sm')
      }`}
    >
      <div className={`w-9 h-9 rounded-lg mr-3 flex items-center justify-center transition-colors ${
        isDarkMode ? 'bg-white/5 text-studio-lichen' : 'bg-[#F2F0EB] text-studio-olive border border-[#E4E0D5]'
      }`}>
        <Icon name={file.type === 'VID' ? 'film' : file.type === 'AUD' ? 'music' : 'image'} className="w-5 h-5" />
      </div>
      
      <div className="flex-1 min-w-0">
         <p className={`text-[12px] font-bold truncate ${isDarkMode ? 'text-[#F2F0EB]' : 'text-[#232921]'}`}>{file.name}</p>
         <div className="flex items-center gap-2 mt-0.5">
             {file.status === 'done' && (
                <span className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 animate-in fade-in slide-in-from-left-1 ${isDarkMode ? 'text-studio-moss' : 'text-studio-forest'}`}>
                  <Icon name="check" className="w-3 h-3" stroke={3} /> Ready
                </span>
             )}
             {file.status === 'processing' && (
                <span className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 animate-pulse ${isDarkMode ? 'text-studio-sage' : 'text-studio-forest'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(138,162,130,0.5)] ${isDarkMode ? 'bg-studio-sage' : 'bg-studio-forest'}`} /> {Math.round(progress)}%
                </span>
             )}
             {file.status === 'error' && (
                <span className="text-[9px] font-black uppercase tracking-widest text-[#B85442] flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#B85442]" /> Retry
                </span>
             )}
             {file.status === 'queued' && (
                <span className={`text-[9px] font-black uppercase tracking-widest ${isDarkMode ? 'text-[#8C9488]' : 'text-[#737A6E]'}`}>Queued</span>
             )}
         </div>
      </div>

      {!isProcessing && (
         <button 
           onClick={() => onRemove(index)} 
           className="ml-3 w-8 h-8 flex items-center justify-center text-[#8C9488] hover:text-[#B85442] transition-colors"
         >
           <Icon name="x" className="w-4 h-4" stroke={2.5} />
         </button>
      )}
    </Reorder.Item>
  );
});

FileQueueItem.displayName = "FileQueueItem";

export default FileQueueItem;
