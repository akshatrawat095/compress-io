import re
import os

def fix_lib():
    path = r'src-tauri\src\lib.rs'
    if not os.path.exists(path): return
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove leading underscores from face_restore
    content = content.replace('_face_restore: bool', 'face_restore: bool')
    
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)
    print("Updated lib.rs: face_restore parameter aligned.")

def fix_app():
    path = r'src\App.jsx'
    if not os.path.exists(path): return
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Standardize invoke calls to camelCase keys for Tauri 
    # (Tauri maps faceRestore -> face_restore automatically)
    
    # Fix enhance_image block
    content = re.sub(
        r'await invoke\("enhance_image", \{.*?\}\);',
        r'''await invoke("enhance_image", { 
                  input: file.path, 
                  output: finalPath, 
                  scale: aiScale, 
                  format: aiFormat, 
                  modelType: aiVideoModel, 
                  faceRestore: faceRestore,
                  hyperDetail: hyperDetail
              });''',
        content,
        flags=re.DOTALL
    )
    
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)
    print("Updated App.jsx: invoke keys standardized to camelCase.")

fix_lib()
fix_app()
