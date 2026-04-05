import re

path = r'c:\dev\universal-compressor\src\App.jsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Correct the "fault" or any line 49 corruption
# This line matches the start of the app component
content = re.sub(
    r'.{0,10}fault function App\(\) \{',
    'export default function App() {',
    content
)

# 2. Fix the structural tags for AI Enhance Contextual Settings
# I'll replace the problematic block entirely to be sure.
# We're looking for the Denoise/Stabilize grid block.
new_stabilize_block = r'''                                <div className={`grid gap-3 ${fileQueue.some(f => f.type === "VID") ? "grid-cols-2" : "grid-cols-1"}`}>
                                   <button onClick={() => setDenoise(!denoise)} className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-all ${denoise ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 shadow-studio-sm' : (isDarkMode ? 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10' : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200')}`}>
                                      <span className="text-[9px] font-black uppercase tracking-widest">Denoise</span>
                                      <div className={`w-1.5 h-1.5 rounded-full ${denoise ? 'bg-amber-500' : 'bg-slate-700'}`} />
                                   </button>
                                   {fileQueue.some(f => f.type === "VID") && (
                                      <button onClick={() => setStabilize(!stabilize)} className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-all ${stabilize ? 'bg-sky-500/10 border-sky-500/30 text-sky-500 shadow-studio-sm' : (isDarkMode ? 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10' : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200')}`}>
                                         <span className="text-[9px] font-black uppercase tracking-widest">Stabilize</span>
                                         <div className={`w-1.5 h-1.5 rounded-full ${stabilize ? 'bg-sky-500' : 'bg-slate-700'}`} />
                                      </button>
                                   )}
                                </div>
                             </div>
                          </div>
                       )}'''

# Search for the block starting with Denoise and ending somewhere near structural tags
# This regex is broad enough but safe for this specific file.
content = re.sub(
    r'<div className={`grid gap-3 \${fileQueue\.some.*?\}\s+</div>\s+</div>\s+</div>\s+\)\}',
    new_stabilize_block,
    content,
    flags=re.DOTALL
)

# If the above fails, let's try a simpler regex to just fix Line 708 specifically
if ')}' not in content[content.find('setStabilize'):]:
    content = re.sub(
        r'(<button onClick=\{\(\) => setStabilize\(!stabilize\)\}.+?</button>)\s+\)',
        r'\1\n                                   )}',
        content,
        flags=re.DOTALL
    )

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Finished fixing App.jsx")
