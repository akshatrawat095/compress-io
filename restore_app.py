import re

path = r'c:\dev\universal-compressor\src\App.jsx'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1. Correct any corrupted line 49
for i, line in enumerate(lines):
    if i < 100 and 'function App()' in line:
        lines[i] = 'export default function App() {\n'
        break

# 2. Correct the AI Enhance logic blocks
# We'll use a stack-based approach or just surgical replacement of the known bad lines.

# First, revert all accidental ')}' or ')}}' from the previous powershell
for i, line in enumerate(lines):
    if '))}' in line:
        lines[i] = line.replace('))}', ')}').replace(')} )}', ')} )')
    # If the line was just '    )}' but shouldn't have been
    if line.strip() == ')}' and i > 710:
        # Revert 712 specifically if it's bad
        if i == 711: # 0-indexed for 712
             lines[i] = '                      )}\n'

# Surgical structural check for the Denoise/Stabilize section
# 703: {fileQueue...
# 707: </button>
# 708: )}
# 709: </div>
# 710: </div>
# 711: </div>
# 712: )}

# Let's rebuild the closing block from line 707 to 716
lines[706] = '                                   </button>\n'
lines[707] = '                                   )}\n'
lines[708] = '                                </div>\n'
lines[709] = '                             </div>\n'
lines[710] = '                          </div>\n'
lines[711] = '                       )}\n'
lines[712] = '                    </div>\n'
lines[713] = '                 </motion.div>\n'
lines[714] = '               </motion.div>\n'
lines[715] = '            )}\n'

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)
