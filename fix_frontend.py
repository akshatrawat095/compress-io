import re

path = r'c:\dev\universal-compressor\src\App.jsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Pass hyperDetail to enhance_image
old_block = r'''              await invoke\("enhance_image", \{ 
                  input: file\.path, 
                  output: finalPath, 
                  scale: aiScale, 
                  format: aiFormat, 
                  model_type: aiVideoModel, 
                  faceRestore: faceRestore 
              \}\);'''

new_block = r'''              await invoke("enhance_image", { 
                  input: file.path, 
                  output: finalPath, 
                  scale: aiScale, 
                  format: aiFormat, 
                  model_type: aiVideoModel, 
                  faceRestore: faceRestore,
                  hyperDetail: hyperDetail
              });'''

if 'hyperDetail: hyperDetail' not in content:
    content = re.sub(old_block, new_block, content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated App.jsx with hyperDetail parameter.")
