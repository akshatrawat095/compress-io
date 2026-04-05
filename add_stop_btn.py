import re
import os

path = r'src\App.jsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add stopJob function before startJob
if 'async function stopJob' not in content:
    stop_fn = r'''  async function stopJob() {
    try {
      await invoke("kill_ffmpeg");
      setIsProcessing(false);
      setIsIndeterminate(false);
      setTimeLeft("PROCESS HALTED");
      setProgress(0);
      setFileQueue(prev => prev.map(f => f.status === 'processing' ? {...f, status: 'queued'} : f));
    } catch (e) {
      console.error("Stop failed:", e);
    }
  }

  async function startJob() {'''
    content = content.replace('async function startJob() {', stop_fn)

# 2. Update the footer button to toggle between START and STOP
old_button = r'''              <button 
                disabled={isProcessing}
                onClick={startJob}'''

new_button = r'''              <button 
                onClick={isProcessing ? stopJob : startJob}'''

content = content.replace(old_button, new_button)

# 3. Update the button text and styling for the STOP state
old_span = r'''<span className="relative z-10">{isProcessing ? `OPTIMIZING ${progress}%` : 'START'}</span>'''
new_span = r'''<span className="relative z-10">{isProcessing ? `STOP OPTIMIZATION (${progress}%)` : 'START'}</span>'''
content = content.replace(old_span, new_span)

# 4. Update the background color for the STOP state
old_bg = r"isProcessing \? \(isDarkMode \? 'bg-slate-800 text-slate-600' : 'bg-slate-200 text-slate-400'\)"
new_bg = "isProcessing ? (isDarkMode ? 'bg-rose-500/20 text-rose-500 border border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.3)] animate-pulse' : 'bg-rose-50 text-rose-600 border border-rose-200 shadow-sm') "
content = re.sub(old_bg, new_bg, content)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Updated App.jsx: STOP button logic implemented.")
